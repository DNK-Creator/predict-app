<template>
    <transition name="history-fade" appear>
        <div v-show="showView" class="transactions-view-container">
            <div v-if="spinnerShow" class="inline-loader" role="status" aria-live="polite">
                <div class="loading-spinner">{{ $t('loading-dots') }}</div>
            </div>

            <!-- empty state -->
            <div v-else-if="isEmpty" class="empty-state" role="status" aria-live="polite">
                <div class="empty-icon">🧾</div>
                <h3 class="empty-title">{{ $t('created-events-empty-first') }}</h3>
                <p class="empty-desc">{{ $t('created-events-empty-second') }}</p>
            </div>

            <!-- list -->
            <div v-else class="history-list">
                <transition-group name="list-fade" tag="div">
                    <CreatedEventListItem v-for="event in displayedEvents" :key="event.id"
                        :stake="event.creator_first_stake" :bet_name="event.name || ''" :bet_name_en="event.name_en"
                        :side="event.creator_side" :description="event.description" :status="event.status"
                        @click="tryOpeningEvent(event.is_approved, event.id)" />
                </transition-group>

                <div v-if="loadingMore && displayedEvents.length > 0" class="inline-loader">
                    <div class="loading-spinner">{{ $t('loading-dots') }}</div>
                </div>

                <div v-if="!allLoaded" ref="scrollAnchor" class="scroll-anchor"></div>
            </div>
        </div>
    </transition>
</template>

<script setup>
import { fetchCreatedEvents } from '@/services/bets-requests'
import { ref, onMounted, watch, nextTick, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import CreatedEventListItem from '@/components/CreatedEventListItem.vue'

const router = useRouter()

const pageSize = 12
let activeLoadId = 0

const displayedEvents = ref([]) // shown in the list
const loadingMore = ref(false)
const allLoaded = ref(false)
const pages = ref(0) // next page index to request (0-based)

const selected = ref(null)

const activityModalShow = ref(false)

const spinnerShow = ref(true)
const showView = ref(false)

const activePage = ref(0)

const scrollAnchor = ref(null)
let observer = null

function tryOpeningEvent(approved, id) {
    if (!approved) return
    router.push({ name: 'BetDetails', params: { id } })
}

function formatRangeForPage(pageIndex) {
    const from = pageIndex * pageSize
    const to = from + pageSize - 1
    return { from, to }
}

async function resetAndLoad() {
    activeLoadId += 1
    const myLoadId = activeLoadId

    pages.value = 0
    allLoaded.value = false
    loadingMore.value = false

    try {
        const offset = activePage.value * pageSize
        const firstPage = await fetchCreatedEvents({ offset, limit: pageSize })
        if (myLoadId !== activeLoadId) return

        activePage.value += 1

        displayedEvents.value = Array.isArray(firstPage) ? firstPage.slice() : []
        pages.value = 1 // next page to fetch
        if (firstPage.length < pageSize) allLoaded.value = true
    } catch (err) {
        console.error('Error loading created events first page', err)
        displayedEvents.value = []
        allLoaded.value = true
    } finally {
        spinnerShow.value = false
    }
}
async function loadMore() {
    if (loadingMore.value) return
    if (allLoaded.value) return

    const myLoadId = activeLoadId
    loadingMore.value = true
    try {
        const offset = activePage.value * pageSize
        const incoming = await fetchCreatedEvents({ offset, limit: pageSize })
        if (myLoadId !== activeLoadId) return

        activePage.value += 1

        if (incoming.length < pageSize) allLoaded.value = true

        // dedupe by id
        const existingIds = new Set(displayedEvents.value.map(t => t.id))
        const filtered = incoming.filter(item => !existingIds.has(item.id))
        if (filtered.length > 0) displayedEvents.value.push(...filtered)

        pages.value = pages.value + 1
    } catch (err) {
        console.error('Error loading more activity', err)
        // don't flip allLoaded — allow retry
    } finally {
        loadingMore.value = false
    }
}

function observeScrollEnd() {
    if (observer) observer.disconnect()
    observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMore()
        },
        { rootMargin: '200px' }
    )

    const tryObserve = () => {
        if (scrollAnchor.value) observer.observe(scrollAnchor.value)
        else requestAnimationFrame(tryObserve)
    }
    tryObserve()
}


onMounted(async () => {
    await resetAndLoad()

    // wait a paint to avoid flicker when spinner hides
    requestAnimationFrame(async () => {
        showView.value = true
    })

    // attach observer after first render
    observeScrollEnd()
})


onUnmounted(() => {
    if (observer) observer.disconnect()
})

const isEmpty = computed(() => !spinnerShow.value && displayedEvents.value.length === 0)

// keep compatibility for the original watch used in your file (avoid flicker)
watch(spinnerShow, async (spinnerIsVisible) => {
    if (spinnerIsVisible) {
        showView.value = false
        return
    }
    await nextTick()
    requestAnimationFrame(() => { showView.value = true })
}, { immediate: true })

</script>

<style scoped>
.wallet-wrapper {
    position: relative;
    max-width: 480px;
    width: 90vw;
    margin: 0.8rem auto 0.5rem;
    overflow: hidden;
    /* clip the header */
    height: 11rem;
    /* enough to show wallet plus header peek */
    user-select: none;
}

.wallet {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 1.6rem;
    /* push down so header peeks out */
    left: 0;
    right: 0;
    height: 9rem;
    background: linear-gradient(to top, #146dd9, #1aa0e8);
    border-radius: 20px;
    z-index: 1;
    /* on top of header */

    align-items: center;
    justify-items: center;
}

/* same .wallet-top-header as before, but no z-index needed */
.wallet-top-header {
    display: flex;
    justify-content: space-between;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 65px;
    background: #292a2a;
    border-radius: 1.1rem 1.3rem 0 0;
    cursor: pointer;
}

.wallet-status-text {
    color: #7d7d7d;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    max-height: 20px;
}

.wallet-action-text {
    color: #ffffff;
    padding: 2px 25px 0px 0px;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.wallet-balance-hint {
    color: white;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    opacity: 0.5;
    font-size: 0.95rem;
    align-self: center;
    text-align: center;
    margin: 0.5rem;
    margin-top: 0.95rem;

}

.wallet-balance {
    color: white;
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    align-self: center;
    text-align: center;
}

.wallet-buttons {
    width: 100%;
    text-align: center;
    margin-top: 0.75rem;
}

.tonconnect-button {
    align-items: center;
    margin: auto auto;
    align-self: center;
    width: 30vw;
}

.wallet-button-deposit {
    height: 3.2rem;
    width: 8rem;
    cursor: pointer;
    border-radius: 17px;
    border: none;
    margin-right: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    background-color: white;
    color: black;
}

.wallet-button-withdraw {
    height: 3rem;
    width: 8rem;
    cursor: pointer;
    border-radius: 17px;
    border: none;
    margin-right: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    color: rgba(235, 235, 235, 0.95);
    background-color: rgb(255, 255, 255, 0.15);
}

.status-container {
    display: flex;
    gap: 8px;
    height: 20px;
    padding: 2px 0px 0px 25px;
    align-items: center;
    justify-content: center;
}

.status-container img {
    height: 12px;
    width: 12px;
}

/* history view appear animation */
.history-fade-enter-active,
.history-fade-leave-active {
    transition: opacity 260ms cubic-bezier(.22, .9, .32, 1), transform 260ms ease;
    will-change: opacity, transform;
}

.history-fade-enter-from,
.history-fade-leave-to {
    opacity: 0;
    transform: translateY(10px) scale(0.996);
    pointer-events: none;
}

.history-fade-enter-to,
.history-fade-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.transactions-view-container {
    /* keep layout same as before; use min-height if you need consistent height */
    min-height: 1px;
    margin-top: 1rem;
}

.transactions-view-container {
    min-height: 1px;
    margin-top: 1rem;
}


.history-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 680px;
    margin: 0 auto;
    padding: 8px;
}


.inline-loader {
    display: flex;
    justify-content: center;
    padding: 18px 0;
}


.scroll-anchor {
    height: 1px;
    width: 100%;
}


/* reuse small transitions (same as BetsView) */
.list-fade-enter-from {
    opacity: 0;
    transform: translateY(-8px);
}

.list-fade-enter-active {
    transition: opacity 260ms cubic-bezier(.22, .9, .32, 1), transform 260ms cubic-bezier(.22, .9, .32, 1);
}

.list-fade-enter-to {
    opacity: 1;
    transform: translateY(0);
}

.list-fade-leave-from {
    opacity: 1;
    transform: translateY(0);
}

.list-fade-leave-active {
    transition: opacity 220ms cubic-bezier(.22, .9, .32, 1), transform 220ms cubic-bezier(.22, .9, .32, 1);
}

.list-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}


/* minimal empty state look */
.empty-state {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    padding: 18px;
    user-select: none;
}

.empty-title {
    margin: 0;
    font-weight: 600;
    color: white;
}

.empty-desc {
    margin: 0;
    color: #888;
}
</style>