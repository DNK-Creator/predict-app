<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" :class="['overlay', 'overlay--visible', { passthrough: passThrough }]"
                @click.self="onClose" :aria-hidden="passThrough ? 'true' : 'false'" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="settings-modal" role="dialog" aria-modal="true" aria-label="Activity details"
                :class="{ passthrough: passThrough }" :aria-hidden="passThrough ? 'true' : 'false'">
                <div class="footer">
                    <h2 class="modal-title"> {{ translateName() || '—' }} </h2>
                    <button class="close-btn" @click="onClose">✖</button>
                </div>

                <div class="main-content">
                    <img v-if="photo_url" :src="photo_url" alt="avatar" class="avatar large" />
                    <div class="main">
                        <div class="top">
                            <div class="name">{{ username ? '@' + username : '—' }}</div>
                            <div class="bet-amount">{{ $t('bet') }} {{ stakeDisplay }} TON</div>
                        </div>
                        <div class="bottom">
                            <div class="bet"><span> {{ $t('side') }} • {{ translateSide(side) }} </span></div>
                            <div class="stake">x{{ multiplierDisplay }}</div>
                        </div>
                    </div>
                </div>

                <div v-if="displayGifts.length > 0" class="gifts-list" v-bind="containerProps" role="list" tabindex="0"
                    aria-live="polite">
                    <div class="gifts-wrapper" v-bind="wrapperProps">
                        <!-- each virtual item is a row (data === array of up to COLUMNS gifts) -->
                        <div v-for="{ index, data: row } in list" :key="index" class="gift-row"
                            :style="{ height: rowHeight + 'px' }" role="listitem">
                            <!-- Render up to COLUMNS items per row; fill blanks if last row isn't full -->
                            <div v-for="(item, colIdx) in row" class="gift-card" :key="item?.uuid ?? `${index}-${colIdx}`">
                                <div class="gift-image-wrap">
                                    <img :src="createGiftUrl(item)" draggable="false" loading="lazy" />
                                </div>

                                <div class="gift-below-img">
                                    <div class="gift-meta">
                                        <span v-if="item?.name.length < 12" class="gift-name">{{ item?.name }}</span>
                                        <span v-else class="gift-name-small">{{ item?.name }}</span>
                                        <div class="price-container">
                                            <img class="price-icon" :src="tonBlueIcon" alt="TON_ICON" loading="lazy" />
                                            <span class="gift-count">{{ item?.value }} TON</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- ACTION BUTTON (24px gap to gifts above) -->
                <div class="action-row">
                    <button class="action-btn" @click="onOpenBetPage" aria-label="Open bet">{{ $t('open-event')
                    }}</button>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { useAppStore } from '@/stores/appStore'
import { computed, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import tonBlueIcon from '@/assets/icons/TON_Icon.png'
import plusImg from '@/assets/icons/Transparent_Plus_Icon.png'

// get props as an object so we can watch props.show cleanly
const props = defineProps({
    show: Boolean,
    name: String,
    name_en: String,
    side: String,
    stake: Number,
    multiplier: Number,
    username: String,
    photo_url: String,
    gifts_bet: { type: [Array, Object, String], default: () => [] },
})

const emit = defineEmits(['close', 'open-bet-page'])

const passThrough = ref(false)

function onClose() {
    passThrough.value = true
    console.log(passThrough.value)
    emit('close')
}

watch(() => props.show, (newVal, oldVal) => {
    if (oldVal === true && newVal === false) {
        passThrough.value = true
    }
})

/* ---------- GRID / VIRTUAL CONFIG ---------- */
const COLUMNS = 3
const CARD_HEIGHT = 160
const ROW_GAP = 18
const rowHeight = CARD_HEIGHT + ROW_GAP

/* group gifts into rows of 3 */
const source = computed(() => {
    const arr = props.gifts_bet || []
    const rows = []
    for (let i = 0; i < arr.length; i += COLUMNS) {
        rows.push(arr.slice(i, i + COLUMNS))
    }
    return rows
})

/* virtualize by rows (each item is a row) */
const { list, containerProps, wrapperProps } = useVirtualList(source, {
    itemHeight: rowHeight,
    overscan: 1, // render a few rows above/below for smoother scrolling
})

function createGiftUrl(giftObj) {
    if (giftObj.slug) {
        return `https://nft.fragment.com/gift/${giftObj.slug}.small.jpg`
    }
    const urlSafeName = String(giftObj.name.replace(/[ -]/g, '')).toLowerCase()
    const newSlug = urlSafeName + "-" + (giftObj.num ?? giftObj.number)
    return `https://nft.fragment.com/gift/${newSlug}.small.jpg`
}

function onAfterLeave() {
    passThrough.value = false
}

watch(() => props.show, (newVal) => {
    if (newVal === true) passThrough.value = false
})

const app = useAppStore()

function onOpenBetPage() {
    emit('open-bet-page')
    emit('close')
}

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
    return app.language === 'ru' ? props.name : props.name_en
}

// stake display
const stakeDisplay = computed(() => {
    if (props.stake == null || props.stake === '') return '—'
    const n = Number(props.stake)
    return Number.isFinite(n) ? n.toFixed(2) : String(props.stake)
})

// multiplier display
const multiplierDisplay = computed(() => {
    if (props.multiplier == null || props.multiplier === '') return '—'
    const m = Number(props.multiplier)
    return Number.isFinite(m) ? m.toFixed(2) : String(props.multiplier)
})

// Gifts parsing (same robust parsing used in list)
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
    if (typeof raw === 'object') {
        // if it's an object but not array, attempt to normalize common shapes:
        // Expect items with keys gift_url, gift_name, count (if your backend uses other fields adapt here)
        if (Array.isArray(raw)) return raw
        // If object contains numeric keys -> convert to array
        try {
            const keys = Object.keys(raw)
            const numericKeys = keys.filter(k => String(Number(k)) === String(k)).sort((a, b) => a - b)
            if (numericKeys.length > 0) {
                return numericKeys.map(k => raw[k])
            }
        } catch (e) { }
        return []
    }
    return []
})

const displayGifts = computed(() => giftsArray.value || [])

</script>

<style scoped>
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    z-index: 30;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.4);
}

/* Modal container, pinned bottom */
.settings-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: max(72vh, 600px);
    min-height: 30vh;
    max-width: 460px;
    margin: auto auto;
    align-self: center;
    background: #292a2a;
    color: White;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 32;
    user-select: none;
    overflow: hidden;
}

.settings-modal h2 {
    margin: 0;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
}

/* groups */
.items-group {
    margin-bottom: 1.25rem;
}

/* options grid unchanged */
.options-grid {
    display: grid;
    grid-auto-flow: column;
    width: 12rem;
    column-count: 2;
    margin-top: 0.75rem;
}

/* actions and other buttons unchanged... (kept for brevity) */

/* INVENTORY styles */
.inventory-group {
    margin-top: 0.5rem;
}

.inventory-container {
    width: 80%;
    margin: 0.75rem auto 0 auto;
    /* height: allow the modal to control total size; make it scrollable */
    max-height: calc(75vh - 230px);
    /* adjust to leave room for header/buttons */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    /* space for scrollbar */
    outline: none;
}

/* grid: two columns, auto rows */
.inventory-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    align-items: start;
}

/* each cell: rectangular square-ish card */
.inventory-cell {
    cursor: pointer;
    background: #202121;
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    min-height: 125px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    transition: transform 160ms ease, box-shadow 160ms ease;
}

.inventory-cell:hover {
    transform: translateY(-6px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
}

/* name at top */
.cell-name {
    font-size: 0.85rem;
    color: #e6e6e6;
    width: 100%;
    text-align: center;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* center image */
.cell-image {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 6px 0;
}

.cell-image img {
    max-width: 80%;
    max-height: 72px;
    object-fit: contain;
    display: block;
}

/* value at bottom */
.cell-value {
    font-size: 0.8rem;
    color: #b8b8b8;
    width: 100%;
    text-align: center;
    margin-top: 6px;
}

/* empty note */
.empty-note {
    color: #cfcfcf;
    opacity: 0.7;
    padding: 6px 0;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: white;
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
    margin-bottom: 1rem;
}

.top {
    display: flex;
    justify-content: space-between;
    align-items: center;
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

.stake {
    font-weight: 600;
    font-size: 0.8rem;
    color: rgba(210, 210, 210, 0.78);
    font-family: "Inter", sans-serif;
}

.name {
    color: white;
    font-weight: 600;
}

/* simple scrollbar styling (WebKit) */
.inventory-container::-webkit-scrollbar {
    width: 10px;
}

.inventory-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
}

.fade.passthrough {
    pointer-events: none;
    touch-action: auto;
}

/* keep your transitions intact */
.fade-enter-active,
.fade-leave-active {
    transition:
        background-color 300ms ease-out;
}

.fade-enter-from,
.fade-leave-to {
    background-color: rgba(0, 0, 0, 0);
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 300ms ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}

.slide-up-enter-to,
.slide-up-leave-from {
    transform: translateY(0%);
}

.gifts-list {
    width: 100%;
    height: min(350px, 35vh);
    box-sizing: border-box;
    overflow-y: auto;
    /* must be scrollable */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
}

.gifts-wrapper {
    width: 100%;
    box-sizing: border-box;
    padding: 0;
}

.gift-row {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    padding: 12px;
    align-items: start;
}

.gifts-list::-webkit-scrollbar {
    display: none;
}

.gift-card {
    background: rgba(95, 95, 95, 0.2);
    cursor: pointer;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    align-self: center;
    justify-self: center;
    overflow: hidden;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
    user-select: none;
    padding: 0;
    height: 160px;
    min-width: 70px;
    max-width: 110px;
    position: relative;
    transform: translateY(0);
    /* base transform */
    transition: transform 180ms cubic-bezier(.2, .9, .2, 1), box-shadow 180ms cubic-bezier(.2, .9, .2, 1), border-color 180ms cubic-bezier(.2, .9, .2, 1);
    will-change: transform, box-shadow;
}

.gift-image-wrap {
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.01);
    border-radius: 8px;
    flex: 0 0 auto;
    display: block;
}

.gift-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 8px;
}

.select-gift-button {
    position: absolute;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    height: 35%;
    width: 40%;
    right: 0px;
    top: 0px;
}

.select-icon {
    width: 18px;
    height: 18px;
    padding: 6px;
}

.gift-below-img {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0px;
}

/* Meta (name / count) sits below the square image and has its own padding */
.gift-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    background: transparent;
    flex: 0 0 auto;
}

/* Count stays to the right (or next to name) and remains prominent */
.gift-count {
    font-size: 0.8rem;
    color: white;
    font-weight: 800;
}

.price-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.price-icon {
    width: 12px;
    height: 12px;
}

.gift-name-small,
.gift-name {
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 0.75rem;
    margin-top: 2px;
}

.gift-name-small {
    font-size: 0.6rem;
}

/* arrow at the right of the gifts area */
.modal-arrow {
    margin-left: 8px;
    flex: 0 0 auto;
    color: rgba(210, 210, 210, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
}

/* ---- ACTION ROW & BUTTON ---- */
.action-row {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: 0 12px;
    box-sizing: border-box;
    margin-top: 24px;
    margin-bottom: 12px;
    /* ~24px offset from gifts */
}

/* main action button */
.action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 160px;
    padding: 12px 18px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(180deg, rgba(133, 206, 255, 0.16), rgba(133, 206, 255, 0.08));
    color: #eaf6ff;
    font-weight: 700;
    font-size: 0.98rem;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(21, 90, 140, 0.08);
    transition: transform 140ms cubic-bezier(.2, .9, .2, 1), box-shadow 140ms ease, background-color 120ms ease, opacity 120ms ease;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
}

/* hover / focus */
.action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px rgba(21, 90, 140, 0.12);
}

.passthrough {
    pointer-events: none;
    touch-action: auto;
}

.keep-interactive {
    pointer-events: auto;
}

/* reduce motion preference */
@media (prefers-reduced-motion: reduce) {

    .action-btn,
    .action-btn:hover,
    .action-btn:active {
        transition: none;
        transform: none;
    }
}
</style>
