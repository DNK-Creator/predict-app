import { createRouter, createWebHistory } from 'vue-router'
import ProfileView from '../views/ProfileView.vue'
import HolidaysView from '@/views/HolidaysView.vue'
import BetsView from '@/views/BetsView.vue'
import BetDetails from '@/components/bet-details/BetDetails.vue'
import DepositView from '@/views/DepositView.vue'
import BetsHistoryList from '@/components/BetsHistoryList.vue'
import PrivacyView from '@/views/PrivacyView.vue'
import GiftsPricesView from '@/views/GiftsPricesView.vue'
import HistoryView from '@/views/HistoryView.vue'
import RunningView from '@/views/RunningView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
    },
    {
      path: '/holidays',
      name: 'holidays',
      component: HolidaysView,
    },
    {
      path: '/',
      name: 'bets',
      component: BetsView,
    },
    {
      path: '/bets-history',
      name: 'bets-history',
      component: BetsHistoryList,
      props: true,
    },
    {
      path: '/bets/:id',
      name: 'BetDetails',
      component: BetDetails,
      props: true
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: PrivacyView,
    },
    {
      path: '/gifts-prices',
      name: 'gifts-prices',
      component: GiftsPricesView,
    },
    {
      path: '/history',
      name: 'history',
      component: HistoryView,
    },
    {
      path: '/running',
      name: 'running',
      component: RunningView,
    },
  ],
})

export default router
