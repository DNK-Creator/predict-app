<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="onClose" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="promocode-modal" role="dialog" aria-modal="true" aria-label="Promocode modal">
                <div class="referral-card">
                    <div class="header">
                        <div class="ref-header-image">
                            <img :src="StarsIcon" alt="" />
                        </div>
                        <button class="close-btn" @click="onClose" aria-label="Close">✖</button>
                    </div>

                    <h1 class="card-title">
                        {{ $t('apply-promo') }}
                    </h1>

                    <p class="ref-description">
                        {{ $t('get-bonus') }}
                    </p>

                    <div class="promo-input">
                        <input ref="promoEl" v-model="promoCode" @focus="onPromoFocus" @blur="onPromoBlur"
                            :maxlength="30" type="text" inputmode="text" :placeholder="defTextInput"
                            aria-label="Promo code" />
                    </div>

                    <div class="subscribe-container">
                        <h1 class="subscribe-description">{{ $t('have-to-sub') }} <span class="subcribe-link"
                                @click="openChannel">@n1kodev</span> </h1>
                    </div>

                    <div class="items-group">
                        <div class="buttons-group">
                            <!-- Left: Close -->
                            <button class="action-btn action-btn-left" type="button" @click="onClose"
                                :disabled="saving">
                                {{ $t('close') }}
                            </button>

                            <!-- Right: Emit promo -->
                            <button class="action-btn action-btn-right" type="button" @click="enterPromo"
                                :disabled="!canSubmit || saving">
                                {{ $t('apply') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/appStore'
import StarsIcon from '@/assets/icons/Stars_Icon.png'
import { useTelegram } from '@/services/telegram'

const { tg } = useTelegram()

function openChannel() {
    tg.openTelegramLink('https://t.me/n1kodev')
}

const props = defineProps({
    show: Boolean,
})

const emit = defineEmits(['close', 'enter-promo'])

// local state
const promoCode = ref('')
const saving = ref(false)

const app = useAppStore()
const defTextInput = computed(() => {
    return app.language === 'ru' ? 'Введите промокод' : 'Enter the promocode'
})

// reset when the modal opens/closes (keeps previous value when closed)
watch(
    () => props.show,
    (v) => {
        if (!v) {
            promoCode.value = ''
        }
    }
)

// computed-ish helper
const canSubmit = computed(() => promoCode.value.trim().length > 0 && !waitingBeforeAnother.value)

const waitingBeforeAnother = ref(false)

function onClose() {
    if (saving.value) return
    emit('close')
}

function enterPromo() {
    // guard using computed ref
    if (!canSubmit.value) return

    waitingBeforeAnother.value = true
    emit('enter-promo', promoCode.value.trim())

    setTimeout(() => {
        waitingBeforeAnother.value = false
    }, 3000)
}

// ref for input element (used by focus/blur handlers)
const promoEl = ref(null)

// keep track of visualViewport listener and RAF to avoid duplicates
const vvState = {
    listener: null,
    raf: 0
}

// helper to add keyboard-open behavior
function onPromoFocus() {
    // add body class that other components use
    document.body.classList.add('keyboard-open')

    // small delay helps avoid jitter while virtual keyboard animates
    setTimeout(() => {
        try {
            promoEl.value?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
        } catch (_) { }
    }, 80)

    if (window.visualViewport) {
        const update = () => {
            if (vvState.raf) cancelAnimationFrame(vvState.raf)
            vvState.raf = requestAnimationFrame(() => {
                const kv = window.visualViewport
                const keyboardHeight = Math.max(0, window.innerHeight - kv.height)
                // set CSS variable on root for layout adjustments
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
            })
        }
        vvState.listener = update
        window.visualViewport.addEventListener('resize', update, { passive: true })
        update()
    }
}

// helper to remove keyboard-open behavior when input loses focus
function onPromoBlur() {
    // small delay because the focus may immediately move to another input we care about
    setTimeout(() => {
        // if focus moved away from our promo input, clean up
        if (document.activeElement !== promoEl.value) {
            document.body.classList.remove('keyboard-open')
            if (window.visualViewport && vvState.listener) {
                window.visualViewport.removeEventListener('resize', vvState.listener)
                vvState.listener = null
                if (vvState.raf) {
                    cancelAnimationFrame(vvState.raf)
                    vvState.raf = 0
                }
                document.documentElement.style.removeProperty('--keyboard-height')
            }
        }
    }, 100)
}

// ensure cleanup if modal closes or component unmounts
function cleanupKeyboardState() {
    document.body.classList.remove('keyboard-open')
    if (window.visualViewport && vvState.listener) {
        try {
            window.visualViewport.removeEventListener('resize', vvState.listener)
        } catch (e) { /* ignore */ }
        vvState.listener = null
    }
    if (vvState.raf) {
        cancelAnimationFrame(vvState.raf)
        vvState.raf = 0
    }
    document.documentElement.style.removeProperty('--keyboard-height')
}

watch(
    () => props.show,
    (v) => {
        if (!v) {
            promoCode.value = ''
            // clean up keyboard listeners immediately when modal closes
            cleanupKeyboardState()
        }
    }
)

// ensure we clean when component unmounts entirely
onBeforeUnmount(() => {
    cleanupKeyboardState()
})
</script>

<style scoped>
/* overlay */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    z-index: 20;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.5);
}

/* modal */
.promocode-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: min(60vh, 400px);
    background: #292a2a;
    color: white;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 22;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    user-select: none;
    max-width: 480px;
    margin: auto;
}

/* header */
.close-btn {
    position: absolute;
    right: 30px;
    top: 26px;
    background: transparent;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: white;
}

/* card */
.referral-card {
    max-width: 480px;
    width: 85vw;
    margin: 0 auto;
    padding: 10px 12px;
    background-color: #292a2a;
    border-radius: 12px;
    color: #f9fafb;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 1rem;
    user-select: none;
}

.ref-header-image {
    display: flex;
    margin: 0.85rem;
    margin-top: 0;
    width: 60px;
    height: 60px;
    align-items: center;
    justify-content: center;
    background: linear-gradient(#5e5ce9, #336ac3);
    padding: 8px;
    border-radius: 20px;
}

.ref-header-image img {
    width: 50px;
    height: 50px;
    margin: auto;
}

.card-title {
    display: flex;
    align-items: center;
    font-size: 1.15rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
    text-align: center;
}

.ref-description {
    color: rgba(207, 207, 207, 0.88);
    text-align: center;
    width: 100%;
    margin-top: 0.1rem;
    margin-bottom: 0.5rem;
    font-family: "Montserrat", sans-serif;
    font-size: 1rem;
    font-weight: 600;
}

/* Promo input container */
.promo-input {
    width: 100%;
    display: flex;
    margin: auto auto;
    align-self: center;
    flex-direction: column;
    gap: 8px;
}

/* Styled input that matches button palette but reads as an input */
.promo-input input {
    display: flex;
    align-items: center;
    align-self: center;
    justify-self: center;
    margin: auto auto;
    width: 90%;
    padding: 12px 8px;
    border-radius: 12px;
    background-color: #3b3c3c;
    /* matches action button bg */
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.06);
    outline: none;
    font-size: 1rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

/* subtle focus */
.promo-input input:focus {
    box-shadow: 0 0 0 3px rgba(115, 59, 246, 0.12);
    border-color: rgba(115, 59, 246, 0.6);
}

/* char count smaller and subtle */
.char-count {
    font-size: 0.8rem;
    color: rgba(207, 207, 207, 0.7);
    text-align: right;
}

.items-group {
    width: 90%;
    margin: 1.25rem auto 0;
}

.subscribe-container {
    width: 90%;
    margin: 0.5rem auto 0;
}

.subscribe-description {
    text-align: center;
    text-justify: center;
    font-size: 0.95rem;
    color: rgb(194, 194, 194);
}

.subcribe-link {
    font-size: 0.95rem;
    color: rgb(73, 158, 242);
}

/* Buttons group: equal-width buttons, centered, small gap */
.buttons-group {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    align-items: center;
    justify-content: center;
}

/* base styles for both action buttons */
.action-btn {
    flex: 1 1 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    padding: 12px 14px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    text-align: center;
    height: 48px;
    min-width: 120px;
}

/* left button (close) — darker button */
.action-btn-left {
    background-color: #3b3c3c;
    color: white;
}

/* right button (apply) — prominent */
.action-btn-right {
    background-color: linear-gradient(90deg, #3b82f6, #733bf6);
    /* if the browser doesn't support gradient on button background we fallback */
    background: -webkit-linear-gradient(90deg, #3b82f6, #733bf6);
    color: white;
}

/* disabled visual style when deposit is blocked */
.action-btn-right.disabled,
.action-btn-right[disabled] {
    opacity: 0.5;
}

/* transitions */
.fade-enter-active,
.fade-leave-active {
    transition: background-color 300ms ease-out;
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

/* small responsive tweaks */
@media (max-height: 700px) {
    .card-title {
        font-size: 0.95rem;
    }

    .ref-description {
        font-size: 0.9rem;
    }

    .action-btn {
        font-size: 0.95rem;
    }
}
</style>
