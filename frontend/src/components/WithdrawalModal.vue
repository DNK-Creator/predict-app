<template>
    <transition name="backdrop" appear>
        <div v-if="modelValue" class="overlay" @click.self="close">
            <!-- Blur and fade mask -->
        </div>
    </transition>

    <transition name="modal" appear>
        <div v-if="modelValue" class="modal-container">
            <header class="modal-header">
                <div class="modal-header-description">
                    <h2>{{ $t('withdraw-two') }}</h2>
                    <span>{{ $t('withdrawal-time') }}</span>
                </div>
                <button class="close-btn" @click="close">×</button>
            </header>
            <section class="modal-body">
                <p class="connected-wallet">{{ $t('connected-wallet') }}</p>
                <p class="wallet-address">{{ shortenedAddress }}</p>

                <!-- CENTERED FLEX GROUP -->
                <div class="amount-wrapper">
                    <div class="input-warnings">
                        <div class="amount-group">
                            <input ref="amountInput" v-model="amount" type="text" inputmode="decimal" placeholder="0"
                                class="amount-input" @input="onAmountInput" @focus="onAmountFocus" @blur="onAmountBlur"
                                :size="amount.length > 0 ? amount.length : 1"
                                :style="{ '--chars': (amount && amount.length) ? amount.length : 1 }" />
                            <span class="amount-currency" @click="focusAmountInput">TON</span>
                        </div>

                        <div class="max-button" @click="onMax">Max</div>

                        <!-- 2000 TON limit warning (existing) -->
                        <span v-if="showWarning" class="warning-text" role="alert" aria-live="polite">
                            {{ $t('withdrawal-limit') }}
                        </span>

                        <!-- MINIMUM AMOUNT WARNING -->
                        <span v-if="showMinWarning" class="warning-text" role="alert" aria-live="polite">
                            <!-- use translation key 'withdrawal-min' if present, fallback literal -->
                            {{ $t('withdrawal-min') || 'Minimum withdrawal: 0.1 TON' }}
                        </span>
                    </div>
                </div>

            </section>
            <div class="divider"></div>
            <footer class="modal-footer">
                <div class="limits-group">
                    <div class="limit-line">
                        <span class="limit-description-item-one">{{ $t('tx-limit') }}:</span>
                        <span class="limit-description-item-two">2000 TON</span>
                    </div>
                    <!-- <div class="limit-line">
                            <span class="limit-description-item-one">{{ $t('withdrawals-per-day') }}:</span>
                            <span class="limit-description-item-two">1</span>
                        </div> -->
                </div>
                <button class="action-btn" :disabled="!validAmount" @click="onWithdraw">{{ $t('withdraw') }}</button>
            </footer>
        </div>
    </transition>
</template>

<script setup>
import { ref, computed } from 'vue'

// defineProps exposes modelValue, address, etc directly
const { modelValue, address, balance, transactionLimit, dailyLimit, dailyUsed } = defineProps({
    modelValue: Boolean,
    address: String,
    balance: [Number, String],
    transactionLimit: { type: Number, default: 1500 },
    dailyLimit: { type: Number, default: 7500 },
    dailyUsed: { type: Number, default: 0 }
})
// defineEmits returns the emit function
const emit = defineEmits(['update:modelValue', 'withdraw'])

// Local state for user input
const amount = ref('')
const minWithdraw = 0.1
const showMinWarning = ref(false)

const lastInputtedNumber = ref('')

const showWarning = ref(false)

// grab a ref to the input element
const amountInput = ref(null)

const shortenedAddress = computed(() => {
    if (!address) return ''
    return `${address.slice(0, 4)}...${address.slice(-3)}`
})

// called when user clicks “TON”
function focusAmountInput() {
    // focus the input so the keyboard appears & the cursor is active
    if (amountInput.value) {
        amountInput.value.focus()
    }
}

// keyboard handlers for mobile
function onAmountFocus() {
    document.body.classList.add('keyboard-open');
    setTimeout(() => {
        try { amountInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
    }, 50);
    if (window.visualViewport) {
        const update = () => {
            const kv = window.visualViewport;
            const keyboardHeight = Math.max(0, window.innerHeight - kv.height);
            document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        };
        amountInput._vvListener = update;
        window.visualViewport.addEventListener('resize', update);
        update();
    }
}

function onAmountBlur() {
    document.body.classList.remove('keyboard-open');
    if (window.visualViewport && amountInput._vvListener) {
        window.visualViewport.removeEventListener('resize', amountInput._vvListener);
        delete amountInput._vvListener;
        document.documentElement.style.removeProperty('--keyboard-height');
    }
}

function onAmountInput(e) {
    let v = e.target.value.replace(/,/g, '.')
        .replace(/[^\d.]/g, '')
        .replace(/^0(\d)/, '0')
        .replace(/(\..*)\./g, '$1')

    if (v.includes('.')) {
        const [i, d] = v.split('.')
        v = i + '.' + d.slice(0, 2)
    }

    if (v === '0' && lastInputtedNumber.value !== '0.') {
        v = '0.'
    } else if (lastInputtedNumber.value === '0.' && v === '0') {
        v = ''
    }

    if (v === '.') {
        v = '0.'
    }

    if (v === '0.0') {
        // avoid user getting stuck with 0.0 — adjust to min if they intended 0
        v = '0.1'
    }

    const num = parseFloat(v)
    if (!isNaN(num) && num > 2000) {
        v = '2000'
        showWarning.value = true
    } else {
        showWarning.value = false
    }

    // set min warning flag if below min (but allow typing so user can reach min)
    showMinWarning.value = !isNaN(num) ? (num < minWithdraw) : false

    amount.value = v

    lastInputtedNumber.value = v
}

// compute whether amount > 0
const validAmount = computed(() => {
    const num = parseFloat(amount.value)
    return !isNaN(num) && num > 0
})

function close() {
    emit('update:modelValue', false)
    amount.value = ''
    showWarning.value = false
    showMinWarning.value = false
}

function onWithdraw() {
    // prevent emitting less than minWithdraw
    const n = parseFloat(amount.value)
    if (isNaN(n) || n < minWithdraw) {
        showMinWarning.value = true
        return
    }

    // emit numeric value (not string)
    emit('withdraw', Number(Math.round(n * 100) / 100))
    close()
}

function onMax() {
    // set maximum allowed value (balance may be string or number)
    const bal = Number(balance ?? 0)
    // if balance is less than minWithdraw, still set it (parent will show insufficient); keep UX predictable
    amount.value = (Number.isFinite(bal) ? String(Math.min(bal, 2000)) : String(2000))
    // update flags
    showWarning.value = Number(amount.value) > 2000
    showMinWarning.value = Number(amount.value) < minWithdraw
}

// numeric value of input (NaN if empty/invalid)
const amountNumber = computed(() => {
    const n = parseFloat(amount.value)
    return Number.isFinite(n) ? n : NaN
})

const netAmount = computed(() => {
    const a = amountNumber.value
    if (!Number.isFinite(a)) return 0
    const net = a
    // don't show negative
    return Math.max(0, Math.round((net + Number.EPSILON) * 100) / 100)
})

// formatted net amount, use 2 decimals and trim trailing zeros for neatness (e.g. "1.50" -> "1.5")
const netAmountFormatted = computed(() => {
    const n = netAmount.value
    // show 2 decimals if fractional, otherwise integer
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.00$/, '');
})
</script>

<style scoped>
/* Backdrop animation */
.backdrop-enter-active,
.backdrop-leave-active {
    transition: opacity 0.3s ease;
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
    background: rgba(0, 0, 0, 0.55);
    z-index: 1000;
}

/* Modal pop-in */
.modal-enter-active {
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.modal-leave-active {
    transition: transform 0.3s ease-in, opacity 0.3s ease-in;
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
    max-width: 400px;
    background: #292a2a;
    border-radius: 18px;
    color: #fff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    z-index: 1001;
    user-select: none;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1rem 0 1rem;
    font-size: 1.25rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.modal-header-description {
    display: block;
    font-size: 1.2rem;
    font-weight: 400;
}

.modal-header-description h2 {
    margin-bottom: 0;
    margin-top: -0.25rem;
    color: white;
    opacity: 1;
}

.modal-header-description span {
    opacity: 0.4;
    color: gray;
    font-size: 1.1rem;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 2.5rem;
    margin-top: -0.75rem;
    cursor: pointer;
    color: white;
}

.modal-body {
    padding: 0.75rem 0.5rem 0.25rem 0.5rem;
    text-align: center;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.connected-wallet {
    font-size: 1.2rem;
    color: #888;
}

.wallet-address {
    margin: 0.5rem 0;
    font-size: 1.3rem;
    font-weight: bold;
}

/* wrapper that contains input + absolute warning */
.input-warnings {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 0.5rem;
}

/* warning text (2000 TON) */
.warning-text {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    text-align: center;
    font-size: 1rem;
    color: rgb(171, 68, 68, 0.9);
    padding: 0;
    z-index: 1;
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
}

/* Commission hint wrapper: now part of normal flow and appears below the input (non-overlapping) */
.cut-wrapper {
    position: static;
    /* <-- important: not absolute anymore */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.6rem;
    /* space below the input */
    z-index: 1;
    pointer-events: none;
    width: 100%;
}

/* Use the same visual style as warning-text for consistency */
.cut-text {
    font-size: 0.8rem;
    color: rgba(173, 173, 173, 0.5);
    text-align: center;
    background: transparent;
    padding: 0;
    font-weight: 600;
}

/* Net amount line slightly bolder but still matches warning look */
.cut-net-text {
    font-size: 0.9rem;
    color: rgba(167, 167, 167, 0.5);
    text-align: center;
    font-weight: 700;
}

/* high-cut accent: subtle yellow background, but still in flow */
.cut-text.warning-high {
    color: rgba(246, 235, 113, 0.5);
    padding: 4px 8px;
    border-radius: 8px;
}

/* Wrapper ensures group is centered */
.amount-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    margin: 1rem 0;
}

/* keep input group normal flow (centred by wrapper) */
.amount-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
    z-index: 2;
}

/* Input width now based on number of characters */
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

/* Optional: scale down fonts on narrow screens so they fit */
@media (max-width: 420px) {
    .amount-input {
        font-size: 1.6rem;
        padding: 0.35rem;
    }

    .amount-currency {
        font-size: 1.15rem;
    }
}

/* remove spin buttons */
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* Currency label stays fixed beside input */
.amount-currency {
    font-size: 1.5rem;
    color: #aaa;
    opacity: 0.7;
    cursor: pointer;
    flex: 0 0 auto;
}

.limits-group {
    margin-bottom: 0.75rem;
}

.limit-line {
    display: flex;
    width: 97%;
    margin: auto auto;
    justify-content: space-between;
    padding: 3px;
    font-size: 1.2rem;
    font-weight: 400;
    font-family: "Inter", sans-serif;
}

.limit-description-item-one {
    color: rgb(217, 217, 217);
    opacity: 0.5;
}

.limit-description-item-two {
    text-align: center;
    text-justify: center;
}

.modal-footer {
    padding: 1rem;
}

.max-button {
    cursor: pointer;
    color: #0098EA;
}

.divider {
    height: 2px;
    width: 87%;
    margin: auto auto;
    background-color: gray;
    opacity: 0.7;
}

.action-btn {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: none;
    border-radius: 8px;
    background-color: #0098EA;
    color: #ffffff;
    cursor: pointer;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    transition: background-color 0.2s ease;
}

.action-btn:disabled {
    background-color: #006fba;
    cursor: not-allowed;
}
</style>
