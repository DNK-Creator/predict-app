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
                    <h2>Пополнить</h2>
                    <span>Пополнение в TON</span>
                </div>
                <button class="close-btn" @click="close">×</button>
            </header>
            <section class="modal-body">
                <p class="connected-wallet">Подключённый кошелёк</p>
                <p class="wallet-address">{{ shortenedAddress }}</p>

                <!-- CENTERED FLEX GROUP -->
                <div class="amount-wrapper">
                    <div class="amount-group">
                        <input ref="amountInput" v-model="amount" type="text" inputmode="decimal" placeholder="0"
                            class="amount-input" @input="onAmountInput" :size="amount.length > 0 ? amount.length : 1" />
                        <span class="amount-currency" @click="focusAmountInput">TON</span>
                    </div>
                </div>

            </section>
            <footer class="modal-footer">
                <button class="action-btn" :disabled="!validAmount" @click="onDepositTon">Пополнить</button>
                <button class="action-btn" :disabled="!validAmount" @click="onDepositStars">Пополнить Stars</button>
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
})
// defineEmits returns the emit function
const emit = defineEmits(['update:modelValue', 'deposit', 'deposit-stars'])

// Local state for user input
const amount = ref('')

const lastInputtedNumber = ref('')

// grab a ref to the input element
const amountInput = ref(null)

// called when user clicks “TON”
function focusAmountInput() {
    // focus the input so the keyboard appears & the cursor is active
    if (amountInput.value) {
        amountInput.value.focus()
    }
}

// sanitize + format input
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

    if (v === '0.00') {
        v = '0.01'
    }

    const num = parseFloat(v)
    if (!isNaN(num) && num > 99999) v = '99999'
    amount.value = v

    lastInputtedNumber.value = v
}

// compute whether amount > 0
const validAmount = computed(() => {
    const num = parseFloat(amount.value)
    return !isNaN(num) && num > 0
})

const shortenedAddress = computed(() => {
    if (!address) return ''
    return `${address.slice(0, 4)}...${address.slice(-3)}`
})

function close() {
    emit('update:modelValue', false)
    amount.value = ''
}

function onDepositTon() {
    // pass amount back to parent
    emit('deposit', amount.value)
}

function onDepositStars() {
    // pass amount back to parent
    emit('deposit-stars', amount.value)
}

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
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(5px);
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
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1rem 0 1rem;
    font-size: 1.25rem;
    font-family: Inter;
}

.modal-header-description {
    display: block;
    font-size: 1rem;
    font-weight: 400;
}

.modal-header-description h2 {
    margin-bottom: 0;
    margin-top: -0.25rem;
    color: white;
    opacity: 1;
}

.modal-header-description span {
    opacity: 0.5;
    color: gray;
    font-size: 0.9rem;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 2.25rem;
    margin-top: -0.75rem;
    cursor: pointer;
    color: white;
}

.modal-body {
    padding: 0.75rem 0.5rem 0.25rem 0.5rem;
    text-align: center;
    font-family: Inter;
}

.connected-wallet {
    font-size: 0.85rem;
    color: #888;
}

.wallet-address {
    margin: 0.5rem 0;
    font-size: 1rem;
    font-weight: bold;
}

/* Wrapper ensures group is centered */
.amount-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    margin: 1rem 0;
}

/* Inline-flex so input + TON sit side by side */
.amount-group {
    display: inline-flex;
    align-items: center;
}

/* Auto-sizing, no max-width → grows/shrinks around content */
.amount-input {
    display: inline-block;
    width: fit-content;
    min-width: 1ch;
    /* always at least room for “0” */
    padding: 0.5rem;
    font-size: 2.25rem;
    color: white;
    background: #292a2a;
    text-align: center;
    border: none;
    outline: none;
    appearance: textfield;
    font-family: inherit;
    margin-left: -2rem;
}

/* remove spin buttons */
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.amount-currency {
    margin-left: -2.5rem;
    font-size: 1.5rem;
    color: #aaa;
    opacity: 0.7;
}


.modal-footer {
    padding: 1rem;
}

/* footer button */
.action-btn {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: none;
    border-radius: 8px;
    background-color: #0098EA;
    color: #ffffff;
    cursor: pointer;
    font-family: Inter;
    transition: background-color 0.2s ease;
}

.action-btn:disabled {
    background-color: #006fba;
    cursor: not-allowed;
}
</style>