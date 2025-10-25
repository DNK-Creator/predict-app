<template>
    <div v-show="!spinnerShow" class="holidays-container">
        <!-- Catalogue (Upcoming / Past) -->
        <div class="bets-catalogue" role="tablist" aria-label="Каталог праздников">
            <button class="catalog-btn" :class="{ active: selectedTab === 'upcoming' }" @click="switchTab('upcoming')"
                role="tab" :aria-selected="selectedTab === 'upcoming'">
                {{ $t('upcoming') || 'Upcoming' }}
            </button>

            <button class="catalog-btn" :class="{ active: selectedTab === 'past' }" @click="switchTab('past')"
                role="tab" :aria-selected="selectedTab === 'past'">
                {{ $t('past') || 'Past' }}
            </button>
        </div>

        <!-- Empty state -->
        <div v-if="isEmpty && !spinnerShow" class="empty-state" role="status" aria-live="polite">
            <div class="empty-icon">🎉</div>
            <h3 class="empty-title">
                {{ $t('empty-now') || (selectedTab === 'upcoming' ? 'No upcoming holidays' : 'No past holidays') }}</h3>
            <p class="empty-desc">
                {{ $t('no-holidays-here') || (selectedTab === 'upcoming' ? 'There are no upcoming holidays yet.' :
                    'There are no past holidays to show.') }}
            </p>
            <div class="empty-actions">
                <button class="catalog-btn" @click="switchTab('upcoming')">{{ $t('upcoming') || 'Upcoming' }}</button>
                <button class="catalog-btn" @click="switchTab('past')">{{ $t('past') || 'Past' }}</button>
            </div>
        </div>

        <TransitionGroup :key="listKey" name="card" tag="div" class="holiday-list" v-if="!isEmpty && showDisplayed"
            appear @before-leave="handleBeforeLeave" @after-leave="handleAfterLeave">
            <HolidayCard v-for="holiday in holidays" :key="holiday.id"
                :title="translatedTitle(holiday.name, holiday.name_en)" :language="language"
                :short-desc="getShortDescription(holiday.description, holiday.description_en)"
                :bg-image="holiday.image_path" :date="new Date(holiday.date)" @click="openModal(holiday)" />
        </TransitionGroup>

        <!-- sentinel -->
        <div ref="scrollAnchor" class="scroll-anchor" v-if="!isEmpty"></div>

        <!-- modal -->
        <HolidayModal v-if="showModal" :visible="showModal" :language="language" :holiday="selectedHoliday"
            @close="closeModal" />
    </div>
</template>

<script setup>
// Vue
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick, onActivated, onDeactivated } from 'vue'

// Components / services
import HolidayCard from '@/components/HolidayCard.vue'
import HolidayModal from '@/components/HolidayModal.vue'
import { useAppStore } from '@/stores/appStore'
import { fetchAllHolidays } from '@/api/requests'

const app = useAppStore()
const language = computed(() => app.language)

// state
const holidays = ref([])
const allHolidays = ref([])
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)
const spinnerShow = ref(true)
const scrollAnchor = ref(null)

const showModal = ref(false)
const selectedHoliday = ref(null)

function cacheKey(tab, pageIndex) {
    return `${tab}:${pageIndex}`
}

const isEmpty = computed(() => allHolidays.value.length === 0 && allLoaded.value)

// Tabbing
const selectedTab = ref('upcoming') // 'upcoming' | 'past'
let cachedPages = [] // paged cache for current tab (client side)

// keep a reference to observer so we can disconnect on unmount
let _infiniteObserver = null

// initial full-page loader
const loadingInitial = ref(true)

const displayedTab = ref(selectedTab.value) // which tab's content is currently mounted
const showDisplayed = ref(true)             // whether the mounted list is visible (mounted)
const incomingPage = ref(null)              // holds the first page for the new tab while leaving
const isLeaving = ref(false)
const waitingForIncoming = ref(false)
const listKey = ref(selectedTab.value + '-' + Date.now())

/* ---------------- helpers copied/kept from original (date helpers etc) ---------------- */

function openModal(holiday) {
    // accept the holiday passed from the template and open modal
    if (!holiday) return
    selectedHoliday.value = holiday
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    // clear selection to avoid stale object references
    selectedHoliday.value = null
}

function toLocalMidnight(d) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

function dayDiffSigned(targetDate, baseDate = new Date()) {
    const t = toLocalMidnight(targetDate).getTime()
    const b = toLocalMidnight(baseDate).getTime()
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    return Math.round((t - b) / MS_PER_DAY)
}

/**
 * Comparator: futures first (diff >= 0), ordered by ascending diff (so soonest first).
 * Then pasts, ordered by descending diff (i.e. -1 (yesterday) comes before -10).
 */
function sortFutureThenPastByCloseness(a, b) {
    if (!a?.date && !b?.date) return 0
    if (!a?.date) return 1
    if (!b?.date) return -1

    const diffA = dayDiffSigned(a.date)
    const diffB = dayDiffSigned(b.date)

    const futureA = diffA >= 0
    const futureB = diffB >= 0

    if (futureA && !futureB) return -1
    if (!futureA && futureB) return 1

    if (futureA && futureB) {
        if (diffA !== diffB) return diffA - diffB
        return new Date(a.date).getTime() - new Date(b.date).getTime()
    }

    if (diffA !== diffB) return diffB - diffA
    return new Date(b.date).getTime() - new Date(a.date).getTime()
}

function chunkArray(arr, size) {
    const pages = []
    for (let i = 0; i < arr.length; i += size) {
        pages.push(arr.slice(i, i + size))
    }
    return pages
}

function translatedTitle(titleRu, titleEn) {
    return language.value === "ru" ? titleRu : titleEn
}

function getShortDescription(descriptionValueRu, descriptionValueEn) {
    if (language.value === 'ru') {
        let shortDescriptionRu = descriptionValueRu
        if (descriptionValueRu && descriptionValueRu.length > 60) {
            shortDescriptionRu = descriptionValueRu.slice(0, 60) + '…'
        }
        return shortDescriptionRu
    }

    let shortDescriptionEn = descriptionValueEn
    if (descriptionValueEn && descriptionValueEn.length > 60) {
        shortDescriptionEn = descriptionValueEn.slice(0, 60) + '…'
    }
    return shortDescriptionEn
}

/* ---------------- Data loading + tab-aware pagination ---------------- */

async function fetchAllAndPrepare() {
    try {
        const { data, error } = await fetchAllHolidays()

        if (error) {
            console.error('Error loading holidays:', error)
            allHolidays.value = []
            cachedPages = []
            holidays.value = []
            allLoaded.value = true
            spinnerShow.value = false
            return
        }

        const normalized = (data || []).map(h => ({
            ...h,
            date: h.date ? new Date(h.date) : null
        }))

        normalized.sort(sortFutureThenPastByCloseness)
        allHolidays.value = normalized
        preparePagedCacheForTab(selectedTab.value)

        // prepare paged cache for currently selected tab and load first page
        preparePagedCacheForTab(selectedTab.value)
        holidays.value = []
        await loadMoreHolidays()
    } catch (err) {
        console.error('fetchAllAndPrepare failed', err)
    } finally {
        spinnerShow.value = false
    }
}

function preparePagedCacheForTab(tab) {
    // filter for the tab
    const filtered = (allHolidays.value || []).filter(h => {
        if (!h || !h.date) return false
        const diff = dayDiffSigned(h.date)
        if (tab === 'upcoming') return diff >= 0
        return diff < 0
    })

    // paginate
    const pages = chunkArray(filtered, pageSize)
    cachedPages = pages

    // Stage the first page to be mounted after the current list finishes leaving.
    // If there is no page, stage an empty array.
    if (Array.isArray(pages) && pages.length > 0) {
        incomingPage.value = pages[0].slice()
        // pages array stored in cachedPages already; page index reset to next page
        page.value = 1
        allLoaded.value = pages.length <= 1
    } else {
        incomingPage.value = []
        page.value = 0
        allLoaded.value = true
    }

    loadingMore.value = false
}

/** loadMore uses cachedPages (tab-aware) */
async function loadMoreHolidays() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    // if cache ready, just use it
    if (Array.isArray(cachedPages) && cachedPages.length > 0) {
        const next = cachedPages[page.value] || []
        if (next.length === 0) {
            allLoaded.value = true
        } else {
            holidays.value.push(...next)
            page.value += 1
            if (page.value >= cachedPages.length) allLoaded.value = true
        }
        loadingMore.value = false
        return
    }

    // fallback: no cache - attempt to create it from allHolidays
    preparePagedCacheForTab(selectedTab.value)
    loadingMore.value = false
}

function handleBeforeLeave(el) {
    // measure element height to reserve, avoid layout jump
    try {
        const wrapper = el.parentElement || el.parentNode
        if (wrapper) wrapper.style.minHeight = el.offsetHeight + 'px'
        // force reflow
        wrapper && wrapper.offsetHeight
    } catch (e) {
        // swallow measurement errors but log to console
        console.warn('handleBeforeLeave measurement failed', e)
    }

    isLeaving.value = true
    waitingForIncoming.value = true
}

function handleAfterLeave(el) {
    // cleanup reserved height
    try {
        const wrapper = (el && (el.parentElement || el.parentNode)) || document.querySelector('.holidays-container')
        if (wrapper) wrapper.style.minHeight = ''
    } catch (e) {
        console.warn('handleAfterLeave cleanup failed', e)
    }

    // leave finished
    isLeaving.value = false

    // If we already have incoming page prepared, mount it now
    if (incomingPage.value !== null) {
        waitingForIncoming.value = false
        holidays.value = Array.isArray(incomingPage.value) ? incomingPage.value.slice() : []
        incomingPage.value = null
        displayedTab.value = selectedTab.value
        listKey.value = displayedTab.value + '-' + Date.now()
        showDisplayed.value = true
        return
    }

    // No incoming yet — keep waiting; the watcher that prepared incomingPage will eventually set it
    waitingForIncoming.value = true
}

/* IntersectionObserver for infinite scroll */
function observeScrollEnd() {
    // disconnect previous if present
    if (_infiniteObserver) {
        try { _infiniteObserver.disconnect() } catch (_) { }
        _infiniteObserver = null
    }

    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMoreHolidays()
        },
        { rootMargin: '200px' }
    )

    _infiniteObserver = observer

    const tryObserve = () => {
        if (scrollAnchor.value) observer.observe(scrollAnchor.value)
        else requestAnimationFrame(tryObserve)
    }
    tryObserve()
}

function switchTab(tab) {
    if (selectedTab.value === tab) return
    selectedTab.value = tab
}

watch(selectedTab, (newTab, oldTab) => {
    if (newTab === oldTab) return

    // If we already have displayed holidays for that tab, avoid unnecessary animation
    if (Array.isArray(holidays.value) && holidays.value.length > 0 && displayedTab.value === newTab) {
        displayedTab.value = newTab
        return
    }

    // Hide current list (start leave animation) — after-leave will mount incomingPage
    showDisplayed.value = false

    // Synchronously prepare cached pages and stage first page into incomingPage
    preparePagedCacheForTab(newTab)
})

watch(incomingPage, (val) => {
    if (!val) return
    if (!isLeaving.value && !showDisplayed.value) {
        // If list not leaving and not mounted, mount immediately
        holidays.value = Array.isArray(val) ? val.slice() : []
        incomingPage.value = null
        displayedTab.value = selectedTab.value
        listKey.value = displayedTab.value + '-' + Date.now()
        showDisplayed.value = true
    }
})

onDeactivated(() => {
    showDisplayed.value = false
})

onActivated(async () => {
    // Ensure persisted cache is available (keep-alive flows)
    try { restorePersistedFirstPage() } catch (e) { /* ignore */ }

    const tab = selectedTab.value || 'active'
    const key = cacheKey(tab, 0)

    // FAST PATH: if we already have displayed bets for this tab, nothing to do
    if (Array.isArray(holidays.value) && holidays.value.length > 0 && displayedTab.value === tab) {
        return
    }

    // Prevent the empty message while we decide
    loadingInitial.value = true
    showDisplayed.value = false

    try {
        // Check in-memory cache first
        const cachedEntry = betsCache.get(key)
        const now = Date.now()
        const isFresh = cachedEntry && ((now - (cachedEntry.ts || 0)) < CACHE_TTL)

        if (cachedEntry && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
            // Show cached immediately (instant UX)
            holidays.value = cachedEntry.data.slice()
            incomingBets.value = null
            showDisplayed.value = true
            displayedTab.value = tab

            pagesByTab.value[tab] = pagesByTab.value[tab] || 1
            allLoadedByTab.value[tab] = allLoadedByTab.value[tab] || (cachedEntry.data.length < pageSize)
            const last = cachedEntry.data[cachedEntry.data.length - 1]
            if (last) cursorsByTab.value[tab] = { last_total_volume: last.total_volume ?? 0, last_id: Number(last.id) }

            // Attach user bets in background (don't await)
            fetchAndAttachUserBets(holidays.value).catch(err => console.warn('attach user bets bg failed', err))

            // If cache is fresh -> background refresh is optional (stale-while-revalidate)
            // If cache is stale -> force a fresh fetch and update UI immediately once it returns
            if (!isFresh) {
                // Force a fresh fetch and update UI as soon as it resolves
                (async () => {
                    try {
                        const fresh = await getCachedBetsPage(tab, 0, { force: true, backgroundRefresh: false })
                        if (Array.isArray(fresh) && fresh.length > 0) {
                            // Replace UI immediately (do NOT wait for transitions)
                            holidays.value = fresh.slice()
                            incomingBets.value = null
                            listKey.value = tab + '-refreshed-' + Date.now()
                            pagesByTab.value[tab] = 1
                            allLoadedByTab.value[tab] = fresh.length < pageSize
                            const last2 = fresh[fresh.length - 1]
                            if (last2) cursorsByTab.value[tab] = { last_total_volume: last2.total_volume ?? 0, last_id: Number(last2.id) }
                            // attach user bets for the fresh items as well
                            fetchAndAttachUserBets(holidays.value).catch(() => { })
                        }
                    } catch (e) {
                        console.warn('forced refresh after showing stale cache failed', e)
                    }
                })()
            } else {
                // Kick off normal background refresh (non-blocking)
                getCachedBetsPage(tab, 0, { force: false, backgroundRefresh: true }).catch(() => { })
            }
            return
        }

        // If no in-memory cache, check sessionStorage persisted first page (defensive)
        const raw = sessionStorage.getItem(PERSIST_FIRST_PAGE_KEY)
        if (raw) {
            try {
                const obj = JSON.parse(raw)
                if (obj && obj[tab] && Array.isArray(obj[tab].data) && ((Date.now() - (obj[tab].ts || 0)) < CACHE_TTL)) {
                    holidays.value = obj[tab].data.slice()
                    showDisplayed.value = true
                    incomingBets.value = null
                    betsCache.set(key, { data: holidays.value.slice(), ts: obj[tab].ts || Date.now() })
                    fetchAndAttachUserBets(holidays.value).catch(() => { })
                        // trigger background forced refresh (replace when fresh)
                        (async () => {
                            try {
                                const fresh = await getCachedBetsPage(tab, 0, { force: true, backgroundRefresh: false })
                                if (Array.isArray(fresh) && fresh.length > 0) {
                                    holidays.value = fresh.slice()
                                    incomingBets.value = null
                                    listKey.value = tab + '-refreshed-' + Date.now()
                                    pagesByTab.value[tab] = 1
                                    allLoadedByTab.value[tab] = fresh.length < pageSize
                                    const last2 = fresh[fresh.length - 1]
                                    if (last2) cursorsByTab.value[tab] = { last_total_volume: last2.total_volume ?? 0, last_id: Number(last2.id) }
                                    fetchAndAttachUserBets(holidays.value).catch(() => { })
                                }
                            } catch (e) { /* ignore forced refresh failures */ }
                        })()
                    return
                }
            } catch (e) { /* ignore parse errors */ }
        }

        // still empty fallback: try forced fetch (rare)
        if ((!holidays.value || holidays.value.length === 0) && !loadingInitial.value) {
            try {
                const forced = await getCachedBetsPage(tab, 0, { force: true, backgroundRefresh: false })
                if (Array.isArray(forced) && forced.length > 0) {
                    holidays.value = forced.slice()
                    incomingBets.value = null
                    showDisplayed.value = true
                    pagesByTab.value[tab] = 1
                    allLoadedByTab.value[tab] = forced.length < pageSize
                    const last = forced[forced.length - 1]
                    if (last) cursorsByTab.value[tab] = { last_total_volume: last.total_volume ?? 0, last_id: Number(last.id) }
                }
            } catch (e) {
                console.warn('Forced fetch on activation failed', e)
            }
        }
    } catch (e) {
        console.warn('onActivated handling failed', e)
    } finally {
        loadingInitial.value = false
    }
})

/* lifecycle */
onMounted(async () => {
    await fetchAllAndPrepare()
    observeScrollEnd()
})

// cleanup observer if component unmounts
onBeforeUnmount(() => {
    if (_infiniteObserver) {
        try { _infiniteObserver.disconnect() } catch (_) { }
        _infiniteObserver = null
    }
})
</script>

<style scoped>
/* keep your container sizing */
.holidays-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;
    user-select: none;
}

/* Reused catalogue styles (same look as bets) */
.bets-catalogue {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 12px;
}

/* Use the same look as your other buttons (keeps visual consistency) */
.catalog-btn {
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: #ddd;
    cursor: pointer;
    font-weight: 600;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    min-width: 120px;
    text-align: center;
}

/* Active state — visually prominent */
.catalog-btn.active {
    background: #fff;
    color: #000;
    border-color: #fff;
}

/* Small hover active */
.catalog-btn.active:hover {
    background: rgba(255, 255, 255, 0.96);
}

/* Small hover */
.catalog-btn:hover {
    background: rgba(255, 255, 255, 0.06);
}

/* holiday list layout */
.holiday-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: stretch;
    gap: 0.65rem;
}

/* sentinel */
.scroll-anchor {
    height: 1px;
    width: 100%;
}

/* Empty state (same approach as bets) */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 28px 12px;
    color: #cfcfcf;
    text-align: center;
}

.empty-icon {
    color: #8b8b8b;
    opacity: 0.95;
}

.empty-title {
    margin: 0;
    font-size: 1.15rem;
    color: #e6e6e6;
    font-weight: 600;
}

.empty-desc {
    margin: 0;
    color: #bdbdbd;
    font-size: 0.95rem;
    max-width: 340px;
}

.empty-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 6px;
    width: 100%;
    justify-content: center;
}

/* small responsive tweaks */
@media (max-width: 420px) {
    .bets-catalogue {
        gap: 0.4rem;
    }

    .catalog-btn {
        min-width: 46%;
        padding: 0.45rem 0.6rem;
        font-size: 0.95rem;
    }

    .empty-desc {
        max-width: 90%;
    }

    .empty-actions .catalog-btn {
        min-width: 46%;
        padding: 0.45rem 0.6rem;
    }
}

/* keep your existing transition class names if you want */
.card-enter-from,
.card-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

.card-enter-active,
.card-leave-active {
    transition: opacity 260ms cubic-bezier(.22, .9, .32, 1), transform 260ms cubic-bezier(.22, .9, .32, 1);
}
</style>
