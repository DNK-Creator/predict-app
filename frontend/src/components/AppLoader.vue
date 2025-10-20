<template>
    <div class="loading-spinner">
        <div ref="svgContainer" class="empty-media"></div>

        <div class="progress-bar" role="progressbar" :aria-valuenow="Math.round(currentStage)" aria-valuemin="0"
            aria-valuemax="5" :aria-valuetext="`${Math.round((currentStage / 5) * 100)}%`">
            <!-- Fill element controlled by JS animation (transform: scaleX) -->
            <div class="progress-fill" :style="{
                transform: `scaleX(${(currentStage / 5).toFixed(6)})`
            }"></div>

            <span class="sr-only">{{ Math.round((currentStage / 5) * 100) }}% complete</span>
        </div>
        <div class="helper-text">
            <span>{{ Math.round((currentStage / 5) * 100) }}%..</span>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, defineProps, computed } from 'vue';
import lottie from 'lottie-web';
import pako from 'pako';
import AppLoadingGift from '@/assets/EmptyGift.tgs';

const props = defineProps({
    stage: {
        type: Number,
        default: 0
    }
});

const svgContainer = ref(null);

// Load Lottie (unchanged)
onMounted(async () => {
    const res = await fetch(AppLoadingGift);
    const buf = await res.arrayBuffer();
    const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' });
    const animationData = JSON.parse(jsonStr);

    lottie.loadAnimation({
        container: svgContainer.value,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData
    });

    setTimeout(() => {
        lottie.play()
    }, 100);
});

// ---- Progress animation logic ----

// clamp helper
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// target stage (0..5) coerced & clamped
const targetStage = computed(() => clamp(Math.round(Number(props.stage) || 0), 0, 5));

// currentStage (animated state)
const currentStage = ref(targetStage.value);

// Animation bookkeeping
let rafId = null;
let animStartTs = 0;
let animDuration = 0;
let animFrom = 0;
let animTo = 0;

// Easing: smooth S-shaped sigmoid (logistic) remapped to [0,1].
// This produces very small initial slope and very small final slope — gentle both ends.
function sigmoidEase(t, k = 8) {
    // logistic: s(t) = 1/(1+e^{-k*(t-0.5)})
    // normalize s so s(0)=0 and s(1)=1
    const s = 1 / (1 + Math.exp(-k * (t - 0.5)));
    const s0 = 1 / (1 + Math.exp(k * 0.5));        // s(0)
    const s1 = 1 / (1 + Math.exp(-k * 0.5));       // s(1)
    return (s - s0) / (s1 - s0);
}

// Start / step animation
function startAnimation(from, to) {
    // If same, bail
    if (from === to) return cancelAnimation();

    // Duration scaling: longer for bigger jumps, but with a minimum so small jumps still feel slow.
    const stepDelta = Math.abs(to - from); // 0..5
    const perStepMs = 150; // how many ms per stage step (tune as desired)
    const minDuration = 300; // ALWAYS at least this long (user requested perceptible delay)
    const maxDuration = 1800; // clamp the max
    animDuration = clamp(Math.round(perStepMs * stepDelta), minDuration, maxDuration);

    // set animation values
    animStartTs = 0; // will set on first frame
    animFrom = from;
    animTo = to;

    // Cancel any existing frame
    if (rafId) cancelAnimationFrame(rafId);

    // animation loop
    const step = (timestamp) => {
        if (!animStartTs) animStartTs = timestamp;
        const elapsed = timestamp - animStartTs;
        const t = clamp(elapsed / animDuration, 0, 1);

        // gentle S-shaped easing; k controls how "S" it is (8 is a good gentle value)
        const eased = sigmoidEase(t, 6);

        // interpolate
        currentStage.value = animFrom + (animTo - animFrom) * eased;

        if (t < 1) {
            rafId = requestAnimationFrame(step);
        } else {
            // ensure final value is exact integer target
            currentStage.value = animTo;
            rafId = null;
        }
    };

    rafId = requestAnimationFrame(step);
}

function cancelAnimation() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

// Watch incoming targetStage and animate to it when it changes.
// This ensures even if props.stage jumps (e.g., 2 -> 5), the bar will animate slowly and gently.
watch(targetStage, (newVal, oldVal) => {
    // Use currentStage.value as 'from' (it may be mid-animation)
    startAnimation(Number(currentStage.value), Number(newVal));
}, { immediate: true });

// Cleanup on unmount
onBeforeUnmount(() => {
    cancelAnimation();
});
</script>

<style scoped>
.loading-spinner {
    margin: auto;
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: rgb(23, 23, 23);
}

.empty-media {
    width: 13rem;
    height: 13rem;
    margin-bottom: 2rem;
}

/* Progress bar container (unfilled color) */
.progress-bar {
    position: relative;
    width: min(60%, 360px);
    height: 7px;
    background: rgb(75, 77, 80);
    /* unfilled color */
    border-radius: 999px;
    margin-bottom: 1.5rem;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}

.helper-text {
    color: white;
    margin-bottom: 6rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
}

/* Fill - we do NOT use CSS transition so JS controls the motion precisely */
.progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    transform-origin: left center;
    transform: scaleX(0);
    /* controlled by inline style bound to currentStage */
    background: rgb(39, 115, 238);
    /* fill color specified */
    border-radius: inherit;
    will-change: transform;
    box-shadow: 0 6px 14px rgba(68, 133, 238, 0.12), inset 0 -2px 6px rgba(0, 0, 0, 0.12);
}

/* gentle shimmer to give life to the fill */
.progress-fill::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background-image: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0) 100%);
    background-size: 200% 100%;
    animation: shimmerSlow 1.2s linear infinite;
    mix-blend-mode: overlay;
}

@keyframes shimmerSlow {
    from {
        background-position: -200% 0;
    }

    to {
        background-position: 200% 0;
    }
}

/* Screen-reader only helper */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
