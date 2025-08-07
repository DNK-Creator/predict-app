<template>
    <div class="bets-history-container">
        <!-- Filter Dropdown -->
        <div class="filter-panel">
            <label for="filter-select" class="filter-label">Show:</label>
            <select id="filter-select" v-model="filter" @change="onFilterChange" class="filter-select">
                <option value="all">All</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
            </select>
        </div>

        <!-- Bets List -->
        <div class="bets-history-list">
            <div v-for="bet in filteredBets" :key="bet.id" :class="['bet-item', bet.won ? 'won' : 'lost']">
                <!-- date badge -->
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
                        {{ bet.name }}
                    </div>
                    <div class="bet-meta">
                        Placed {{ bet.stake }} TON on {{ bet.side }}
                    </div>
                </router-link>
            </div>

            <div v-if="filteredBets.length === 0" class="empty-state">
                No {{ filter === 'all' ? 'past' : filter }} bets.
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUsersHistoryBets } from '@/services/bets-requests.js'

const route = useRoute()
const router = useRouter()
const historyBets = ref([])
const filter = ref(route.query.filter ?? 'all')

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

function formatDate(dateString, opts) {
    return new Date(dateString).toLocaleDateString('en-US', opts)
}
</script>

<style scoped>
.bets-history-container {
    max-width: 480px;
    width: 89.5vw;
    margin: 0 auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* Filter Panel */
.filter-panel {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #313131;
    padding: 8px;
    border-radius: 12px;
}

.filter-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #9ca3af;
}

.filter-select {
    flex: 1;
    padding: 6px 8px;
    font-size: 0.9rem;
    background-color: #313131;
    color: #f9fafb;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.filter-select:hover {
    background-color: #313131;
}

/* Bets List */
.bet-item {
    display: flex;
    background: linear-gradient(to right, #2d83ec, #1ac9ff);
    border-radius: 12px;
    overflow: hidden;
    transition: background-color 0.2s ease;
}

/* Bets List Container */
.bets-history-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 70vh;
    overflow-y: auto;
    padding-right: 4px;
}

.bets-history-list::-webkit-scrollbar {
    width: 6px;
}

.bets-history-list::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.bet-item:hover {
    background-color: #457da8;
}

.bet-item.won .bet-name {
    color: #22c55e;
}

.bet-item.lost .bet-name {
    color: #ef4444;
}

.date-badge {
    flex-shrink: 0;
    width: 56px;
    background-color: #1f2937;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
}

.date-month {
    font-size: 0.85rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    line-height: 1;
}

.date-day {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f9fafb;
    margin-top: 2px;
    line-height: 1;
}

.bet-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px;
    text-decoration: none;
    flex: 1;
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

.empty-state {
    text-align: center;
    font-size: 0.95rem;
    color: #9ca3af;
    padding: 16px;
    background-color: #292a2a;
    border-radius: 12px;
}
</style>