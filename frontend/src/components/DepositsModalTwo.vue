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
                        <h2>Пополнение баланса</h2>
                    </div>

                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedDeposit === 'TON' }"
                            @click="selectDeposit('TON')">
                            <span>TON</span>
                        </button>
                        <button class="option" :class="{ active: selectedDeposit === 'GIFT' }"
                            @click="selectDeposit('GIFT')">
                            <span>Подарками</span>
                        </button>
                    </div>

                    <div class="deposit-method-visual">
                        <!-- note: we add two containers -->
                        <div class="deposit-method-container" v-show="selectedDeposit === 'TON'">
                            <div ref="svgContainerOne" class="media-method"> </div>
                            <div class="description-texts">
                                <span v-if="!address" class="deposit-text-info">Пополнение через TON Connect</span>
                                <span v-else="!address" class="deposit-text-info">Баланс на подключённом кошельке: {{
                                    balance }} TON</span>
                            </div>
                            <!-- Starting Deposit Fields container for TON -->
                            <section class="deposit-ton-body">
                                <div v-if="!address" class="wallet-connect-container" @click="connectNewWallet">
                                    <img :src="tonIcon" class="wallet-address-icon">
                                    <p class="wallet-address">Подключить кошелёк</p>
                                </div>
                                <div v-else class="wallet-address-container" @click="$emit('open-wallet-info')">
                                    <img :src="walletIcon" class="wallet-address-icon">
                                    <p class="wallet-address">{{ shortenedAddress }}</p>
                                </div>

                                <!-- CENTERED FLEX GROUP -->
                                <div class="amount-wrapper">
                                    <div class="amount-group">
                                        <input ref="amountInput" v-model="amount" type="text" inputmode="decimal"
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
                        <div class="deposit-method-container" v-show="selectedDeposit === 'GIFT'">
                            <div ref="svgContainerTwo" class="media-method"> </div>
                            <div class="description-texts">
                                <div class="top-info-gifts">
                                    <span class="deposit-text-info">Для пополнения баланса подарком отправьте подарок
                                        нашему
                                        боту</span>
                                    <button class="bot-button" @click="openRelayerChat">@GiftsPredictRelayer</button>
                                </div>
                                <div class="top-info-gifts">
                                    <button class="list-button" @click="$emit('open-prices')">Подарок
                                        зачислится на
                                        баланс TON по рыночной цене из списка.</button>
                                </div>
                                <span class="deposit-text-info">Операция передачи является окончательной, баланс
                                    обновится моментально.</span>
                            </div>
                        </div>
                    </div>

                </div>

                <div class="buttons-group">
                    <button class="action-btn-one" @click="close">Закрыть</button>
                    <button v-if="selectedDeposit === 'TON'" class="action-btn-two" @click="$emit('deposit', amount)">
                        <span>{{ actionText }}</span>
                    </button>
                    <button v-else class="action-btn-two" @click="openRelayerChat">
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
import lottie from 'lottie-web'
import pako from 'pako'
import TonMedia from '@/assets/EmptyGift2.tgs'
import GiftMedia from '@/assets/LootBag.tgs'
import walletIcon from '@/assets/icons/Wallet_Icon_Gray.png'
import tonIcon from '@/assets/icons/TON_White_Icon.png'

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

const { tg } = useTelegram()

const emit = defineEmits(['update:modelValue', 'open-wallet-info', 'open-prices', 'close', 'anim-start', 'anim-end', 'connect-new-wallet', 'deposit']) // keep update:modelValue for v-model support

const selectedDeposit = ref('TON')
const svgContainerOne = ref(null)
const svgContainerTwo = ref(null)

let animOne = null
let animTwo = null
const parsedTgsCache = {} // key: media (import string/module), value: parsed json

const lastInputtedNumber = ref('')
const amountInput = ref(null)
const modalBody = ref(null)
// Local state for user input
const amount = ref('')

const route = useRoute()
const overlayHideRoute = ['bets-history', 'gifts-prices']

const hideOverlay = computed(() =>
    overlayHideRoute.includes(route.name)
)

const visible = computed(() => modelValue.value === true && hideOverlay.value === false)

watch(visible, (v) => {
    console.log('[DepositsModalTwo] visible changed ->', v)
})

function openRelayerChat() {
    tg.openTelegramLink('https://t.me/giftspredictrelayer')
}

async function scrollModalToBottom(smooth = true) {
    const el = modalBody.value
    const input = amountInput.value
    if (!el) return

    // ensure DOM/layout settled
    await nextTick()
    // allow one rAF for any browser reflow quirks
    await new Promise((r) => requestAnimationFrame(r))

    // If we don't have an input or measurement fails, fallback to full bottom
    if (!input) {
        const kb = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0
        const fallbackTop = Math.max(0, el.scrollHeight - el.clientHeight + kb + 8)
        if (smooth && el.scrollTo) el.scrollTo({ top: fallbackTop, behavior: 'smooth' })
        else el.scrollTop = fallbackTop
        return
    }

    // Measurements
    const elRect = el.getBoundingClientRect()
    const inputRect = input.getBoundingClientRect()

    // offset of input within the scroll container content (taking current scrollTop into account)
    const inputOffsetTop = inputRect.top - elRect.top + el.scrollTop

    // keyboard height (0 fallback)
    const keyboardHeight = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) :
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0

    // how much space inside the container we want beneath the input (16px or more)
    const desiredBottomGap = 16

    // compute desired scrollTop so the input is just above the keyboard / bottom area:
    // put input near the bottom of the visible container: offsetTop - (containerHeight - inputHeight) + keyboardHeight + gap
    const desiredTop = Math.max(
        0,
        Math.round(
            inputOffsetTop - (el.clientHeight - inputRect.height) + keyboardHeight + desiredBottomGap
        )
    )

    if (smooth && el.scrollTo) {
        // some browsers ignore smooth during keyboard animation; still try it
        el.scrollTo({ top: desiredTop, behavior: 'smooth' })
    } else {
        el.scrollTop = desiredTop
    }
}

// called when user clicks “TON”
function focusAmountInput() {
    // focus the input so the keyboard appears & the cursor is active
    if (amountInput.value) {
        amountInput.value.focus()
    }
}

function onAmountFocus() {
    document.body.classList.add('keyboard-open')

    // run initial scroll after short delay to let keyboard show
    setTimeout(() => {
        try {
            // first try to bring the input into view (this helps some Android variants)
            amountInput.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
        } catch (_) { }
        // then do our fine-grained scroll
        scrollModalToBottom(true)
    }, 500)

    // visualViewport: update CSS var for keyboard height & re-scroll when it changes
    if (window.visualViewport) {
        vvResizeListener = () => {
            const kv = window.visualViewport
            const kbHeight = Math.max(0, window.innerHeight - kv.height)
            document.documentElement.style.setProperty('--keyboard-height', `${kbHeight}px`)
            // re-align modal content immediately (non-smooth to avoid being ignored)
            scrollModalToBottom(false)
        }
        window.visualViewport.addEventListener('resize', vvResizeListener)
        // call once immediately to set initial spacing
        vvResizeListener()
    } else {
        // fallback: some browsers don't have visualViewport — use window resize and a small delay
        windowResizeListener = () => {
            // avoid thrashing — small timeout
            setTimeout(() => scrollModalToBottom(false), 200)
        }
        window.addEventListener('resize', windowResizeListener)
    }
}

function onAmountBlur() {
    document.body.classList.remove('keyboard-open')

    // remove visualViewport listener
    if (window.visualViewport && vvResizeListener) {
        window.visualViewport.removeEventListener('resize', vvResizeListener)
        vvResizeListener = null
    }
    if (windowResizeListener) {
        window.removeEventListener('resize', windowResizeListener)
        windowResizeListener = null
    }

    // cleanup CSS var (optional)
    document.documentElement.style.removeProperty('--keyboard-height')
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

// safety: if component unmounts, remove listeners
onBeforeUnmount(() => {
    if (window.visualViewport && vvResizeListener) {
        window.visualViewport.removeEventListener('resize', vvResizeListener)
    }
    if (windowResizeListener) {
        window.removeEventListener('resize', windowResizeListener)
    }
})

const shortenedAddress = computed(() => {
    if (!address) return ''
    if (!address.value) return ''
    return `${address.value.slice(0, 4)}...${address.value.slice(-3)}`
})

const actionText = computed(() => selectedDeposit.value === 'TON' ? 'Пополнить' : 'Отправить подарок')

function selectDeposit(code) {
    selectedDeposit.value = code
    if (animOne && animTwo) {
        if (code === 'TON') {
            animOne.play()
            animTwo.stop()
        }
        else {
            animOne.stop()
            animTwo.play()
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
    // use media as cache key (works for imported static assets)
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
    // wait for DOM to be rendered (svgContainer refs to exist)
    await nextTick()

    try {
        const data = await ensureTgs(TonMedia)

        // always destroy previous to avoid duplicates
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

        // play correct one
        if (animOne) {
            if (selectedDeposit.value === 'TON') {
                animOne.play()
                if (animTwo) animTwo.stop()
            } else {
                animOne.stop()
                if (animTwo) animTwo.play()
            }
        }
    } catch (err) {
        console.error('Animation load failed', err)
    }
}

// watch the combined visible flag (handles both opening modal and returning from route)
watch(
    visible,
    async (isVisible) => {
        console.log('[DepositsModalTwo] visible ->', isVisible) // helpful for debugging
        if (isVisible) {
            await initAnimations()
        } else {
            destroyAnims()
        }
    },
    { immediate: true } // init on mount if already visible
)

onUnmounted(() => {
    destroyAnims()
})

onDeactivated(() => {
    destroyAnims()
})

// optional: close helper that respects v-model and emits close
function close() {
    emit('update:modelValue', false) // update v-model
    emit('close') // keep your custom callback too
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
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 75vh;
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
    /* optional: give inner spacing so content doesn't butt to edges */
    padding-bottom: 0.5rem;


    /* iOS momentum scrolling */
    -webkit-overflow-scrolling: touch;

    /* Hide scrollbar in Firefox */
    scrollbar-width: none;
    /* Firefox */

    /* Hide scrollbar in IE 10+ */
    -ms-overflow-style: none;
    /* IE and old Edge */

    /* ensure enough room above the OS keyboard when open */
    padding-bottom: calc(1rem + var(--keyboard-height, 0px));
}

/* Hide WebKit/Blink scrollbars (Chrome, Edge Chromium, Safari, Android) */
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
    width: 150px;
}

.items-group {
    margin-bottom: 2vh;
}

.options-grid {
    display: grid;
    grid-auto-flow: column;
    margin: auto auto;
    width: 12rem;
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
    width: 8rem;
    height: 2.5rem;
    background-color: #3b3c3c;
    border-radius: 10px;
    border: none;
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 1rem;
    align-items: center;
    justify-content: center;
    transition: background-color 200ms, color 200ms;
}

/* active state */
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
    /* single place to tweak gap */
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
    /* calc((100% - gap) / 2) ensures both sum to 100% with the gap between them */
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

    /* clamp long text: change to `white-space: normal` if you want wrapping instead */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

/* WALLET TON POP UP STYLES */
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

/* Make wallet info modal overlay to be on top of deposit modal! */

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

/* Wrapper ensures group is centered */
.amount-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    margin: 1rem 0;
}

/* Use flex (not inline-flex) with no wrapping, and a small gap */
.amount-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* replace negative margins with a proper gap */
    white-space: nowrap;
    /* prevent children from wrapping to next line */
}

/* Input width now based on number of characters */
.amount-input {
    /* compute width = number-of-chars * 1ch + extra space for padding */
    width: calc(var(--chars, 1) * 1ch + 1rem);

    /* padding and box model */
    padding: 0.35rem 0.5rem;
    box-sizing: content-box;
    /* width above excludes padding (we added +1rem) */

    font-size: 2.25rem;
    color: white;
    background: #292a2a;
    text-align: center;
    border: none;
    outline: none;
    appearance: textfield;
    font-family: inherit;

    flex: 0 0 auto;
    /* don't grow/shrink */
    min-width: 1ch;
    /* at least one character */
    max-width: 70vw;
    /* prevent overflow on tiny screens */
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
