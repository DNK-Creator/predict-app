<template>
    <div class="bet-card" role="button" tabindex="0" @click="$emit('click')" @keydown.enter="$emit('click')"
        aria-label="Open bet">
        <!-- background (gradient or image if provided) -->
        <div class="card-bg" :style="bgStyle"></div>

        <!-- Top row — left status, center pool, right chance -->
        <div class="card-top">
            <div class="card-top-right-group">
                <div class="badge badge--status">{{ status }}</div>
                <div class="badge badge--pool">
                    <img class="badge__currency-logo" :src="tonLogo" alt="TON" />
                    <span class="badge__amount">{{ pool }} </span>
                    <span class="badge__currency">Объём</span>
                </div>
            </div>

            <div class="badge badge--chance">
                <span class="chance-text">Шанс</span>

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
                    <img :src="eventLogo" class="event-logo" alt="event" />
                    <!-- <img src="https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/PlushPepes.webp"
                        class="event-logo" alt="event" /> -->

                </div>
            </div>

            <div class="content">
                <h4 class="title">{{ title }}</h4>
            </div>
        </div>

        <!-- bottom meta row -->
        <div class="card-footer">
            <div class="divider"></div>
            <div class="meta-left">
                <div class="meta-tag">
                    <img class="meta-logo" :src="tonSecondIcon" alt="tag" />
                    <span>{{ betTypeText }}</span>
                </div>

                <div class="meta-ends">{{ timePrefix }} • <time :datetime="endsISO">{{ endsText }}</time></div>
            </div>

            <button class="share-btn" @click.stop="$emit('share')" aria-label="Share bet">
                <img :src="shareIcon">
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
    eventLogo: { type: String, default: '' },
    pool: { type: [Number, String], default: '10' },
    chance: { type: [Number, String], default: 70 },
    status: { type: String, default: 'Открыто' },
    betTypeText: { type: String, default: 'Крипто событие' },
    endsAt: { type: String, default: '' } // iso string or human text (we format)
})

const timePrefix = computed(() => props.status === "Открыто" ? 'До' : 'Прошло')

const endsISO = computed(() => props.endsAt || '')

const endsText = computed(() => {
    if (!props.endsAt) return '1 сен, 15:00' // fallback example in Russian

    try {
        const d = new Date(props.endsAt)
        if (Number.isNaN(d.getTime())) return props.endsAt

        // Use Russian locale explicitly and get parts so we can control punctuation
        const dtf = new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })

        const parts = dtf.formatToParts(d)
        const day = parts.find(p => p.type === 'day')?.value || String(d.getDate())
        // month might come with a trailing dot (e.g. "авг.") in some engines — remove it and lowercase
        let month = parts.find(p => p.type === 'month')?.value || d.toLocaleString('ru-RU', { month: 'short' })
        month = month.replace(/\.$/, '').toLowerCase()

        const hour = parts.find(p => p.type === 'hour')?.value ?? String(d.getHours()).padStart(2, '0')
        const minute = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2, '0')

        return `${day} ${month}, ${hour}:${minute}`
    } catch (e) {
        return props.endsAt
    }
})


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
        background: 'linear-gradient(rgba(30, 30, 30, 0.7) 6%, rgba(59, 130, 246, 0.55) 75%)'
    }
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

.card-top .badge--status {
    justify-self: start;
    background: rgba(104, 104, 104, 0.38);
    padding: 4px 6px 4px 6px;
    border: none;
    color: rgba(255, 255, 255, 0.88);
    min-width: 35px;
    text-align: center;
    font-size: 12px;
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

.meta-left {
    display: flex;
    align-items: center;
    gap: 4px;
}

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

/* responsive tweaks */
@media (max-width: 420px) {
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
        font-size: 0.98rem;
    }
}
</style>
