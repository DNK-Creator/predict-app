import {
  getOrCreateUser,
  registerRef,
  getUsersPoints,
} from '../api/requests.js'
import { defineStore } from 'pinia'
import { useTelegram } from '../services/telegram.js'
import supabase from '@/services/supabase.js'

const { user } = useTelegram()

export const useAppStore = defineStore('app', {
  state: () => ({
    user: {},
    points: 0,
  }),
  actions: {
    async init(ref) {
      this.user = await getOrCreateUser()
      if (ref && +ref !== +this.user.telegram) {
        await registerRef(user?.first_name ?? 'Nameless Referal', ref)
      }
      await this.fetchPoints()
      this.subscribePointChanges()
    },
    async fetchPoints() {
      // call your API helper
      this.points = await getUsersPoints()
    },
    setPoints(newPoints) {
      this.points = newPoints
    },
    subscribePointChanges() {
      // if (!user?.id) return
      supabase
        .channel(`points-${user?.id ?? 99}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `telegram=eq.${user?.id ?? 99}`,
        }, payload => {
          // whenever the user's row changes, re-fetch points
          this.fetchPoints()
        })
        .subscribe()
    },
  },
})