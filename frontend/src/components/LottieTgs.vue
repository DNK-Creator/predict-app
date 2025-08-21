<template>
    <div class="lottie-clip">
        <div ref="container" class="lottie-container" />
    </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'
import lottie from 'lottie-web'
import pako from 'pako'

const props = defineProps({
    src: { type: [String, Object], required: true }, // string URL or imported asset
    autoplay: { type: Boolean, default: true },
    loop: { type: Boolean, default: true }
})

const container = ref(null)
let instance = null

async function mountLottie() {
    if (!props.src) return
    await nextTick()

    // wait a few RAFs in case we are inside a transition/teleport
    let tries = 0
    while (!container.value && tries < 8) {
        await new Promise((r) => requestAnimationFrame(r))
        tries++
    }
    if (!container.value) {
        console.warn('LottieTgs: container not found after wait')
        return
    }

    // fetch + decode .tgs (gzip)
    try {
        const prefersReduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const res = await fetch(props.src)
        const buf = await res.arrayBuffer()
        const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' })
        const animationData = JSON.parse(jsonStr)

        instance = lottie.loadAnimation({
            container: container.value,
            renderer: 'svg',
            loop: props.loop,
            autoplay: props.autoplay && !prefersReduce,
            animationData
        })
    } catch (err) {
        console.error('LottieTgs failed to load .tgs', err)
    }
}

function destroyLottie() {
    try { instance?.destroy?.() } catch (e) { }
    instance = null
}

onMounted(() => {
    mountLottie()
})

onBeforeUnmount(() => {
    destroyLottie()
})

// reload when src changes
watch(() => props.src, async (newSrc) => {
    destroyLottie()
    await mountLottie()
})
</script>

<style scoped>
.lottie-clip {
    width: min(62vw, 560px);
    max-width: 100%;
    max-height: 40vh;
    border-radius: 14px;
    box-shadow: 0 14px 40px rgba(2, 6, 23, 0.6);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
}

.lottie-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
