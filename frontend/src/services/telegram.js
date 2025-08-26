// src/services/telegram.js
import { ref } from 'vue'

const TELEGRAM_LOCAL_BYPASS = (import.meta.env?.VITE_TELEGRAM_LOCAL_BYPASS === 'true')

const user = ref(null)
let _validated = false
let _validatingPromise = null

// helper that calls your backend validation endpoint
async function _validateInitDataOnServer(initData) {
  const resp = await fetch('https://api.giftspredict.ru/api/validate-initdata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ initData })
  })
  const json = await resp.json().catch(() => null)
  if (!resp.ok || !json) {
    const reason = json?.reason || json?.error || `server responded ${resp.status}`
    throw new Error(`initData validation failed: ${reason}`)
  }
  if (!json.valid) throw new Error(json.reason || 'invalid')
  return json.data || {}
}

// read unsafe copy (only for dev / fallback)
function _readInitDataUnsafe() {
  try {
    if (typeof window === 'undefined') return null
    return window.Telegram?.WebApp?.initDataUnsafe ?? null
  } catch (e) { return null }
}

function _wrapNative(native) {
  // Ensure a `ready()` method exists immediately.
  // The ready() wrapper: waits for native.ready(), then performs validation once.
  return {
    ...native,
    ready: async (...args) => {
      // if local bypass — resolve immediately
      if (TELEGRAM_LOCAL_BYPASS) return Promise.resolve()

      // if native isn't present, reject so caller can block app init
      if (!native || typeof native.ready !== 'function') return Promise.reject(new Error('not_in_telegram'))

      // call native ready
      try {
        await native.ready?.(...args)
      } catch (e) {
        // still attempt validation — but propagate native.ready errors as well
        // (most callers expect to await native.ready; keeping original behaviour)
      }

      // perform server-side validation only once
      if (_validated) return
      if (_validatingPromise) return _validatingPromise

      _validatingPromise = (async () => {
        const initData = native.initData
        if (!initData) {
          throw new Error('missing_initData')
        }
        const parsed = await _validateInitDataOnServer(initData)
        // parsed may contain parsed.user, chat, etc.
        if (parsed?.user) user.value = parsed.user
        _validated = true
        _validatingPromise = null
      })()

      return _validatingPromise
    }
  }
}

// exported composable
export function useTelegram() {
  // immediate detection
  const native = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null

  // local bypass flow: if bypass, fake a minimal tg object and user
  if (TELEGRAM_LOCAL_BYPASS && !native) {
    console.warn('[useTelegram] TELEGRAM_LOCAL_BYPASS enabled — skipping Telegram environment checks.')
    // try to use unsafe initData as dev-supplied user if available
    const unsafe = _readInitDataUnsafe()
    if (unsafe && unsafe.user) user.value = unsafe.user
    else user.value = { id: 99, first_name: 'LocalTest', username: 'local_test', language_code: 'en' }

    // return a minimal tg stub that mimics methods you call
    const tgStub = {
      ready: () => Promise.resolve(),
      expand: () => { },
      openTelegramLink: (u) => { window.open(u, '_blank') },
      BackButton: { onClick: () => { }, offClick: () => { }, show: () => { }, hide: () => { } },
      initData: null,
      initDataUnsafe: unsafe ?? null
    }
    return { tg: tgStub, user }
  }

  // Not inside Telegram + not bypass: log and return an object whose ready() rejects
  if (!native) {
    console.error('⚠️ This website must be opened inside Telegram to access the app.')
    const deadTg = {
      ready: () => Promise.reject(new Error('not_in_telegram')),
      expand: () => { },
      openTelegramLink: (u) => { window.open(u, '_blank') },
      BackButton: { onClick: () => { }, offClick: () => { }, show: () => { }, hide: () => { } },
      initData: null,
      initDataUnsafe: null
    }
    return { tg: deadTg, user }
  }

  // native exists -> wrap with validation logic
  const tg = _wrapNative(native)
  return { tg, user }
}
