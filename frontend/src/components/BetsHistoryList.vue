<template>
    <div class="bets-history-container">
        <!-- Filter Panel -->
        <div class="filter-panel" role="region" aria-label="Фильтр предсказаний">
            <label for="filter-select" class="filter-label">{{ $t('filter') }}</label>
            <select id="filter-select" v-model="filter" @change="onFilterChange" class="filter-select">
                <option value="all">{{ $t('all') }}</option>
                <option value="won">{{ $t('won') }}</option>
                <option value="lost">{{ $t('lost') }}</option>
            </select>
        </div>

        <!-- Bets List -->
        <div class="bets-history-list" role="list">
            <div v-for="bet in filteredBets" :key="bet.id" :class="['bet-item', bet.won ? 'won' : 'lost']"
                role="listitem" tabindex="0"
                :aria-label="`${bet.name} ${bet.won ? t('result-won') : t('result-lost')}`">
                <!-- left accent + date -->
                <div class="left-col">
                    <div class="accent" aria-hidden="true"></div>
                    <div class="date-badge" aria-hidden="true">
                        <div class="date-month">{{ formatDate(bet.date, { month: 'short' }) }}</div>
                        <div class="date-day">{{ formatDate(bet.date, { day: 'numeric' }) }}</div>
                    </div>
                </div>

                <!-- main content -->
                <router-link :to="{ name: 'BetDetails', params: { id: bet.id } }" class="bet-content" tabindex="-1">
                    <div class="bet-name">{{ bet.name }}</div>
                    <div class="bet-meta">{{ t('placed_on', { stake: bet.stake, side: formatSide(bet.side) }) }}</div>
                </router-link>

                <!-- result chip (compact) -->
                <div class="result-col">
                    <span class="result-chip" :class="bet.won ? 'chip-won' : 'chip-lost'"
                        :aria-label="bet.won ? t('result-won') : t('result-lost')" role="status">
                        <span class="chip-icon" aria-hidden="true">
                            <svg v-if="bet.won" width="12" height="12" viewBox="0 0 24 24" fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                        </span>
                        <span class="chip-text">{{ bet.won ? t('result-won') : t('result-lost') }}</span>
                    </span>
                </div>
            </div>

            <div v-if="filteredBets.length === 0" class="empty-state" role="status">
                {{ $t('no') }} {{ formatFilterWord(filter) }} {{ $t('predictions') }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUsersHistoryBets } from '@/services/bets-requests.js'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from 'vue-i18n'

const app = useAppStore()

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const historyBets = ref([])
const filter = ref(route.query.filter ?? 'all')

function formatWon() {
    return t('result-won-short') || (app.language === "ru" ? "- выигрыш" : "- winning")
}

function formatLost() {
    return t('result-lost-short') || (app.language === "ru" ? "- проигрыш" : "- lose")
}

onMounted(async () => {
    try {
        historyBets.value = (await getUsersHistoryBets()).reverse()
    } catch (e) {
        console.error('Failed to load bet history', e)
    }
})

watch(
    () => route.query.filter,
    (newFilter) => {
        filter.value = newFilter ?? 'all'
    }
)

const filteredBets = computed(() => {
    if (filter.value === 'all') return historyBets.value
    if (filter.value === 'won') return historyBets.value.filter(b => b.won)
    return historyBets.value.filter(b => !b.won)
})

function onFilterChange() {
    router.push({ name: 'bets-history', query: { filter: filter.value } })
}

function formatFilterWord(word) {
    // prefer i18n keys where available
    if (word === 'won') return t('filter-word-won') || (app.language === 'ru' ? 'выигранных' : 'won')
    if (word === 'lost') return t('filter-word-lost') || (app.language === 'ru' ? 'проигранных' : 'lost')
    return t('filter-word-past') || (app.language === 'ru' ? 'завершённых' : 'past')
}

function formatDate(dateInput, opts = {}) {
    // defensive: invalid/missing date
    if (!dateInput) return ''
    const d = new Date(dateInput)
    if (Number.isNaN(d.getTime())) return ''

    // decide which locale to use based on app.language
    const lang = (app.language ?? 'en').toLowerCase()
    // map short codes to full locales for predictable output
    let locale = 'en-US'
    if (lang.startsWith('ru')) locale = 'ru-RU'
    else if (lang.startsWith('en')) locale = 'en-US'
    else locale = lang // allow custom stored locales

    try {
        return d.toLocaleDateString(locale, opts)
    } catch (e) {
        // fallback to ISO-ish pieces if toLocaleDateString fails
        if (opts.month === 'short') {
            return d.toLocaleString('en-US', { month: 'short' })
        }
        if (opts.day === 'numeric') {
            return String(d.getDate())
        }
        return d.toLocaleString()
    }
}

function formatSide(side) {
    if (!side) return ''
    const s = String(side).trim().toLowerCase()
    // map booleans/strings to localized Yes/No
    if (s === 'yes' || s === 'да' || s === 'true' || s === '1') return t('yes') || (app.language === 'ru' ? 'Да' : 'Yes')
    if (s === 'no' || s === 'нет' || s === 'false' || s === '0') return t('no') || (app.language === 'ru' ? 'Нет' : 'No')
    // otherwise return original (but try to localize via i18n if you have keys)
    return s
}
</script>

<style scoped>
/* Container */
.bets-history-container {
    max-width: 680px;
    width: 94vw;
    margin: 0 auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
}

/* Filter Panel (clean, subtle) */
.filter-panel {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
    padding: 8px;
    border-radius: 12px;
}

.filter-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #9ca3af;
}

/* Styled select (dark) */
.filter-select {
    flex: 1;
    padding: 8px 10px;
    font-size: 0.95rem;
    background: #1f2937;
    /* dark select background */
    color: #f9fafb;
    /* visible text */
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    position: relative;
    background-image: linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.6) 50%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.6) 50%, transparent 50%);
    background-position: calc(100% - 18px) calc(1em + 2px), calc(100% - 12px) calc(1em + 2px);
    background-size: 6px 6px, 6px 6px;
    background-repeat: no-repeat;
}

/* Desktop/modern browsers: darken the option list and text */
.filter-select option {
    background-color: #1f2937;
    /* dark option background */
    color: #f9fafb;
    /* visible option text */
}

/* Firefox specific: better contrast and remove default outline */
@-moz-document url-prefix() {
    .filter-select {
        padding-right: 34px;
        /* leave space for Firefox caret */
    }

    .filter-select option {
        color: #f9fafb;
        background-color: #1f2937;
    }
}

/* IE/Edge: hide default expand button so our caret shows */
.filter-select::-ms-expand {
    display: none;
}

/* Focus / hover states */
.filter-select:focus,
.filter-select:hover {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.02);
}

/* For accessibility: ensure options remain readable when the browser applies its own highlight */
.filter-select option:checked,
.filter-select option:active {
    background-color: #111827;
    /* slightly darker for selected item */
    color: #fff;
}

/* Bets list */
.bets-history-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 68vh;
    overflow-y: auto;
    padding-right: 4px;
}

/* Individual card */
.bet-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01));
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 14px;
    padding: 8px;
    transition: transform 160ms cubic-bezier(.2, .9, .3, 1), box-shadow 160ms ease;
    position: relative;
    overflow: hidden;
}

/* Hover/focus microinteraction */
.bet-item:hover,
.bet-item:focus {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(2, 6, 23, 0.45);
    outline: none;
}

/* left column containing accent + date */
.left-col {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}

/* accent bar: the subtle quick-cue for status */
.accent {
    width: 6px;
    height: 56px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
}

/* date badge */
.date-badge {
    width: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 4px;
}

.date-month {
    font-size: 0.75rem;
    color: #9ca3af;
    text-transform: uppercase;
    line-height: 1;
}

.date-day {
    font-size: 1.25rem;
    color: #f8fafc;
    font-weight: 700;
    line-height: 1;
    margin-top: 2px;
}

/* main content */
.bet-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 8px 6px;
    text-decoration: none;
    color: inherit;
    flex: 1;
    min-width: 0;
}

.bet-name {
    font-size: 1rem;
    font-weight: 600;
    color: #f8fafc;
    /* neutral title color */
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.bet-meta {
    font-size: 0.88rem;
    color: rgba(249, 250, 251, 0.72);
    margin-top: 4px;
    display: block;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

/* result chip column */
.result-col {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-left: 6px;
}

/* chip base style */
.result-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 700;
    color: white;
    min-width: 92px;
    justify-content: center;
    box-sizing: border-box;
}

/* chip variants - subtle tinted backgrounds, not harsh text color changes */
.chip-won {
    background: linear-gradient(90deg, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0.08));
    color: #16a34a;
    /* green text */
    border: 1px solid rgba(34, 197, 94, 0.16);
}

.chip-lost {
    background: linear-gradient(90deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.08));
    color: #ef4444;
    /* red text */
    border: 1px solid rgba(239, 68, 68, 0.14);
}

/* chip icon style (keeps icon same color as text) */
.chip-icon svg {
    display: block;
    stroke: currentColor;
    fill: none;
}

/* Per-card accent color rules (applies to .accent bar and subtle border tint) */
.bet-item.won .accent {
    background: linear-gradient(180deg, #34d399, #10b981);
    /* green accent */
}

.bet-item.lost .accent {
    background: linear-gradient(180deg, #fb7185, #ef4444);
    /* red accent */
}

/* subtle border tint to harmonize with accent */
.bet-item.won {
    border-color: rgba(16, 185, 129, 0.06);
}

.bet-item.lost {
    border-color: rgba(239, 68, 68, 0.06);
}

/* Empty state */
.empty-state {
    text-align: center;
    font-size: 0.95rem;
    color: #9ca3af;
    padding: 16px;
    background-color: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
}

/* scrollbar */
.bets-history-list::-webkit-scrollbar {
    width: 6px;
}

.bets-history-list::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
}

/* Responsive */
@media (max-width: 420px) {
    .result-chip {
        min-width: 76px;
        padding: 5px 7px;
        font-size: 0.78rem;
    }

    .accent {
        height: 48px;
    }

    .date-day {
        font-size: 1.1rem;
    }
}
</style>
