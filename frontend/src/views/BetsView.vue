<template>
    <!-- Global full-screen loader (fixed, centered) -->
    <div v-if="loadingInitial" class="global-loader" aria-hidden="true">
        <!-- optionally pass variant if you later refactor LoaderPepe to accept it -->
        <LoaderPepe />
    </div>

    <!-- root always present to avoid layout jumps -->
    <div class="bets-root">
        <div class="bets-container">
            <!-- Catalogue (Active / Archived) -->
            <div class="bets-catalogue" role="tablist" aria-label="Каталог ставок">
                <button class="catalog-btn" :class="{ active: selectedTab === 'active' }" @click="switchTab('active')"
                    role="tab" :aria-selected="selectedTab === 'active'">
                    Активные
                </button>
                <button class="catalog-btn" :class="{ active: selectedTab === 'archived' }"
                    @click="switchTab('archived')" role="tab" :aria-selected="selectedTab === 'archived'">
                    Архив
                </button>
            </div>

            <!-- Empty state when there are no bets in the selected tab -->
            <div v-if="isEmpty && !isLoadingFirstPage" class="empty-state" role="status" aria-live="polite">
                <!-- ... same empty markup ... -->
            </div>

            <!-- Bets list (normal) -->
            <!-- disable transition animation while loading the first page to avoid flicker -->
            <TransitionGroup v-else :name="isLoadingFirstPage ? '' : 'card'" tag="div" class="bets-list"
                aria-live="polite">
                <BetsCard v-for="bet in bets" :key="bet.id" :title="bet.name"
                    :short-desc="getShortDescription(bet.description)" :bg-image="bet.image_path"
                    @click="$router.push({ name: 'BetDetails', params: { id: bet.id } })" />
            </TransitionGroup>

            <!-- Inline loader for first page of a tab (keeps layout) -->
            <!-- IMPORTANT: only show inline loader when we are *not* showing global overlay -->
            <div v-show="isLoadingFirstPage && !loadingInitial" class="inline-loader" aria-hidden="true">
                <LoaderPepe />
            </div>

            <!-- Sentinel for IntersectionObserver (only show when not empty) -->
            <div v-if="!isEmpty" ref="scrollAnchor" class="scroll-anchor"></div>
        </div>
    </div>
</template>


<script setup>
// Vue
import { ref, onMounted, watch, computed } from 'vue'

// Components
import BetsCard from '@/components/bet-details/BetsCard.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'

// Supabase client
import supabase from '@/services/supabase'

// Reactive state
const bets = ref([])
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)

// initial full-page loader
const loadingInitial = ref(true)
let initialLoaderTimer = null

// Catalogue
const selectedTab = ref('active') // 'active' | 'archived'

// Helpers
function getShortDescription(descriptionValue = '') {
    let shortDescription = descriptionValue || ''
    if (shortDescription.length > 45) {
        shortDescription = shortDescription.slice(0, 43) + '…'
    }
    return shortDescription
}

// isLoadingFirstPage: when we're loading and have no bets yet (show inline loader inside list)
const isLoadingFirstPage = computed(() => loadingMore.value && bets.value.length === 0)
const isEmpty = computed(() => !loadingInitial.value && bets.value.length === 0 && allLoaded.value)


// load initial data and set up infinite scroll
onMounted(async () => {
    await resetAndLoad()
    observeScrollEnd()
})

// reload when tab changes
watch(selectedTab, async () => {
    await resetAndLoad()
})

// reset and load with debounced global loader
async function resetAndLoad() {
    // pagination reset
    page.value = 0
    bets.value = []
    allLoaded.value = false
    loadingMore.value = false

    // debounce showing the global loader to avoid flicker for fast loads
    if (initialLoaderTimer) {
        clearTimeout(initialLoaderTimer)
        initialLoaderTimer = null
    }
    // only show global loader if load takes longer than 150ms
    initialLoaderTimer = setTimeout(() => {
        loadingInitial.value = true
    }, 150)

    try {
        await loadMoreBets()
    } catch (err) {
        console.error('resetAndLoad error', err)
    } finally {
        // cancel timer & hide loader
        if (initialLoaderTimer) {
            clearTimeout(initialLoaderTimer)
            initialLoaderTimer = null
        }
        loadingInitial.value = false
    }
}

// Fetch a page of bets for the current tab
async function loadMoreBets() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    const from = page.value * pageSize
    const to = from + pageSize - 1

    let query = supabase
        .from('bets')
        .select('id, name, description, image_path, date, result')
        .order('date', { ascending: true })
        .range(from, to)

    if (selectedTab.value === 'active') {
        query = query.eq('result', 'undefined')
    } else {
        query = query.neq('result', 'undefined')
    }

    const { data, error } = await query

    if (error) {
        console.error('Error loading bets:', error)
    } else {
        const incoming = data || []
        if (incoming.length < pageSize) {
            allLoaded.value = true
        }
        bets.value.push(...incoming)
        page.value += 1
    }

    loadingMore.value = false
}

// IntersectionObserver for infinite scroll
const scrollAnchor = ref(null)
function observeScrollEnd() {
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMoreBets()
        },
        { rootMargin: '200px' }
    )

    const tryObserve = () => {
        if (scrollAnchor.value) observer.observe(scrollAnchor.value)
        else requestAnimationFrame(tryObserve)
    }
    tryObserve()
}

// switch tab handler
function switchTab(tab) {
    if (selectedTab.value === tab) return
    selectedTab.value = tab
}
</script>

<style scoped>
.bets-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;
}

/* Catalogue buttons row */
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

/* Bets list */
.bets-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: stretch;
}

/* Sentinel anchor */
.scroll-anchor {
    height: 1px;
    width: 100%;
}

/* Empty state */
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

/* Actions in empty state */
.empty-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 6px;
    width: 100%;
    justify-content: center;
}

.empty-actions .catalog-btn {
    min-width: 140px;
}

/* Press feedback for cards */
.bet-card:active {
    transform: scale(0.98);
    transition: transform 0.1s;
}

/* Responsive tweaks */
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

/* Full viewport overlay that centers the loader visually */
.global-loader {
    position: fixed;
    inset: 0;
    /* top:0; right:0; bottom:0; left:0; */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    /* very high so it's on top of everything */
    pointer-events: auto;
    /* capture clicks if desired */
    /* optional dimming — uncomment if you want page to darken when loading */
    /* background: rgba(0,0,0,0.45); */
}

/* ensure underlying UI is inert (prevents accidental clicks)
   the aria-hidden attr is set on .bets-root in the template */
.bets-root[aria-hidden="true"] {
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    opacity: 0.98;
    /* slightly dim so overlay stands out (optional) */
}

/* Keep inline loader reserved space so list doesn't jump */
.inline-loader {
    display: flex;
    justify-content: center;
    padding: 28px 0;
    min-height: 120px;
    /* reserve approximate space so layout is stable */
}

/* Override LoaderPepe inner margin so the animation truly centers
   ::v-deep reaches into scoped child component styles */
.global-loader ::v-deep(.empty-media) {
    margin-bottom: 0 !important;
}

.global-loader ::v-deep(.loading-spinner) {
    height: auto !important;
    width: auto !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}
</style>
