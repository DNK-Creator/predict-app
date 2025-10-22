<template>
  <div v-if="loadingStage > 0 && !outsideTelegram" class="app">
    <div class="app-scroll-container" ref="appScrollRef">
      <Header :balance="app.points" :address="walletAddress" @deposit-click="openDepositWindow"
        @history-click="historyOpenView" @settings-click="openSettings" @wallet-connect="reconnectWallet" />

      <RouterView v-slot="{ Component }">
        <transition name="route-fade" mode="out-in" appear>
          <div :key="route.fullPath" class="route-transition-wrapper">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </div>
        </transition>
      </RouterView>

    </div>

    <SettingsModal v-if="!outsideTelegram" :show="showSettings" @close="closeSettings" @open-privacy="openPrivacy"
      @open-support="openSupport" />

    <Navbar v-if="!outsideTelegram" />

    <!-- <DevSafeDebug v-if="showDevSafeDebug" /> -->
  </div>

  <transition v-if="!outsideTelegram" name="overlay-fade" @after-leave="onOverlayHidden">
    <div v-show="overlayVisible" class="app-overlay" aria-hidden="true" role="presentation">
      <div class="app-overlay__center">
        <AppLoader :stage="loadingStage" />
      </div>
    </div>
  </transition>

  <TutorialOverlay v-if="!outsideTelegram" :show="showTutorialOverlay" :images="tutorialImages" :titles="tutorialTitles"
    :subtitles="tutorialSubtitles" :tgsFiles="tutorialTgsFiles" @close="closeTutorial" @finished="onTutorialFinished" />


  <ChannelFollowModal v-if="!outsideTelegram" :show="showChannelFollowModal" channel="@giftspredict"
    @close="closeChannelModal" @subscribe="onSubscribeToChannel" />

</template>

<script setup>
import { useRouter, useRoute, RouterView } from 'vue-router'
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue'
// at top of App.vue script setup
import { debug, info, warn, error, group, groupEnd, wrapAsync, installGlobalErrorHandlers } from '@/services/debugLogger'
import { initLayout, disposeLayout, updateLayoutVars } from '@/services/useLayoutChanges' // ensure updateLayoutVars is exported
import { getReferralFromUrl } from './services/urlParamsParse'
import { userFirstTimeOpening } from './api/requests'
import { useAppStore } from '@/stores/appStore.js'
import { useTelegram } from '@/services/telegram.js'
import { Address } from '@ton/core'
import { useTon } from './services/useTon'
import supabase from './services/supabase'
import Navbar from './components/Navbar.vue'
import Header from './components/Header.vue'
import SettingsModal from './components/SettingsModal.vue'
import AppLoader from './components/AppLoader.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import ChannelFollowModal from './components/ChannelFollowModal.vue'
import DevSafeDebug from '@/components/DebugArea.vue'

const showDevSafeDebug = ref(false)

const appDataLoading = ref(true)
const loadingStage = ref(0)
const app = useAppStore()

const { ton, ensureTon } = useTon()

const DuckMedia = ref('https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/DuckClicking.tgs')

const { user, tg } = useTelegram()

const showSettings = ref(false)

const router = useRouter()

const route = useRoute()

const API_BASE = 'https://api.giftspredict.ru'

const userFirstTime = ref(false)
const userFollowsChannel = ref(false)

const walletAddress = computed(() => {
  return app.walletAddress ?? null
})

const overlayVisible = ref(true)          // initially true so loader overlay blocks page on cold start
const overlayShownAt = ref(Date.now())   // timestamp when overlay was shown (for min visible time)

const MIN_OVERLAY_VISIBLE_MS = 450  // ensure overlay visible at least this long (tweak as needed)
const EXTRA_PAINT_FRAMES = 2        // number of requestAnimationFrame steps to wait for paint
const SAFETY_TIMEOUT = 60           // small timeout (ms) to give the browser a bit more time

// New: global flag that indicates we're running outside official Telegram
const outsideTelegram = ref(false)

function assertInTelegram() {
  if (outsideTelegram.value) {
    console.error('Outside of telegram. Please return to the official Telegram Application')
    return false
  }
  return true
}

/* ---------- new: UI state for the two overlays ---------- */
const showTutorialOverlay = ref(false)
const showChannelFollowModal = ref(false)

/* ---------- Tutorial configuration ---------- */

// helper to normalise language code to primary subtag (e.g. "en-US" -> "en")
const normalizeLang = (lc) => {
  if (!lc) return 'en'
  if (typeof lc !== 'string') return 'en'
  return lc.split('-')[0].toLowerCase()
}

// compute active language: prefer store's app.language, fallback to Telegram user language_code, then 'en'
const language = computed(() => {
  return normalizeLang(app.language ?? user?.language_code ?? 'en')
})

// localized content for tutorial. Add other languages as needed.
const TUTORIAL_BY_LANG = {
  en: {
    images: [
      // english image set (3 images)
      'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/EN_PromoTutorialFirst.png',
      'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/EN_PhoneDepositPromo.png',
      ''
    ],
    titles: [
      'Welcome to Gifts Predict!',
      'Top up & Withdraw',
      'Together is better'
    ],
    subtitles: [
      'Predict upcoming events from Telegram, Gifts and Crypto and win rewards.',
      'Top up your balance with TON or Telegram gifts. Withdrawals are processed daily.',
      'Invite friends with your referral link and earn a percentage of their winnings.'
    ],
    tgsFiles: [null, null, DuckMedia.value ?? null]
  },
  // default language (ru) — keep your original images and copy
  ru: {
    images: [
      'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/PromoTutorialFirst.png',
      'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/PhoneDepositPng.png',
      ''
    ],
    titles: [
      'Привет! Это Gifts Predict',
      'Пополнение и вывод',
      'Вместе - веселее'
    ],
    subtitles: [
      'Здесь ты можешь предсказывать будущие события из мира Telegram, Подарков и Криптовалюты.',
      'Пополняй баланс, используя TON или Телеграм подарки. Выдача призов происходит ежедневно.',
      'С помощью реферальной программы пользователи могут приглашать друзей, делиться своей реферальной ссылкой и зарабатывать процент с выигрыша других.'
    ],
    tgsFiles: [null, null, DuckMedia.value ?? null]
  }
}

// computed wrapper that returns the correct set, falling back to 'ru' then 'en'
const tutorialContent = computed(() => {
  const lang = language.value
  if (TUTORIAL_BY_LANG[lang]) return TUTORIAL_BY_LANG[lang]
  // fallback: prefer 'en' when unknown, otherwise 'ru'
  return TUTORIAL_BY_LANG.en
})

// expose computed arrays individually for easier template binding
const tutorialImages = computed(() => tutorialContent.value.images)
const tutorialTitles = computed(() => tutorialContent.value.titles)
const tutorialSubtitles = computed(() => tutorialContent.value.subtitles)
const tutorialTgsFiles = computed(() => tutorialContent.value.tgsFiles)

// helper to preload and confirm caching
function preloadTutorialImages(urls) {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ src, ok: true })
          img.onerror = () => resolve({ src, ok: false })
          img.src = src
        })
    )
  )
}

const currentTutorialIndex = ref(0)

/* ---------- helper functions for overlays ---------- */
async function openTutorial() {
  currentTutorialIndex.value = 0
  showTutorialOverlay.value = true
}

function closeTutorial() {
  showTutorialOverlay.value = false

  // Notify others that tutorial changed (detail.visible = current state)
  try {
    window.dispatchEvent(new CustomEvent('tutorial-visibility', { detail: { visible: showTutorialOverlay.value } }))
  } catch (e) { /* ignore */ }
}

function onTutorialFinished() {
  // Called when the user clicked "Я готов!" on the last step
  userFirstTime.value = false
  showTutorialOverlay.value = false
}

/* ---------- channel modal handlers ---------- */
function closeChannelModal() {
  showChannelFollowModal.value = false
}

/* Clicking subscribe should try to open the channel and then close modal.
   Optionally you may want to re-check membership afterwards with checkChannelMembership()
*/
async function onSubscribeToChannel() {
  if (!assertInTelegram()) return
  try {
    // try to open channel: prefer tg native (if available)
    try {
      tg.openTelegramLink('https://t.me/giftspredict')
    } catch (e) {
      // fallback
      window.open('https://t.me/giftspredict', '_blank')
    }

    showChannelFollowModal.value = false
  } catch (err) {
    console.error('Failed to open channel link', err)
    showChannelFollowModal.value = false
  }
}


// Wait for a couple of frames and a small timeout to ensure rendering is painted.
// Returns a promise that resolves once we believe the route is painted.
// This is intentionally conservative to avoid "semi-page" flashes.
async function waitForPaint() {
  // ensure DOM updates flushed
  await nextTick()

  // wait for N consecutive rAF frames
  await new Promise((resolve) => {
    let frames = 0
    const loop = () => {
      frames += 1
      if (frames >= EXTRA_PAINT_FRAMES) {
        return resolve()
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  // small safety timeout to let images / webfonts kick in (very short)
  await new Promise((r) => setTimeout(r, SAFETY_TIMEOUT))
}

// Called when we want to hide the overlay but ensure the page is painted first.
// Ensures a minimum visible time (so very quick operations don't cause flicker).
async function hideOverlayWhenReady() {
  const elapsed = Date.now() - overlayShownAt.value
  if (elapsed < MIN_OVERLAY_VISIBLE_MS) {
    await new Promise((r) => setTimeout(r, MIN_OVERLAY_VISIBLE_MS - elapsed))
  }

  // Wait for the route component to mount + paint
  await waitForPaint()

  // Finally hide overlay (triggers transition)
  overlayVisible.value = false
}

async function onOverlayHidden() {
  // small safety: ensure scroller reset to top after overlay gone
  if (appScrollRef.value) {
    try { appScrollRef.value.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch (e) { appScrollRef.value.scrollTop = 0 }
  }

  // Give DOM a tick
  await nextTick()

  // If tutorial was already prepared and shown earlier, don't try to reopen it
  if (showTutorialOverlay.value) {
    // tutorial already visible (it was prepared before overlay hide) — keep it and do nothing
    return
  }

  // If user is first-time but tutorial wasn't prepared for some reason, show it now
  if (userFirstTime.value) {
    openTutorial()
    showChannelFollowModal.value = false
    return
  }

  // not first time -> if user does NOT follow the channel -> show channel follow modal
  if (!userFollowsChannel.value) {
    showChannelFollowModal.value = true
  }
}

// handler that ensures DOM updated + painted before measuring
function handleMenuToggled(e) {
  // defensive: event may be CustomEvent or called without event
  const detail = e?.detail ?? {}
  // if the Navbar provided a direct measured pixel, use it right away
  if (typeof detail.requiredBottom === 'number') {
    // set the CSS var to exactly this px (no extra env() addition — measurement already includes everything)
    document.documentElement.style.setProperty('--app-bottom-space', `${detail.requiredBottom}px`)
    // ensure any keyboard var remains respected: keyboard var is separate in CSS
    return
  }

  // fallback: attempt to recalc via updateLayoutVars (if available)
  // wait for DOM update then call updateLayoutVars
  nextTick(() => {
    requestAnimationFrame(() => {
      try {
        updateLayoutVars?.() // call if exported; if not, you can call your local fallback
      } catch (err) { /* ignore */ }
    })
  })
}

// watch route name changes and recalc layout after DOM update
watch(
  () => route.name,
  async () => {
    await nextTick()
    // a short RAF can still help on mobile
    requestAnimationFrame(() => {
      try { updateLayoutVars() } catch (e) { }
    })
  }
)

async function reconnectWallet() {
  if (!assertInTelegram()) return
  ensureTon()
  // If already connected, drop the session
  if (ton.value.connected) {
    app.walletAddress = null
    await ton.value.disconnect()

    const { error } = await supabase
      .from('users')
      .update({ wallet_address: null })
      .eq('telegram', user?.id ?? 99)
    if (error) {
      console.error('Error updating wallet_address:', error)
    }

  }
  // Then always open the wallet selector
  const wallet = await ton.value.connectWallet()
  if (wallet) {
    await handleConnected(wallet)
  }
}

// add this helper near the other functions
async function handleConnected(wallet) {
  if (!assertInTelegram()) return
  // normalize address
  app.walletAddress = wallet?.account?.address || null

  let parsedAddress = null
  if (app.walletAddress !== null) {
    try {
      parsedAddress = (Address.parse(app.walletAddress)).toString({ urlSafe: true, bounceable: false })
    } catch (err) {
      console.warn('Failed to parse address', err)
    }
  }

  // update Supabase users.wallet_address (keep your previous logic)
  if (user || !user) {
    const { error } = await supabase
      .from('users')
      .update({ wallet_address: parsedAddress })
      .eq('telegram', user?.id ?? 99)
    if (error) {
      console.error('Error updating wallet_address:', error)
    }
  }
}

function openDepositWindow() {
  if (!assertInTelegram()) return
  router.push({ name: 'profile' })
}

function openPrivacy() {
  if (!assertInTelegram()) return
  // navigate to the privacy route — RouterView will render PrivacyView
  router.push({ name: 'privacy' }).catch(() => { })
  // close settings modal if open
  closeSettings()
}

function openSupport() {
  if (!assertInTelegram()) return
  try {
    tg.openTelegramLink('https://t.me/giftspredict_support')
  } catch (e) {
    // fallback: open share link in new tab
    window.open('https://t.me/giftspredict_support', '_blank')
  }
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

function historyOpenView() {
  router.push({ name: 'transactions' }).catch(() => { })
}

/* -------------------------
   NEW: ref for scroll container
   ------------------------- */
const appScrollRef = ref(null)
let removeAfterHook = null

// near the top of your <script setup>
let __menuMo = null

// keep a reference to the current back handler so we can offClick it later
let _removeBackHandler = null
let _backHandler = null
// routes where we want Telegram's back button visible
const ROUTES_SHOW_BACK_BUTTON = new Set(['BetDetails', 'deposit', 'privacy', 'bets-history',
  'gifts-prices', 'transactions', 'created-history', 'create-event'])

function enableTelegramBackButton() {
  if (!tg?.BackButton) return

  // remove any previous handler (defensive)
  try { if (_backHandler) tg.BackButton.offClick?.(_backHandler) } catch (e) { /* ignore */ }

  // create new handler that routes back in-app
  _backHandler = () => {
    // If your app uses a more specific navigation logic, adapt this:
    // e.g. router.back() or router.push({ name: 'bets' })
    try {
      // prefer router.back so browser history works naturally
      router.back()
    } catch (e) {
      // fallback to go to main bets view if back fails
      router.push({ name: 'bets' }).catch(() => { })
    }
  }

  // register handler then show the button
  try { tg.BackButton.onClick?.(_backHandler) } catch (e) { /* ignore */ }
  try { tg.BackButton.show?.() } catch (e) { /* ignore */ }
}

function disableTelegramBackButton() {
  if (!tg?.BackButton) return

  // hide the button and remove click handler
  try { tg.BackButton.hide?.() } catch (e) { /* ignore */ }
  try {
    if (_backHandler) {
      tg.BackButton.offClick?.(_backHandler)
      _backHandler = null
    }
  } catch (e) { /* ignore */ }
}

// call on each route change to show/hide button as needed
function updateBackButtonForRoute(route) {
  const name = route?.name ?? (route?.matched && route.matched[0]?.name) ?? ''
  if (ROUTES_SHOW_BACK_BUTTON.has(name)) {
    enableTelegramBackButton()
  } else {
    disableTelegramBackButton()
  }
}

// ---------------------
// Backend-backed channel membership check
// ---------------------
async function checkChannelMembership() {
  // user may be null/undefined; we'll still call backend with a missing id check
  const userId = encodeURIComponent(String(user?.id ?? ''));

  if (!userId) {
    // If you prefer: return false silently instead of hitting backend
    console.warn('checkChannelMembership called without user id');
    return false;
  }

  try {
    const url = `${API_BASE}/api/channelMembership?userId=${userId}`;
    const resp = await fetch(url, { credentials: 'include' }); // include credentials if your API uses cookies
    if (!resp.ok) {
      // try to show any helpful server error, but return false to the caller
      const body = await resp.json().catch(() => null);
      console.error('Membership endpoint error', resp.status, body);
      return false;
    }

    const json = await resp.json().catch(() => null);
    if (!json || typeof json.isMember !== 'boolean') {
      console.error('Unexpected response shape from membership endpoint', json);
      return false;
    }

    return json.isMember;
  } catch (err) {
    console.error('checkChannelMembership error', err);
    return false;
  }
}

const testingLocally = ref(true)

onMounted(async () => {
  // --- Immediately block if we don't have a Telegram user object ---
  if ((!user || typeof user !== 'object' || Object.keys(user).length === 0 || !user.id) && testingLocally.value === false) {
    console.error('Outside of telegram. Please return to the official Telegram Application')
    outsideTelegram.value = true
    // ensure overlay blocks interaction just in case (keeps blank screen)
    overlayVisible.value = true
    // stop further initialization
    return
  }

  installGlobalErrorHandlers()

  debug('[App] onMounted start', { location: window.location.href })

  window.addEventListener('menu-toggled', handleMenuToggled);
  const appEl = document.querySelector('.app') || document.documentElement;
  const mo = new MutationObserver((mutations) => { handleMenuToggled(); });
  mo.observe(appEl, { childList: true, subtree: true });
  __menuMo = mo;

  // Attempt to ready/expand Telegram early — log failures
  try {
    debug('[App] waiting for tg.ready() (if available)')
    await (tg?.ready?.() ?? Promise.resolve())
    info('[App] tg.ready() resolved')
  } catch (e) {
    console.warn('[App] tg.ready() failed or threw', { err: e?.message ?? e, stack: e?.stack })
    return
  }

  loadingStage.value = 1

  try {
    const env = detectTelegramEnvironment(tg)
    debug('[App] TG env', env)

    // Skip attempts on desktop unless you explicitly want to expand there
    if (env.isDesktop) {
      info('[App] detected desktop — skipping auto expand/fullscreen')
    } else {
      // mobile-first: prefer requestFullscreen if supported
      if (env.fullscreenSupported) {
        try {
          debug('[App] attempting tg.requestFullscreen()')
          await tg.requestFullscreen()
          info('[App] tg.requestFullscreen resolved')
        } catch (err) {
          console.warn('[App] tg.requestFullscreen failed, fallback to expand()', err)
          if (env.expandSupported) await tg.expand()
        }
      } else if (env.expandSupported) {
        debug('[App] tg.requestFullscreen not available, calling tg.expand()')
        await tg.expand()
        info('[App] tg.expand resolved')
      } else {
        debug('[App] no fullscreen/expand support detected — skipping')
      }
    }
  } catch (e) {
    console.warn('[App] expand/fullscreen attempt failed (non-fatal)', e)
  }

  loadingStage.value = 2

  try {
    // pass user id if you have it; else userFirstTimeOpening will use the current user from useTelegram()
    const isFirst = await userFirstTimeOpening(user?.id ?? 99)
    userFirstTime.value = Boolean(isFirst)
    debug('[App] userFirstTime set', { userFirstTime: userFirstTime.value })
  } catch (e) {
    // Conservative fallback: not first time (do not block init)
    console.error('[App] userFirstTimeOpening failed, defaulting to false', e)
    userFirstTime.value = false
  }

  if (userFirstTime.value === false) {
    try {
      // pass user id if you have it; else userFirstTimeOpening will use the current user from useTelegram()
      const followsChannel = await checkChannelMembership()
      userFollowsChannel.value = Boolean(followsChannel)
    } catch (e) {
      // Conservative fallback: not first time (do not block init)
      console.error('[App] userChannelMembership check failed, defaulting to false', e)
      userFollowsChannel.value = false
    }
  }

  // visualViewport settle wait
  debug('[App] waiting for visualViewport settle (180ms max)')
  // Wait for visualViewport to settle OR fallback to short timeout
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const cleanup = () => {
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', finish);
      window.removeEventListener('orientationchange', finish);
      clearTimeout(timer);
    };

    // prefer the visualViewport resize event (fires when host UI changes)
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', finish);
      window.addEventListener('orientationchange', finish);
    }

    // always fallback if no event or it doesn't fire quickly
    const timer = setTimeout(finish, 180); // 120-250ms is a good sweet spot
  });
  info('[App] visualViewport settled (or timeout)')

  // init layout subsystem, measure/layout
  try {
    initLayout({ telegram: tg })
    debug('[App] initLayout called')
    updateLayoutVars()
    debug('[App] updateLayoutVars initial call done', {
      tgViewportStable: getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-stable-height')
    })
  } catch (e) {
    warn('[App] layout init failed', { err: e?.message ?? e, stack: e?.stack })
  }

  // attach visualViewport resize -> updateLayoutVars
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLayoutVars)
    info('[App] visualViewport resize handler attached')
  }
  window.addEventListener('orientationchange', updateLayoutVars)

  loadingStage.value = 3

  const referral = getReferralFromUrl({ tgInstance: tg, persist: true }) // returns Number or null
  info('[App] referral detected', { referral })

  // Make app.init observable/wrapped so errors/time reported
  const wrappedInit = wrapAsync(app.init.bind(app), 'app.init')
  try {
    group('[App] app.init')
    const t0 = Date.now()
    await wrappedInit(referral)
    info('[App] app.init completed', { durationMs: Date.now() - t0, userTelegram: app.user?.telegram })
  } catch (err) {
    error('[App] app.init failed', { err: (err && (err.message || String(err))) ?? err, stack: err?.stack })
    // optional: rethrow or show UI
  } finally {
    groupEnd()
  }

  loadingStage.value = 4

  // If user is first-time, prepare & show the tutorial overlay *early*
  if (userFirstTime.value) {
    // Preload images so they appear instantly when overlay fades
    const results = await preloadTutorialImages(tutorialImages.value)
    console.log('[App] preloadTutorialImages done', results)

    // you could also delay showing the tutorial until they are ready:
    showTutorialOverlay.value = results.every(r => r.ok)
    console.log('[App] showTutorialOverlay set true', showTutorialOverlay.value, 'overlayVisible=', overlayVisible.value)

    // We do NOT open channel modal in this case — tutorial is superior
    showChannelFollowModal.value = false
  }

  // set initial state for current route
  updateBackButtonForRoute(router.currentRoute.value)

  // update on each navigation
  _removeBackHandler = router.afterEach((to) => updateBackButtonForRoute(to))

  // ensure initial state starts at the top
  if (appScrollRef.value) {
    appScrollRef.value.scrollTop = 0
    debug('[App] scroller reset to top')
  }

  removeAfterHook = router.afterEach((to) => {
    // Wait for Vue DOM update, then measure — wrapped in RAF for extra safety
    nextTick(() => {
      requestAnimationFrame(() => {
        // Reset the custom scroll container position (your existing logic)
        if (appScrollRef.value) {
          try {
            appScrollRef.value.scrollTo({ top: 0, left: 0, behavior: 'auto' })
          } catch (e) {
            appScrollRef.value.scrollTop = 0
          }
        }

        // Recalculate layout AFTER DOM updates (menu/header v-if changes)
        try {
          updateLayoutVars()
        } catch (e) {
          // ignore errors
        }
      })
    })
  })
  debug('[App] onMounted done')

  // When you decide you finished loading, instead of setting appDataLoading=false directly,
  // leave appDataLoading for any logic that depends on it, but ensure overlay hide waits for paint:
  loadingStage.value = 5

  // mark when overlay was shown (so minimum visible time is honored)
  overlayShownAt.value = Date.now()

  // ensure any final microtasks done, then begin hide sequence
  // (your previous code used: setTimeout(() => { appDataLoading.value = false }, 700);
  //  you can keep that if you need minimum loader time - here we call hide logic)
  setTimeout(() => {
    // mark that data is loaded — keep this for any other logic that depends on appDataLoading
    appDataLoading.value = false

    // then start the conservative hide routine which waits for router view to paint
    hideOverlayWhenReady().catch((e) => {
      // always hide overlay even on errors after fallback small timeout
      setTimeout(() => { overlayVisible.value = false }, 250)
      console.error('hideOverlayWhenReady failed', e)
    })
  }, 500);
})

// cleanup at top-level
onBeforeUnmount(() => {
  if (typeof _removeBackHandler === 'function') _removeBackHandler()   // cleanup router hook
  disableTelegramBackButton()   // ensure Telegram button state cleaned up

  disposeLayout()

  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateLayoutVars);
  }
  window.removeEventListener('orientationchange', updateLayoutVars);

  window.removeEventListener('menu-toggled', handleMenuToggled)
  try {
    if (__menuMo) __menuMo.disconnect()
    __menuMo = null
  } catch (e) { }
})

// utils/tgEnv.js
function detectTelegramEnvironment(tg = window?.Telegram?.WebApp) {
  const ua = (navigator.userAgent || '').toLowerCase()
  const platformRaw = (tg && typeof tg.platform === 'string') ? tg.platform.toLowerCase() : ''

  // Known platform tokens seen in docs / implementations:
  // mobile: 'android', 'ios', 'iphone', 'ipad'
  // desktop: 'tdesktop', 'macos', 'windows', 'linux'
  // web clients: 'weba', 'webk', 'web'
  const platform = platformRaw || ''

  // simple token checks on platform string
  const platformIsDesktopToken = /tdesktop|desktop|macos|windows|linux/.test(platform)
  const platformIsWebToken = /weba|webk|web/.test(platform)
  const platformIsMobileToken = /android|ios|iphone|ipad/.test(platform)

  // feature-detection: what the Telegram WebApp exposes
  const fullscreenSupported = !!(tg && typeof tg.requestFullscreen === 'function')
  const expandSupported = !!(tg && typeof tg.expand === 'function')
  const hasIsFullscreenFlag = !!(tg && typeof tg.isFullscreen !== 'undefined')
  const hasIsExpandedFlag = !!(tg && typeof tg.isExpanded !== 'undefined')

  // userAgent heuristics as last resort
  const uaIsMobile = /mobi|android|iphone|ipad/.test(ua)
  const uaIsDesktop = /windows|macintosh|linux|cros|x11/.test(ua)

  // Final resolution (prefer Telegram platform token > feature detection > UA)
  const isDesktop = platformIsDesktopToken || (platformIsWebToken && !platformIsMobileToken) || (!platform && uaIsDesktop)
  const isMobile = platformIsMobileToken || (!platform && uaIsMobile)

  return {
    platform,               // raw platform string from Telegram (may be '')
    isDesktop,
    isMobile,
    fullscreenSupported,    // tg.requestFullscreen exists
    expandSupported,        // tg.expand exists
    hasIsFullscreenFlag,
    hasIsExpandedFlag,
    ua // raw ua for debugging if needed
  }
}

</script>

<style lang="css" scoped>
/* overlay styles - absolutely cover the app and center loader */
.app-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  /* put above everything */
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 1);
  /* transparent base so underlying page can still be measured during paint */
  pointer-events: auto;
}

/* center wrapper for loader - keeps loader centered and stacked in overlay */
.app-overlay__center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* fade transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 360ms cubic-bezier(.22, .9, .32, 1), transform 360ms ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.overlay-fade-enter-to,
.overlay-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* When overlay is hidden we disable pointer events so the page receives interaction */
.app-overlay[style*="display: none"],
.app-overlay[aria-hidden="true"][v-cloak] {
  pointer-events: none;
}

/* base overlay = fully dark + blurred */
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
  z-index: 10;
}

.overlay--visible {
  background-color: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(3px);
}

/* Modal container, 45vh tall, pinned bottom */
.settings-modal {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 45vh;
  background: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 1rem;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 12;
}

/* FADE TRANSITION FOR OVERLAY OPACITY */
.fade-enter-active,
.fade-leave-active {
  transition:
    background-color 300ms ease-out,
    backdrop-filter 300ms ease-out;
}

/* transition on both props */
.fade-enter-active,
.fade-leave-active {
  transition:
    background-color 300ms ease-out,
    backdrop-filter 300ms ease-out;
}

/* override on enter-from & leave-to → “start at zero” */
.fade-enter-from,
.fade-leave-to {
  background-color: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
}

/* SLIDE-UP TRANSITION FOR MODAL */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 300ms ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.slide-up-enter-to,
.slide-up-leave-from {
  transform: translateY(0%);
}

.app-scroll-container {
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* hide in IE/Edge */

  /* enable scrolling */
  overflow-y: auto;

  /* hide scrollbar in WebKit browsers */
  -webkit-overflow-scrolling: touch;
  /* smooth on iOS */
}

.app-scroll-container::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* wrapper that doesn't change layout but gives transition an element to animate */
.route-transition-wrapper {
  width: 100%;
  /* let children decide height; if you want full height, use min-height:100vh or flex settings */
}

/* existing route-fade from before (copy if not present) */
.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 350ms cubic-bezier(.22, .9, .32, 1), transform 200ms ease;
}

.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
}

.route-fade-enter-to,
.route-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
