<template>
    <Transition name="fade">
        <div v-if="visible" class="modal-overlay" @click.self="close">
            <div class="modal-container">
                <button class="modal-close" @click="close">×</button>

                <!-- Header -->
                <div class="modal-header">
                    <div class="modal-header-left">
                        <img :src="bet.image_path" alt="logo" class="modal-logo" />
                        <span class="modal-title">{{ bet.name }}</span>
                    </div>
                    <span class="modal-side" :class="side">{{ sideText }}</span>
                </div>

                <!-- Amount Input -->
                <div class="modal-input-wrapper">
                    <input type="number" v-model.number="betAmount" min="0" class="modal-input" placeholder="0" />
                    <div class="modal-step-controls">
                        <button @click="decreaseAmount" class="step-btn">−</button>
                        <button @click="increaseAmount" class="step-btn">+</button>
                    </div>
                </div>

                <!-- Win Info -->
                <div v-if="betAmount > 0" class="modal-win">
                    To win ${{ (betAmount * odds).toFixed(2) }}
                </div>

                <!-- Quick Add -->
                <div class="modal-quick">
                    <button @click="quickAdd(1)">+1$</button>
                    <button @click="quickAdd(20)">+20$</button>
                    <button @click="quickAdd(100)">+100$</button>
                </div>

                <!-- Place Bet -->
                <button class="modal-place-btn" @click="placeBet" :disabled="betAmount === 0 || loading">
                    {{ loading ? 'Placing…' : 'Bet' }}
                </button>
            </div>
        </div>
    </Transition>
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

const betAmount = ref(0)
const loading = ref(false)

const sideText = computed(() => (props.side === 'yes' ? 'YES' : 'NO'))
const odds = computed(() => 2.0) // placeholder

watch(() => props.visible, (v) => {
    if (v) betAmount.value = 0
})

function increaseAmount() { betAmount.value++ }
function decreaseAmount() { if (betAmount.value > 0) betAmount.value-- }
function quickAdd(n) { betAmount.value += n }
function close() { emit('close') }

async function placeBet() {
    if (!betAmount.value || loading.value) return
    loading.value = true
    try {
        await placeBetRequest(props.bet.id, props.side, betAmount.value)
        toast.success('Bet placed successfully!')
        emit('placed', { side: props.side, amount: betAmount.value })
        app.points -= betAmount.value
        close()
    } catch (err) {
        toast.error(err.message || 'Failed to place bet')
    } finally {
        loading.value = false
    }
}
</script>

<style lang="css" scoped>
/* Overlay & Container */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-container {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    width: 90%;
    max-width: 400px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

/* Close Button */
.modal-close {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 24px;
    line-height: 1;
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    transition: color 0.2s;
}

.modal-close:hover {
    color: #000;
}

/* Header */
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #eee;
    padding-bottom: 16px;
    margin-bottom: 24px;
}

.modal-header-left {
    display: flex;
    align-items: center;
}

.modal-logo {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    object-fit: cover;
}

.modal-title {
    margin-left: 12px;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
}

.modal-side {
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
}

.modal-side.yes {
    color: #3c884d;
}

.modal-side.no {
    color: #d04f4f;
}

/* Input & Controls */
.modal-input-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 16px;
}

.modal-input {
    width: 50%;
    font-size: 2.5rem;
    text-align: center;
    border: none;
    border-bottom: 2px solid #ddd;
    outline: none;
    padding: 4px 0;
    color: #333;
}

.modal-input:focus {
    border-color: #aaa;
}

.modal-step-controls {
    display: flex;
    gap: 32px;
    margin-top: 8px;
}

.step-btn {
    font-size: 2rem;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    transition: color 0.2s;
}

.step-btn:hover {
    color: #000;
}

/* Win text */
.modal-win {
    background: #f5f5f5;
    text-align: center;
    font-size: 0.9rem;
    padding: 8px;
    border-radius: 8px;
    margin-bottom: 16px;
    color: #444;
}

/* Quick add */
.modal-quick {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
}

.modal-quick button {
    flex: 1;
    background: #f0f0f0;
    border: none;
    border-radius: 8px;
    padding: 8px 0;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
}

.modal-quick button:hover {
    background: #e0e0e0;
}

/* Place Bet */
.modal-place-btn {
    width: 100%;
    background: #0066cc;
    color: #fff;
    border: none;
    padding: 14px 0;
    font-size: 1.05rem;
    font-weight: 700;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
}

.modal-place-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.modal-place-btn:not(:disabled):hover {
    background: #005bb5;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
