<template>
    <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow">
        <ReferalShareModal :show="showReferalModal" @close="closeReferalModal" />
        <ProfileCard :user="user" :totalVolume="volume" :betsMade="betsMade" :betsWon="betsWon"
            @view-previous-bets="previousBetsHistory" @view-won-bets="wonBetsHistory" />
        <ActiveBetsList />
        <ReferalCard @open-referal-modal="openReferalModal" />
    </div>
</template>

<script setup>
// Vue & reactivity
import { ref, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

// Your services
import { useTelegram } from '@/services/telegram.js'

import ReferalCard from '@/components/user-profile/ReferalCard.vue'
import ProfileCard from '@/components/user-profile/ProfileCard.vue'
import ActiveBetsList from '@/components/user-profile/ActiveBetsList.vue'
import ReferalShareModal from '@/components/ReferalShareModal.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'

import { getUsersWonBetsCount, getUsersBetsSummary } from '@/api/requests'

// ——— Telegram user ———
const { user } = useTelegram()
const router = useRouter()

const betsMade = ref(0)
const betsWon = ref(0)
const volume = ref(0)

const spinnerShow = ref(true)
const loading = ref(false)

const showReferalModal = ref(false)

function openReferalModal() {
    showReferalModal.value = true
}

function closeReferalModal() {
    showReferalModal.value = false
}

function previousBetsHistory() {
    router.push({ name: 'bets-history', query: { filter: 'all' } })
}

function wonBetsHistory() {
    router.push({ name: 'bets-history', query: { filter: 'won' } })
}

async function loadProfileSummary() {
    // guard against concurrent loads
    if (loading.value) return
    loading.value = true

    try {
        // If both endpoints are independent, fetch in parallel for speed
        const [summary, wonCount] = await Promise.all([
            getUsersBetsSummary(),
            getUsersWonBetsCount()
        ])

        // summary shape assumed: { countBets, totalVolume }
        const { countBets = 0, totalVolume = 0 } = summary || {}

        betsMade.value = countBets
        volume.value = totalVolume
        betsWon.value = wonCount ?? 0
    } catch (err) {
        console.error('Failed to load profile summary', err)
        // keep previous values rather than clearing on error
    } finally {
        loading.value = false
        spinnerShow.value = false
    }
}

// initial load when component mounts
onMounted(() => {
    loadProfileSummary()
})

// also refresh when component is re-activated (useful for <keep-alive>)
onActivated(() => {
    loadProfileSummary()
})

// refresh when the user returns to the tab (optional but useful)
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        loadProfileSummary()
    }
}
document.addEventListener('visibilitychange', handleVisibilityChange)

// cleanup listener when component unmounts
onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>
