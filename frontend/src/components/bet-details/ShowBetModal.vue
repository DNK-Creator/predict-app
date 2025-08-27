<template>
    <transition name="backdrop" appear>
        <div v-if="visible" class="overlay" @click.self="close"></div>
    </transition>

    <transition name="modal" appear>
        <div v-if="visible" ref="modalRef" class="modal-container">
            <header class="modal-header">
                <div class="modal-header-description">
                    <h2>{{ translateBetName(bet.name, bet.name_en) }}</h2>
                </div>
                <button class="close-btn" @click="close">×</button>
            </header>

            <section class="modal-body">
                <p class="connected-wallet">{{ $t('bet-on') }} "{{ sideText }}"</p>

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

                    <!-- Potential earnings panel (uses props.bet.current_odds and props.bet.volume shape) -->
                    <div class="potential-panel" v-if="bet && potentialPayout > 0">
                        <div class="potential-row">
                            <div class="potential-left">
                                <div v-if="side === 'Yes'" class="lbl">{{ $t('probability') }} ({{ $t('yes') }})</div>
                                <div v-else class="lbl">{{ $t('probability') }} ({{ $t('no') }})</div>

                                <div v-if="side === 'Yes'" class="values">
                                    <div class="old">{{ fmtPct(currentYesProb) }}</div>
                                    <div class="arrow">→</div>
                                    <div class="new">{{ fmtPct(newYesProb) }}</div>
                                </div>

                                <div v-else class="values">
                                    <div class="old">{{ fmtPct(currentNoProb) }}</div>
                                    <div class="arrow">→</div>
                                    <div class="new">{{ fmtPct(newNoProb) }}</div>
                                </div>
                            </div>

                            <div class="potential-right">
                                <div class="lbl">{{ $t('to-win') }}</div>
                                <div class="big">{{ fmtTon(potentialPayout) }}</div>
                                <div class="sub-profit">{{ $t('profit') }} {{ fmtTon(potentialProfit) }}</div>
                            </div>
                        </div>

                    </div>

                    <!-- quick add -->
                    <div class="quick-add">
                        <span class="quick-add-label">{{ $t('quick-actions') }}</span>
                        <div class="quick-add-buttons">
                            <button type="button" class="quick-btn" :class="{ pressed: pressedQuick === 2 }"
                                @pointerdown="() => pressQuick(2)" @pointerup="releaseQuick"
                                @pointercancel="releaseQuick" @mouseleave="releaseQuick"
                                @click="() => quickAdd(2)">+2</button>

                            <button type="button" class="quick-btn" :class="{ pressed: pressedQuick === 4.5 }"
                                @pointerdown="() => pressQuick(4.5)" @pointerup="releaseQuick"
                                @pointercancel="releaseQuick" @mouseleave="releaseQuick"
                                @click="() => quickAdd(4.5)">+4.5</button>

                            <button type="button" class="quick-btn" :class="{ pressed: pressedQuick === 10 }"
                                @pointerdown="() => pressQuick(10)" @pointerup="releaseQuick"
                                @pointercancel="releaseQuick" @mouseleave="releaseQuick"
                                @click="() => quickAdd(10)">+10</button>
                        </div>
                    </div>
                </div>
            </section>

            <footer class="modal-footer">
                <button class="action-btn" :disabled="!validAmount" @click="placeBet">
                    {{ loading ? translateValidating() : translateBet() }}
                </button>
            </footer>
        </div>
    </transition>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { placeBetRequest } from '@/services/bets-requests'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const props = defineProps({
    visible: Boolean,
    bet: Object,
    side: String
})
const emit = defineEmits(['close', 'placed'])

const amount = ref('0')
const lastInputtedNumber = ref('0')
const amountInput = ref(null)
const loading = ref(false)

// micro interaction state
const pressedInc = ref(false)
const pressedDec = ref(false)
const pressedQuick = ref(null)

const modalRef = ref(null)   // NEW: used to scope outside-click blur

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

watch(() => props.visible, (v) => {
    if (v) {
        amount.value = '0'
        lastInputtedNumber.value = '0'
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
    if (!amount.value || loading.value) return
    loading.value = true
    try {
        await placeBetRequest(props.bet.id, props.side, +amount.value)
        let messageText = app.language === 'ru' ? 'Ставка успешно поставлена!' : 'Bet placed successfully!'
        toast.success(messageText)
        emit('placed', { side: props.side, amount: +amount.value })
        app.points -= Number(amount.value)
        close()
    } catch (err) {
        let messageText = app.language === 'ru' ? 'Не удалось поставить ставку.' : 'Unable to place bet.'
        toast.error(err.message || messageText)
    } finally {
        loading.value = false
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

function quickAdd(v) {
    const n = currentAmountNumber()
    const newVal = n + Number(v)
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
function pressQuick(val) {
    pressedQuick.value = val
    setTimeout(() => (pressedQuick.value = null), 140)
}
function releaseQuick() {
    pressedQuick.value = null
}

/* ------------------------------
   Earnings calculations:
   prefer deriving current odds from props.bet.volume object { Yes, No }
   fall back to props.bet.current_odds when volume info absent
   ------------------------------ */

/**
 * Helper: read yes/no numeric values from various possible shapes of props.bet.volume
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
const volParts = computed(() => readVolumeObject(props.bet?.volume))

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
    const singleTotal = Number(props.bet?.volume) || 0
    return singleTotal * currentYesProb.value
})

const noVolume = computed(() => {
    const no = Number(volParts.value.no) || 0
    if (no > 0) return no
    const singleTotal = Number(props.bet?.volume) || 0
    return Math.max(0, singleTotal - yesVolume.value)
})

const totalVolume = computed(() => {
    const s = yesVolume.value + noVolume.value
    if (s > 0) return s
    // fallback: maybe props.bet.volume was a single numeric total
    return Number(props.bet?.volume) || 0
})

/* newYesProb (after user's stake) uses the volumes computed above */
const newYesProb = computed(() => {
    const stake = currentAmountNumber()
    const yVol = yesVolume.value
    const nVol = noVolume.value
    const total = totalVolume.value

    if (total === 0) {
        if (stake <= 0) return currentYesProb.value || 0
        return props.side === 'Yes' ? 1 : 0
    }
    if (stake <= 0) return currentYesProb.value

    if (props.side === 'Yes') {
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

// payout shown to user after house takes 15%
const potentialPayout = computed(() => {
    const gross = grossPayout.value
    if (!isFinite(gross) || gross <= 0) return 0
    // clamp to reasonable upper bound
    const stake = currentAmountNumber()
    const payoutBeforeTaxation = Math.min(9999999, Math.round(gross * 100) / 100)
    const profit = payoutBeforeTaxation - stake
    const finalPayment = payoutBeforeTaxation - (profit * HOUSE_CUT)
    return finalPayment
})

const potentialProfit = computed(() => {
    const stake = currentAmountNumber()
    const profit = potentialPayout.value - stake
    return profit > 0 ? profit : 0
})

// put near the other computed properties
const HOUSE_CUT = 0.15 // 15%

const grossPayout = computed(() => {
    const stake = currentAmountNumber()
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
.backdrop-enter-active,
.backdrop-leave-active {
    transition: opacity 0.15s ease;
}

.backdrop-enter-from,
.backdrop-leave-to {
    opacity: 0;
}

.backdrop-enter-to,
.backdrop-leave-from {
    opacity: 1;
}

.overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(5px);
    z-index: 1000;
}

.modal-enter-active {
    transition: transform 0.15s ease-out, opacity 0.15s ease-out;
}

.modal-leave-active {
    transition: transform 0.15s ease-in, opacity 0.15s ease-in;
}

.modal-enter-from {
    transform: scale(0.8);
    opacity: 0;
}

.modal-enter-to {
    transform: scale(1);
    opacity: 1;
}

.modal-leave-from {
    transform: translateY(0);
    opacity: 1;
}

.modal-leave-to {
    transform: translateY(100vh);
    opacity: 0;
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

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-content: center;
    padding: 1rem 1rem 1rem 1rem;
    font-size: 1.25rem;
    font-family: Inter;
}

.modal-header-description {
    display: block;
    font-size: 1.1rem;
    max-width: 80%;
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
    max-width: 70vw;
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
    margin-top: 0.9rem;
    width: calc(100% - 3rem);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008));
    border: 1px solid rgba(255, 255, 255, 0.04);
    padding: 0.6rem;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    color: #e6eef8;
    display: flex;
    flex-direction: column;
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
    padding: 1.5rem;
}

.action-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
    border: none;
    border-radius: 20px;
    background-color: #0098EA;
    color: #ffffff;
    cursor: pointer;
    font-family: Inter;
    transition: background-color 0.1s ease;
}

.action-btn:disabled {
    background-color: #006fba;
    cursor: not-allowed;
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
        width: calc(100% - 1rem);
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
</style>
