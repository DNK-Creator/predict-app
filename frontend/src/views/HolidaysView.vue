<template>
    <LoaderPepe v-if="spinnerShow" />

    <div v-show="!spinnerShow" class="holidays-container">
        <!-- Infinite scroll list -->
        <TransitionGroup name="card" tag="div" class="holiday-list">
            <HolidayCard v-for="holiday in holidays" :key="holiday.id" :title="holiday.name"
                :short-desc="getShortDescription(holiday.description)" :bg-image="holiday.image_path"
                :date="new Date(holiday.date)" @click="openModal(holiday)" />

        </TransitionGroup>
        <!-- Sentinel for IntersectionObserver -->
        <div ref="scrollAnchor" class="scroll-anchor"></div>

        <!-- Detail modal -->
        <HolidayModal v-if="showModal" :visible="showModal" :holiday="selectedHoliday" @close="closeModal" />
    </div>
</template>

<script setup>
// ✅ Vue & reactivity
import { ref, onMounted } from 'vue'

// ✅ Components
import HolidayCard from '@/components/HolidayCard.vue'
import HolidayModal from '@/components/HolidayModal.vue'

// ✅ Supabase client & your API helpers
import supabase from '@/services/supabase'
import LoaderPepe from '@/components/LoaderPepe.vue'

// state
const holidays = ref([])
const allHolidays = ref([])        // full dataset (sorted by rule)
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)

const showModal = ref(false)
const selectedHoliday = ref(null)
const spinnerShow = ref(true)
const scrollAnchor = ref(null)

// --- helpers ---
function getShortDescription(descriptionValue) {
    let shortDescription = descriptionValue
    if (descriptionValue && descriptionValue.length > 60) {
        shortDescription = descriptionValue.slice(0, 60) + '…'
    }
    return shortDescription
}

// normalize date to local midnight (so day-diff calculations are whole days)
function toLocalMidnight(d) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

// difference in days (signed): target - base (today by default)
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
    // guard nulls
    if (!a?.date && !b?.date) return 0
    if (!a?.date) return 1
    if (!b?.date) return -1

    const diffA = dayDiffSigned(a.date) // e.g. 2, 0, -1
    const diffB = dayDiffSigned(b.date)

    const futureA = diffA >= 0
    const futureB = diffB >= 0

    // future vs past prioritization
    if (futureA && !futureB) return -1
    if (!futureA && futureB) return 1

    // both future (including today): nearest (smaller diff) first
    if (futureA && futureB) {
        if (diffA !== diffB) return diffA - diffB
        // same day distance: fallback to exact date ascending
        return new Date(a.date).getTime() - new Date(b.date).getTime()
    }

    // both past: more recent (diff closer to 0, i.e. larger diff) first
    // e.g. diffA = -1, diffB = -10 -> we want a before b => diffB - diffA = -10 - (-1) = -9 (negative => a before b)
    if (diffA !== diffB) return diffB - diffA

    // same day distance in past: fallback
    return new Date(b.date).getTime() - new Date(a.date).getTime()
}

// split array into pages (returns array-of-arrays)
function chunkArray(arr, size) {
    const pages = []
    for (let i = 0; i < arr.length; i += size) {
        pages.push(arr.slice(i, i + size))
    }
    return pages
}

// --- Data loading (fetch all, sort by rule, then paginate client-side) ---
let cachedPages = [] // array of pages after sorting

async function fetchAllAndPrepare() {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('id, name, description, image_path, date')

        if (error) {
            console.error('Error loading holidays:', error)
            return
        }

        // Convert dates to JS Date objects for easier comparisons & pass to HolidayCard
        const normalized = (data || []).map(h => ({
            ...h,
            date: h.date ? new Date(h.date) : null
        }))

        // sort using the custom comparator: future first, then past; both by closeness
        normalized.sort(sortFutureThenPastByCloseness)

        allHolidays.value = normalized

        // create paged cache
        cachedPages = chunkArray(allHolidays.value, pageSize)

        // reset visible list
        holidays.value = []
        page.value = 0
        allLoaded.value = cachedPages.length === 0

        // load first page immediately
        await loadMoreHolidays()
    } catch (err) {
        console.error('fetchAllAndPrepare failed', err)
    }
}

async function loadMoreHolidays() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    // If we have paged cache ready, use it
    if (cachedPages.length > 0) {
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

    // fallback: no cache (shouldn't happen with this approach)
    console.warn('No client-side pages available; consider using fetchAllAndPrepare() on mount')
    allLoaded.value = true
    loadingMore.value = false
}

// --- IntersectionObserver for infinite scroll ---
function observeScrollEnd() {
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMoreHolidays()
        },
        { rootMargin: '200px' }
    )
    if (scrollAnchor.value) {
        observer.observe(scrollAnchor.value)
    }
}

// --- Modal controls ---
function openModal(holiday) {
    selectedHoliday.value = holiday
    showModal.value = true
}
function closeModal() {
    showModal.value = false
    selectedHoliday.value = null
}

// --- lifecycle ---
onMounted(async () => {
    await fetchAllAndPrepare()
    observeScrollEnd()
    spinnerShow.value = false
})
</script>



<style scoped>
.holidays-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;
    user-select: none;
}

.holiday-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: stretch;
}

/* Just an invisible box to trigger loading more */
.scroll-anchor {
    height: 1px;
    width: 100%;
    /* ← ensure it doesn’t collapse */
}

/* Optional loading indicator */
.holiday-list::after {
    content: attr(data-loading);
    display: block;
    text-align: center;
    padding: 16px;
    color: #666;
    font-size: 0.9rem;
}

.holiday-card:active {
    transform: scale(0.98);
    transition: transform 0.1s;
}
</style>
