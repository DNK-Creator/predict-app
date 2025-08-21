<template>
    <!-- Global full-screen loader (fixed, centered) -->
    <div v-if="loadingInitial" class="global-loader" aria-hidden="true">
        <LoaderPepe />
    </div>

    <!-- root always present to avoid layout jumps -->
    <div class="bets-root" :aria-hidden="loadingInitial ? 'true' : 'false'">
        <div class="bets-container">
            <!-- Catalogue (Active / Archived) -->
            <div class="bets-catalogue" role="tablist" aria-label="Каталог ставок">
                <button class="catalog-btn" :class="{ active: selectedTab === 'active' }" @click="switchTab('active')"
                    role="tab" :aria-selected="selectedTab === 'active'">
                    Активные
                </button>
                <button class="catalog-btn" :class="{ active: selectedTab === 'archived' }"
                    @click="switchTab('archived')" role="tab" :aria-selected="selectedTab === 'archived'">
                    Прошедшие
                </button>
            </div>

            <!-- Empty state when there are no bets in the selected tab -->
            <div v-if="isEmpty && !isLoadingFirstPage" class="empty-state" role="status" aria-live="polite">
                <div class="empty-icon">🧾</div>
                <h3 class="empty-title">Здесь пока пусто</h3>
                <p class="empty-desc">Нет ставок в этой категории. Попробуйте переключиться на другую вкладку.</p>
                <div class="empty-actions">
                    <button class="catalog-btn" @click="switchTab('active')">Активные</button>
                    <button class="catalog-btn" @click="switchTab('archived')">Архив</button>
                </div>
            </div>

            <!-- Bets list (normal) -->
            <!-- We use an out-in transition around the entire list so old list leaves, then new list appears.
           The listKey is bumped only when new data arrives, so while fetching the old list remains visible. -->
            <transition name="list-fade" mode="out-in">
                <div class="bets-list" :key="listKey">
                    <div v-for="bet in bets" :key="bet.id">
                        <BetsCard :title="bet.name" :eventLogo="bet.image_path" :endsAt="bet.close_time"
                            :pool="getTotalPool(bet)" :betTypeText="bet.event_type" :status="getBetStatus(bet)"
                            :chance="getBetPercent(bet)" @share="shareBetFunction(bet.name)"
                            @click="$router.push({ name: 'BetDetails', params: { id: bet.id } })" />
                    </div>
                </div>
            </transition>

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

import { useTelegram } from '@/services/telegram'

// Supabase client
import supabase from '@/services/supabase'

const { tg, user } = useTelegram()

/* ---------------------------
   Reactive state
   --------------------------- */
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

// key for the visible list. we bump this after new data is assigned to trigger out-in transition
const listKey = ref('initial-' + Date.now())

/* ---------------------------
   Utility / parsing helpers
   --------------------------- */

/** Coerce a string/number into a finite Number, handling commas, symbols. */
function parseNumber(v) {
    if (v == null) return NaN
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
    if (typeof v === 'string') {
        const trimmed = v.trim()
        try {
            const maybe = JSON.parse(trimmed)
            if (typeof maybe === 'number') return Number.isFinite(maybe) ? maybe : NaN
        } catch (e) { /* ignore */ }

        const cleaned = trimmed.replace(',', '.').replace(/[^\d.\-+eE]/g, '')
        const n = parseFloat(cleaned)
        return Number.isFinite(n) ? n : NaN
    }
    return NaN
}

function normalizeOdds(raw) {
    if (raw == null) return NaN
    const n = parseNumber(raw)
    if (!Number.isFinite(n)) return NaN
    if (n > 1) return Math.max(0, Math.min(1, n / 100))
    return Math.max(0, Math.min(1, n))
}

/** Recursively sum numeric values inside arrays/objects */
function sumNumeric(x) {
    if (x == null) return 0
    if (typeof x === 'number') return Number.isFinite(x) ? x : 0
    if (typeof x === 'string') {
        const n = parseNumber(x)
        return Number.isFinite(n) ? n : 0
    }
    if (Array.isArray(x)) return x.reduce((s, it) => s + sumNumeric(it), 0)
    if (typeof x === 'object') return Object.values(x).reduce((s, v) => s + sumNumeric(v), 0)
    return 0
}

/** Round to max 2 decimals and strip trailing zeros (return Number) */
function round2(n) {
    if (!Number.isFinite(n)) return 0
    return Number(Number(n).toFixed(2))
}

/* ---------------------------
   Volume & percent helpers
   (reused by the BetsCard props)
   --------------------------- */

function getTotalPool(betObj) {
    if (!betObj) return 0
    const source = (betObj && typeof betObj === 'object' && 'value' in betObj) ? betObj.value : betObj
    let vol = source && source.volume
    if (vol == null) return 0

    if (typeof vol === 'string') {
        const s = vol.trim()
        if ((s[0] === '{' && s[s.length - 1] === '}') || (s[0] === '[' && s[s.length - 1] === ']')) {
            try { vol = JSON.parse(s) } catch (e) { /* not JSON */ }
        }
    }

    function sumVolume(x) {
        if (x == null) return 0
        if (typeof x === 'number') return Number.isFinite(x) ? x : 0
        if (typeof x === 'string') {
            const n = parseFloat(x.replace(/[^\d.-]+/g, ''))
            return Number.isFinite(n) ? n : 0
        }
        if (Array.isArray(x)) return x.reduce((s, it) => s + sumVolume(it), 0)
        if (typeof x === 'object') return Object.values(x).reduce((s, v) => s + sumVolume(v), 0)
        return 0
    }

    const rawSum = sumVolume(vol)
    if (!Number.isFinite(rawSum)) return 0
    return Number(rawSum.toFixed(2))
}

/**
 * Compute integer percent (0..100) for a single bet object.
 * Uses volume Yes/No if present; otherwise uses total pool + odds; fallback to bet.current_odds.
 */
function getBetPercent(bet) {
    if (!bet) return 0

    const rawVol = bet.volume ?? bet.value?.volume ?? bet.value ?? bet
    let vol = rawVol
    if (typeof vol === 'string') {
        const s = vol.trim()
        if ((s[0] === '{' && s[s.length - 1] === '}') || (s[0] === '[' && s[s.length - 1] === ']')) {
            try { vol = JSON.parse(s) } catch (e) { /* leave vol as string */ }
        }
    }

    if (vol && typeof vol === 'object' && !Array.isArray(vol)) {
        const keys = Object.keys(vol)
        const yesKey = keys.find(k => /^(yes|y|yesamount|yes_amount|yesAmount|yes_value)$/i.test(k))
        const noKey = keys.find(k => /^(no|n|noamount|no_amount|noAmount|no_value)$/i.test(k))

        if (yesKey || noKey) {
            const yes = parseNumber(vol[yesKey]) || 0
            const no = parseNumber(vol[noKey]) || 0
            const total = yes + no
            if (total > 0) return Math.round((yes / total) * 100)
        }

        const total = sumNumeric(vol)
        const p = normalizeOdds(bet.current_odds ?? bet.value?.current_odds)
        if (total > 0 && Number.isFinite(p)) return Math.round(p * 100)
    }

    if (Array.isArray(vol)) {
        let yesAcc = 0, noAcc = 0
        for (const item of vol) {
            if (!item || typeof item !== 'object') continue
            const yk = Object.keys(item).find(k => /yes/i.test(k))
            const nk = Object.keys(item).find(k => /no/i.test(k))
            if (yk || nk) {
                yesAcc += parseNumber(item[yk]) || 0
                noAcc += parseNumber(item[nk]) || 0
            }
        }
        const totalAcc = yesAcc + noAcc
        if (totalAcc > 0) return Math.round((yesAcc / totalAcc) * 100)

        const total = sumNumeric(vol)
        const p = normalizeOdds(bet.current_odds ?? bet.value?.current_odds)
        if (total > 0 && Number.isFinite(p)) return Math.round(p * 100)
    }

    const tot = parseNumber(vol)
    const p = normalizeOdds(bet.current_odds ?? bet.value?.current_odds)
    if (Number.isFinite(tot) && Number.isFinite(p)) {
        return Math.round(p * 100)
    }

    if (bet.current_odds != null || (bet.value && bet.value.current_odds != null)) {
        const pf = normalizeOdds(bet.current_odds ?? bet.value?.current_odds)
        if (Number.isFinite(pf)) return Math.round(pf * 100)
    }

    return 0
}

/**
 * Determine localized bet status string.
 * Accepts betObj (or Vue ref with .value).
 */
function getBetStatus(betObj) {
    const bet = betObj && typeof betObj === 'object' && 'value' in betObj ? betObj.value : (betObj || {})
    const closeRaw = bet.close_time ?? null
    const resultRaw = bet.result ?? null

    const isMissing = (v) => {
        if (v == null) return true
        if (typeof v === 'string') {
            const t = v.trim().toLowerCase()
            return t === '' || t === 'undefined' || t === 'null'
        }
        return false
    }

    let closeDate = null
    if (closeRaw != null) {
        try {
            closeDate = (typeof closeRaw === 'number') ? new Date(closeRaw) : new Date(String(closeRaw))
            if (Number.isNaN(closeDate.getTime())) closeDate = null
        } catch (e) {
            closeDate = null
        }
    }

    if (closeDate && Date.now() < closeDate.getTime()) return 'Открыто'
    if (isMissing(resultRaw)) {
        if (closeDate && Date.now() >= closeDate.getTime()) return 'Обработка'
        return 'Открыто'
    }

    let r = resultRaw
    if (typeof r === 'boolean') r = r ? 'yes' : 'no'
    else r = String(r).trim().toLowerCase()

    const yesSet = new Set(['yes', 'y', 'да', 'дa', 'true', '1', 'yes!'])
    const noSet = new Set(['no', 'n', 'нет', 'false', '0', 'no!'])

    if (yesSet.has(r)) return 'Результат "Да"'
    if (noSet.has(r)) return 'Результат "Нет"'

    return `Результат "${String(resultRaw)}"`
}

/* ---------------------------
   Networking & pagination
   --------------------------- */

function shareBetFunction(betName) {
    let ref = user?.id ?? ''
    let shareLink = 'https://t.me/GiftsPredict_Bot?startapp=' + ref
    let messageText = `%0AПосмотри, что думает комьюнити в телеграме по поводу события - ${betName} 🔔%0A%0AЛегкие TON или прогорят? 💵`
    tg.openTelegramLink(`https://t.me/share/url?url=${shareLink}&text=${messageText}`)
}

const isLoadingFirstPage = computed(() => loadingMore.value && bets.value.length === 0)
const isEmpty = computed(() => !loadingInitial.value && bets.value.length === 0 && allLoaded.value)

// initial load & observe
onMounted(async () => {
    await resetAndLoad()
    observeScrollEnd()
})

// when tab changes, we call resetAndLoad — we DO NOT clear bets until new data is ready
watch(selectedTab, async () => {
    await resetAndLoad({ showGlobal: false, clearBefore: false })
})

/**
 * resetAndLoad(options)
 * - showGlobal (default true): whether to allow the global loader debounce to show
 * - clearBefore (default true): whether to clear bets immediately (we keep old list during tab switches)
 */
async function resetAndLoad({ showGlobal = true, clearBefore = true } = {}) {
    page.value = 0
    allLoaded.value = false
    loadingMore.value = false

    if (clearBefore) bets.value = []

    if (initialLoaderTimer) {
        clearTimeout(initialLoaderTimer)
        initialLoaderTimer = null
    }
    if (showGlobal) {
        initialLoaderTimer = setTimeout(() => {
            loadingInitial.value = true
        }, 150)
    }

    try {
        const firstPage = await fetchBetsPage(0)

        // replace UI list only once data is ready to avoid empty flicker.
        bets.value = firstPage
        // bump the key so the transition will animate out old -> animate in new
        listKey.value = selectedTab.value + '-' + Date.now()

        page.value = 1
        if (firstPage.length < pageSize) allLoaded.value = true
    } catch (err) {
        console.error('resetAndLoad error', err)
    } finally {
        if (initialLoaderTimer) {
            clearTimeout(initialLoaderTimer)
            initialLoaderTimer = null
        }
        loadingInitial.value = false
    }
}

/**
 * fetchBetsPage(pageIndex) -> returns array
 */
async function fetchBetsPage(pageIndex) {
    const from = pageIndex * pageSize
    const to = from + pageSize - 1

    let query = supabase
        .from('bets')
        .select('id, name, image_path, date, result, close_time, volume, event_type, current_odds')
        .order('date', { ascending: true })
        .range(from, to)

    if (selectedTab.value === 'active') {
        query = query.eq('result', 'undefined')
    } else {
        query = query.neq('result', 'undefined')
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
}

/* loadMoreBets */
async function loadMoreBets() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    try {
        const incoming = await fetchBetsPage(page.value)
        if (incoming.length < pageSize) allLoaded.value = true
        bets.value.push(...incoming)
        page.value += 1
    } catch (err) {
        console.error('Error loading bets:', err)
    } finally {
        loadingMore.value = false
    }
}

/* IntersectionObserver for infinite scroll */
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

/* switch tab */
function switchTab(tab) {
    if (selectedTab.value === tab) return
    selectedTab.value = tab
}

/* ---------------------------
   Styles remain below
   --------------------------- */
</script>

<style scoped>
.bets-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;
    user-select: none;
}

/* Catalogue buttons row */
.bets-catalogue {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 12px;
}

/* Transition for whole-list out-in */
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
    gap: 0.65rem;
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
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: auto;
}

/* ensure underlying UI is inert (prevents accidental clicks)
   the aria-hidden attr is set on .bets-root in the template */
.bets-root[aria-hidden="true"] {
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    opacity: 0.98;
}

/* Keep inline loader reserved space so list doesn't jump */
.inline-loader {
    display: flex;
    justify-content: center;
    padding: 28px 0;
    min-height: 120px;
    /* reserve approximate space so layout is stable */
}

/* Override LoaderPepe inner margin so the animation truly centers */
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
