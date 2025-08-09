<template>
    <!-- Global loader for first full-page load -->
    <LoaderPepe v-if="spinnerShow" />

    <div v-show="!spinnerShow" class="bets-container">
        <!-- Catalogue (Active / Archived) -->
        <div class="bets-catalogue" role="tablist" aria-label="Каталог ставок">
            <button class="catalog-btn" :class="{ active: selectedTab === 'active' }" @click="switchTab('active')"
                role="tab" :aria-selected="selectedTab === 'active'">
                Активные
            </button>
            <button class="catalog-btn" :class="{ active: selectedTab === 'archived' }" @click="switchTab('archived')"
                role="tab" :aria-selected="selectedTab === 'archived'">
                Архив
            </button>
        </div>

        <!-- Loading first page for the selected tab -->
        <div v-if="isLoadingFirstPage" class="inline-loader">
            <LoaderPepe />
        </div>

        <!-- Empty state when there are no bets in the selected tab -->
        <div v-else-if="isEmpty" class="empty-state" role="status" aria-live="polite">
            <svg class="empty-icon" viewBox="0 0 64 64" width="92" height="92" aria-hidden="true">
                <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                    opacity="0.9">
                    <path d="M8 20h48v28a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V20z" />
                    <path d="M20 16a6 6 0 1 1 24 0" />
                    <path d="M22 36h20" />
                </g>
            </svg>

            <h3 class="empty-title">Здесь пока нет событий</h3>
            <p class="empty-desc">Попробуйте перейти в другой раздел или обновить
                список.</p>

            <div class="empty-actions">
                <button class="catalog-btn" @click="resetAndLoad"
                    aria-label="Перезагрузить список">Перезагрузить</button>
                <button class="catalog-btn" @click="switchTab(selectedTab === 'active' ? 'archived' : 'active')"
                    aria-label="Переключиться на другой раздел">
                    Перейти
                </button>
            </div>
        </div>

        <!-- Bets list (normal) -->
        <TransitionGroup v-else name="card" tag="div" class="bets-list" aria-live="polite">
            <BetsCard v-for="bet in bets" :key="bet.id" :title="bet.name"
                :short-desc="getShortDescription(bet.description)" :bg-image="bet.image_path"
                @click="$router.push({ name: 'BetDetails', params: { id: bet.id } })" />
        </TransitionGroup>

        <!-- Sentinel for IntersectionObserver (only show when not empty) -->
        <div v-if="!isEmpty" ref="scrollAnchor" class="scroll-anchor"></div>
    </div>
</template>

<script setup>
// Vue
import { ref, onMounted, watch, computed } from 'vue'

// Components
import BetsCard from '@/components/BetsCard.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'

// Supabase client
import supabase from '@/services/supabase'

// Reactive state
const bets = ref([])
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)

const spinnerShow = ref(true) // initial full-page loader

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

// Computed flags for UI states
const isLoadingFirstPage = computed(() => loadingMore.value && bets.value.length === 0)
const isEmpty = computed(() => !spinnerShow.value && bets.value.length === 0 && allLoaded.value)

// load initial data and set up infinite scroll
onMounted(async () => {
    await resetAndLoad()
    observeScrollEnd()
    spinnerShow.value = false
})

// reload when tab changes
watch(selectedTab, async () => {
    await resetAndLoad()
})

// Reset pagination and load first page
async function resetAndLoad() {
    page.value = 0
    bets.value = []
    allLoaded.value = false
    await loadMoreBets()
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
    padding-bottom: 95px;
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

/* Inline loader styling (used for first page of a tab) */
.inline-loader {
    display: flex;
    justify-content: center;
    padding: 28px 0;
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
</style>
