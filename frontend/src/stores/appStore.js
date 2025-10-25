import { defineStore } from 'pinia'
import { getOrCreateUser, registerRef, getUsersByTelegrams, getUsersWalletAddress, updateUsername, getUsersPoints, subscribeToPointsChange, getUsersLanguage, changeUsersLanguage, fetchUserReferrals, getUsersTransactions } from '@/api/requests.js'
import { useTelegram } from '@/services/telegram.js'
import { debug, info, warn, error, group, groupEnd } from '@/services/debugLogger'

function normalizeLangCode(lc) {
  if (!lc) return 'en'
  if (typeof lc !== 'string') return 'en'
  return lc.split('-')[0].toLowerCase()
}

function normalizeUsername(u) {
  if (!u) return ''
  try {
    return String(u).replace(/^@+/, '')
  } catch (e) {
    return ''
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    user: null,
    language: "en",
    points: 0,
    referrals: [],
    transactions,
    loadingReferrals: false,
    _pointsChannel: null,
    _userChannel: null,
    walletAddress: null,
    demoMode: false,
    openDepositFlag: false,
  }),
  actions: {
    /* INIT */
    async init(refParam) {
      group('[app.init] start')
      const tStart = Date.now()

      const { user: tgUser, ready } = useTelegram()

      const languageCode = tgUser?.language_code ?? 'en'

      debug('[app.init] telegram raw user', { tgUser })

      try { if (typeof ready === 'function') await ready() } catch (e) { warn('[app.init] tg.ready threw', { e }) }

      const telegramId = Number(tgUser?.id)
      if (!telegramId) {
        console.warn('No telegram id available on init')
        warn('[app.init] no telegram id; aborting init', { tgUser })
        groupEnd()
        return
      }
      debug('[app.init] telegramId resolved', { telegramId })

      // fetch/create the user row (RPC or function you created)
      try {
        debug('[app.init] calling getOrCreateUser', { telegramId })
        this.user = await getOrCreateUser(languageCode)
        info('[app.init] getOrCreateUser OK', { userId: this.user?.id, telegram: this.user?.telegram })
      } catch (err) {
        console.error('Failed to get/create user row', err)
        error('[app.init] getOrCreateUser failed', { err: err?.message ?? err, stack: err?.stack })
        throw err
      }

      // ensure DB username matches Telegram username; if not, update DB
      try {
        await this.syncTelegramUsername(tgUser)
      } catch (e) {
        // don't block init on username sync failures
        warn('[app.init] username sync failed', { err: e?.message ?? e })
      }

      this.walletAddress = await getUsersWalletAddress()

      // handle referral registration
      try {
        const inviterId = refParam == null ? null : Number(refParam)
        if (inviterId && Number.isFinite(inviterId) && inviterId !== telegramId) {
          debug('[app.init] registering referral', { inviterId, telegramId })
          await registerRef(inviterId, null, telegramId, tgUser?.username ?? 'Anonymous')
          // refresh user after register
          this.user = await getOrCreateUser(languageCode)
          info('[app.init] registerRef OK & user refreshed', { user: this.user })
        } else {
          debug('[app.init] no valid inviterId or inviter equals self', { inviterId })
        }
      } catch (err) {
        warn('[app.init] registerRef failed', { err: err?.message ?? err })
        // continue — we don't want to block the whole init for referral fail
      }

      // load referrals
      try {
        debug('[app.init] loading referrals for user', { telegram: this.user?.telegram })
        await this.loadReferrals()
        info('[app.init] loadReferrals done', { referralsCount: this.referrals?.length ?? 0 })
      } catch (err) {
        warn('[app.init] loadReferrals threw', { err: err?.message ?? err })
      }

      // points fetch and subscriptions
      try {
        debug('[app.init] fetching points & subscribing')
        await this.fetchPoints()
        subscribeToPointsChange()
        info('[app.init] points fetched & subscriptions set', { points: this.points })
      } catch (err) {
        warn('[app.init] points/subscriptions failed', { err: err?.message ?? err })
      }

      // after this.user assignment in init
      // prefer DB row's language; fallback to telegram language_code we passed
      try {
        const dbLang = this.user?.language ?? null
        // languageCode variable from earlier in init still available
        const finalLang = normalizeLangCode(dbLang ?? languageCode ?? 'en')
        this.language = finalLang
        debug('[app.init] language set on store', { language: this.language, dbLang, languageCode })
      } catch (e) {
        // defensive: don't break init on language issues
        console.warn('Failed to set language in store', e)
      }

      info('[app.init] finished', { durationMs: Date.now() - tStart })
      groupEnd()
    },

    /**
* Sync Telegram username to users table if it differs from DB value.
* - Strips leading @ for comparison only (stores the original tg username as-is).
* - Non-blocking: logs and returns false on failure.
*/
    async syncTelegramUsername(tgUser) {
      try {
        if (!tgUser) {
          debug('[syncTelegramUsername] no tgUser provided')
          return false
        }

        const tgNameRaw = tgUser?.username ?? ''
        if (!tgNameRaw) {
          debug('[syncTelegramUsername] telegram username empty — nothing to sync')
          return false
        }

        const tgName = normalizeUsername(tgNameRaw)
        const dbName = normalizeUsername(this.user?.username)

        if (tgName === dbName) {
          debug('[syncTelegramUsername] username already matches DB', { tgName, dbName })
          return false
        }

        debug('[syncTelegramUsername] attempting DB update', { from: dbName, to: tgName })

        const { error } = await updateUsername(tgNameRaw)

        if (error) {
          console.error('syncTelegramUsername supabase update error', error)
          warn('[syncTelegramUsername] supabase update error', { err: error })
          return false
        }

        // update in-memory user row too
        try { if (this.user) this.user.username = tgNameRaw } catch (e) { /* ignore */ }

        info('[syncTelegramUsername] username updated', { old: dbName, new: tgName })
        return true
      } catch (err) {
        console.error('syncTelegramUsername unexpected error', err)
        warn('[syncTelegramUsername] unexpected', { err: err?.message ?? err })
        return false
      }
    },

    // Set demo mode locally (no DB persistence). This updates the Pinia store only.
    setDemoMode(value) {
      try {
        this.demoMode = !!value
      } catch (e) {
        console.warn('setDemoMode failed', e)
      }
    },

    /* POINTS */
    async fetchPoints() {
      if (!this.user?.telegram) return
      try {

        const { data, error } = await getUsersPoints()

        if (error) {
          console.error('fetchPoints error', error)
          return
        }
        // numeric -> might be string, coerce to number
        const pts = Number(data?.points ?? 0)
        this.points = Number.isFinite(pts) ? pts : 0
      } catch (err) {
        console.error('fetchPoints unexpected', err)
      }
    },

    setPoints(newPoints) {
      this.points = newPoints
    },

    /* LANGUAGE */
    async fetchLanguage() {
      if (!this.user?.telegram) return
      try {
        const { data, error } = await getUsersLanguage()
        if (error) {
          console.error('fetchLanguage error', error)
          return
        }
        this.language = String(data?.language ?? 'en')
      } catch (err) {
        console.error('fetchLanguage unexpected', err)
      }
    },

    // Add this helper to set language locally (synchronous)
    setLanguage(lang) {
      try {
        const code = normalizeLangCode(lang)
        this.language = code
      } catch (e) {
        console.warn('setLanguage failed', e)
      }
    },

    // Persist language to Supabase and update local state (async)
    async changeLanguage(lang) {
      const code = normalizeLangCode(lang)
      this.language = code

      if (this.user?.telegram) {
        try {
          const { error } = await changeUsersLanguage(code)

          if (error) {
            console.error('changeLanguage: supabase update error', error)
            return false
          }

          try { this.user.language = code } catch (e) { /* ignore */ }

          return true
        } catch (err) {
          console.error('changeLanguage unexpected', err)
          return false
        }
      }

      // no DB user row: just updated local store (useful in early init or anonymous)
      return true
    },

    /* REFERRALS loader: supports both friends jsonb and referred_by fallback */
    async loadReferrals() {
      this.loadingReferrals = true
      try {
        const friendsObj = this.user?.friends ?? null

        // 1) If friends object exists and has keys, use it (we preserve stored usernames)
        if (friendsObj && typeof friendsObj === 'object' && Object.keys(friendsObj).length > 0) {
          const keys = Object.keys(friendsObj)
          // batch fetch referred users' stats using helper
          const rows = await getUsersByTelegrams(keys) // returns [{telegram, total_winnings}, ...]
          const map = new Map(rows.map(r => [String(r.telegram), r]))

          this.referrals = keys.map(k => {
            const entry = friendsObj[k] ?? {}
            const row = map.get(String(k)) ?? {}
            const tw = Number(row?.total_winnings ?? 0)
            const safeTw = Number.isFinite(tw) ? tw : 0
            return {
              telegram: k,
              username: entry.username ?? (`@${k}`),
              total_winnings: safeTw,
              commission: +(safeTw * 0.03)
            }
          })
          this.loadingReferrals = false
          return
        }

        const { data: referredRows, error } = await fetchUserReferrals()

        if (error) {
          console.error('loadReferrals fallback query error', error)
          this.referrals = []
          this.loadingReferrals = false
          return
        }

        // Build list. We don't have usernames in this fallback, so use @id as fallback.
        this.referrals = (referredRows ?? []).map(r => {
          const tw = Number(r?.total_winnings ?? 0)
          const safeTw = Number.isFinite(tw) ? tw : 0
          return {
            telegram: String(r.telegram),
            username: `@${r.telegram}`,
            total_winnings: safeTw,
            commission: +(safeTw * 0.03)
          }
        })
      } catch (err) {
        console.error('loadReferrals unexpected error', err)
        this.referrals = []
      } finally {
        this.loadingReferrals = false
      }
    },
  }
})
