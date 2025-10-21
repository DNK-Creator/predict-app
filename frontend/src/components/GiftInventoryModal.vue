<template>
    <Teleport to="body">
        <transition name="fade">
            <div v-if="visible" class="overlay overlay--visible" @click.self="close" />
        </transition>

        <transition name="slide-up" appear>
            <div v-if="visible" class="gift-info-modal" role="dialog" aria-modal="true">
                <header class="modal-header">
                    <h2>{{ $t('gift') }}</h2>
                    <button class="close-btn" @click="close" aria-label="Close">×</button>
                </header>

                <section class="modal-body">

                    <!-- Lottie animation container (replaces <img>) -->
                    <div class="gift-image-wrapper">
                        <div ref="svgContainer" class="tgs-container" aria-hidden="true"></div>
                    </div>

                    <div class="main-information">
                        <span v-if="gift.name.length < 11" class="gift-name">{{ gift.name }} #{{ gift.number }}</span>
                        <span v-else class="gift-name-small">{{ gift.name }} #{{ gift.number }}</span>
                        <div class="price-container">
                            <img class="price-icon" :src="tonIcon">
                            <span class="gift-price">{{ gift.value }} TON</span>
                        </div>
                    </div>

                    <div class="meta-information">
                        <span class="attribute-name">Model</span>
                        <div>
                            <span>{{ model }}</span>
                            <span> • </span>
                            <span :class="getRarityColor(modelRarity)">{{ modelRarity }}%</span>
                        </div>
                    </div>
                    <div class="spacer"></div>
                    <div class="meta-information">
                        <span class="attribute-name">Backdrop</span>
                        <div>
                            <span>{{ backdrop }}</span>
                            <span> • </span>
                            <span :class="getRarityColor(backdropRarity)">{{ backdropRarity }}%</span>
                        </div>
                    </div>
                    <div class="spacer"></div>
                    <div class="meta-information">
                        <span class="attribute-name">Symbol</span>
                        <div>
                            <span>{{ symbol }}</span>
                            <span> • </span>
                            <span :class="getRarityColor(symbolRarity)">{{ symbolRarity }}%</span>
                        </div>
                    </div>

                    <div class="id-information" @click="copyGiftID">
                        <span class="attribute-name">Gift ID: #{{ gift.uuid }}</span>
                        <img class="id-copy-icon" :src="activeCopyImg">
                    </div>

                </section>

                <section>
                    <div class="footer">
                        <div class="action-button" @click="close">
                            <span>{{ $t('close') }}</span>
                        </div>
                    </div>
                </section>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import lottie from 'lottie-web'
import tonIcon from '@/assets/icons/TON_Icon.png'
import copyIcon from '@/assets/icons/Copy_Icon_Two.png'
import okayIcon from '@/assets/icons/Okay_Icon.png'

const props = defineProps({
    visible: { type: Boolean, default: false },
    gift: { type: Object, default: {} },
    gift_url: { type: String, default: '' }
})

const emit = defineEmits(['close', 'action'])

const model = ref('Model')
const backdrop = ref('Backdrop')
const symbol = ref('Symbol')

const modelRarity = ref(1.5)
const backdropRarity = ref(1.5)
const symbolRarity = ref(1.5)

async function getTelegramGift() {
    if (props.gift == null || props.gift == undefined) return null

    const urlSafeName = String(props.gift.name.replace(/[ -]/g, '')).toLowerCase()

    const slug = `${urlSafeName}-${props.gift.number}`

    const r = await fetch(`https://api.giftspredict.ru/api/telegram/nft/${encodeURIComponent(slug)}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
}

/* ----- mapping gift_id -> tgs asset ----- */
function getTgsById() {
    if (props.gift == null || props.gift == undefined) return null

    const urlSafeName = String(props.gift.name.replace(/[ -]/g, '')).toLowerCase()

    return `https://nft.fragment.com/gift/${urlSafeName}-${props.gift.number}.lottie.json`
}

/* ----- Lottie related ----- */
const svgContainer = ref(null)
let animInstance = null
let currentTgsUrl = null
let loadToken = 0 // simple token to ignore stale loads

const activeCopyImg = ref(copyIcon)

function getRarityColor(percent) {
    if (percent >= 2) return 'rarity-silver'
    if (percent > 1) return 'rarity-blue'
    if (percent > 0.5) return 'rarity-purple'
    return 'rarity-golden'
}

function copyGiftID() {
    activeCopyImg.value = okayIcon
    setTimeout(() => {
        activeCopyImg.value = copyIcon
    }, 1000);
    navigator.clipboard.writeText(props.gift.uuid)
}

async function loadTgsAndPlay(tgsUrl) {
    // increment token so we can ignore stale/racy loads
    const myToken = ++loadToken

    // destroy previous animation if present
    if (animInstance) {
        try { animInstance.destroy() } catch (_) { /* ignore */ }
        animInstance = null
    }

    // clear container while loading
    try { if (svgContainer.value) svgContainer.value.innerHTML = '' } catch (_) { }

    if (!tgsUrl) {
        // nothing to play
        currentTgsUrl = null
        return
    }

    try {
        const res = await fetch(tgsUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to fetch tgs (${res.status})`)

        // bail if a newer request started
        if (myToken !== loadToken) return

        // Prefer res.json() for plain JSON; fallback to text+JSON.parse for non-standard headers
        let animationData
        const contentType = (res.headers.get('content-type') || '').toLowerCase()
        if (contentType.includes('application/json') || contentType.includes('+json')) {
            animationData = await res.json()
        } else {
            // Some servers return wrong content-type; try to parse text anyway
            const txt = await res.text()
            animationData = JSON.parse(txt)
        }

        // bail if a newer request started
        if (myToken !== loadToken) return

        // ensure container still exists
        if (!svgContainer.value) return

        // load into lottie
        animInstance = lottie.loadAnimation({
            container: svgContainer.value,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid meet'
            }
        })

        currentTgsUrl = tgsUrl
    } catch (err) {
        console.error('loadTgsAndPlay error', err)
        // cleanup on error
        try { if (svgContainer.value) svgContainer.value.innerHTML = '' } catch (_) { }
        animInstance = null
        currentTgsUrl = null
    }
}

watch(
    () => [props.visible, props.gift],
    ([visible]) => {
        // if modal is visible, load the animation; if not, destroy to save memory
        if (visible) {
            const tgs = getTgsById()
            if (tgs) {
                loadTgsAndPlay(tgs).catch(e => console.error(e))
            } else {
                // no tgs available for this id -> cleanup container
                if (animInstance) {
                    try { animInstance.destroy() } catch (_) { }
                    animInstance = null
                }
                if (svgContainer.value) svgContainer.value.innerHTML = ''
            }
            // Fetch the gifts attributes 
            getTelegramGift().then(data => {
                console.log(data.model, data.backdrop, data.symbol)
                // assign to refs:
                model.value = data.model
                backdrop.value = data.backdrop
                symbol.value = data.symbol
                modelRarity.value = data.modelRarity
                backdropRarity.value = data.backdropRarity
                symbolRarity.value = data.symbolRarity
            })
        } else {
            // hide -> destroy animation for performance
            if (animInstance) {
                try { animInstance.destroy() } catch (_) { }
                animInstance = null
            }
            if (svgContainer.value) svgContainer.value.innerHTML = ''
        }
    },
    { immediate: true }
)

onMounted(() => {
    const tgs = getTgsById()
    if (tgs) loadTgsAndPlay(tgs).catch(e => console.error(e))
})

onBeforeUnmount(() => {
    // cleanup
    if (animInstance) {
        try { animInstance.destroy() } catch (_) { }
        animInstance = null
    }
    if (svgContainer.value) svgContainer.value.innerHTML = ''
})

/* ----- UI actions ----- */
function close() {
    emit('close')
}

</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    z-index: 10;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.4);
}

/* Modal container, 45vh tall, pinned bottom */
.gift-info-modal {
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

.gift-info-modal h2 {
    margin: 0;
}

.modal-body {
    padding: 0.75rem 0.5rem 0.25rem 0.5rem;
    text-align: center;
    font-family: Inter;
}

.modal-header {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    align-content: center;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    font-family: Inter;
}

.close-btn {
    position: absolute;
    background: transparent;
    border: none;
    font-size: 2.25rem;
    cursor: pointer;
    color: white;
    right: 15px;
}

.main-information {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 2rem 0.5rem;
}

.gift-price,
.gift-name {
    font-size: 1.25rem;
}

.gift-name-small {
    font-size: 1rem;
}

.gift-price {
    font-size: 1.2rem;
}

.id-information,
.meta-information {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0.5rem;
}

.id-information {
    cursor: pointer;
    justify-content: center;
    margin: 1rem;
    margin-top: 1.5rem;
    margin-bottom: 0;
    gap: 8px;
}

.id-copy-icon {
    height: 12px;
    width: 12px;
}

.attribute-name {
    color: rgba(127, 129, 151, 0.88);
}

.spacer {
    margin: 1.25rem 0.5rem;
    border: 1px solid rgb(62, 64, 73);
    border-radius: 2px;
}

.price-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.price-icon {
    height: 16px;
    width: 16px;
}

.gift-image-wrapper {
    margin: 1rem auto 0 auto;
    margin-top: 0;
    width: 240px;
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 24px;
    overflow: hidden;
}

/* container where lottie places the SVG */
.tgs-container {
    width: 100%;
    height: 100%;
    display: block;
}

/* ensure svg scales nicely */
.tgs-container svg {
    width: 100% !important;
    height: 100% !important;
    display: block;
}

.footer {
    display: flex;
    margin: 1rem;
    align-items: center;
    justify-content: center;
}

.action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 16px;
    font-size: 1.25rem;
    padding: 15px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    width: 85%;
}

.action-button {
    flex: 0 0 auto;
    gap: 5px;
    background-color: #3b3c3c;
    color: white;
}

.rarity-blue {
    color: #4872e6;
}

/* Dark Blue */
.rarity-silver {
    color: #c1c1c1e8;
}

/* Yellow */
.rarity-purple {
    color: #8b5cf6;
}

/* Purple */
.rarity-golden {
    color: #fbbf24;
}

/* Golden */

/* FADE TRANSITION FOR OVERLAY OPACITY */
.fade-enter-active,
.fade-leave-active {
    transition:
        background-color 300ms ease-out;
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

/* Tweak for small screens so the rail doesn't overflow too much */
@media (max-height: 720px) {
    .gift-image-wrapper {
        width: 120px;
        height: 120px;
    }

    .gift-name {
        font-size: 1rem;
    }

    .gift-price {
        font-size: 0.85rem;
    }

    .footer,
    .id-information,
    .meta-information {
        margin: 0.25rem 0.5rem;
    }

    .spacer {
        margin: 0.75rem 0.5rem;
    }

    .attribute-name {
        font-size: 0.85rem;
    }
}
</style>
