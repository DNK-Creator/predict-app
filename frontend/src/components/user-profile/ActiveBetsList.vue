<template>
    <div class="active-bets-list">
        <div v-for="bet in activeBets" :key="bet.id" class="bet-item">
            <!-- date “badge” -->
            <div class="date-badge">
                <div class="date-month">
                    {{ formatDate(bet.date, { month: 'short' }) }}
                </div>
                <div class="date-day">
                    {{ formatDate(bet.date, { day: 'numeric' }) }}
                </div>
            </div>

            <!-- main content -->
            <router-link :to="{ name: 'BetDetails', params: { id: bet.id } }" class="bet-content">
                <div class="bet-name">
                    {{ translateBetName(bet.name, bet.name_en) }}
                </div>
                <div class="bet-meta">
                    {{ $t('placed') }} {{ bet.stake }} TON {{ $t('on-something') }} {{ formattedSide(bet.side) }}
                </div>
            </router-link>
        </div>
        <!-- 
        <div v-if="activeBets.length === 0" class="empty-state">
            Нет активных предсказаний.
        </div> -->
    </div>
</template>

<script setup>
import { ref, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { getUsersActiveBets } from '@/services/bets-requests.js'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const activeBets = ref([])
const loading = ref(false)

function translateBetName(nameRu, nameEn) {
    return app.language === 'ru' ? nameRu : nameEn
}

async function loadActiveBets() {
    try {
        loading.value = true
        // always fetch fresh data from the API
        activeBets.value = await getUsersActiveBets()
    } catch (e) {
        console.error('Failed to load active bets', e)
        // optional: keep previous data instead of clearing on error
    } finally {
        loading.value = false
    }
}

// initial load when component first mounts
onMounted(() => {
    loadActiveBets()
})

// also refresh when component is re-activated (useful if you wrap the view in <keep-alive>)
onActivated(() => {
    loadActiveBets()
})

// refresh when the user returns to the tab (optional but useful)
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        loadActiveBets()
    }
}

function resolveLocale() {
    // normalize app.language like: 'ru', 'ru-RU', 'en', 'en-US'
    const lang = String(app.language ?? '').toLowerCase()
    if (!lang) return 'en-US' // fallback
    if (lang.startsWith('ru')) return 'ru-RU'
    if (lang.startsWith('en')) return 'en-US'
    // add other mappings if you need them in future (e.g. 'uk' -> 'uk-UA')
    return 'en-US'
}

function formatDate(dateString, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
    if (!dateString) return '—'
    try {
        const locale = resolveLocale()
        return new Date(dateString).toLocaleDateString(locale, opts)
    } catch (e) {
        // fallback: ISO-like short
        return String(dateString).slice(0, 10)
    }
}

function formattedSide(side) {
    const s = String(side ?? '').toLowerCase()
    const isYes = s === 'yes'
    if (String(app.language ?? '').toLowerCase().startsWith('ru')) {
        return isYes ? 'ДА' : 'НЕТ'
    }
    // English (keep uppercase like the Russian UI)
    return isYes ? 'YES' : 'NO'
}

document.addEventListener('visibilitychange', handleVisibilityChange)

// cleanup listener when component unmounts
onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>


<style scoped>
.active-bets-list {
    max-width: 480px;
    width: 87.5vw;
    margin: 0 auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    user-select: none;
}

.header-text {
    color: rgb(215, 215, 215, 0.88);
    text-align: center;
}

/* Each bet row */
.bet-item {
    display: flex;
    /* background-color: #292a2a; */
    background: linear-gradient(to right, #2D83EC, #1AC9FF);
    border-radius: 24px;
    overflow: hidden;
    transition: background-color 0.2s ease;
}

.bet-item:hover {
    background-color: #457da8;
}

/* Date badge on the left */
.date-badge {
    flex-shrink: 0;
    width: 58px;
    background-color: #1f2937;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 4px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.date-month {
    font-size: 0.85rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    line-height: 1;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.date-day {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f9fafb;
    margin-top: 2px;
    line-height: 1;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

/* Main clickable content */
.bet-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px;
    text-decoration: none;
    flex: 1;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.bet-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: #f9fafb;
    margin-bottom: 4px;
}

.bet-meta {
    font-size: 0.9rem;
    opacity: 0.6;
    color: #ffffff;
}

/* Empty-state message */
.empty-state {
    text-align: center;
    font-size: 0.95rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    color: #9ca3af;
    padding: 16px;
    background-color: #292a2a;
    border-radius: 12px;
}
</style>
