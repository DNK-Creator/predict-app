<template>
    <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow">
        <ProfileCard :user="user" :totalVolume="volume" :betsMade="betsMade" :betsWon="betsWon"
            @view-previous-bets="previousBetsHistory" @view-won-bets="wonBetsHistory" />
        <ActiveBetsList />
        <ReferalCard />
    </div>
</template>

<script setup>
// Vue & reactivity
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

// Your services
import { useTelegram } from '@/services/telegram.js'

import ReferalCard from '@/components/user-profile/ReferalCard.vue'
import ProfileCard from '@/components/user-profile/ProfileCard.vue'
import ActiveBetsList from '@/components/user-profile/ActiveBetsList.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'

import { getUsersWonBetsCount, getUsersBetsSummary } from '@/api/requests'

// ——— Telegram user ———
const { user } = useTelegram()
const router = useRouter()

const betsMade = ref(0)
const betsWon = ref(0)
const volume = ref(0)

const spinnerShow = ref(true)

function previousBetsHistory() {
    router.push({ name: 'bets-history', query: { filter: 'all' } })
}

function wonBetsHistory() {
    router.push({ name: 'bets-history', query: { filter: 'won' } })
}

onMounted(async () => {
    // Destructure the object your RPC returns:
    const { countBets, totalVolume } = await getUsersBetsSummary()
    betsWon.value = await getUsersWonBetsCount()

    // Now assign each one separately
    betsMade.value = countBets
    volume.value = totalVolume

    spinnerShow.value = false;
})

</script>