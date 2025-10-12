<template>
    <div class="bet-card" role="button" tabindex="0" @click="$emit('click')" @keydown.enter="$emit('click')"
        aria-label="Open bet">

        <!-- Giveaway badge rotated on the top-right corner when pool < 25 TON -->
        <div v-if="showGiveawayBadge" class="giveaway-badge" aria-hidden="true">
            <span class="giveaway-badge__text">{{ $t('promo') }}</span>
        </div>

        <!-- background (gradient or image if provided) -->
        <div class="card-bg" :style="bgStyle"></div>

        <!-- Top row — left status, center pool, right chance -->
        <div class="card-top">
            <div class="card-top-right-group">
                <div class="status-badge">{{ status }}</div>
                <div class="badge badge--pool">
                    <img class="badge__currency-logo" :src="tonLogo" alt="TON" />
                    <span class="badge__amount">{{ pool }} </span>
                    <span class="badge__currency">{{ $t('volume') }}</span>
                </div>
            </div>

            <div class="badge badge--chance">
                <span class="chance-text">{{ $t('chance') }}</span>

                <!-- small top-right square icon (inline 2x2 grid), colors bound from JS -->
                <div class="top-right-square" aria-hidden="true" title="Type">
                    <span v-for="(c, i) in dotColors" :key="i" class="grid-dot" :style="{ backgroundColor: c }"></span>
                </div>

                <span class="chance-text">{{ chance }}%</span>
            </div>
        </div>

        <!-- Main body: left symbol / logo, right title -->
        <div class="card-body">
            <div class="symbol-wrap" aria-hidden="true">
                <div class="coin">
                    <img :src="eventLogo" loading="lazy" class="event-logo" alt="event" />
                </div>
            </div>

            <div class="content">
                <h4 class="title">{{ title }}</h4>
            </div>
        </div>

        <!-- template: replace the existing meta-left block with this -->
        <div class="card-footer">
            <div class="divider"></div>

            <div class="meta-left">
                <!-- ACTIVE LIST -->
                <template v-if="isActiveList">
                    <template v-if="userStakeNumber > 0">
                        <div class="meta-win">
                            <img class="meta-logo" :src="tonSecondIcon" alt="TON" />
                            <span class="meta-win-label">{{ $t('potential-win') }}:</span>
                            <span class="meta-win-value">{{ formatTon(totalWinnings) }}</span>
                        </div>
                    </template>
                    <template v-else>
                        <div class="meta-tag">
                            <img class="meta-logo" :src="tonSecondIcon" alt="tag" />
                            <span>{{ betTypeText }}</span>
                        </div>
                        <div class="meta-ends">{{ timePrefix }} • <time :datetime="endsISO">{{ endsText }}</time></div>
                    </template>
                </template>

                <!-- ARCHIVED LIST -->
                <template v-else>
                    <template v-if="didUserWin">
                        <div class="meta-win">
                            <img class="meta-logo" :src="tonSecondIcon" alt="TON" />
                            <span class="meta-win-label">{{ $t('got-win') }}:</span>
                            <span class="meta-win-value">{{ formatTon(totalWinnings) }}</span>
                        </div>
                    </template>
                    <template v-else>
                        <div class="meta-tag">
                            <img class="meta-logo" :src="tonSecondIcon" alt="tag" />
                            <span>{{ betTypeText }}</span>
                        </div>
                        <div class="meta-ends">{{ timePrefix }} • <time :datetime="endsISO">{{ endsText }}</time></div>
                    </template>
                </template>
            </div>

            <button class="share-btn" @click.stop="$emit('share')" aria-label="Share bet">
                <img :src="shareIcon" />
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import tonLogo from '@/assets/icons/TON_Icon.png'
import tonSecondIcon from '@/assets/icons/TON_White_Icon.png'
import shareIcon from '@/assets/icons/Upload_Icon_Updated.png'

const props = defineProps({
    title: { type: String, default: '$BTC price below $104,000 on June 1, 20:00 UTC?' },
    app: { type: Object, default: () => ({ language: 'ru' }) },
    eventLogo: { type: String, default: '' },
    pool: { type: [Number, String], default: '10' },
    chance: { type: [Number, String], default: 70 },
    userStake: { type: [Number, String], default: 0 },
    userSide: { type: [String], default: null },
    betResult: { type: [String, null], default: null }, // the resolved result from backend
    isActiveList: { type: Boolean, default: true },     // true if current tab is active bets
    volume: { type: [Object, Number, String], default: null },
    currentOdds: { type: [Number, String], default: null },
    status: { type: String, default: 'Открыто' },
    betTypeText: { type: String, default: 'Крипто событие' },
    totalTickets: { type: [Number], default: 0 },
    endsAt: { type: [String, Date, Number], default: '' } // iso string, Date, or timestamp (we format)
})

const normalizedUserSide = computed(() => normalizeUserSide(props.userSide))
const normalizedResult = computed(() => normalizeUserSide(props.betResult))

const didUserWin = computed(() => {
    if (!props.isActiveList && normalizedUserSide.value && normalizedResult.value) {
        return normalizedUserSide.value === normalizedResult.value
    }
    return false
})

/* ---------- timePrefix: localized and robust ---------- */
const timePrefix = computed(() => {
    const lang = props.app?.language === 'ru' ? 'ru' : 'en'
    const st = String(props.status || '').toLowerCase()

    const isOpen = lang === 'ru'
        ? /открыт/i.test(props.status ?? '') || st.includes('открыт') || st.includes('открыто')
        : /open/i.test(props.status ?? '') || st.includes('open')

    if (lang === 'ru') {
        return isOpen ? 'До' : 'Прошло'
    } else {
        return isOpen ? 'Until' : 'Closed'
    }
})

/* ---------- endsISO: provide proper machine-readable datetime when possible ---------- */
const endsISO = computed(() => {
    if (!props.endsAt && props.endsAt !== 0) return ''
    const d = (props.endsAt instanceof Date) ? props.endsAt : new Date(props.endsAt)
    if (!d || Number.isNaN(d.getTime())) return String(props.endsAt || '')
    return d.toISOString()
})

/* ---------- endsText: localized human-readable date + time ---------- */
const endsText = computed(() => {
    if (!props.endsAt && props.endsAt !== 0) return '' // nothing to show

    const raw = props.endsAt
    const d = (raw instanceof Date) ? raw : new Date(raw)
    if (!d || Number.isNaN(d.getTime())) {
        // couldn't parse -> show raw text fallback
        return String(raw)
    }

    const lang = props.app?.language === 'ru' ? 'ru' : 'en'

    try {
        if (lang === 'ru') {
            // month short in some engines can be "авг." — remove trailing dot and lowercase
            const dtf = new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            })
            const parts = dtf.formatToParts(d)
            const day = parts.find(p => p.type === 'day')?.value || String(d.getDate())
            let month = parts.find(p => p.type === 'month')?.value || d.toLocaleString('ru-RU', { month: 'short' })
            month = String(month).replace(/\.$/, '').toLowerCase()
            const hour = parts.find(p => p.type === 'hour')?.value ?? String(d.getHours()).padStart(2, '0')
            const minute = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2, '0')
            return `${day} ${month}, ${hour}:${minute}`
        } else {
            // English: "Sep 1, 15:00" (24h)
            const dtf = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            })
            // formatToParts to ensure we can control spacing/punctuation if needed
            const parts = dtf.formatToParts(d)
            const month = parts.find(p => p.type === 'month')?.value || d.toLocaleString('en-US', { month: 'short' })
            const day = parts.find(p => p.type === 'day')?.value || String(d.getDate())
            const hour = parts.find(p => p.type === 'hour')?.value ?? String(d.getHours()).padStart(2, '0')
            const minute = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2, '0')
            return `${month} ${day}, ${hour}:${minute}`
        }
    } catch (e) {
        // fallback: simple manual formatting
        const day = d.getDate()
        const monthIdx = d.getMonth()
        const hour = String(d.getHours()).padStart(2, '0')
        const minute = String(d.getMinutes()).padStart(2, '0')

        if (lang === 'ru') {
            const monthsGenShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
            return `${day} ${monthsGenShort[monthIdx]}, ${hour}:${minute}`
        } else {
            const monthsEnShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            return `${monthsEnShort[monthIdx]} ${day}, ${hour}:${minute}`
        }
    }
})

// show giveaway only when pool < 25, there are tickets, AND (no endsISO provided OR endsISO is in the future)
const showGiveawayBadge = computed(() => {
    // keep numeric parsing robust (works for string/number props.pool)
    const poolNum = parseNumberLoose(props.pool)
    const hasTickets = Number(props.totalTickets) > 0

    if (!(poolNum < 25 && hasTickets)) return false

    // if we don't have an endsISO (no endsAt provided), preserve previous behavior and show the badge
    if (!endsISO.value) return true

    // parse endsISO (endsISO is already an ISO string when valid)
    const endDate = new Date(endsISO.value)
    if (Number.isNaN(endDate.getTime())) {
        // fallback: if date parsing failed, keep showing (or change to `return false` if you prefer hiding on invalid dates)
        return true
    }

    // show badge only when end time is still in the future
    return Date.now() < endDate.getTime()
})

/* ---------- rest of original helpers / UI colors (unchanged) ---------- */

// helper: parse numeric chance robustly (strip % etc.)
function parseChance(value) {
    if (value == null) return 0
    if (typeof value === 'number') return value
    const s = String(value).replace('%', '').trim()
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : 0
}

// choose base color (hex) by chance
const baseHex = computed(() => {
    const n = parseChance(props.chance)
    if (n > 75) return '#2ecc71' // green
    if (n >= 26) return '#1d7abd' // blue (close to previous teal)
    return '#e55353' // red
})

// convert hex like #RRGGBB to {r,g,b}
function hexToRgb(hex) {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h
    const r = parseInt(full.substr(0, 2), 16)
    const g = parseInt(full.substr(2, 2), 16)
    const b = parseInt(full.substr(4, 2), 16)
    return { r, g, b }
}

// opacities in DOM order (grid flow: row-major: top-left, top-right, bottom-left, bottom-right)
const opacities = [0.25, 0.5, 1.0, 0.5]

const dotColors = computed(() => {
    const rgb = hexToRgb(baseHex.value)
    return opacities.map(a => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`)
})

// background style (optionally you can wire bgImage prop in future)
const bgStyle = computed(() => {
    return {
        background: 'linear-gradient(rgba(30, 30, 30, 0.8) 8%, rgba(59, 130, 246, 0.85) 85%)'
    }
})

const HOUSE_CUT = 0.03

function parseNumberLoose(v) {
    if (v == null) return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v === 'string') {
        const s = v.trim()
        // try JSON parse first
        try {
            const j = JSON.parse(s)
            if (typeof j === 'number') return Number.isFinite(j) ? j : 0
            if (typeof j === 'object') return 0
        } catch (e) { /* not json */ }
        const cleaned = s.replace(',', '.').replace(/[^\d.\-+eE]/g, '')
        const n = parseFloat(cleaned)
        return Number.isFinite(n) ? n : 0
    }
    return 0
}

// format TON like before (string with unit)
function formatTon(x) {
    if (!Number.isFinite(x) || x == null) return '—'
    const rounded = Math.round(x * 100) / 100
    return rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' TON'
}

function normalizeUserSide(side) {
    if (side == null) return null
    const s = String(side).trim().toLowerCase()
    if (s === 'yes' || s === 'y' || s === 'да') return 'Yes'
    if (s === 'no' || s === 'n' || s === 'нет') return 'No'
    return null
}

/**
 * Compute total winnings for this card's userStake (payout after house cut).
 * IMPORTANT: we DO NOT add the user's stake to the pool because volume already includes it.
 */
const userStakeNumber = computed(() => parseNumberLoose(props.userStake))

const volPartsFromProp = computed(() => {
    const vol = props.volume
    if (!vol && vol !== 0) return { yes: 0, no: 0 }

    // if object (Yes/No keys) extract robustly
    if (typeof vol === 'object') {
        const yes = Number(vol.Yes ?? vol.yes ?? vol['YES'] ?? vol['yes'] ?? vol?.YesAmount ?? 0) || 0
        const no = Number(vol.No ?? vol.no ?? vol['NO'] ?? vol['no'] ?? vol?.NoAmount ?? 0) || 0
        return { yes, no }
    }

    // if it's a string that looks like JSON, try parse
    if (typeof vol === 'string') {
        try {
            const parsed = JSON.parse(vol)
            if (typeof parsed === 'object') {
                const yes = Number(parsed.Yes ?? parsed.yes ?? parsed['YES'] ?? parsed['yes'] ?? 0) || 0
                const no = Number(parsed.No ?? parsed.no ?? parsed['NO'] ?? parsed['no'] ?? 0) || 0
                return { yes, no }
            }
            // otherwise treat as numeric total
            const total = parseNumberLoose(vol)
            const p = Number(props.currentOdds)
            const prob = (isFinite(p) ? (p > 1 ? Math.max(0, Math.min(1, p / 100)) : Math.max(0, Math.min(1, p))) : 0)
            const yes = total * prob
            const no = total - yes
            return { yes, no }
        } catch (e) {
            // fallback to numeric parse
            const total = parseNumberLoose(vol)
            const p = Number(props.currentOdds)
            const prob = (isFinite(p) ? (p > 1 ? Math.max(0, Math.min(1, p / 100)) : Math.max(0, Math.min(1, p))) : 0)
            const yes = total * prob
            const no = total - yes
            return { yes, no }
        }
    }

    // numeric total fallback
    const total = Number(vol) || 0
    const p = Number(props.currentOdds)
    const prob = (isFinite(p) ? (p > 1 ? Math.max(0, Math.min(1, p / 100)) : Math.max(0, Math.min(1, p))) : 0)
    const yes = total * prob
    const no = Math.max(0, total - yes)
    return { yes, no }
})

/**
 * Total winnings for existing user bet (payout after house cut).
 *
 * IMPORTANT: volume already includes the user's stake, so we DO NOT add the stake
 * to the pool when computing implied probabilities here.
 *
 * Returns a Number (rounded to 2 decimals) — template calls formatTon(...) to display.
 */
const totalWinnings = computed(() => {
    const stake = Number(userStakeNumber.value) || 0
    if (stake <= 0) return 0

    const yes = Number(volPartsFromProp.value.yes) || 0
    const no = Number(volPartsFromProp.value.no) || 0
    const total = yes + no

    const userSide = normalizeUserSide(props.userSide)

    // derive chosen probability from existing volumes (do NOT add stake)
    let chosenProb = 0

    if (total > 0) {
        if (userSide === 'Yes') {
            chosenProb = yes / total
        } else if (userSide === 'No') {
            chosenProb = no / total
        } else {
            // unknown side: fall back to current_odds
            const p = Number(props.currentOdds)
            chosenProb = isFinite(p) ? (p > 1 ? Math.max(0, Math.min(1, p / 100)) : Math.max(0, Math.min(1, p))) : 0
        }
    } else {
        const p = Number(props.currentOdds)
        chosenProb = isFinite(p) ? (p > 1 ? Math.max(0, Math.min(1, p / 100)) : Math.max(0, Math.min(1, p))) : 0
    }

    // invalid or zero probability -> no payout (avoid infinite multiplier)
    if (!isFinite(chosenProb) || chosenProb <= 0) return 0

    // gross payout (stake * (1 / prob))
    const gross = stake * (1 / chosenProb)
    if (!isFinite(gross) || gross <= 0) return 0

    const payoutBeforeTaxation = Math.min(9999999, Math.round(gross * 100) / 100)
    const profitBeforeTax = payoutBeforeTaxation - stake

    // final payout after house takes cut on the profit portion
    const finalPayment = payoutBeforeTaxation - (profitBeforeTax * HOUSE_CUT)

    // round to 2 decimals and ensure non-negative
    return Math.max(0, Math.round(finalPayment * 100) / 100)
})

defineEmits(['click', 'share'])
</script>


<style scoped lang="css">
/* Card shell */
.bet-card {
    position: relative;
    width: 100%;
    height: 180px;
    border-radius: 20px;
    border: 1px solid rgba(0, 152, 234, 0.4);
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 6px 18px rgba(0, 0, 0, 0.45);
    transition: transform 200ms cubic-bezier(.2, .9, .3, 1), box-shadow 200ms;
    -webkit-font-smoothing: antialiased;
}

/* Hover / focus */
.bet-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
}

.bet-card:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(68, 133, 238, 0.14), 0 8px 20px rgba(0, 0, 0, 0.5);
}

/* background */
.card-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: saturate(0.95) contrast(0.92);
    z-index: 0;
    background: linear-gradient(rgb(24, 24, 24) 14%, rgb(59, 130, 246) 90%);
    border-radius: inherit;
}

/* Top row badges */
.card-top {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    padding-bottom: 6px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.card-top-right-group {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
}

.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(90, 90, 90, 0.5);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255, 255, 255, 0.03);
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.status-badge {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    padding-bottom: 6px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    justify-self: start;
    background: rgba(104, 104, 104, 0.38);
    padding: 4px 6px 4px 6px;
    border: none;
    color: rgba(255, 255, 255, 0.88);
    min-width: 35px;
    text-align: center;
    font-size: 12px;
    border-radius: 12px;
}

.card-top .badge--pool {
    justify-self: center;
    padding: 6px 10px;
    display: flex;
    gap: 5px;
    align-items: center;
    font-weight: 700;
    font-size: 12px;
    background: none;
    backdrop-filter: blur(0px);
    border: none;
}

.card-top .badge--chance {
    justify-self: end;
    margin-right: 10px;
    padding: 2px 8px;
    display: flex;
    gap: 6px;
    align-items: center;
}

/* icons and text in badges */
.badge__currency {
    opacity: 0.9;
    font-weight: 700;
}

.badge__currency-logo {
    height: 16px;
    width: 16px;
}

.badge__amount {
    font-size: 12px;
    font-weight: 600;
}

.chance-text {
    color: rgba(255, 255, 255, 0.92);
}

/* Top-right tiny square icon (2x2 grid) */
.top-right-square {
    width: 18px;
    height: 18px;
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    box-sizing: border-box;
    align-items: center;
    justify-items: center;
    gap: 2px;
}

/* small dots inside the square - colors are applied inline via :style */
.top-right-square .grid-dot {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    display: block;
}

/* Body */
.card-body {
    z-index: 2;
    display: flex;
    gap: 12px;
    padding: 0px 12px 2px 12px;
    align-items: flex-start;
    margin-top: 2px;
    flex: 1 1 auto;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

/* coin / event logo */
.symbol-wrap {
    width: 69px;
    height: 69px;
    flex: 0 0 69px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.event-logo {
    width: 69px;
    height: 69px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 20px rgba(247, 147, 26, 0.12), inset 0 -6px 12px rgba(0, 0, 0, 0.18);
    flex-shrink: 0;
}

/* title */
.content {
    color: white;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

.title {
    margin: 0;
    margin-top: 0.1rem;
    font-size: 1.03rem;
    font-weight: 700;
    line-height: 1.15;
    color: white;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* footer */
.card-footer {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0px 16px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.01), rgba(0, 0, 0, 0.02));
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
}

.divider {
    height: 1.25px;
    border-radius: 1px;
    left: 2.5%;
    background-color: rgba(145, 180, 255, 0.35);
    width: 95%;
    position: absolute;
    top: 0;
}

.meta-win,
.meta-left {
    display: flex;
    align-items: center;
    gap: 4px;
}

.meta-win,
.meta-tag {
    display: flex;
    gap: 3px;
    align-items: center;
    color: rgba(255, 255, 255, 0.93);
    font-weight: 700;
    padding: 6px 2px;
    border-radius: 8px;
    min-height: 32px;
}

.meta-ends {
    color: rgba(255, 255, 255, 0.75);
    font-weight: 600;
}

.meta-logo {
    width: 15px;
    height: 15px;
    padding: 3px;
}

/* share */
.share-btn {
    margin-right: 0.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 30px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: background 150ms;
}

.share-btn img {
    width: 74%;
    height: 67%;
    opacity: 0.9;
}

.share-btn:hover {
    background: rgba(255, 255, 255, 0.06);
}

/* Giveaway badge (rotated sticker at top-right) */
.giveaway-badge {
    position: absolute;
    top: 8px;
    right: -35px;
    /* pushed right so the rotated ribbon sits on corner */
    width: 100px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(45deg);
    transform-origin: center;
    z-index: 6;
    /* above other content */
    pointer-events: none;
    /* don't block clicks */
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    background: linear-gradient(90deg, #4c1d97 0%, #664fc3 100%);
    color: #eaeaea;
    letter-spacing: 0.6px;
    text-transform: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.giveaway-badge__text {
    font-weight: 600;
    font-family: "Inter", sans-serif;
    font-size: 0.6rem;
    display: inline-block;
}

/* responsive tweaks */
@media (max-width: 360px) {
    .bet-card {
        height: 160px;
        border-radius: 16px;
    }

    .symbol-wrap {
        width: 56px;
        height: 56px;
    }

    .event-logo {
        width: 56px;
        height: 56px;
        border-radius: 10px;
    }

    .title {
        font-size: 0.9rem;
    }
}
</style>
