<template>
    <Teleport to="body">
        <transition name="backdrop" appear>
            <div v-if="visible" class="overlay" @click.self="close"></div>
        </transition>

        <transition name="modal" appear>
            <div v-if="visible" class="modal-container" role="dialog" aria-modal="true" :aria-label="headerText">
                <header class="modal-header">
                    <div class="modal-header-description">
                        <h2>{{ headerText }}</h2>
                    </div>
                    <button class="close-btn" @click="close" aria-label="Close">×</button>
                </header>

                <section class="modal-body">

                    <!-- Lottie animation container (replaces <img>) -->
                    <div class="gift-image-wrapper">
                        <div ref="svgContainer" class="tgs-container" aria-hidden="true"></div>
                    </div>

                    <!-- optional extra description area (value / metadata) -->
                    <div class="gift-meta">
                        <span>{{ $t('price') }}: {{ metaText() }} </span>
                        <img class="ton-price" :src="TonIcon">
                    </div>
                </section>

                <footer class="modal-footer">
                    <button class="action-btn" @click="onAction">
                        {{ $t('withdraw') }}
                    </button>
                </footer>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import lottie from 'lottie-web'
import pako from 'pako'

// your tgs assets (already imported by you)
import Gift_Anim_Cookie from '@/assets/game/Cookie_Anim.tgs'
import Gift_Anim_Snake from '@/assets/game/Snake_Anim.tgs'
import Gift_Anim_Cat from '@/assets/game/Cat_Anim.tgs'
import TonIcon from '@/assets/icons/TON_Icon.png'

const props = defineProps({
    visible: { type: Boolean, default: false },
    name: { type: String, default: '' },      // friendly name (ex: 'Scared Cat')
    gift_id: { type: String, default: '' },   // id (ex: 'cat', 'cookie', 'snake')
    image: { type: String, default: '' }      // optional image URL (not used for .tgs, kept for compatibility)
})
const emit = defineEmits(['close', 'action'])

/* ----- mapping gift_id -> tgs asset ----- */
function getTgsById(id) {
    switch ((id || '').toString().toLowerCase()) {
        case 'cookie': return Gift_Anim_Cookie
        case 'ginger': return Gift_Anim_Cookie
        case 'cat': return Gift_Anim_Cat
        case 'snake': return Gift_Anim_Snake
        default: return null
    }
}

/* ----- header / meta ----- */
const headerText = computed(() => {
    if (props.name && props.name.trim().length > 0) return props.name
    const map = { cookie: 'Ginger Cookie', cat: 'Scared Cat', snake: 'Pet Snake' }
    return (props.gift_id && map[props.gift_id]) ? map[props.gift_id] : (props.gift_id ? String(props.gift_id) : 'Unknown Item')
})

function metaText() {
    if (props.gift_id === 'cat') {
        return '50'
    }
    else if (props.gift_id === 'cookie') {
        return '2.5'
    }
    else if (props.gift_id === 'snake') {
        return '1.5'
    }
}

/* ----- Lottie related ----- */
const svgContainer = ref(null)
let animInstance = null
let currentTgsUrl = null
let loadToken = 0 // simple token to ignore stale loads

async function loadTgsAndPlay(tgsUrl) {
    // increment token so we can ignore racey older requests
    const myToken = ++loadToken

    // cleanup previous anim if any
    if (animInstance) {
        try { animInstance.destroy() } catch (_) { /* ignore */ }
        animInstance = null
    }

    if (!tgsUrl) {
        // nothing to play; show fallback (we keep container empty)
        return
    }

    try {
        // fetch binary
        const res = await fetch(tgsUrl)
        if (!res.ok) throw new Error('failed to fetch tgs')
        const buf = await res.arrayBuffer()

        // if another load started in meantime, bail
        if (myToken !== loadToken) return

        // decompress gzip -> JSON string
        const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' })

        // if another load started in meantime, bail
        if (myToken !== loadToken) return

        const animationData = JSON.parse(jsonStr)

        // if another load started in meantime, bail
        if (myToken !== loadToken) return

        // load animation into container
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

        // keep track of what we loaded
        currentTgsUrl = tgsUrl
    } catch (err) {
        console.error('loadTgsAndPlay error', err)
        // fallback: if animation fails, optionally render a static image into container
        try {
            if (svgContainer.value) svgContainer.value.innerHTML = ''
        } catch (_) { }
        animInstance = null
        currentTgsUrl = null
    }
}

/* watch for visible + gift_id changes to (re)load animation */
watch(
    () => [props.visible, props.gift_id],
    ([visible]) => {
        // if modal is visible, load the animation; if not, destroy to save memory
        if (visible) {
            const tgs = getTgsById(props.gift_id)
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
    // if modal is already visible on mount, attempt to load
    if (props.visible) {
        const tgs = getTgsById(props.gift_id)
        if (tgs) loadTgsAndPlay(tgs).catch(e => console.error(e))
    }
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
function onAction() {
    emit('action', { gift_id: props.gift_id, name: props.name })
    emit('close')
}
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

.modal-footer {
    padding: 1.5rem;
    padding-top: 0.5rem;
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

.gift-image-wrapper {
    margin: 1rem auto 0 auto;
    margin-top: 0;
    width: 160px;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
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

.gift-meta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 2rem;
    color: #b8b8b8;
    font-size: 1rem;
}

.ton-price {
    height: 20px;
    width: 20px;
}
</style>
