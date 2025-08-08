<template>
    <transition name="backdrop" appear>
        <div v-if="visible" class="overlay" @click.self="close">
            <!-- Blur and fade mask -->
        </div>
    </transition>

    <transition name="modal" appear>
        <div v-if="visible" class="modal-container">
            <header class="modal-header">
                <div class="modal-header-description">
                    <h2>{{ bet.name }}</h2>
                    <span>Предсказываем..</span>
                </div>
                <button class="close-btn" @click="close">×</button>
            </header>
            <section class="modal-body">
                <p class="connected-wallet">Ставка на "{{ sideText }}"</p>

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
                <button class="action-btn" :disabled="!validAmount" @click="placeBet">
                    {{ loading ? 'Обрабатываем..' : 'Поставить' }}
                </button>
            </footer>
        </div>
    </transition>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
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

// Local state for user input
const amount = ref('0')

const lastInputtedNumber = ref('0')

// grab a ref to the input element
const amountInput = ref(null)

const loading = ref(false)

const sideText = computed(() => (props.side === 'Yes' ? 'Yes' : 'No'))
const odds = computed(() => 2.0) // placeholder

watch(() => props.visible, v => {
    if (v) {
        amount.value = '0'
        lastInputtedNumber.value = '0'
    }
})

function increaseAmount() { amount.value++ }
function decreaseAmount() { if (amount.value > 0) amount.value-- }
function quickAdd(n) { amount.value += n }
function close() { emit('close') }

// called when user clicks “TON”
function focusAmountInput() {
    // focus the input so the keyboard appears & the cursor is active
    if (amountInput.value) {
        amountInput.value.focus()
    }
}

function onAmountInput(e) {
    let v = e.target.value
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '')
        .replace(/(\..*)\./g, '$1')

    if (v.includes('.')) {
        const [i, d] = v.split('.')
        v = i + '.' + d.slice(0, 2)
    }

    // collapse leading “0x” without dot → “x”
    if (/^0[1-9]$/.test(v)) {
        v = v[1]
    }

    // handle the “0 → 0.” transition
    if (v === '0' && lastInputtedNumber.value !== '0.') {
        v = '0.'
    }
    else if (lastInputtedNumber.value === '0.' && v === '0') {
        v = ''
    }

    if (v === '.') {
        v = '0.'
    }
    if (v === '0.00') {
        v = '0.01'
    }

    const num = parseFloat(v)
    if (!isNaN(num) && num > 99999) {
        v = '99999'
    }

    amount.value = v
    lastInputtedNumber.value = v   // <-- use the same ref
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
        toast.success('Bet placed successfully!')
        emit('placed', { side: props.side, amount: +amount.value })
        app.points -= Number(amount.value)
        close()
    } catch (err) {
        toast.error(err.message || 'Failed to place bet')
    } finally {
        loading.value = false
    }
}
</script>

<style scoped>
/* Backdrop animation */
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

/* Modal pop-in */
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
    font-size: 1.5rem;
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
    transition: background-color 0.1s ease;
}

.action-btn:disabled {
    background-color: #006fba;
    cursor: not-allowed;
}
</style>