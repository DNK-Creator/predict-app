<template>
    <div class="bets-catalogue" role="tablist" aria-label="Каталог ставок">
        <button class="catalog-btn" :class="{ active: helperQuickSelected === 'active' }" role="tab"
            @click="selectActiveTab">
            {{ $t('active') }}
        </button>
        <button class="catalog-btn" :class="{ active: helperQuickSelected === 'past' }" role="tab"
            @click="selectPastTab">
            {{ $t('past') }}
        </button>
    </div>
    <div class="create-event-button" @click="createEventFunc">
        <img :src="createIcon" class="create-icon">
        <span>{{ $t('create-event') }}</span>
    </div>
    <div class="lists-parent">
        <div class="bets-list" v-show="helperQuickSelected === 'active' || selectedTab === 'active'"
            :class="{ listActive: isActiveShown }">
            <div class="list-element" v-for="event in activeEvents" :key="event.id">
                <BetsCard :title="translatedTitle(event)" :app="app" :eventLogo="event.image_path"
                    :pool="event.volume_number" :chance="normalizedOdds(event)" :betResult="event.result"
                    :isActiveList="isActiveSelected" :volume="event.volume" :currentOdds="event.currentOdds"
                    :status="computeBetStatus(event.close_time, event.result)" :betTypeText="translatedEventType(event)"
                    :totalTickets="event.giveaway_total_tickets" :endsAt="event.close_time"
                    @click="openBetPage(event.id)" @share="shareBetFunction(event.name, event.name_en)" />
            </div>
            <div ref="activeSentinel" class="list-sentinel" aria-hidden="true"></div>
        </div>
        <div class="bets-list" v-show="helperQuickSelected === 'past' || selectedTab === 'past'"
            :class="{ listActive: isPastShown }">
            <div class="list-element" v-for="event in pastEvents" :key="event.id">
                <BetsCard :title="translatedTitle(event)" :app="app" :eventLogo="event.image_path"
                    :pool="event.volume_number" :chance="normalizedOdds(event)" :betResult="event.result"
                    :isActiveList="isActiveSelected" :volume="event.volume" :currentOdds="event.currentOdds"
                    :status="computeBetStatus(event.close_time, event.result)" :betTypeText="translatedEventType(event)"
                    :totalTickets="event.giveaway_total_tickets" :endsAt="event.close_time"
                    @click="openBetPage(event.id)" @share="shareBetFunction(event.name, event.name_en)" />
            </div>
            <div ref="pastSentinel" class="list-sentinel" aria-hidden="true"></div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { parseISO, differenceInMilliseconds } from 'date-fns'
import { fetchActiveBets, fetchPastBets } from '@/services/bets-requests'
import { useAppStore } from '@/stores/appStore'
import { useTelegram } from '@/services/telegram'
import BetsCard from '@/components/bet-details/BetsCard.vue'
import createIcon from '@/assets/icons/Plus_White_Icon.png'

const activeEvents = ref([])
const activeLoading = ref(true)

const pastEvents = ref([])
const pastLoading = ref(true)

const selectedTab = ref('active')
const helperQuickSelected = ref('active')
const helperAnimPassed = ref(true)
const isActiveShown = ref(true)
const isPastShown = ref(false)

// Infinite Scroll Values below
const activePage = ref(0)
const pastPage = ref(0)
const pageSize = 8
const activeHasMore = ref(true)
const pastHasMore = ref(true)
const isLoadingMoreActive = ref(false)
const isLoadingMorePast = ref(false)

const activeSentinel = ref(null)
const pastSentinel = ref(null)

let activeObserver = null
let pastObserver = null

const app = useAppStore()
const { tg, user } = useTelegram()
const router = useRouter()

const translatedTitle = (event) => {
    return app.language === 'ru' ? event.name : event.name_en
}

const translatedEventType = (event) => {
    return app.language === 'ru' ? event.event_type : event.event_type_en
}

const normalizedOdds = (event) => {
    return Number(event.current_odds.toFixed(2) * 100).toFixed(0)
}

const isActiveSelected = computed(() => {
    return selectedTab.value === 'active'
})

function openBetPage(id) {
    router.push({ name: 'BetDetails', params: { id } })
}

function createEventFunc() {
    router.push({ name: 'create-event'})
}

function computeBetStatus(closeTimeIso, result) {
    if (!closeTimeIso) return app.language === 'ru' ? 'Обработка' : 'Validating'
    const now = new Date()
    const close = parseISO(closeTimeIso)
    const diffMs = differenceInMilliseconds(close, now)

    if (diffMs <= 0 && result === 'undefined') {
        return app.language === 'ru' ? 'Обработка' : 'Validating'
    }
    else if (diffMs <= 0) {
        return app.language === 'ru' ? 'Закрыто' : 'Closed'
    }

    return app.language === 'ru' ? 'Открыто' : 'Open'
}

onMounted(async () => {
    await loadMoreActiveEvents()
    await loadMorePastEvents()

    if (helperQuickSelected.value === 'active') {
        observeActiveSentinel()
    } else {
        observePastSentinel()
    }
})

onBeforeUnmount(() => {
    if (activeObserver) activeObserver.disconnect()
    if (pastObserver) pastObserver.disconnect()
})

watch(helperQuickSelected, (newVal) => {
    if (newVal === 'active') {
        observeActiveSentinel()
        if (activeEvents.value.length === 0 && activeHasMore.value) loadMoreActiveEvents()
    } else {
        observePastSentinel()
        if (pastEvents.value.length === 0 && pastHasMore.value) loadMorePastEvents()
    }
})

function appendUnique(listRef, items) {
    const existingIds = new Set(listRef.value.map(i => i.id))
    const filtered = items.filter(i => !existingIds.has(i.id))

    listRef.value = listRef.value.concat(filtered)
}

async function loadMoreActiveEvents() {
    if (!activeHasMore.value || isLoadingMoreActive.value) return
    isLoadingMoreActive.value = true

    try {
        const offset = activePage.value * pageSize
        const newItems = await fetchActiveBets({ offset, limit: pageSize })
        if (newItems.length < pageSize) activeHasMore.value = false
        appendUnique(activeEvents, newItems)
        activePage.value += 1
    } catch (e) {
        console.error('Failed to load new active bets: ' + e)
    } finally {
        isLoadingMoreActive.value = false
        activeLoading.value = false
    }
}

async function loadMorePastEvents() {
    if (!pastHasMore.value || isLoadingMorePast.value) return
    isLoadingMorePast.value = true

    try {
        const offset = pastPage.value * pageSize
        const newItems = await fetchPastBets({ offset, limit: pageSize })
        if (newItems.length < pageSize) pastHasMore.value = false
        appendUnique(pastEvents, newItems)
        pastPage.value += 1
    } catch (e) {
        console.error('Error when trying to load more past events: ' + e)
    } finally {
        isLoadingMorePast.value = false
        pastLoading.value = false
    }
}

function createObserver(callback) {
    return new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                callback()
            }
        }
    }, {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    })
}

function observeActiveSentinel() {
    if (activeObserver) activeObserver.disconnect()
    if (!activeSentinel.value) return
    activeObserver = createObserver(loadMoreActiveEvents)
    activeObserver.observe(activeSentinel.value)
}

function observePastSentinel() {
    if (pastObserver) pastObserver.disconnect()
    if (!pastSentinel.value) return
    pastObserver = createObserver(loadMorePastEvents)
    pastObserver.observe(pastSentinel.value)
}

function selectActiveTab() {
    if (helperAnimPassed.value === true && helperQuickSelected.value !== 'active') {
        isPastShown.value = false
        helperQuickSelected.value = 'active'
        helperAnimPassed.value = false

        setTimeout(() => {
            selectedTab.value = 'active'
            isActiveShown.value = true
            setTimeout(() => {
                helperAnimPassed.value = true
            }, 150);
        }, 150);
    }
}

function selectPastTab() {
    if (helperAnimPassed.value === true && helperQuickSelected.value !== 'past') {
        isActiveShown.value = false
        helperQuickSelected.value = 'past'
        helperAnimPassed.value = false

        setTimeout(() => {
            selectedTab.value = 'past'
            isPastShown.value = true
            setTimeout(() => {
                helperAnimPassed.value = true
            }, 150);
        }, 150);
    }
}

function shareBetFunction(betName, betNameEn) {
    let ref = user?.id ?? ''
    let shareLink = 'https://t.me/GiftsPredict_Bot?startapp=' + ref
    let messageText = ''
    if (app.language === 'ru') {
        messageText = `%0AПосмотри, что думает комьюнити в телеграме по поводу события - ${betName} 🔔%0A%0AЛегкие TON или прогорят? 💵`
    } else {
        messageText = `%0ALook at what the telegram community thinks about - ${betNameEn} 🔔%0A%0AEasy TON or a quick money burn? 💵`
    }
    tg.openTelegramLink(`https://t.me/share/url?url=${shareLink}&text=${messageText}`)
}

</script>

<style scoped>
.bets-catalogue {
    display: flex;
    width: 100%;
    gap: 8px;
    align-items: center;
    justify-content: center;
    margin-top: 12px;
}

.catalog-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 10px 20px;
    min-width: 120px;
    border: none;
    border-radius: 12px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    background-color: rgb(41, 41, 41);
    border: solid 1px rgb(255, 255, 255);
    color: white;
    transition: background-color 0.15s, color 0.15s;
}

.active {
    background-color: white;
    color: black;
    transition: background-color 0.15s, color 0.15s;
}

.lists-parent {
    position: relative;
    display: flex;
    align-items: center;
    align-self: center;
    margin: auto auto;
    min-height: 200px;
    width: 95%;
}

.bets-list {
    position: absolute;
    top: 0;
    left: 0;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    align-items: center;
    justify-content: center;
    align-self: center;
    margin: auto auto;
    margin-top: 12px;
    padding-bottom: 120px;
    opacity: 0;
    transition: opacity 0.15s ease-out, visibility 0s linear 0.15s;
    /* Fade out opacity, then hide */
    visibility: hidden;
}

.bets-list.listActive {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.15s ease-in, visibility 0s linear 0s;
    /* Fade in opacity, then show */
}

.list-sentinel {
    width: 100%;
    height: 32px;
}

.list-element {
    width: 100%;
}

.create-event-button {
    display: flex;
    cursor: pointer;
    align-self: center;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: auto auto;
    width: 92%;
    height: 2.5rem;
    margin-top: 12px;
    border-radius: 20px;
    border: none;
    background: linear-gradient(#3b82f6, #3b82f6);
    color: white;
    font-family: "Inter", sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
}

.create-icon {
    margin-top: 1px;
    height: 12px;
    width: 12px;
}
</style>