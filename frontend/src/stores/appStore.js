// src/stores/appStore.js
import { defineStore } from 'pinia'
import supabase from '@/services/supabase.js'
import { getOrCreateUser, registerRef, getUsersByTelegrams } from '@/api/requests.js'
import { useTelegram } from '@/services/telegram.js'

export const useAppStore = defineStore('app', {
  state: () => ({
    user: null,         // DB user row
    points: 0,
    referrals: [],      // [{ telegram, username, total_winnings, commission }]
    loadingReferrals: false,
    _pointsChannel: null,
    _userChannel: null,
  }),
  actions: {
    /* INIT */
    async init(refParam) {
      const { user: tgUser, ready } = useTelegram()
      try { if (typeof ready === 'function') await ready() } catch (e) { /* ignore */ }

      const telegramId = Number(tgUser?.id ?? 99)
      if (!telegramId) {
        console.warn('No telegram id available on init')
        return
      }

      // fetch/create the user row (RPC or function you created)
      try {
        this.user = await getOrCreateUser(telegramId, { first_name: tgUser?.username })
      } catch (err) {
        console.error('Failed to get/create user row', err)
        throw err
      }

      // If there's an inviter param, register ref (only if not same user)
      const inviterId = refParam == null ? null : Number(refParam)
      if (inviterId && Number.isFinite(inviterId) && inviterId !== telegramId) {
        console.log('[app.init] registering referral', inviterId, 'for', telegramId)
        try {
          await registerRef(inviterId, null, telegramId, tgUser?.username ?? 'Anonymous')
          this.user = await getOrCreateUser(telegramId)
        } catch (err) {
          console.error('registerRef failed', err)
        }
      }


      // load referrals data (either from user.friends or by querying referred_by)
      await this.loadReferrals()

      // load points and subscribe to changes
      await this.fetchPoints()
      this.subscribePointChanges()
      this.subscribeUserChanges()
    },

    /* POINTS */
    async fetchPoints() {
      if (!this.user?.telegram) return
      try {
        const { data, error } = await supabase
          .from('users')
          .select('points')
          .eq('telegram', Number(this.user.telegram))
          .single()
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

    subscribePointChanges() {
      if (!this.user?.telegram) return
      // unsubscribe previous if present
      if (this._pointsChannel) {
        try { supabase.removeChannel(this._pointsChannel) } catch (e) { /* ignore */ }
        this._pointsChannel = null
      }

      const channel = supabase
        .channel(`points-${this.user.telegram}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `telegram=eq.${this.user.telegram}`,
        }, payload => {
          // whenever the user's row changes, re-fetch points
          this.fetchPoints()
        })
        .subscribe()

      this._pointsChannel = channel
    },

    subscribeUserChanges() {
      // subscribe to changes on the user row so we can refresh referrals/bonus when needed
      if (!this.user?.telegram) return

      if (this._userChannel) {
        try { supabase.removeChannel(this._userChannel) } catch (e) { /* ignore */ }
        this._userChannel = null
      }

      const ch = supabase
        .channel(`user-${this.user.telegram}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `telegram=eq.${this.user.telegram}`,
        }, payload => {
          // refresh stored user row and referrals if relevant fields changed
          this.refreshUserRow()
        })
        .subscribe()

      this._userChannel = ch
    },

    async refreshUserRow() {
      if (!this.user?.telegram) return
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('telegram', Number(this.user.telegram))
          .single()

        if (!error && data) {
          this.user = data
          // reload referrals if friends object changed or referred_by logic changed
          await this.loadReferrals()
        }
      } catch (err) {
        console.error('refreshUserRow error', err)
      }
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

        // 2) FALLBACK: fetch users where referred_by == current user's telegram
        const { data: referredRows, error } = await supabase
          .from('users')
          .select('telegram, total_winnings')
          .eq('referred_by', Number(this.user.telegram))

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

    /* CLEANUP (call on app tear-down) */
    async dispose() {
      try {
        if (this._pointsChannel) {
          supabase.removeChannel(this._pointsChannel)
          this._pointsChannel = null
        }
        if (this._userChannel) {
          supabase.removeChannel(this._userChannel)
          this._userChannel = null
        }
      } catch (e) { /* ignore */ }
    }
  }
})
