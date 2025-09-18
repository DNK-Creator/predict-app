<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="visible" class="overlay overlay--visible" @click.self="close"></div>
        </transition>

        <!-- modal -->
        <transition name="slide-up" @before-enter="$emit('anim-start')" @after-enter="$emit('anim-end')"
            @before-leave="$emit('anim-start')" @after-leave="$emit('anim-end')">

            <div v-if="visible" class="settings-modal">
                <div class="divider"></div>

                <div class="settings-modal__body" ref="modalBody">
                    <div class="modal-footer">
                        <h2>{{ $t('balance-top-up') }}</h2>
                    </div>

                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedDeposit === 'TON' }"
                            @click="selectDeposit('TON')">
                            <span>TON</span>
                        </button>
                        <button class="option" :class="{ active: selectedDeposit === 'GIFTS' }"
                            @click="selectDeposit('GIFTS')">
                            <span>{{ $t('by-gifts') }}</span>
                        </button>
                        <button class="option" :class="{ active: selectedDeposit === 'STARS' }"
                            @click="selectDeposit('STARS')">
                            <span>{{ $t('by-stars') }}</span>
                        </button>
                    </div>

                    <div class="deposit-method-visual">
                        <!-- note: we add three containers -->
                        <div class="deposit-method-container" v-show="selectedDeposit === 'TON'">
                            <div ref="svgContainerOne" class="media-method"> </div>
                            <div class="description-texts">
                                <span v-if="!address" class="deposit-text-info-two">{{ $t('deposit-ton-connect')
                                }}</span>
                                <span v-else="!address" class="deposit-text-info-two">{{ $t('connected-balance') }} {{
                                    balance }} TON</span>
                            </div>
                            <!-- Starting Deposit Fields container for TON -->
                            <section class="deposit-ton-body">
                                <div v-if="!address" class="wallet-connect-container" @click="connectNewWallet">
                                    <img :src="tonIcon" class="wallet-address-icon">
                                    <p class="wallet-address">{{ $t('connect-wallet') }} </p>
                                </div>
                                <div v-else class="wallet-address-container" @click="$emit('open-wallet-info')">
                                    <img :src="walletIcon" class="wallet-address-icon">
                                    <p class="wallet-address">{{ shortenedAddress }}</p>
                                </div>

                                <!-- CENTERED FLEX GROUP -->
                                <div class="amount-wrapper">
                                    <div class="amount-group">
                                        <!-- TON input -->
                                        <input ref="amountInputTon" v-model="amount" type="text" inputmode="decimal"
                                            placeholder="0" class="amount-input" @input="onAmountInput"
                                            @focus="onAmountFocus" @blur="onAmountBlur"
                                            :size="amount.length > 0 ? amount.length : 1"
                                            :style="{ '--chars': (amount && amount.length) ? amount.length : 1 }" />
                                        <span class="amount-currency" @click="focusAmountInput">TON</span>
                                    </div>
                                </div>

                            </section>
                            <!-- Ending Deposit for TON -->
                        </div>

                        <!-- STARTING Deposit for Stars -->
                        <div class="deposit-method-container" v-show="selectedDeposit === 'STARS'">
                            <div ref="svgContainerThree" class="media-method"> </div>
                            <div class="description-texts">
                                <span class="deposit-text-info">{{ $t('stars-deposit-info') }}</span>
                            </div>
                            <!-- Starting Deposit Fields container for TON -->
                            <section class="deposit-ton-body">

                                <div class="top-info-gifts">
                                    <button class="list-button">
                                        {{ $t('stars-deposit-instruction') }}</button>
                                </div>

                                <!-- CENTERED FLEX GROUP -->
                                <div class="amount-wrapper">
                                    <div class="input-warnings">
                                        <div class="amount-group">
                                            <!-- STARS input -->
                                            <input ref="amountInputStars" v-model="amount" type="text"
                                                inputmode="numeric" pattern="[0-9]*" placeholder="0"
                                                class="amount-input" @input="onAmountStarsInput" @focus="onAmountFocus"
                                                @blur="onAmountStarsBlur" :size="amount.length > 0 ? amount.length : 1"
                                                :style="{ '--chars': (amount && amount.length) ? amount.length : 1 }" />
                                            <img :src="StarIcon" class="amount-currency-star" @click="focusAmountInput">
                                        </div>
                                        <span class="converted-ton">~{{ starsConvertedTon }} TON</span>
                                        <span v-if="starsWarn" class="warning-text" role="alert" aria-live="polite">
                                            {{ $t('stars-limit') }}
                                        </span>
                                    </div>
                                </div>

                            </section>
                            <!-- Ending Deposit for STARS -->
                        </div>

                        <div class="deposit-method-container" v-show="selectedDeposit === 'GIFTS'">
                            <div ref="svgContainerTwo" class="media-method"> </div>
                            <div class="description-texts">
                                <div class="top-info-gifts">
                                    <span class="deposit-text-info">{{ $t('gifts-deposit-instruction-one') }}</span>
                                    <button class="bot-button" @click="openRelayerChat">@GiftsPredictRelayer</button>
                                </div>
                                <div class="top-info-gifts">
                                    <button class="list-button" @click="$emit('open-prices')">{{
                                        $t('gifts-deposit-instruction-two') }}</button>
                                </div>
                                <span class="deposit-text-info">{{ $t('gifts-deposit-instruction-three') }}</span>
                            </div>
                        </div>
                    </div>

                </div>

                <div class="buttons-group">
                    <!-- wire the handlers so we can animate and debounce -->
                    <button type="button" class="action-btn-one" :class="{ pressed: pressingBtn === 'one' }"
                        @click="onBtnOneClick">
                        {{ $t('close') }}
                    </button>

                    <button type="button" v-if="selectedDeposit === 'TON'" class="action-btn-two"
                        :class="{ pressed: pressingBtn === 'two', disabled: depositBlocked }" :disabled="depositBlocked"
                        @click="onBtnTwoClick">
                        <span>{{ actionText }}</span>
                    </button>

                    <button type="button" v-if="selectedDeposit === 'GIFTS'" class="action-btn-two"
                        :class="{ pressed: pressingBtn === 'two' }" @click="onBtnTwoClick">
                        <span>{{ actionText }}</span>
                    </button>

                    <button type="button" v-if="selectedDeposit === 'STARS'" class="action-btn-two"
                        :class="{ pressed: pressingBtn === 'two' }" @click="onBtnTwoClick">
                        <span>{{ actionText }}</span>
                    </button>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted, computed, onDeactivated, toRef, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import lottie from 'lottie-web'
import pako from 'pako'
import TonMedia from '@/assets/EmptyGift2.tgs'
import GiftMedia from '@/assets/DurovsCap.tgs'
import StarsMedia from '@/assets/LootBag.tgs'
import walletIcon from '@/assets/icons/Wallet_Icon_Gray.png'
import tonIcon from '@/assets/icons/TON_White_Icon.png'
import StarIcon from '@/assets/icons/Star.png'

const app = useAppStore()

// keep props reactive: use toRef to avoid breaking reactivity
const props = defineProps({
    modelValue: Boolean,
    address: String,
    balance: [Number, String],
    transactionLimit: [Number, String],
    dailyLimit: [Number, String],
    dailyUsed: [Number, String],
})
const modelValue = toRef(props, 'modelValue')
const address = toRef(props, 'address')
const balance = toRef(props, 'balance')

// add near top of script setup, alongside other locals
let vvResizeListener = null
let windowResizeListener = null

const { tg } = useTelegram()

const emit = defineEmits(['update:modelValue', 'deposit-stars', 'open-wallet-info', 'open-prices', 'close', 'anim-start', 'anim-end', 'connect-new-wallet', 'deposit']) // keep update:modelValue for v-model support

const starsConvertedTon = computed(() => Number(amount.value / 250).toFixed(2))

const selectedDeposit = ref('TON')
const svgContainerOne = ref(null)
const svgContainerTwo = ref(null)
const svgContainerThree = ref(null)

let animOne = null
let animTwo = null
let animThree = null
const parsedTgsCache = {} // key: media (import string/module), value: parsed json

const lastInputtedNumber = ref('')
const amountInputTon = ref(null)
const amountInputStars = ref(null)
const modalBody = ref(null)
const amount = ref('')

const route = useRoute()
const overlayHideRoute = ['bets-history', 'gifts-prices']

const hideOverlay = computed(() =>
    overlayHideRoute.includes(route.name)
)

const visible = computed(() => modelValue.value === true && hideOverlay.value === false)

const starsWarn = ref(false)

// Button press animation state
const pressingBtn = ref(null)
function triggerPress(which, duration = 180) {
    pressingBtn.value = which
    // clear previous timer if any — using setTimeout is fine here
    setTimeout(() => {
        if (pressingBtn.value === which) pressingBtn.value = null
    }, duration)
}

// deposit block (3s after emitting a deposit)
const depositBlocked = ref(false)
function blockDepositFor(ms = 3000) {
    depositBlocked.value = true
    setTimeout(() => { depositBlocked.value = false }, ms)
}

watch(visible, (v) => {
    console.log('[DepositsModalTwo] visible changed ->', v)
})

function sendDepositRequest() {
    // If blocked, early-return — caller handles animation
    if (depositBlocked.value) return

    emit('deposit', amount.value)
    // start 3 second block after emitting
    blockDepositFor(3000)
}


function sendStarsRequest() {
    // If blocked, early-return — caller handles animation
    if (depositBlocked.value) return
    if (amount.value < 50) {
        starsWarn.value = true

        setTimeout(() => {
            starsWarn.value = false
        }, 3000);

        return
    }

    emit('deposit-stars', amount.value)
    // start 3 second block after emitting
    blockDepositFor(3000)
}

function openRelayerChat() {
    tg.openTelegramLink('https://t.me/giftspredictrelayer')
}

// handlers that animate then perform action
async function onBtnOneClick() {
    triggerPress('one')
    // allow the press animation to be visible
    await new Promise(r => setTimeout(r, 140))
    close()
}

async function onBtnTwoClick() {
    triggerPress('two')
    // short delay to let animation show
    await new Promise(r => setTimeout(r, 140))

    if (selectedDeposit.value === 'TON') {
        // deposit: send only if not blocked
        if (depositBlocked.value) return
        sendDepositRequest()
    } else if (selectedDeposit.value === 'GIFTS') {
        openRelayerChat()
    }
    else {
        sendStarsRequest()
    }
}

async function scrollModalToBottom(smooth = true, inputEl = null) {
    const el = modalBody.value
    // prefer provided element, otherwise pick by selectedDeposit
    const input = inputEl ?? (selectedDeposit.value === 'TON' ? amountInputTon.value : amountInputStars.value)

    if (!el) return

    await nextTick()
    await new Promise((r) => requestAnimationFrame(r))

    let buttonsHeight = 0
    try {
        const settingsRoot = el.closest('.settings-modal') || el.parentElement
        const buttonsEl = settingsRoot ? settingsRoot.querySelector('.buttons-group') : null
        if (buttonsEl) {
            buttonsHeight = Math.round(buttonsEl.getBoundingClientRect().height) || 0
        }
    } catch (e) {
        buttonsHeight = 0
    }

    if (!input) {
        const kb = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0
        const fallbackTop = Math.max(0, el.scrollHeight - el.clientHeight + kb + buttonsHeight + 8)
        if (smooth && el.scrollTo) el.scrollTo({ top: fallbackTop, behavior: 'smooth' })
        else el.scrollTop = fallbackTop
        return
    }

    const elRect = el.getBoundingClientRect()
    const inputRect = input.getBoundingClientRect()

    const inputOffsetTop = inputRect.top - elRect.top + el.scrollTop

    const keyboardHeight = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) :
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0

    const desiredBottomGap = 16

    const desiredTop = Math.max(
        0,
        Math.round(
            inputOffsetTop - (el.clientHeight - inputRect.height) + keyboardHeight + desiredBottomGap + buttonsHeight
        )
    )

    if (smooth && el.scrollTo) {
        el.scrollTo({ top: desiredTop, behavior: 'smooth' })
    } else {
        el.scrollTop = desiredTop
    }
}

function focusAmountInput() {
    const input = selectedDeposit.value === 'TON' ? amountInputTon.value : amountInputStars.value
    if (input && typeof input.focus === 'function') {
        input.focus()
    }
}

function onAmountFocus(e) {
    document.body.classList.add('keyboard-open')

    // get the actual focused element (event target is most reliable)
    const focusedEl = e?.target ?? (selectedDeposit.value === 'TON' ? amountInputTon.value : amountInputStars.value)

    // run initial scroll after short delay to let keyboard show
    setTimeout(() => {
        try {
            focusedEl?.scrollIntoView({ behavior: 'smooth', block: 'end' })
        } catch (_) { }
        scrollModalToBottom(true, focusedEl)
    }, 140) // lowered from 400 to ~140ms

    if (window.visualViewport) {
        if (!vvResizeListener) {
            vvResizeListener = () => {
                const kv = window.visualViewport
                const kbHeight = Math.max(0, window.innerHeight - kv.height)
                document.documentElement.style.setProperty('--keyboard-height', `${kbHeight}px`)
                // prefer to pass the focused element so it always measures the correct target
                scrollModalToBottom(false, focusedEl)
            }
            window.visualViewport.addEventListener('resize', vvResizeListener)
        }
        vvResizeListener()
    } else {
        if (!windowResizeListener) {
            windowResizeListener = () => {
                setTimeout(() => scrollModalToBottom(false, focusedEl), 200)
            }
            window.addEventListener('resize', windowResizeListener)
        }
    }
}

function onAmountBlur() {
    document.body.classList.remove('keyboard-open')

    if (window.visualViewport && vvResizeListener) {
        try { window.visualViewport.removeEventListener('resize', vvResizeListener) } catch (e) { /* ignore */ }
        vvResizeListener = null
    }
    if (windowResizeListener) {
        try { window.removeEventListener('resize', windowResizeListener) } catch (e) { /* ignore */ }
        windowResizeListener = null
    }

    document.documentElement.style.removeProperty('--keyboard-height')
}

function onAmountStarsBlur() {
    document.body.classList.remove('keyboard-open')

    if (window.visualViewport && vvResizeListener) {
        try { window.visualViewport.removeEventListener('resize', vvResizeListener) } catch (e) { /* ignore */ }
        vvResizeListener = null
    }
    if (windowResizeListener) {
        try { window.removeEventListener('resize', windowResizeListener) } catch (e) { /* ignore */ }
        windowResizeListener = null
    }

    document.documentElement.style.removeProperty('--keyboard-height')

    if (!amount.value) return
    let n = Number(amount.value)
    if (!Number.isFinite(n) || isNaN(n) || n <= 0) {
        amount.value = ''   // or set to '1' if you prefer a minimum
    } else if (n > 2500) {
        amount.value = '2500'
    } else {
        amount.value = String(Math.floor(n))
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

    if (v === '0.00') {
        v = '0.01'
    }

    const num = parseFloat(v)
    if (!isNaN(num) && num > 99999) v = '99999'
    amount.value = v

    lastInputtedNumber.value = v
}

function onAmountStarsInput(e) {
    // raw typed string
    const raw = String(e.target?.value ?? '')

    // 1) keep only digits
    let cleaned = raw.replace(/\D+/g, '')

    // 2) remove leading zeros but keep single "0" if that's all the user typed
    //    e.g. "000" -> "0", "0012" -> "12"
    if (cleaned.length > 1) cleaned = cleaned.replace(/^0+/, '')

    // 3) if empty, allow empty (user cleared input)
    if (cleaned === '') {
        amount.value = ''
        lastInputtedNumber.value = ''
        return
    }

    // 4) parse integer and clamp to max 2500
    let n = parseInt(cleaned, 10)
    if (!Number.isFinite(n) || isNaN(n)) {
        amount.value = ''
        lastInputtedNumber.value = ''
        return
    }

    if (n > 2500) n = 2500

    // write back normalized integer string
    const out = String(n)
    amount.value = out
    lastInputtedNumber.value = out
}

onBeforeUnmount(() => {
    if (window.visualViewport && vvResizeListener) {
        try { window.visualViewport.removeEventListener('resize', vvResizeListener) } catch (e) { /* ignore */ }
        vvResizeListener = null
    }
    if (windowResizeListener) {
        try { window.removeEventListener('resize', windowResizeListener) } catch (e) { /* ignore */ }
        windowResizeListener = null
    }
})

const shortenedAddress = computed(() => {
    if (!address) return ''
    if (!address.value) return ''
    return `${address.value.slice(0, 4)}...${address.value.slice(-3)}`
})
const actionText = computed(() => {
    if (app.language === 'ru') {
        if (selectedDeposit.value === 'TON' || selectedDeposit.value === 'STARS') {
            return 'Пополнить'
        } else {
            return 'Отправить подарок'
        }
    }
    else {
        if (selectedDeposit.value === 'TON' || selectedDeposit.value === 'STARS') {
            return 'Deposit'
        } else {
            return 'Send a gift'
        }
    }
})

function selectDeposit(code) {
    selectedDeposit.value = code
    amount.value = ''
    if (animOne && animTwo) {
        if (code === 'TON') {
            animOne.play()
            if (animThree) animThree.stop()
            if (animTwo) animTwo.stop()
        }
        else if (code === 'GIFTS') {
            animOne.stop()
            animTwo.play()
            if (animThree) animThree.stop()
        }
        else {
            animOne.stop()
            animTwo.stop()
            if (animThree) animThree.play()
        }
    }
}

async function loadTgsJson(url) {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('Failed to fetch TGS: ' + resp.status)
    const buffer = await resp.arrayBuffer()
    const jsonStr = pako.inflate(new Uint8Array(buffer), { to: 'string' })
    return JSON.parse(jsonStr)
}

async function ensureTgs(media) {
    if (!parsedTgsCache[media]) {
        parsedTgsCache[media] = await loadTgsJson(media)
    }
    return parsedTgsCache[media]
}

function destroyAnims() {
    if (animOne && typeof animOne.destroy === 'function') { animOne.destroy(); animOne = null }
    if (animTwo && typeof animTwo.destroy === 'function') { animTwo.destroy(); animTwo = null }
}

async function initAnimations() {
    await nextTick()

    try {
        const data = await ensureTgs(TonMedia)

        destroyAnims()

        if (svgContainerOne.value) {
            animOne = lottie.loadAnimation({
                container: svgContainerOne.value,
                renderer: 'svg',
                loop: true,
                autoplay: false,
                animationData: data
            })
        }

        const dataSecond = await ensureTgs(GiftMedia)
        if (svgContainerTwo.value) {
            animTwo = lottie.loadAnimation({
                container: svgContainerTwo.value,
                renderer: 'svg',
                loop: true,
                autoplay: false,
                animationData: dataSecond
            })
        }

        const dataThird = await ensureTgs(StarsMedia)
        if (svgContainerThree.value) {
            animThree = lottie.loadAnimation({
                container: svgContainerThree.value,
                renderer: 'svg',
                loop: true,
                autoplay: false,
                animationData: dataThird
            })
        }

        if (animOne) {
            if (selectedDeposit.value === 'TON') {
                animOne.play()
                if (animTwo) animTwo.stop()
            } else if (selectDeposit.value === 'GIFTS') {
                animOne.stop()
                if (animThree) animThree.stop()
                if (animTwo) animTwo.play()
            } else {
                animOne.stop()
                if (animTwo) animTwo.stop()
                if (animThree) animThree.play()
            }
        }
    } catch (err) {
        console.error('Animation load failed', err)
    }
}

watch(
    visible,
    async (isVisible) => {
        console.log('[DepositsModalTwo] visible ->', isVisible)
        if (isVisible) {
            await initAnimations()
        } else {
            destroyAnims()
        }
    },
    { immediate: true }
)

onUnmounted(() => {
    destroyAnims()
})

onDeactivated(() => {
    destroyAnims()
})

function close() {
    emit('update:modelValue', false)
    emit('close')
}

function connectNewWallet() {
    emit('connect-new-wallet')
}
</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
    z-index: 10;
    user-select: none;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(3px);
}

/* Modal container, 45vh tall, pinned bottom */
.settings-modal {
    display: flex;
    flex-direction: column;
    align-self: center;
    margin: auto auto;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 75vh;
    max-width: 620px;
    background: #292a2a;
    color: White;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    padding-top: 15px;
    padding-bottom: 1rem;
    box-sizing: border-box;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 12;
    user-select: none;
}

/* body grows and scrolls when content exceeds available space */
.settings-modal__body {
    flex: 1 1 auto;
    overflow: auto;
    padding-bottom: 0.5rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding-bottom: calc(1rem + var(--keyboard-height, 0px));
}

.settings-modal__body::-webkit-scrollbar {
    width: 0;
    height: 0;
    background: transparent;
}

.settings-modal h2 {
    margin: 0;
}

.divider {
    height: 2.5px;
    border-radius: 2px;
    width: 20%;
    margin: auto auto;
    background-color: #31343b;
    margin-bottom: 1.25rem;
}

.modal-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2vh;
    font-size: 1rem;
    text-align: center;
}

.modal-footer h2 {
    width: 200px;
}

.items-group {
    margin-bottom: 2vh;
}

.options-grid {
    display: grid;
    grid-auto-flow: column;
    margin: auto auto;
    width: 100%;
    column-count: 3;
    margin-top: 0.75rem;
    align-content: center;
    justify-content: center;
    gap: 8px;
}

.option {
    display: flex;
    cursor: pointer;
    gap: 0.35rem;
    width: 6rem;
    height: 2.5rem;
    background-color: #3b3c3c;
    border-radius: 10px;
    border: none;
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    align-items: center;
    justify-content: center;
    transition: background-color 200ms, color 200ms;
}

.option.active {
    background-color: #3b82f6;
    color: white;
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
    --btn-gap: 0.75rem;
    gap: var(--btn-gap);

    width: 100%;
    margin: auto auto;
    margin-top: 0;
    margin-bottom: 1rem;
}

.action-btn-one,
.action-btn-two {
    display: inline-flex;
    flex: 0 0 calc((100% - var(--btn-gap)) / 2);
    max-width: calc((100% - var(--btn-gap)) / 2);
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 16px;
    font-size: 1.05rem;
    padding: 15px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    /* prepare for transform animation */
    transform-origin: center center;
    transition: transform 160ms cubic-bezier(.2, .9, .3, 1), box-shadow 160ms ease, opacity 160ms ease;
}

/* pressed state: float up a few pixels and scale up ~4% */
.action-btn-one.pressed,
.action-btn-two.pressed {
    transform: translateY(-4px) scale(1.04);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
}

/* also offer a native :active fallback for immediate press feedback */
.action-btn-one:active,
.action-btn-two:active {
    transform: translateY(-3px) scale(1.03);
}

.action-btn-one {
    gap: 5px;
    background-color: #3b3c3c;
    color: white;
}

.action-btn-two {
    background-color: #3b82f6;
    gap: 8px;
}

.action-btn-two span {
    color: white;
    outline: none;
}

/* disabled visual style when deposit is blocked */
.action-btn-two.disabled,
.action-btn-two[disabled] {
    opacity: 0.95;
    pointer-events: none;
    box-shadow: none;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: white;
}

.deposit-method-visual {
    margin-top: 1.5rem;
    align-items: center;
    justify-content: center;
}

.media-method {
    margin: auto auto;
    width: 175px;
    height: 175px;
    margin-bottom: 1rem;
}

.top-info-gifts {
    line-height: 1.45rem;
}

.description-texts {
    display: flex;
    flex-direction: column;
    margin: auto auto;
    align-self: center;
    gap: 8px;
    align-content: center;
    justify-content: center;
    text-align: center;
    width: 100%;
    max-width: 480px;
}

.deposit-text-info {
    color: rgba(171, 171, 171, 0.78);
    font-family: "Inter", sans-serif;
    font-weight: 600;
    text-align: center;
    padding: 5px;
}

.deposit-text-info-two {
    margin-top: 1.5rem;
    color: rgba(171, 171, 171, 0.78);
    font-family: "Inter", sans-serif;
    font-weight: 600;
    text-align: center;
    padding: 5px;
}

/* wrapper that contains input + absolute warning */
.input-warnings {
    position: relative;
    /* container for absolutely-positioned warning */
    display: flex;
    flex-direction: column;
    align-items: center;
    /* center amount-group horizontally */
    margin-bottom: 1rem;
}

/* warning pops up below the amount-group but does NOT affect layout */
.warning-text {
    position: absolute;
    top: 100%;
    /* just below the input group */
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    /* keep it on one line; remove if you want wrapping */
    max-width: max(180%, 280px);
    text-align: center;
    font-size: 1rem;
    color: rgb(171, 68, 68, 0.7);
    background: transparent;
    /* change to semi-opaque for contrast if needed */
    padding: 0;
    /* optional small padding if you add background */
    z-index: 1;
    pointer-events: none;
    /* prevents it from affecting clicks — remove if interactive */
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.list-button,
.bot-button {
    border: none;
    padding: 6px;
    background-color: #323437;
    border-radius: 10px;
    color: white;
    cursor: pointer;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.list-button {
    font-size: 0.9rem;
    margin-top: 0.25rem;
    border-radius: 24px;
    padding: 12px;
}

.item-header {
    opacity: 0.5;
    font-size: 1rem;
    color: rgb(209, 209, 209);
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.deposit-ton-body {
    padding: 0.75rem 0.5rem 0.25rem 0.5rem;
    text-align: center;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.connected-wallet {
    font-size: 1.2rem;
    color: #888;
}

.wallet-connect-container,
.wallet-address-container {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    background-color: #323437;
    border-radius: 28px;
    width: 55%;
    padding: 4px 10px 4px 10px;
    margin: auto auto;
    cursor: pointer;
}

.wallet-connect-container {
    width: 70%;
    background-color: #3b82f6;
    padding: 8px 12px 8px 12px;
}

.wallet-address {
    margin: 0.5rem 0;
    font-size: 1.05rem;
    font-weight: bold;
}

.wallet-address-icon {
    height: 16px;
    width: 16px;
}

.amount-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    margin: 0.35rem 0;
}

.amount-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
}

.amount-input {
    width: calc(var(--chars, 1) * 1ch + 0.5rem);
    padding: 0.35rem 0rem;
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
    min-width: 3ch;
    max-width: 70vw;
}

@media (max-width: 420px) {
    
    .amount-input {
        font-size: 1.6rem;
        padding: 0.35rem;
        min-width: 4ch;
    }

    .amount-currency {
        font-size: 1.15rem;
    }

    .amount-currency-star {
        font-size: 1.15rem;
    }
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
}

.converted-ton {
    font-size: 1rem;
    color: #aaa;
    opacity: 0.7;
    cursor: pointer;
    flex: 0 0 auto;
}


.amount-currency-star {
    font-size: 1.5rem;
    cursor: pointer;
    flex: 0 0 auto;
}

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
