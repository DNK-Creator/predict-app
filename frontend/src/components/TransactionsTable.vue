<template>
    <div v-show="loaded" class="tx-list-parent">
        <!-- Group transactions by date -->
        <div v-if="transactions.length < 1" class="empty-transactions">
            <div ref="svgContainer" class="empty-media"></div>
            <span class="empty-text">{{ $t("make-tx") }}</span>
            <span class="empty-text-two">{{ $t("tx-next-hint") }}</span>
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
                        <div class="transaction-name">{{ translateStatus(tx.status) }}</div>
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
import EmptyGift from '@/assets/PepeCalendar.tgs'
import depositImg from '@/assets/icons/Deposit_Icon.png'
import withdrawalImg from '@/assets/icons/Withdrawal_Icon.png'
import giftImg from '@/assets/icons/Gift_Icon.png'
import { useAppStore } from '@/stores/appStore'

const props = defineProps({
    transactions: {
        type: Array,
        required: true
    },
    loaded: Boolean
})

const app = useAppStore()

const svgContainer = ref(null);

function translateStatus(status) {
    if (status === 'Незавершённое пополнение' || status === 'Незавершенное пополнение' || status === 'незавершенное пополнение' || status === 'Ожидание пополнения') {
        return app.language === 'ru' ? 'Незавершённое пополнение' : 'Unfinished deposit'
    } else if (status === 'Ожидание вывода' || status === 'ожидание вывода' || status === 'Незавершенный вывод') {
        return app.language === 'ru' ? 'Ожидание выводы' : 'Withdrawal pending'
    } else if (status === 'Успешное пополнение' || status === 'Пополнение успешно' || status === 'Успешный депозит') {
        return app.language === 'ru' ? 'Успешное пополнение' : 'Successful Deposit'
    } else if (status === 'Пополнение подарком' || status === 'Пополнение подарками' || status === 'Подарок') {
        return app.language === 'ru' ? 'Пополнение подарком' : 'Gift Deposit'
    } else if (status === 'Успешный вывод' || status === 'Вывод успешен' || status === 'Завершенный вывод') {
        return app.language === 'ru' ? 'Успешный вывод' : 'Successful Withdrawal'
    } else if (status === 'Отмененное пополнение' || status === 'Отменённое пополнение' || status === 'Пополнение отменено') {
        return app.language === 'ru' ? 'Отменённое пополнение' : 'Canceled Deposit'
    } else if (status === 'Отмененный вывод' || status === 'Вывод отменён' || status === 'Отменённый вывод') {
        return app.language === 'ru' ? 'Отменённый вывод' : 'Canceled Withdrawal'
    }
}

// Group transactions by date (YYYY-MM-DD)
const groupedTransactions = computed(() => {
    return props.transactions.reduce((groups, tx) => {
        const date = new Date(tx.created_at).toISOString().split('T')[0]
        if (!groups[date]) groups[date] = []
        groups[date].push(tx)
        return groups
    }, {})
})

/**
 * Resolve a locale string from app.language
 * - 'ru' → 'ru-RU'
 * - 'en' → 'en-US' (you can change to 'en-GB' if you prefer DMY order)
 * - fallback: 'en-US'
 */
function resolveLocale() {
    const lang = String(app.language ?? '').toLowerCase()
    if (!lang) return 'en-US'
    if (lang.startsWith('ru')) return 'ru-RU'
    if (lang.startsWith('en')) return 'en-US'
    return 'en-US'
}

/**
 * Format header like: "5 АВГУСТА 2025" (Russian genitive month, uppercase)
 * or for English / other languages: "5 AUGUST 2025" (uppercase month, day-first)
 *
 * Uses Intl.formatToParts so we can assemble day / month / year regardless of locale ordering.
 */
function formatDateHeader(dateString) {
    const date = new Date(dateString)
    if (isNaN(date)) return '—'

    const locale = resolveLocale()

    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat?.prototype?.formatToParts) {
        try {
            // Request day/month/year parts; for ru-RU Intl will already return genitive month when day present
            const parts = new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).formatToParts(date)

            // extract values
            const dayPart = parts.find(p => p.type === 'day')?.value ?? String(date.getDate())
            const monthPart = parts.find(p => p.type === 'month')?.value ?? (date.toLocaleString(locale, { month: 'long' }))
            const yearPart = parts.find(p => p.type === 'year')?.value ?? String(date.getFullYear())

            return `${dayPart} ${monthPart.toUpperCase()} ${yearPart}`
        } catch (e) {
            // fallback to older approach below
            console.warn('formatDateHeader Intl error', e)
        }
    }

    // Fallback: manual Russian genitive mapping if locale is ru, else use simple month name
    const isRu = resolveLocale().startsWith('ru')
    if (isRu) {
        const monthsGenitive = [
            'ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ',
            'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ'
        ]
        const day = date.getDate()
        const month = monthsGenitive[date.getMonth()]
        const year = date.getFullYear()
        return `${day} ${month} ${year}`
    } else {
        const months = [
            'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
            'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
        ]
        const day = date.getDate()
        const month = months[date.getMonth()]
        const year = date.getFullYear()
        return `${day} ${month} ${year}`
    }
}

// Format time: "17:42" (24-hour, leading zeros) — uses locale but keeps 24-hour for consistency
function formatTime(iso) {
    const date = new Date(iso)
    if (isNaN(date)) return '—'

    const locale = resolveLocale()

    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        try {
            return new Intl.DateTimeFormat(locale, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(date)
        } catch (e) {
            console.warn('formatTime Intl error', e)
        }
    }

    // Fallback
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
}

// Return icon path based on transaction type
function getIcon(type) {
    if (type === 'Deposit') {
        return depositImg
    } else if (type === 'Withdrawal') {
        return withdrawalImg
    } else if (type === 'Gift' || type === 'gift') {
        return giftImg
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
    max-height: 85vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
        width: 0;
        height: 0;
    }

    scrollbar-width: none;
    scrollbar-color: transparent transparent;
    user-select: none;
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
    max-width: 480px;
    margin: auto auto;
    font-family: Inter;
}

.transactions-list {
    list-style: none;
    padding: 0;
    margin: auto auto;
    width: 90vw;
    max-width: 480px;
}

.transaction-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: thin solid #626262;
    max-width: 480px;
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
    height: 60vh;
    width: auto;
    color: white;
}

.empty-media {
    height: calc(1.5rem + 15vh);
    width: calc(1.5rem + 15vh);
}

.empty-text {
    font-weight: 600;
    font-family: "Inter", sans-serif;
    font-size: 2.25vh;
    margin-bottom: 0;
    margin-top: 2vh;
}

.empty-text-two {
    font-weight: 600;
    font-family: "Inter", sans-serif;
    font-size: 2vh;
    opacity: 0.5;
    margin-top: 0.25vh;
}
</style>
