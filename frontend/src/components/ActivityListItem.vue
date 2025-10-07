<template>
    <div class="history-item" role="listitem">
        <div class="info-header">
            <div class="bet-group">
                <span>🔮</span>
                <div class="bet-name">
                    <span>{{ translateName() || '—' }}</span>
                </div>
            </div>
            <div class="time">{{ formattedTime }}</div>
        </div>
        <div class="main-content">
            <img v-if="photo_url" :src="photo_url" alt="avatar" class="avatar" />
            <div class="main">
                <div class="top">
                    <div class="name">{{ '@' + username || '—' }}</div>
                    <div class="bet-amount">{{ $t('bet') }} {{ stakeDisplay }} TON</div>
                </div>
                <div class="bottom">
                    <div class="bet"><span> {{ $t('side') }} • {{ translateSide(side) }} </span></div>
                    <div class="stake">x{{ multiplierDisplay }}</div>
                </div>
            </div>
        </div>

        <!-- BOTTOM WINNINGS ROW -->
        <div class="bottom-winnings" v-if="displayGifts.length > 0">
            <div class="gifts-row" v-if="displayGifts.length">
                <div v-for="(g, idx) in displayGifts" :key="g.gift_url + '-' + idx" class="gift"
                    :aria-hidden="(isOverflowed && idx === 6) ? 'false' : 'true'">
                    <img :src="g.gift_url" :alt="g.gift_name || 'gift'" />
                    <!-- overlay for 7th item when there are more than 7 gifts -->
                    <div v-if="isOverflowed && idx === 6" class="gift-overlay">
                        <span class="more-text">+{{ remainingCount }}</span>
                    </div>
                </div>
            </div>

            <!-- right arrow -->
            <div class="arrow" role="img" aria-hidden="true" :title="'Open winnings'">
                <!-- simple chevron-right SVG using currentColor so CSS color applies -->
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const props = defineProps({
    stake: [String, Number],
    multiplier: [String, Number],
    // accept array, object, or JSON string
    gifts_bet: { type: [Array, Object, String], default: () => [] },
    bet_name: { type: String, default: '' },
    bet_name_en: { type: String, default: '' },
    username: { type: String, default: '' },
    side: { type: String, default: '' },
    created_at: [String, Number, Date],
    photo_url: { type: String, default: '' }
})

const betNameDisplay = computed(() => {
    if (props.bet_name == null) return '—'
    if (props.bet_name.length > 25) {
        return props.bet_name.slice(0, 25) + '..'
    }
    return props.bet_name
})

const stakeDisplay = computed(() => {
    if (props.stake == null) return '—'
    return typeof props.stake === 'number' ? props.stake.toFixed(2) : String(props.stake)
})

const multiplierDisplay = computed(() => {
    if (props.multiplier == null) return '—'
    return typeof props.multiplier === 'number' ? props.multiplier.toFixed(2) : String(props.multiplier)
})

function yesTranslated() {
    return app.language === 'ru' ? 'Да' : 'Yes'
}

function noTranslated() {
    return app.language === 'ru' ? 'Нет' : 'No'
}

function translateSide() {
    if (props.side.toLowerCase() === 'yes') {
        return yesTranslated()
    }
    return noTranslated()
}

function translateName() {
    return app.language === 'ru' ? props.bet_name : props.bet_name_en
}

const formattedTime = computed(() => {
    if (!props.created_at) return ''
    try {
        let d = null
        if (props.created_at instanceof Date) {
            d = props.created_at
        } else if (typeof props.created_at === 'number' || !Number.isNaN(Number(props.created_at))) {
            const num = Number(props.created_at)
            d = (String(props.created_at).length <= 10) ? new Date(num * 1000) : new Date(num)
        } else {
            let s = String(props.created_at).trim()
            s = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2')
            d = new Date(s)
        }

        if (!d || Number.isNaN(d.getTime())) return ''

        const pad = (n) => String(n).padStart(2, '0')
        const day = pad(d.getDate())
        const month = pad(d.getMonth() + 1)
        const hours = pad(d.getHours())
        const minutes = pad(d.getMinutes())

        return `${day}.${month} • ${hours}:${minutes}`
    } catch (e) {
        return ''
    }
})

// --- Gifts parsing & display logic ---
// Accept array or JSON string (or empty)
const giftsArray = computed(() => {
    const raw = props.gifts_bet
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed : []
        } catch (e) {
            return []
        }
    }
    // if it's an object that is not an array, try to detect if it contains an array property
    if (typeof raw === 'object') {
        // if it's an object that already looks like an array-like (numeric keys), convert to array
        if (Array.isArray(raw)) return raw
        // otherwise, return empty or try to find a plausible key
        // (kept simple — you can expand if your backend uses another shape)
        return []
    }
    return []
})

// total gifts count
const totalGifts = computed(() => giftsArray.value.length)

// whether we have more than 8 gifts
const isOverflowed = computed(() => totalGifts.value > 7)

// remaining count to show on overlay (total - 6)
const remainingCount = computed(() => (isOverflowed.value ? (totalGifts.value - 6) : 0))

// which gifts to render in the row: if overflowed show first 7 (we overlay the 7th), otherwise show all up to 7
const displayGifts = computed(() => {
    if (!giftsArray.value || giftsArray.value.length === 0) return []
    if (isOverflowed.value) {
        return giftsArray.value.slice(0, 7)
    }
    // if <= 7, show them all
    return giftsArray.value.slice(0, 7)
})
</script>

<style scoped>
.history-item {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    margin: 12px 0;
    gap: 12px;
    align-items: center;
    justify-content: flex-start;
    padding: 20px 20px 20px 20px;
    border-radius: 12px;
    background: #2f2f32;
    font-family: "Inter", sans-serif;
    user-select: none;
}

/* other styles preserved... (kept minimal repeating of earlier selectors) */
.info-header {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 12px;
}

.bet-group {
    display: flex;
    align-self: start;
    justify-self: start;
    align-items: center;
    justify-content: center;
    gap: 6px;
    max-width: 70%;
}

.bet_icon {
    height: 26px;
    width: 20px;
}

.main-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
}

.avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.top {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.name {
    color: white;
    font-weight: 600;
}

.time {
    font-size: 1rem;
    max-width: 120px;
    color: rgba(210, 210, 210, 0.78);
    font-family: "Inter", sans-serif;
    font-weight: 600;
    align-self: center;
}

.bet-amount {
    font-size: 1rem;
    color: #85ceff;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.bet-name {
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
}

.bottom {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    align-items: center;
}

.bet {
    color: #dcdcdc;
}

.stake {
    font-weight: 600;
    font-size: 0.8rem;
    color: rgba(210, 210, 210, 0.78);
    font-family: "Inter", sans-serif;
}

/* ---- bottom-winnings ---- */
.bottom-winnings {
    display: flex;
    justify-content: space-between;
    /* gifts row at left, arrow at right */
    align-items: center;
    width: 100%;
    gap: 12px;
    margin-top: 8px;
    padding-top: 8px;
    box-sizing: border-box;
}

/* gifts row container */
.gifts-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    overflow: hidden;
    min-height: 40px;
}

/* single gift */
.gift {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    flex: 0 0 40px;
    background: rgba(255, 255, 255, 0.03);
}

.gift img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

/* overlay used for the 8th item when there are more than 8 gifts */
.gift-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    /* half black */
    display: flex;
    align-items: center;
    justify-content: center;
}

.more-text {
    color: white;
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1;
}

/* right arrow — uses currentColor so color below applies */
.arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(210, 210, 210, 0.78);
    /* matches .time and .stake color */
    flex: 0 0 auto;
    margin-left: 8px;
}

/* responsive adjustments */
@media (max-width: 400px) {
    .history-item {
        padding: 8px;
        height: auto;
    }

    .avatar {
        width: 38px;
        height: 38px;
    }

    .gift {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
    }

    .more-text {
        font-size: 0.85rem;
    }
}
</style>
