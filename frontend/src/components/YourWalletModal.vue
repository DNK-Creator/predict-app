<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="close" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="wallet-info-modal">
                <div class="footer">
                    <h2>{{ $t('your-wallet') }}</h2>
                    <button class="close-btn" @click="close">✖</button>
                </div>
                <div class="items-group">
                    <h2 class="item-header">{{ $t('balance-caps') }}</h2>
                    <h1 v-if="balance" class="item-balance">
                        {{ balance }} TON
                    </h1>
                    <h1 v-else class="item-balance">
                        {{ $t('unknown') }}
                    </h1>
                </div>
                <div class="items-group">
                    <button class="wallet-item" @click="copyAddress">
                        <img class="wallet-icon" :src="WalletIcon" alt="wallet icon" />

                        <span v-if="!copied" class="wallet-text">
                            {{ shortenedAddress(address) }}
                        </span>
                        <span v-else class="wallet-text"> {{ $t('copied') }} </span>

                        <img class="copy-icon" :src="CopyIcon" alt="copy icon" />
                    </button>
                </div>
                <div class="items-group">
                    <div class="buttons-group">
                        <button class="action-btn-two" @click="reconnectWallet">
                            <span>{{ $t('reconnect') }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import CopyIcon from '@/assets/icons/Copy_Icon.png'
import WalletIcon from '@/assets/icons/Wallet_Icon_Blue.png'
import { ref, defineEmits, defineProps } from 'vue'

const props = defineProps({
    /** whether the modal is visible */
    show: Boolean,
    address: String,
    balance: Number,
})
const emit = defineEmits(['close', 'reconnect-wallet'])

function close() {
    emit('close')
}

function reconnectWallet() {
    emit('reconnect-wallet')
    close()
}

const copied = ref(false)

function shortenedAddress(addr) {
    return addr.slice(0, 6) + '...' + addr.slice(-6)
}

async function copyAddress() {
    try {
        await navigator.clipboard.writeText(props.address);
        if (copied.value === false) {
            setTimeout(() => {
                copied.value = false
            }, 1500);
        }
        copied.value = true
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
    z-index: 20;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(3px);
}

/* Modal container, 45vh tall, pinned bottom */
.wallet-info-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 38vh;
    background: #292a2a;
    color: White;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 22;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    user-select: none;
}

.wallet-info-modal h2 {
    margin: 0;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 3.5vh;
    font-size: 1.5rem;
}

.items-group {
    margin-bottom: 2vh;
}

.options-grid {
    display: grid;
    grid-auto-flow: column;
    width: 12rem;
    column-count: 2;
    margin-top: 0.75rem;
}

.option {
    display: flex;
    cursor: pointer;
    gap: 0.35rem;
    width: 5rem;
    height: 3rem;
    background-color: #3b3c3c;
    border-radius: 30px;
    border: none;
    color: white;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    font-size: 1rem;
    align-items: center;
    justify-content: center;
    transition: background-color 200ms, color 200ms;
}

/* active state */
.option.active {
    background-color: white;
    color: black;
}

.option img {
    height: 1.5rem;
    width: 1.5rem;
}

.option span {
    text-justify: center;
}

.buttons-group {
    display: flex;
    gap: 0.75rem;
    width: 100%;
    margin: auto auto;
    margin-top: 2.5rem;
}

.action-btn-two {
    flex: 1 1 auto;
    /* grow to fill remaining space */
    gap: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 16px;
    padding: 15px;
}

.action-btn-two span {
    font-size: 1.25rem;
    color: black;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* full-width button with spacing & truncation */
.wallet-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background-color: #323333;
    border-color: #3b3c3c;
    border-radius: 12px;
    cursor: pointer;
}

/* left icon */
.wallet-icon {
    width: 1.5rem;
    height: 1.5rem;
}

/* center text: truncate if too long */
.wallet-text {
    flex: 1;
    margin: 0 0.75rem;
    color: white;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* right “copy” icon */
.copy-icon {
    width: 1.25rem;
    height: 1.25rem;
    opacity: 0.8;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: white;
}

.item-header {
    opacity: 0.5;
    font-size: 1.3rem;
    color: rgb(209, 209, 209);
    margin-bottom: 0;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.item-balance {
    font-weight: 400;
    margin-top: 0.5rem;
}

/* FADE TRANSITION FOR OVERLAY OPACITY */
.fade-enter-active,
.fade-leave-active {
    transition:
        background-color 300ms ease-out,
        backdrop-filter 300ms ease-out;
}

.fade-enter-from,
.fade-leave-to {
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
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
