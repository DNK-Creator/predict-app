<template>
    <!-- <LoaderPepe v-if="spinnerShow" /> -->

    <!-- animated content: appears after spinnerHide -->
    <transition name="profile-fade" appear>
        <div v-show="showProfile" class="profile-view-container">
            <ReferalShareModal :show="showReferalModal" @close="closeReferalModal" />
            <ProfileCard :user="user" :totalVolume="volume" :betsMade="betsMade" :betsWon="betsWon"
                @view-previous-bets="previousBetsHistory" @view-won-bets="wonBetsHistory" />
            <ActiveBetsList />
            <ReferalCard @open-referal-modal="openReferalModal" />
        </div>
    </transition>
</template>

<script setup>
// Vue & reactivity
import { ref, onMounted, onActivated, onBeforeUnmount, nextTick, watch } from 'vue'
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
const showProfile = ref(false)

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

// when spinnerShow changes, show content only after spinner is hidden
watch(spinnerShow, async (spinnerIsVisible) => {
    if (spinnerIsVisible) {
        // spinner showing → hide profile content
        showProfile.value = false
        return
    }

    // spinner hidden → show content after a paint to avoid flicker
    await nextTick()
    requestAnimationFrame(() => { showProfile.value = true })
}, { immediate: true })

// also re-trigger when kept-alive component is activated
onActivated(async () => {
    // if spinner is currently visible, don't run the show/hide dance
    if (spinnerShow.value) {
        // still loading — refresh data and bail out
        await loadProfileSummary()
        return
    }

    // otherwise briefly hide then show so the transition runs again when returning
    showProfile.value = false
    await nextTick()
    requestAnimationFrame(() => { showProfile.value = true })

    // refresh data
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

<style scoped>
/* profile view appear animation */
.profile-fade-enter-active,
.profile-fade-leave-active {
    transition: opacity 260ms cubic-bezier(.22, .9, .32, 1), transform 260ms ease;
    will-change: opacity, transform;
}

.profile-fade-enter-from,
.profile-fade-leave-to {
    opacity: 0;
    transform: translateY(8px) scale(0.996);
    pointer-events: none;
}

.profile-fade-enter-to,
.profile-fade-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
}

/* optional container sizing so layout doesn't jump */
.profile-view-container {
    min-height: 1px;
    /* keep layout behaviour same as before; adjust if you need full viewport height */
}
</style>
