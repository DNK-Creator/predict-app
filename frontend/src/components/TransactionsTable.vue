<template>
    <div class="tx-list-parent">
        <!-- Group transactions by date -->
        <div v-if="transactions.length < 1" class="empty-transactions">
            <div ref="svgContainer" class="empty-media"></div>
            <span class="empty-text">Make first transaction</span>
            <span class="empty-text-two">and start predicting</span>
        </div>
        <div v-for="(group, date) in groupedTransactions" :key="date" class="day-group">
            <!-- Day header -->
            <div class="day-header">
                {{ formatDateHeader(date) }}
            </div>

            <ul class="transactions-list">
                <li v-for="tx in group" :key="tx.uuid" class="transaction-item">
                    <!-- Icon based on type -->
                    <img :src="getIcon(tx.type)" alt="transaction icon" class="transaction-icon" />

                    <!-- Details: status/name and time -->
                    <div class="transaction-details">
                        <div class="transaction-name">{{ tx.status }}</div>
                        <div class="transaction-time">{{ formatTime(tx.created_at) }}</div>
                    </div>

                    <!-- Amount with sign -->
                    <div class="transaction-amount">
                        {{ tx.type === 'Withdrawal' ? '-' : '+' }}{{ Math.abs(tx.amount) }} TON
                    </div>
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { defineProps } from 'vue'
import lottie from 'lottie-web';
import pako from 'pako';
import EmptyGift from '@/assets/EmptyGift.tgs'
import depositImg from '@/assets/icons/Deposit_Icon.png'
import withdrawalImg from '@/assets/icons/Withdrawal_Icon.png'

const props = defineProps({
    transactions: {
        type: Array,
        required: true
    }
})

const svgContainer = ref(null);

// Group transactions by date (YYYY-MM-DD)
const groupedTransactions = computed(() => {
    return props.transactions.reduce((groups, tx) => {
        const date = new Date(tx.created_at).toISOString().split('T')[0]
        if (!groups[date]) groups[date] = []
        groups[date].push(tx)
        return groups
    }, {})
})

// Format header: 7 JULY 2025
function formatDateHeader(dateString) {
    const date = new Date(dateString)
    const day = date.getDate()
    const month = date.toLocaleString('en-US', { month: 'long' }).toUpperCase()
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
}

// Format time: 16:30
function formatTime(iso) {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Return icon path based on transaction type
function getIcon(type) {
    if (type === 'Deposit') {
        return depositImg
    } else if (type === 'Withdrawal') {
        return withdrawalImg
    }
    return depositImg
}

onMounted(async () => {
    // 1) Fetch the .tgs file as binary
    const res = await fetch(EmptyGift);
    const buf = await res.arrayBuffer();

    // 2) Decompress gzip → JSON string
    const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' });

    // 3) Parse and load into lottie
    const animationData = JSON.parse(jsonStr);
    lottie.loadAnimation({
        container: svgContainer.value,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData
    });
})
</script>

<style scoped>
.tx-list-parent {
    max-height: 55vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
        width: 0;
        height: 0;
    }

    scrollbar-width: none;
    scrollbar-color: transparent transparent;
}

.day-group {
    margin-bottom: 1.5rem;
}

.day-header {
    opacity: 0.5;
    color: white;
    font-weight: bold;
    margin-bottom: 0.5rem;
    width: 90vw;
    margin: auto auto;
    font-family: Inter;
}

.transactions-list {
    list-style: none;
    padding: 0;
    margin: auto auto;
    width: 90vw;
}

.transaction-item {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    border-bottom: thin solid #626262;
}

.transaction-icon {
    width: 40px;
    height: 40px;
    object-fit: cover;
    margin-right: 0.75rem;
    border-radius: 12px;
}

.transaction-details {
    flex-grow: 1;
}

.transaction-name {
    font-size: 1rem;
    font-weight: 500;
    color: white;
    font-family: Inter;
    font-weight: 400;
}

.transaction-time {
    opacity: 0.5;
    color: white;
    font-size: 0.875rem;
    font-family: Inter;
    font-weight: 400;
}

.transaction-amount {
    font-size: 1rem;
    font-family: Inter;
    font-weight: 400;
    color: white;
}

.empty-transactions {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 40vh;
    width: auto;
    color: white;
}

.empty-media {
    height: calc(1.5rem + 15vh);
    width: calc(1.5rem + 15vh);
}

.empty-text {
    font-family: Inter;
    font-size: 2.25vh;
    margin-bottom: 0;
    margin-top: 2vh;
}

.empty-text-two {
    font-family: Inter;
    font-size: 2vh;
    opacity: 0.5;
    margin-top: 0.25vh;
}
</style>
