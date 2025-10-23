<template>
    <transition name="fade">
        <div v-if="visible" class="overlay overlay--visible" @click.self="close" />
    </transition>

    <transition name="slide-up" appear>
        <div v-if="visible" ref="modalRef" class="betting-modal">
            <header class="modal-header">
                <div class="modal-header-description">
                    <h2>{{ translateBetName(bet.name, bet.name_en) }}</h2>
                </div>
                <button class="close-btn" @click="close">×</button>
            </header>

            <section class="modal-body">

                <div class="winnings-container">
                    <div class="visual-winnings">
                        <!-- text fallback when there are no visuals -->
                        <div class="ton-container" :class="{ 'ton-container--visible': !hasVisuals }">
                            <img class="ton-icon" :src="tonBlueIcon">
                            <span class="ton-text" aria-hidden="false">
                                {{ fmtTon(potentialPayout) }}
                            </span>
                        </div>

                        <!-- dual-layer Lottie containers for smooth crossfade -->
                        <div class="animating-gift-visual" aria-hidden="true">
                            <div ref="giftLayer0" class="gift-layer" />
                            <div ref="giftLayer1" class="gift-layer" />
                        </div>
                    </div>

                    <div class="winnings-hint">{{ $t('potential-win') }} ~{{ fmtTon(potentialPayout) }}</div>
                </div>

                <div class="sides-container">
                    <div class="side" @click="sideToYes" :class="{ active: props.side.toLowerCase() === 'yes' }">
                        <span>{{ $t('yes') }}</span>
                        <span class="probability-text" :class="{ active: props.side.toLowerCase() === 'yes' }">{{
                            fmtPct(newYesProb) }}</span>
                    </div>
                    <div class="side" @click="sideToNo" :class="{ active: props.side.toLowerCase() === 'no' }">
                        <span>{{ $t('no') }}</span>
                        <span class="probability-text" :class="{ active: props.side.toLowerCase() === 'no' }">{{
                            fmtPct(newNoProb) }}</span>
                    </div>
                </div>

                <div class="spacer"></div>

                <!-- INVENTORY -->
                <div v-if="source.length > 0" class="gifts-list" v-bind="containerProps" role="list" tabindex="0" aria-live="polite">
                    <div class="gifts-wrapper" v-bind="wrapperProps">
                        <!-- each virtual item is a row (data === array of up to COLUMNS gifts) -->
                        <div v-for="{ index, data: row } in list" :key="index" class="gift-row"
                            :style="{ height: rowHeight + 'px' }" role="listitem">
                            <!-- Render up to COLUMNS items per row; fill blanks if last row isn't full -->
                            <div v-for="(item, colIdx) in row" :key="item?.uuid ?? `${index}-${colIdx}`"
                                :class="['gift-card', { selected: isSelected(item?.uuid) }]"
                                @click="toggleSelect(item)">
                                <div class="gift-image-wrap">
                                    <img :src="createGiftUrl(item)" draggable="false" :alt="item?.gift_name || 'gift'"
                                        loading="lazy" />
                                </div>

                                <div class="select-gift-button">
                                    <img class="select-icon" :src="plusImg" draggable="false" alt="SELECT" />
                                </div>

                                <div class="gift-meta">
                                    <span v-if="item?.name.length < 12" class="gift-name">{{ item?.name }}</span>
                                    <span v-else class="gift-name-small">{{ item?.name }}</span>
                                    <div class="price-container">
                                        <img class="price-icon" :src="tonBlueIcon" alt="TON_ICON" loading="lazy" />
                                        <span class="gift-count">{{ Number(item?.value).toFixed(2) }} TON</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- INVENTORY END -->

                <div class="amount-wrapper">
                    <div class="amount-row">
                        <button class="step-btn" :class="{ pressed: pressedDec }" @pointerdown="pressDec"
                            @pointerup="releaseDec" @pointercancel="releaseDec" @mouseleave="releaseDec"
                            @click="amountDecrease" aria-label="Уменьшить" title="Уменьшить">
                            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none"
                                xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" />
                            </svg>
                        </button>

                        <div class="amount-group">
                            <input ref="amountInput" v-model="amount" type="text" inputmode="decimal" placeholder="0"
                                class="amount-input" @input="onAmountInput" @focus="onAmountFocus" @blur="onAmountBlur"
                                :size="amount.length > 0 ? amount.length : 1"
                                :style="{ '--chars': (amount && amount.length) ? amount.length : 1 }" />
                            <span class="amount-currency" @click="focusAmountInput">TON</span>
                        </div>

                        <button class="step-btn" :class="{ pressed: pressedInc }" @pointerdown="pressInc"
                            @pointerup="releaseInc" @pointercancel="releaseInc" @mouseleave="releaseInc"
                            @click="amountIncrease" aria-label="Увеличить" title="Увеличить">
                            <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none"
                                xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <rect x="11" y="4" width="2" height="16" rx="1" fill="currentColor" />
                                <rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                </div>
            </section>

            <div class="total-bet-info">{{ $t('total-bet') }}: {{ totalBetInfo }}</div>

            <footer class="modal-footer">
                <button class="action-btn" :disabled="!totalBettingValue" @click="placeBet">
                    {{ loading ? translateValidating() : translateBet() }}
                </button>
            </footer>
        </div>
    </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, toRaw } from 'vue'
import { toast } from 'vue3-toastify'
import { useVirtualList } from '@vueuse/core'
import lottie from 'lottie-web'
import 'vue3-toastify/dist/index.css'
import { placeBetRequest } from '@/services/bets-requests'
import { useAppStore } from '@/stores/appStore'
import tonBlueIcon from '@/assets/icons/TON_Icon.png'
import plusImg from '@/assets/icons/Transparent_Plus_Icon.png'

const app = useAppStore()

const props = defineProps({
    visible: Boolean,
    bet: Object,
    side: String,
    gifts: { type: Array, required: true },
    prices: { type: Array, required: true },
})

const emit = defineEmits(['close', 'placed', 'side-to-yes', 'side-to-no'])

const localGifts = ref(Array.isArray(props.gifts) ? JSON.parse(JSON.stringify(props.gifts)) : [])

const amount = ref('0')
const lastInputtedNumber = ref('0')
const amountInput = ref(null)
const loading = ref(false)

// micro interaction state
const pressedInc = ref(false)
const pressedDec = ref(false)
const pressedQuick = ref(null)

const inputDebounceTimer = ref(null)
const INPUT_DEBOUNCE_MS = 800

const modalRef = ref(null)

// Keep local copy in sync when parent changes the gifts prop
watch(() => props.gifts, (newGifts) => {
    // replace whole array to keep identity changes simple for useVirtualList
    localGifts.value = Array.isArray(newGifts) ? JSON.parse(JSON.stringify(newGifts)) : []
}, { deep: true })

// helper: remove all items whose uuid is in placedGifts (mirrors your server removal)
function removeGiftsFromInventory(inventory = [], placedGifts = []) {
    if (!placedGifts || placedGifts.length === 0) return inventory
    const uuids = new Set(placedGifts.map(g => String(g?.uuid)))
    return inventory.filter(item => !uuids.has(String(item?.uuid)))
}

// GIFT VISUALS ANIMATION WINNINGS BELOW 
let pendingCleanupTimeout = null   // used to cancel pending destroy jobs
let transitioning = false         // optional flag if you want to block new crossfades (not required)

const suitableGiftsVisuals = ref([])
const quickStakeChanged = ref(false)

const giftLayer0 = ref(null)
const giftLayer1 = ref(null)
const layers = [giftLayer0, giftLayer1]

const currentLayerIndex = ref(0) // which layer is visible (0 or 1)
const animInstances = [null, null] // lottie instances for each layer
const parsedTgsCache = {} // { url: animationData }

let crossfadeSerial = 0                 // monotonic id for in-flight crossfade

const layerUrl = [null, null]           // which url is loaded in each layer (string or null)

let rotateTimer = null
const ROTATE_INTERVAL = 2600 // ms
const CROSSFADE_MS = 300 // must match CSS transition duration for opacity/transform

// computed helpers
const hasVisuals = computed(() => suitableGiftsVisuals.value && suitableGiftsVisuals.value.length > 0)
// --- TGS loader & cache ---
async function loadTgsJson(url) {
    // small guard if url is empty
    if (!url) throw new Error('No url for tgs')
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch tgs (${res.status})`)

    let animationData
    const contentType = (res.headers.get('content-type') || '').toLowerCase()

    if (contentType.includes('application/json') || contentType.includes('+json')) {
        animationData = await res.json()
    } else {
        // Some servers return wrong content-type; try to parse text anyway
        const txt = await res.text()
        animationData = JSON.parse(txt)
    }
    return animationData
}

async function ensureTgs(url) {
    if (!parsedTgsCache[url]) {
        parsedTgsCache[url] = await loadTgsJson(url)
    }
    return parsedTgsCache[url]
}

// destroy an anim instance safely
function destroyAnimAtIndex(i) {
    try {
        animInstances[i]?.destroy?.()
    } catch (e) { /* ignore */ }
    animInstances[i] = null
}

// helper to schedule next rotation (resets timer so every shown visual gets full interval)
function scheduleNextRotation() {
    // only schedule if visuals exist
    if (!hasVisuals.value) {
        clearRotateTimer()
        return
    }
    clearRotateTimer()
    rotateTimer = setTimeout(() => {
        rotateTimer = null
        // call rotateOnce (don't await)
        rotateOnce()
    }, ROTATE_INTERVAL)
}

function clearRotateTimer() {
    if (rotateTimer) {
        clearTimeout(rotateTimer)
        rotateTimer = null
    }
}

// create lottie into layer `i` with given animationData; autoplay set to false to control crossfade
function createAnimInLayer(i, animationData) {
    if (!layers[i].value) return null
    destroyAnimAtIndex(i)
    animInstances[i] = lottie.loadAnimation({
        container: layers[i].value,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData
    })
    return animInstances[i]
}

async function crossfadeToUrl(url) {
    if (!url) return

    // if same url already visible in the currently-active layer, skip
    const visibleIdx = currentLayerIndex.value

    const targetIdx = 1 - visibleIdx

    const candidates = suitableGiftsVisuals.value || []
    if (candidates.length === 1) {
        // if the currently-visible layer already *thinks* it shows this url,
        // verify DOM / anim state and restore if necessary instead of silent return.
        if (layerUrl[visibleIdx] === url) {
            const visibleEl = layers[visibleIdx]?.value
            const animIsPresent = !!animInstances[visibleIdx]
            const classVisible = visibleEl ? visibleEl.classList.contains('gift-layer--visible') : false

            // If everything is healthy, just reset rotation timer and return
            if (animIsPresent && classVisible) {
                // already visible and playing — reset timer
                scheduleNextRotation()
                return
            }

            // Otherwise we need to restore it (recreate anim from cache if necessary)
            const myId = ++crossfadeSerial

            // cancel pending cleanup
            if (pendingCleanupTimeout) {
                clearTimeout(pendingCleanupTimeout)
                pendingCleanupTimeout = null
            }

            // try to (re)create anim using cached data if possible
            try {
                // Ensure we still have the parsed animation data in cache (or re-fetch)
                let animationData = parsedTgsCache[url]
                if (!animationData) {
                    try {
                        animationData = await ensureTgs(url)
                    } catch (err) {
                        console.error('restore single-candidate: failed to load animation', err)
                        return
                    }
                }

                // Abort if newer crossfade started while loading
                if (myId !== crossfadeSerial) return

                // If anim instance missing, create one in the visible layer
                if (!animInstances[visibleIdx]) {
                    // visibleEl may be null if not mounted — guard
                    if (!layers[visibleIdx]?.value) {
                        // no DOM to attach to — schedule rotation but nothing to show
                        layerUrl[visibleIdx] = url
                        scheduleNextRotation()
                        return
                    }
                    createAnimInLayer(visibleIdx, animationData)
                }

                // ensure DOM element exists and has the visible class
                const vEl = layers[visibleIdx].value
                if (vEl) {
                    vEl.classList.remove('gift-layer--hidden', 'gift-layer--hidden-prep')
                    vEl.classList.add('gift-layer--visible')
                }

                // start playback if not playing
                try { animInstances[visibleIdx]?.play?.() } catch (_) { }

                // ensure other layer is clean
                try {
                    destroyAnimAtIndex(targetIdx)
                    layerUrl[targetIdx] = null
                    const otherEl = layers[targetIdx]?.value
                    if (otherEl) otherEl.classList.remove('gift-layer--visible', 'gift-layer--hidden', 'gift-layer--hidden-prep')
                } catch (_) { /* ignore */ }

                // ensure logical URL reference
                layerUrl[visibleIdx] = url

                // schedule next rotation so this visual remains for a full interval
                scheduleNextRotation()
            } catch (err) {
                console.error('restore-single-candidate error', err)
            }
            return
        }

        // --- existing "load into visible layer" path when visible layer doesn't already have url ---
        const myId = ++crossfadeSerial
        if (pendingCleanupTimeout) {
            clearTimeout(pendingCleanupTimeout)
            pendingCleanupTimeout = null
        }

        // load data
        let animationData
        try {
            animationData = await ensureTgs(url)
        } catch (err) {
            console.error('crossfade load failed (single candidate)', err)
            return
        }

        if (myId !== crossfadeSerial) return

        // create animation directly in the visible layer (destroy whatever was there)
        try {
            createAnimInLayer(visibleIdx, animationData)
            layerUrl[visibleIdx] = url
            const visibleEl = layers[visibleIdx]?.value
            const otherEl = layers[targetIdx]?.value

            if (visibleEl) {
                visibleEl.classList.add('gift-layer--visible')
                try { animInstances[visibleIdx]?.play?.() } catch (_) { }
            }

            // clean up the other layer to keep state pristine
            try {
                destroyAnimAtIndex(targetIdx)
                layerUrl[targetIdx] = null
                if (otherEl) otherEl.classList.remove('gift-layer--visible', 'gift-layer--hidden', 'gift-layer--hidden-prep')
            } catch (_) { /* ignore */ }

            scheduleNextRotation()
        } catch (e) {
            console.error('error setting single-layer animation', e)
        }

        return
    }

    if (layerUrl[visibleIdx] === url) {
        scheduleNextRotation()
        return
    }

    const myId = ++crossfadeSerial

    if (pendingCleanupTimeout) {
        clearTimeout(pendingCleanupTimeout)
        pendingCleanupTimeout = null
    }

    let animationData
    try {
        animationData = await ensureTgs(url)
    } catch (err) {
        console.error('crossfade load failed', err)
        return
    }

    // abort if newer crossfade started while we were loading
    if (myId !== crossfadeSerial) return

    // create Lottie in target layer (destroys previous anim instance on that layer)
    createAnimInLayer(targetIdx, animationData)
    layerUrl[targetIdx] = url

    const targetEl = layers[targetIdx]?.value
    const currentEl = layers[visibleIdx]?.value

    // If DOM not mounted, just play & mark as visible logically
    if (!targetEl || !currentEl) {
        try { animInstances[targetIdx]?.play?.() } catch (_) { }
        currentLayerIndex.value = targetIdx
        return
    }

    // --- PREP TARGET: ensure no conflicting classes remain before we add hidden-prep ---
    try {
        targetEl.classList.remove('gift-layer--visible', 'gift-layer--hidden', 'gift-layer--hidden-prep')
        // put it into the "hidden-prep" starting state (off-screen, invisible)
        targetEl.classList.add('gift-layer--hidden-prep')
    } catch (e) { /* ignore DOM errors */ }

    // ensure currentEl does not have the transient prep class
    try { currentEl.classList.remove('gift-layer--hidden-prep') } catch (_) { }

    // ensure DOM updates are flushed
    await nextTick()

    // start the lottie in the target so it animates while we fade it in
    try { animInstances[targetIdx]?.play?.() } catch (_) { }

    // --- PERFORM CROSSFADE: hide current, show target ---
    try {
        // hide current: remove visible & prep, add hidden
        currentEl.classList.remove('gift-layer--visible', 'gift-layer--hidden-prep')
        currentEl.classList.add('gift-layer--hidden')
    } catch (e) { /* ignore */ }

    try {
        // show target: remove prep & any lingering hidden, then add visible
        targetEl.classList.remove('gift-layer--hidden-prep', 'gift-layer--hidden')
        targetEl.classList.add('gift-layer--visible')
    } catch (e) { /* ignore */ }

    // Wait transition to complete (use same ms as CSS)
    await new Promise(r => setTimeout(r, CROSSFADE_MS + 30))

    // if another crossfade started, abort finalization (leave cleanup to newer run)
    if (myId !== crossfadeSerial) return

    // Cleanup previously-visible layer: destroy lottie & remove classes to avoid stale state
    try {
        const previousIdx = visibleIdx
        // capture previous DOM element (may be null if unmounted)
        const prevEl = layers[previousIdx]?.value

        destroyAnimAtIndex(previousIdx)
        layerUrl[previousIdx] = null

        if (prevEl) {
            // remove any crossfade classes so this layer is pristine for the next time
            prevEl.classList.remove('gift-layer--visible', 'gift-layer--hidden', 'gift-layer--hidden-prep')
        }
    } catch (e) { /* ignore */ }

    // finalize logical visible index
    currentLayerIndex.value = targetIdx

    // clear any pending cleanup token
    if (pendingCleanupTimeout) {
        clearTimeout(pendingCleanupTimeout)
        pendingCleanupTimeout = null
    }

    // schedule next rotation so the newly-visible visual stays the full interval
    scheduleNextRotation()
}

async function rotateOnce() {
    if (!hasVisuals.value) {
        clearRotateTimer()
        return
    }
    const list = suitableGiftsVisuals.value || []
    if (!list.length) return

    const visibleIdx = currentLayerIndex.value
    const currentUrl = layerUrl[visibleIdx]

    // pick a random url trying to avoid immediate repeat
    let url = null
    if (list.length === 1) url = list[0]
    else {
        let attempts = 0
        do {
            url = list[Math.floor(Math.random() * list.length)]
            attempts++
        } while (url === currentUrl && attempts < 6)
    }

    try {
        await crossfadeToUrl(url)
    } catch (err) {
        console.warn('rotateOnce crossfade failed', err)
    }
    // scheduleNextRotation() is called inside crossfadeToUrl after it finishes
}

function startRotation() {
    clearRotateTimer()
    if (!hasVisuals.value) return
    const first = suitableGiftsVisuals.value[Math.floor(Math.random() * suitableGiftsVisuals.value.length)]
    // crossfadeToUrl will schedule the next rotation when done
    crossfadeToUrl(first).catch(err => console.warn('startRotation initial crossfade failed', err))
}

function stopRotation() {
    clearRotateTimer()
}

function generateRandomVisuals() {
    if (quickStakeChanged.value === true) return
    quickStakeChanged.value = true

    suitableGiftsVisuals.value = []
    const payout = Number(potentialPayout.value || 0)

    if (!isFinite(payout) || payout <= 0) {
        quickStakeChanged.value = false
        return
    }
    const minBorderPrice = payout * 0.85
    const maxBorderPrice = (payout * 1.15) + 0.25

    for (let i = 0; i < props.prices.length && suitableGiftsVisuals.value.length < 10; i++) {
        const p = props.prices[i]
        if (!p) continue
        const priceTon = Number(p.price_ton)
        if (!isNaN(priceTon) && priceTon >= minBorderPrice && priceTon <= maxBorderPrice) {
            suitableGiftsVisuals.value.push(p.lottie_url)
        }
    }

    // small release delay to mimic your existing UX (so changes don't happen too fast)
    setTimeout(() => {
        quickStakeChanged.value = false
        // restart rotation if needed
        stopRotation()
        if (hasVisuals.value) startRotation()
    }, 200)
}

watch(() => props.visible, (v) => {
    stopRotation()
    destroyAnimAtIndex(0)
    destroyAnimAtIndex(1)
    layerUrl[0] = layerUrl[1] = null
    // cancel any in-flight crossfade by bumping serial
    crossfadeSerial++
    if (pendingCleanupTimeout) {
        clearTimeout(pendingCleanupTimeout)
        pendingCleanupTimeout = null
    }
    if (inputDebounceTimer.value) {
        clearTimeout(inputDebounceTimer.value)
        inputDebounceTimer.value = null
    }
    // if (!v) {
    //     stopRotation()
    //     destroyAnimAtIndex(0)
    //     destroyAnimAtIndex(1)
    //     layerUrl[0] = layerUrl[1] = null
    //     // cancel any in-flight crossfade by bumping serial
    //     crossfadeSerial++
    //     if (pendingCleanupTimeout) {
    //         clearTimeout(pendingCleanupTimeout)
    //         pendingCleanupTimeout = null
    //     }
    //     if (inputDebounceTimer.value) {
    //         clearTimeout(inputDebounceTimer.value)
    //         inputDebounceTimer.value = null
    //     }
    // } else {
    //     // small delay to ensure layers refs exist before starting
    //     if (hasVisuals.value) setTimeout(() => startRotation(), 80)
    // }
})

onBeforeUnmount(() => {
    stopRotation()
    destroyAnimAtIndex(0)
    destroyAnimAtIndex(1)
    if (inputDebounceTimer.value) {
        clearTimeout(inputDebounceTimer.value)
        inputDebounceTimer.value = null
    }
})

/* ---------- GRID / VIRTUAL CONFIG ---------- */
const COLUMNS = 3
const CARD_HEIGHT = 160
const ROW_GAP = 18
const rowHeight = CARD_HEIGHT + ROW_GAP

const source = computed(() => {
    const arr = localGifts.value || []
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

/* ---------- UI state ---------- */
const selectedOrder = ref([])
const selectedGifts = ref([])

const isSelected = (id) => selectedOrder.value.indexOf(id) !== -1

// Nicely format TON numbers (integers as ints, otherwise up to 2 decimals)
function formatTonValue(n) {
    if (!isFinite(n)) return '0'
    const num = Number(n)
    if (Math.abs(Math.round(num) - num) < 1e-9) return String(Math.round(num))
    return Number(num.toFixed(2)).toString()
}

const totalBettingValue = computed(() => {
    const amt = Number(String((amount.value ?? '0')).replace(',', '.')) || 0
    const giftsSum = selectedGifts.value.reduce((acc, g) => {
        const vRaw = g?.value ?? g?.price ?? 0
        const vNum = Number(String(vRaw).replace(',', '.')) || 0
        return acc + vNum
    }, 0)
    return Math.max(0, amt + giftsSum)
})

const totalBetInfo = computed(() => {
    const tonAmount = Number(String((amount.value ?? '0')).replace(',', '.')) || 0

    const giftParts = selectedGifts.value.map(g => {
        const name = (g?.name ?? 'Gift').toString()
        const number = g?.number ?? (g?.id ?? '')
        return `${name} #${number}`
    })

    const infoParts = []
    if (tonAmount > 0) {
        infoParts.push(`${formatTonValue(tonAmount)} TON`)
        if (giftParts.length) infoParts.push(...giftParts)
    } else {
        if (giftParts.length) infoParts.push(...giftParts)
        else infoParts.push(`0 TON`)
    }

    const total = totalBettingValue.value
    const lang = (typeof app !== 'undefined' && app?.language) ? app.language : 'en'
    const suffix = lang === 'ru'
        ? `- на сумму ${formatTonValue(total)} TON.`
        : `- amounting to ${formatTonValue(total)} TON.`

    return `${infoParts.join(', ')} ${suffix}`
})

function toggleSelect(giftObj) {
    if (!giftObj.uuid) return
    const idx = selectedOrder.value.indexOf(giftObj.uuid)
    if (idx >= 0) {
        selectedOrder.value.splice(idx, 1)
        selectedGifts.value.splice(idx, 1)
    }
    else {
        selectedOrder.value.push(giftObj.uuid)
        selectedGifts.value.push(giftObj)
    }
}

function createGiftUrl(giftObj) {
    if (!giftObj) return giftImg
    const urlSafeName = String(giftObj.name.replace(/[ -]/g, '')).toLowerCase()
    return `https://nft.fragment.com/gift/${urlSafeName}-${giftObj.number}.webp`
}

// END VIRTUAL LIST INVENTORY ^^^

watch(
    [
        () => amount?.value,
        () => selectedGifts.value
    ],
    ([vAmount, vGifts], [oldAmount, oldGifts]) => {
        // clear any previous debounce
        if (inputDebounceTimer.value) {
            clearTimeout(inputDebounceTimer.value)
            inputDebounceTimer.value = null
        }

        // Immediately hide visuals while user types or changes selection:
        try {
            stopRotation()
            destroyAnimAtIndex(0)
            destroyAnimAtIndex(1)
            layerUrl[0] = layerUrl[1] = null
        } catch (e) { /* ignore */ }

        suitableGiftsVisuals.value = []

        // If input empty or invalid *and* no selected gifts, do nothing further (we keep TON text)
        const normalized = sanitizeNumberString(String(vAmount ?? ''))
        const n = Number(normalized)
        const hasValidAmount = !!vAmount && isFinite(n) && n > 0
        const hasSelectedGifts = Array.isArray(vGifts) && vGifts.length > 0

        if (!hasValidAmount && !hasSelectedGifts) {
            return
        }

        // Start debounce: only when user stops typing / changing gifts for INPUT_DEBOUNCE_MS do we compute visuals
        inputDebounceTimer.value = setTimeout(() => {
            inputDebounceTimer.value = null
            // small safety: if quickStakeChanged guard is used, let generateRandomVisuals handle it
            generateRandomVisuals()
        }, INPUT_DEBOUNCE_MS)
    },
    { deep: true }
)

function sideToYes() {
    emit('side-to-yes')
}

function sideToNo() {
    emit('side-to-no')
}

function translateValidating() {
    return app.language === 'ru' ? 'Подтверждаем..' : 'Confirming..'
}

function translateBet() {
    return app.language === 'ru' ? 'Поставить' : 'Place'
}

const sideText = computed(() => {
    if (props.side === 'Yes') {
        return app.language === 'ru' ? 'Да' : 'Yes'
    } else {
        return app.language === 'ru' ? 'Нет' : 'No'
    }
})

watch(() => props.side, (v) => {
    if (v) {
        generateRandomVisuals()
    }
})

watch(() => props.visible, (v) => {
    if (v) {
        amount.value = '0'
        lastInputtedNumber.value = '0'
        selectedGifts.value = []
        selectedOrder.value = []
    }
})

function translateBetName(nameRu, nameEn) {
    return app.language === 'ru' ? nameRu : nameEn
}

function close() {
    emit('close')
    document.body.classList.remove('keyboard-open');
}

function focusAmountInput() {
    if (amountInput.value) amountInput.value.focus()
}

// keyboard handlers for mobile
function onAmountFocus() {
    document.body.classList.add('keyboard-open')

    // ensure we scroll into view
    setTimeout(() => {
        try { amountInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) { }
    }, 50)

    if (window.visualViewport && amountInput.value) {
        const update = () => {
            const kv = window.visualViewport
            const keyboardHeight = Math.max(0, window.innerHeight - kv.height)
            document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
        }
        amountInput.value._vvListener = update
        window.visualViewport.addEventListener('resize', update)
        update()
    }
}

function onAmountBlur() {
    document.body.classList.remove('keyboard-open')

    if (window.visualViewport && amountInput.value && amountInput.value._vvListener) {
        window.visualViewport.removeEventListener('resize', amountInput.value._vvListener)
        delete amountInput.value._vvListener
        document.documentElement.style.removeProperty('--keyboard-height')
    }
}

// Helper: decide if an element is interactive (so we don't blur when tapping real buttons/links/inputs)
function isInteractiveElement(el) {
    while (el && el !== document.documentElement) {
        if (!el.tagName) return false
        const tag = el.tagName.toUpperCase()
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)) return true
        if (el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' || el.getAttribute('role') === 'textbox')) return true
        if (el.isContentEditable) return true
        // any element with tabindex >= 0 should be considered interactive
        const tabindex = el.getAttribute && el.getAttribute('tabindex')
        if (tabindex != null && parseInt(tabindex, 10) >= 0) return true
        el = el.parentElement
    }
    return false
}

// capture-phase handler: blur active input when user taps non-interactive area
function onGlobalPointer(e) {
    try {
        const active = document.activeElement
        if (!active) return
        const aTag = active.tagName ? active.tagName.toUpperCase() : ''
        const isActiveInput = (aTag === 'INPUT' || aTag === 'TEXTAREA' || active.isContentEditable)
        if (!isActiveInput) return

        // optionally scope to only inputs inside the modal:
        if (modalRef.value && !modalRef.value.contains(active)) {
            return
        }

        // if the tap target is the input itself (or inside it), don't blur
        const target = e.target
        if (active === target || active.contains && active.contains(target)) return

        // if tapped element is interactive, don't blur (so buttons still work)
        if (isInteractiveElement(target)) return

        // otherwise, blur the input — this is a user gesture (pointerdown/touchstart) so it will normally hide the keyboard
        active.blur()

        // iOS/WebView fallback: sometimes blur doesn't hide keyboard immediately — nudge it
        setTimeout(() => {
            try { window.scrollTo(window.scrollX, window.scrollY) } catch (_) { }
        }, 50)
    } catch (err) {
        // swallow errors — nothing fatal
    }
}

/* input sanitizers (unchanged) */
function sanitizeNumberString(s) {
    if (s == null || s === '') return ''
    let v = s.toString()
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '')
        .replace(/(\..*)\./g, '$1')

    if (v.includes('.')) {
        const [i, d] = v.split('.')
        v = i + '.' + d.slice(0, 2)
    }
    return v
}

function formatAmountNumber(n) {
    if (!isFinite(n) || isNaN(n)) return '0'
    let clamped = Math.max(0, Math.min(99999, n))
    const fixed = Math.round(clamped * 100) / 100
    if (Number.isInteger(fixed)) return String(fixed)
    return String(fixed).replace(/\.?0+$/, '')
}

function onAmountInput(e) {
    let v = e.target.value
    v = sanitizeNumberString(v)

    if (/^0[1-9]$/.test(v)) v = v[1]

    if (v === '0' && lastInputtedNumber.value !== '0.') v = '0.'
    else if (lastInputtedNumber.value === '0.' && v === '0') v = ''

    if (v === '.') v = '0.'
    if (v === '0.00') v = '0.01'

    const num = parseFloat(v)
    if (!isNaN(num) && num > 99999) v = '99999'

    amount.value = v
    lastInputtedNumber.value = v
}

const validAmount = computed(() => {
    const n = parseFloat(amount.value)
    return !isNaN(n) && n > 0
})

async function placeBet() {
    if (!amount.value && (!selectedGifts.value || selectedGifts.value.length === 0)) return
    if (loading.value) return
    loading.value = true

    // Take backups for rollback
    const backupLocalGifts = JSON.parse(JSON.stringify(localGifts.value || []))
    const backupSelectedGifts = JSON.parse(JSON.stringify(selectedGifts.value || []))
    const backupSelectedOrder = Array.from(selectedOrder.value || [])

    let appliedOptimistic = false

    try {
        // Apply optimistic removal immediately if there are gifts selected
        if (selectedGifts.value && selectedGifts.value.length > 0) {
            localGifts.value = removeGiftsFromInventory(localGifts.value, selectedGifts.value)
            // clear the selection visually (since the items are "consumed")
            selectedGifts.value = []
            selectedOrder.value = []
            appliedOptimistic = true
        }

        // Call RPC (amount can be 0 if gifts provided)
        await placeBetRequest(props.bet.id, props.side, Number(amount.value || 0), backupSelectedGifts)

        const messageText = app.language === 'ru' ? 'Ставка успешно поставлена!' : 'Bet placed successfully!'
        toast.success(messageText)
        emit('placed', { side: props.side, amount: Number(amount.value || 0) })
        close()
    } catch (err) {
        // rollback optimistic changes if any
        if (appliedOptimistic) {
            localGifts.value = backupLocalGifts
            selectedGifts.value = backupSelectedGifts
            selectedOrder.value = backupSelectedOrder
        }
        const messageText = app.language === 'ru' ? 'Не удалось поставить ставку.' : 'Unable to place bet.'
        toast.error(err?.message || messageText)
    } finally {
        loading.value = false
        await app.fetchPoints()
    }
}

/* increase/decrease/quick add logic */
function currentAmountNumber() {
    const n = parseFloat(sanitizeNumberString(amount.value))
    return isNaN(n) ? 0 : n
}

function determineStep(n) {
    if (n >= 2000) return 50
    if (n >= 1000) return 20
    if (n >= 100) return 5
    return 1
}
function amountIncrease() {
    const n = currentAmountNumber()
    const step = determineStep(n)
    const newVal = n + step
    amount.value = formatAmountNumber(newVal)
    lastInputtedNumber.value = amount.value

    // ensure the input is NOT focused after quick add:
    // if it is currently focused (keyboard open), blur it which triggers onAmountBlur()
    try {
        const el = amountInput?.value
        if (el && document.activeElement === el) {
            el.blur()
        }
    } catch (e) {
        // silent fallback
    }

    // DO NOT call focusAmountInput() here
}
function amountDecrease() {
    const n = currentAmountNumber()
    const step = determineStep(n)
    const newVal = Math.max(0, n - step)
    amount.value = formatAmountNumber(newVal)
    lastInputtedNumber.value = amount.value

    // ensure the input is NOT focused after quick add:
    // if it is currently focused (keyboard open), blur it which triggers onAmountBlur()
    try {
        const el = amountInput?.value
        if (el && document.activeElement === el) {
            el.blur()
        }
    } catch (e) {
        // silent fallback
    }

    // DO NOT call focusAmountInput() here
}

/* micro interaction helpers */
function pressInc() {
    pressedInc.value = true
    setTimeout(() => (pressedInc.value = false), 140)
}
function releaseInc() {
    pressedInc.value = false
}
function pressDec() {
    pressedDec.value = true
    setTimeout(() => (pressedDec.value = false), 140)
}
function releaseDec() {
    pressedDec.value = false
}

/**
 * Helper: read yes/no numeric values from various possible shapes of props.bet.volume_with_gifts
 */
function readVolumeObject(vol) {
    // returns { yes: number, no: number } (numbers >=0)
    let yes = 0
    let no = 0
    if (!vol && vol !== 0) return { yes: 0, no: 0 }

    if (typeof vol === 'object') {
        // try common key variants
        yes = Number(vol.Yes ?? vol.yes ?? vol['YES'] ?? vol['yes'] ?? vol?.YesAmount ?? 0) || 0
        no = Number(vol.No ?? vol.no ?? vol['NO'] ?? vol['no'] ?? vol?.NoAmount ?? 0) || 0

        // Sometimes volume may be provided as a Proxy map like { Yes: 3000, No: 4000 }
        // Those will be read by the lines above.
        return { yes, no }
    }

    // if it's numeric (total), split by current_odds if present
    const total = Number(vol) || 0
    const p = Number(props.bet?.current_odds)
    const prob = isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
    yes = total * prob
    no = total - yes
    return { yes, no }
}

/* compute yes/no volumes from props.bet.volume (preferred source) */
const volParts = computed(() => readVolumeObject(props.bet?.volume_with_gifts))

/* currentNoProb: prefer volumes when possible (equivalent to 1 - currentYesProb) */
const currentNoProb = computed(() => {
    // simply invert the computed currentYesProb so we stay consistent with volume fallback logic
    const yes = Number(volParts.value.yes) || 0
    const no = Number(volParts.value.no) || 0
    const total = yes + no
    if (total > 0) return no / total

    // fallback: invert current_odds (which is yes-prob)
    return 1 - currentYesProb.value
})

/* newNoProb: inverted newYesProb */
const newNoProb = computed(() => {
    return 1 - newYesProb.value
})

/* currentYesProb: prefer computing from explicit volumes when possible */
const currentYesProb = computed(() => {
    // if explicit volumes exist and sum > 0, derive percent from them
    const yes = Number(volParts.value.yes) || 0
    const no = Number(volParts.value.no) || 0
    const total = yes + no
    if (total > 0) return yes / total

    // fallback: use current_odds field if volumes are not informative
    const p = Number(props.bet?.current_odds)
    return isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
})

/* yesVolume / noVolume / totalVolume must align with the above logic */
const yesVolume = computed(() => {
    const yes = Number(volParts.value.yes) || 0
    // if explicit yes present, use it
    if (yes > 0) return yes
    // else infer from numeric total or fallback to zero
    const singleTotal = Number(props.bet?.volume_with_gifts) || 0
    return singleTotal * currentYesProb.value
})

const noVolume = computed(() => {
    const no = Number(volParts.value.no) || 0
    if (no > 0) return no
    const singleTotal = Number(props.bet?.volume_with_gifts) || 0
    return Math.max(0, singleTotal - yesVolume.value)
})

const totalVolume = computed(() => {
    const s = yesVolume.value + noVolume.value
    if (s > 0) return s
    // fallback: maybe props.bet.volume was a single numeric total
    return Number(props.bet?.volume_with_gifts) || 0
})

/* newYesProb (after user's stake) uses the volumes computed above */
const newYesProb = computed(() => {
    const stake = totalBettingValue.value
    const yVol = yesVolume.value
    const total = totalVolume.value

    if (total === 0) {
        if (stake <= 0) return currentYesProb.value || 0
        return props.side.toLowerCase() === 'yes' ? 1 : 0
    }
    if (stake <= 0) return currentYesProb.value

    if (props.side.toLowerCase() === 'yes') {
        const newYes = yVol + stake
        const newTotal = total + stake
        return newYes / newTotal
    } else {
        const newTotal = total + stake
        return yVol / newTotal
    }
})

const chosenProbAfter = computed(() => {
    const yesAfter = newYesProb.value
    return props.side === 'Yes' ? yesAfter : 1 - yesAfter
})

// payout shown to user after house takes 20%
const potentialPayout = computed(() => {
    const gross = grossPayout.value
    if (!isFinite(gross) || gross <= 0) return 0
    // clamp to reasonable upper bound
    const stake = totalBettingValue.value
    const payoutBeforeTaxation = Math.min(9999999, Math.round(gross * 100) / 100)
    const profit = payoutBeforeTaxation - stake
    const finalPayment = payoutBeforeTaxation - (profit * HOUSE_CUT)
    return finalPayment
})

const potentialProfit = computed(() => {
    const stake = totalBettingValue.value
    const profit = potentialPayout.value - stake
    return profit > 0 ? profit : 0
})

// put near the other computed properties
const HOUSE_CUT = 0.20

const grossPayout = computed(() => {
    const stake = totalBettingValue.value
    const prob = chosenProbAfter.value
    if (stake <= 0 || prob <= 0) return 0
    const multiplier = 1 / prob
    const payout = stake * multiplier
    return Math.min(9999999, payout)
})

/* formatting helpers */
function fmtPct(x) {
    if (!isFinite(x)) return '—'
    return (x * 100).toFixed(1) + '%'
}
function fmtTon(x) {
    if (!isFinite(x)) return '—'
    return (Math.round(x * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' TON'
}

watch([() => potentialPayout.value, suitableGiftsVisuals], () => {
    if (Number(potentialPayout.value) > 0 && hasVisuals.value) {
        startRotation()
    } else {
        // show TON text when no visuals
        stopRotation()
        // destroy both anims
        destroyAnimAtIndex(0)
        destroyAnimAtIndex(1)
    }
}, { immediate: true })

onMounted(() => {
    // install both pointerdown and touchstart for older WebViews (capture so we run first)
    document.addEventListener('pointerdown', onGlobalPointer, { capture: true, passive: true })
    document.addEventListener('touchstart', onGlobalPointer, { capture: true, passive: true })
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onGlobalPointer, { capture: true })
    document.removeEventListener('touchstart', onGlobalPointer, { capture: true })
})
</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: none;
    z-index: 10;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.4);
    backdrop-filter: none;
}

.modal-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: 480px;
    background: #292a2a;
    border-radius: 18px;
    color: #fff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    z-index: 1001;
}

.betting-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: auto;
    max-width: 480px;
    margin: auto auto;
    align-self: center;
    background: #292a2a;
    color: White;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem 0;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 12;
    user-select: none;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-content: center;
    padding: 0 1rem;
    font-size: 1.25rem;
    font-family: "Inter", sans-serif;
}

.modal-header-description {
    display: block;
    font-size: 0.75rem;
    max-width: min(480px, 100%);
    font-weight: 400;
}

.modal-header-description h2 {
    margin-bottom: 0;
    margin-top: -0.25rem;
    color: white;
}

.modal-header-description span {
    opacity: 0.5;
    color: gray;
    font-size: 1.1rem;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 2.25rem;
    cursor: pointer;
    color: white;
}

.modal-body {
    padding: 0.75rem 0.5rem 0.25rem 0.5rem;
    text-align: center;
    font-family: Inter;
}

.connected-wallet {
    font-size: 1.5rem;
    color: #888;
    margin: 0;
}

.amount-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1rem 0;
    margin-bottom: 0;
}

.amount-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    justify-content: center;
}

.amount-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    background: transparent;
    flex: 0 1 auto;
    align-self: center;
}

.amount-input {
    width: calc(var(--chars, 1) * 1ch + 1rem);
    padding: 0.35rem 0.5rem;
    box-sizing: content-box;
    font-size: 2.25rem;
    color: white;
    background: #292a2a;
    text-align: center;
    border: none;
    outline: none;
    appearance: textfield;
    font-family: inherit;
    flex: 0 0 auto;
    min-width: 1ch;
    max-width: min(480px, 70vw);
}

.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.amount-currency {
    font-size: 1.5rem;
    color: #aaa;
    opacity: 0.7;
    cursor: pointer;
    flex: 0 0 auto;
    padding-right: 16px;
}

.step-btn {
    background: #343536;
    border: none;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.02);
    flex: 0 0 auto;
    transition: transform 0.12s cubic-bezier(.2, .8, .2, 1), box-shadow 0.12s;
}

.step-btn .icon {
    display: block;
    width: 16px;
    height: 16px;
    transition: transform 0.12s cubic-bezier(.2, .8, .2, 1);
}

.step-btn.pressed {
    transform: translateY(1px) scale(0.96);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3), inset 0 0 0 rgba(255, 255, 255, 0);
}

.step-btn.pressed .icon {
    transform: scale(0.92);
}

/* potential panel */
.potential-panel {
    display: flex;
    flex-direction: column;
    margin: auto auto;
    margin-top: 0.9rem;
    width: 90%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008));
    border: 1px solid rgba(255, 255, 255, 0.04);
    padding: 0.6rem;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    color: #e6eef8;
    gap: 0.45rem;
    align-self: center;
}

.potential-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
}

.potential-left {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1 1 60%;
    min-width: 0;
}

.potential-right {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 0 0 auto;
    min-width: 110px;
}

.potential-left .lbl,
.potential-right .lbl {
    color: #9eb3c9;
    font-size: 0.85rem;
}

.values {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 1rem;
    color: #fff;
}

.values .old {
    color: #cbd9e6;
}

.values .new {
    color: #fff;
    font-weight: 700;
}

.values .arrow {
    color: #7f98ad;
}

.potential-right .big {
    font-size: 1.2rem;
    font-weight: 700;
    color: #fff;
}

.sub-profit {
    font-size: 0.75rem;
    color: #ffffff;
    margin-top: 0.1rem;
}

.muted {
    font-size: 0.72rem;
    color: #8fa6bb;
    opacity: 0.9;
    margin-top: 0.25rem;
    text-align: left;
}

.quick-add {
    margin-top: 1.15rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.quick-add-label {
    color: #9aa0a6;
    font-size: 0.85rem;
    align-self: center;
}

.quick-add-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    width: 100%;
    padding: 0 0.25rem;
    box-sizing: border-box;
}

.quick-btn {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008));
    border: none;
    color: white;
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    min-width: 72px;
    cursor: pointer;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.02);
    flex: 1 1 auto;
    max-width: 120px;
    transition: transform 0.12s cubic-bezier(.2, .8, .2, 1), box-shadow 0.12s;
}

.quick-btn.pressed {
    transform: translateY(1px) scale(0.985);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.modal-footer {
    padding: 0.5rem;
}

.action-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
    border: none;
    border-radius: 12px;
    background-color: #0163cb;
    color: #ffffff;
    cursor: pointer;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    transition: background-color 0.1s ease;
}

.action-btn:disabled {
    background-color: rgb(1, 99, 203, 0.8);
    cursor: not-allowed;
}


.gifts-list {
    width: 100%;
    height: 300px;
    box-sizing: border-box;
    overflow-y: auto;
    /* must be scrollable */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    margin-top: 1rem;
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
    background: rgb(91, 91, 91, 0.3);
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
    max-width: 110px;
    position: relative;
    transform: translateY(0);
    /* base transform */
    transition: transform 180ms cubic-bezier(.2, .9, .2, 1), box-shadow 180ms cubic-bezier(.2, .9, .2, 1), border-color 180ms cubic-bezier(.2, .9, .2, 1);
    will-change: transform, box-shadow;
}

.gift-card.selected {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 1),
        /* white halo */
        0 10px 20px rgba(0, 0, 0, 0.22);
    transform: translateY(-6px);
    z-index: 2;
}

.gift-card.selected .select-icon {
    opacity: 0;
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
    height: 30%;
    width: 30%;
    right: 0px;
    top: 0px;
}

.select-icon {
    width: 18px;
    height: 18px;
    padding: 6px;
}

/* Meta (name / count) sits below the square image and has its own padding */
.gift-meta {
    padding: 4px 0px;
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
    font-size: 0.7rem;
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
    font-size: 0.7rem;
}

.sides-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 1rem;
}

.side {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 3rem;
    width: 9rem;
    gap: 4px;
    border-radius: 16px;
    background-color: rgba(203, 203, 203, 0.5);
    opacity: 0.5;
    cursor: pointer;
    transition: background-color 0.3s ease, opacity 0.3s;
}

.probability-text {
    font-size: 0.7rem;
}

.side.active {
    background-color: #0163cb;
    opacity: 1;
    transition: background-color 0.3s ease, opacity 0.3s;
}

.spacer {
    margin: 1.25rem 0.5rem;
    border: 1px solid rgb(62, 64, 73);
    border-radius: 2px;
}

.winnings-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.visual-winnings {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 7rem;
    width: 7rem;
    overflow: visible;
}

.ton-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: absolute;
    z-index: 5;
    transition: opacity 300ms ease, transform 300ms ease;
    opacity: 0;
    transform: translateY(6px);
}

.ton-container--visible {
    opacity: 1;
    transform: translateY(0);
}

.ton-icon {
    height: 16px;
    width: 16px;
}

/* fallback text that crossfades/translate when visuals appear/disappear */
.ton-text {
    font-family: "Inter", sans-serif;
    font-size: 1.1rem;
    font-weight: 600;
}

/* container for two layers */
.animating-gift-visual {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
    display: block;
    transform: translateZ(0);
    /* promote to its own layer */
}

/* each layer occupies same space and stacks */
.gift-layer {
    border-radius: 24px;
    /* tweak value to taste */
    overflow: hidden;
    /* clip inner SVG / image to the rounded rect */
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: translateY(8px) scale(0.995);
    transition: opacity 300ms ease, transform 300ms ease;
    will-change: opacity, transform;
    z-index: 4;
}

/* visible layer: fully opaque and in-place */
.gift-layer--visible {
    opacity: 1;
    transform: translateY(0) scale(1);
}

/* hidden state during the initial prep (prevents flash) */
.gift-layer--hidden-prep {
    opacity: 0;
    transform: translateY(8px) scale(0.995);
}

/* when explicitly hidden after transition */
.gift-layer--hidden {
    opacity: 0;
    transform: translateY(-6px) scale(0.995);
}

.total-bet-info,
.winnings-hint {
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    opacity: 0.5;
    margin-top: 1rem;
}

.total-bet-info {
    align-items: center;
    text-align: center;
    font-size: 0.6rem;
    margin: 0.5rem 0;
    padding: 0 4px;
    max-height: 35px;
    box-sizing: border-box;
    overflow-y: auto;
    /* must be scrollable */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
}

.total-bet-info::-webkit-scrollbar {
    display: none;
}

@media (max-height: 780px) {
    .gifts-list {
        height: 180px;
    }

    .total-bet-info {
        max-height: 18px;
    }

    .winnings-hint {
        font-size: 0.7rem;
    }

    .gift-layer {
        border-radius: 12px;
    }

    .visual-winnings {
        height: 3rem;
        width: 3rem;
    }

    .spacer {
        margin: 0.5rem 0.25rem;
    }

    .amount-wrapper {
        margin: 0.5rem;
        margin-bottom: 0;
    }

    .amount-input {
        font-size: 1.5rem;
    }

    .amount-currency {
        font-size: 1rem;
    }
}

@media (max-width: 420px) {
    .amount-input {
        font-size: 1.6rem;
        padding: 0.35rem;
    }

    .amount-currency {
        font-size: 1.15rem;
    }

    .step-btn {
        width: 34px;
        height: 34px;
        border-radius: 8px;
    }

    .step-btn .icon {
        width: 14px;
        height: 14px;
    }

    .quick-btn {
        padding: 0.45rem 0.6rem;
        font-size: 0.9rem;
        min-width: 56px;
    }

    .amount-row {
        padding: 0 0.25rem;
    }

    .potential-panel {
        padding: 0.5rem;
        border-radius: 10px;
    }

    .potential-right {
        min-width: 88px;
    }

    .potential-left .values {
        font-size: 0.95rem;
    }

    .potential-right .big {
        font-size: 0.95rem;
    }
}

/* FADE TRANSITION FOR OVERLAY OPACITY */
.fade-enter-active,
.fade-leave-active {
    transition:
        background-color 300ms ease-out,
}

.fade-enter-from,
.fade-leave-to {
    background-color: rgba(0, 0, 0, 0);
}

/* SLIDE-UP TRANSITION FOR MODAL */
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
</style>
