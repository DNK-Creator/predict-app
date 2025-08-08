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
                    {{ bet.name }}
                </div>
                <div class="bet-meta">
                    Placed {{ bet.stake }} TON on {{ bet.side }}
                </div>
            </router-link>
        </div>

        <div v-if="activeBets.length === 0" class="empty-state">
            No active bets.
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getUsersActiveBets } from '@/services/bets-requests.js'

const activeBets = ref([])

onMounted(async () => {
    try {
        activeBets.value = await getUsersActiveBets()
    } catch (e) {
        console.error('Failed to load active bets', e)
    }
})

function formatDate(dateString, opts) {
    return new Date(dateString).toLocaleDateString('en-US', opts)
}
</script>

<style scoped>
.active-bets-list {
    max-width: 480px;
    width: 89.5vw;
    margin: 0 auto;
    padding: 14px;
    padding-top: 0px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* Each bet row */
.bet-item {
    display: flex;
    /* background-color: #292a2a; */
    background: linear-gradient(to right, #2D83EC, #1AC9FF);
    border-radius: 12px;
    overflow: hidden;
    transition: background-color 0.2s ease;
}

.bet-item:hover {
    background-color: #457da8;
}

/* Date badge on the left */
.date-badge {
    flex-shrink: 0;
    width: 56px;
    background-color: #1f2937;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 600;
}

.date-month {
    font-size: 0.85rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    line-height: 1;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.date-day {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f9fafb;
    margin-top: 2px;
    line-height: 1;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

/* Main clickable content */
.bet-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12px;
    text-decoration: none;
    flex: 1;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
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
    font-family: 'Inter Variable', sans-serif;
    color: #9ca3af;
    padding: 16px;
    background-color: #292a2a;
    border-radius: 12px;
}
</style>
