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

                <!-- BIGGER GIFTS GRID (inserted into modal) -->
                <div v-if="displayGifts.length > 0" class="modal-gifts-section" role="region" aria-label="Winnings">
                    <div class="modal-gifts-list" :class="{ passthrough: passThrough }" role="list" tabindex="0"
                        aria-live="polite">
                        <div v-for="(g, idx) in displayGifts" :key="(g.gift_url || '') + '-' + idx"
                            class="modal-gift-card" role="listitem" :aria-label="g.gift_name || 'gift'">
                            <div class="modal-gift-image-wrap">
                                <img :src="g.gift_url" :alt="g.gift_name || 'gift'" />
                            </div>
                            <div class="modal-gift-meta">
                                <div class="modal-gift-name">{{ g.gift_name || '' }}</div>
                                <div class="modal-gift-count" v-if="g.count">x{{ g.count }}</div>
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

/* -------- Modal gifts section (scaled x2) -------- */
.modal-gifts-section {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
    margin-top: 24px;
    height: 320px;
}

/* Scrollable grid: 3 columns, doubled height (600px) */
.modal-gifts-list {
    width: 100%;
    height: 320px;
    /* doubled from 300px */
    box-sizing: border-box;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    padding: 12px;
    align-content: start;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.modal-gifts-list.passthrough {
    overscroll-behavior: disabled;
}

.modal-gifts-list::-webkit-scrollbar {
    display: none;
}

.modal-gift-card {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    /* card outer radius (keeps a subtle card corner) */
    display: flex;
    flex-direction: column;
    align-items: stretch;
    /* make children (image) take full card width */
    overflow: hidden;
    /* clip image and content inside rounded card */
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
    user-select: none;
    padding: 0;
    /* remove internal padding so image touches card edges */
    height: 145px;
    max-width: 110px;
}

/* Image wrapper: square by aspect-ratio, fills card width */
.modal-gift-image-wrap {
    width: 100%;
    aspect-ratio: 1 / 1;
    /* forces a square region */
    overflow: hidden;
    background: rgba(255, 255, 255, 0.01);
    border-radius: 8px;
    /* smooth image corner radius (your request) */
    flex: 0 0 auto;
    /* ensure image sits at the top of the card visually */
    display: block;
}

/* The image itself covers the square (fills full width & height) */
.modal-gift-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* crop to fill without letterboxing */
    display: block;
    border-radius: 8px;
    /* match wrapper radius so corners are smooth */
}

/* Meta (name / count) sits below the square image and has its own padding */
.modal-gift-meta {
    padding: 10px 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    background: transparent;
    flex: 0 0 auto;
}

/* Name: allow up to two lines, centered, ellipsed if too long */
.modal-gift-name {
    font-size: 0.85rem;
    color: #e6e6e6;
    text-align: center;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    line-height: 1.1;
    max-height: 2.2em;
    white-space: normal;
}

/* Count stays to the right (or next to name) and remains prominent */
.modal-gift-count {
    font-size: 0.95rem;
    color: #bdbdbd;
    font-weight: 800;
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
