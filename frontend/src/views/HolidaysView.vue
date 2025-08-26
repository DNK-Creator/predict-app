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

        <!-- Holiday list with transition -->
        <TransitionGroup name="card" tag="div" class="holiday-list" v-if="!isEmpty">
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
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'

// Components / services
import HolidayCard from '@/components/HolidayCard.vue'
import HolidayModal from '@/components/HolidayModal.vue'
import supabase from '@/services/supabase'
import { useAppStore } from '@/stores/appStore'

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

const isEmpty = computed(() => allHolidays.value.length === 0 && allLoaded.value)

// Tabbing
const selectedTab = ref('upcoming') // 'upcoming' | 'past'
let cachedPages = [] // paged cache for current tab (client side)

// keep a reference to observer so we can disconnect on unmount
let _infiniteObserver = null

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
        const { data, error } = await supabase
            .from('holidays')
            .select('id, name, name_en, description, description_en, image_path, date')

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

/** Build cachedPages for a given tab (upcoming | past) and reset pagination */
function preparePagedCacheForTab(tab) {
    // filter for the tab
    const filtered = (allHolidays.value || []).filter(h => {
        if (!h || !h.date) return false
        const diff = dayDiffSigned(h.date)
        if (tab === 'upcoming') return diff >= 0
        return diff < 0
    })

    // use the same sorting (already sorted globally, but keep stable)
    const pages = chunkArray(filtered, pageSize)
    cachedPages = pages
    page.value = 0
    allLoaded.value = pages.length === 0
    loadingMore.value = false
    holidays.value = []
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

/* Switch tab */
function switchTab(tab) {
    if (selectedTab.value === tab) return
    selectedTab.value = tab
}

/* react to tab changes: prepare cache and load first page */
watch(selectedTab, async (newTab) => {
    preparePagedCacheForTab(newTab)
    // load first page for the new tab
    await loadMoreHolidays()
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
