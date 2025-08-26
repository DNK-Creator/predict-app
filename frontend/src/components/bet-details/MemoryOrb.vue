<template>
    <!-- orb-stage is a fixed-size centered container (based on --orb-size).
       The entrance animation runs on this element so child transforms don't clash. -->
    <div class="orb-stage" ref="orbStage">
        <div class="orb-wrap" ref="orbWrap">

            <!-- HALO: glass-morphism blurred glow that shines outside the orb evenly -->
            <div class="halo" aria-hidden="true"></div>

            <div class="orb" ref="orb">
                <!-- hand (child of orb) -->
                <div class="hand" aria-hidden="true">
                    <img :src="handSrc" alt="Hand under orb" />
                </div>

                <div class="orb-inner" aria-hidden="false">

                    <div class="inner-group" id="innerGroup">
                        <!-- main image (uses prop) -->
                        <img class="inner-layer inner-main" ref="innerMain" :src="inside_image"
                            :alt="bet_name ? `${bet_name} inside memory orb` : 'inside image'" />

                        <!-- fringe layers for color separation / cinematic effect -->
                        <img class="inner-layer inner-fringe r" ref="innerR" :src="inside_image" alt=""
                            aria-hidden="true" />
                        <img class="inner-layer inner-fringe b" ref="innerB" :src="inside_image" alt=""
                            aria-hidden="true" />
                    </div>

                    <div class="cool-patch" aria-hidden="true"></div>
                    <div class="frost" aria-hidden="true"></div>
                    <div class="vignette" aria-hidden="true"></div>

                    <div class="specks" aria-hidden="true">
                        <div class="speck"></div>
                        <div class="speck"></div>
                        <div class="speck"></div>
                        <div class="speck"></div>
                        <div class="speck"></div>
                    </div>
                </div>
                <!-- /.orb-inner -->
            </div>
            <!-- /.orb -->
        </div>
        <!-- /.orb-wrap -->
    </div>
    <!-- /.orb-stage -->
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";

defineProps({
    bet_name: { type: String, required: true, default: "" },
    inside_image: { type: String, required: true, default: "" },
});

const handSrc =
    "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/SkellyArmFive.png";

const orb = ref(null);
const innerMain = ref(null);
const innerR = ref(null);
const innerB = ref(null);
const orbWrap = ref(null);
const orbStage = ref(null);

let rafId = null;

onMounted(() => {
    const baseScale = 0.85;

    const elOrb = orb.value;
    const elMain = innerMain.value;
    const elR = innerR.value;
    const elB = innerB.value;

    const hasR = !!elR;
    const hasB = !!elB;

    let target = { x: 0, y: 0, rx: 0, ry: 0 };
    let current = { x: 0, y: 0, rx: 0, ry: 0 };
    const ease = 0.07;

    const cfg = {
        freqX: 0.12,
        freqY: 0.09,
        ampX: 0.7,
        ampY: 0.55,
        rotAmpX: 3.8,
        rotAmpY: 5.6,
    };

    let start = performance.now();

    let lastTick = 0;
    const minDelta = 1000 / 45; // ~45 FPS cap

    function animate(now) {
        if (document.visibilityState === 'hidden') {
            rafId = requestAnimationFrame(animate);
            return;
        }

        const delta = now - lastTick;
        if (delta < minDelta) {
            rafId = requestAnimationFrame(animate);
            return;
        }
        lastTick = now;

        const elapsed = (now - start) / 1000;
        const sx = Math.sin(elapsed * Math.PI * 2 * cfg.freqX);
        const sy = Math.cos(elapsed * Math.PI * 2 * cfg.freqY);

        target.x = sx * cfg.ampX;
        target.y = sy * cfg.ampY;
        target.rx =
            Math.sin(elapsed * Math.PI * 2 * (cfg.freqY * 1.05)) * cfg.rotAmpX;
        target.ry =
            Math.cos(elapsed * Math.PI * 2 * (cfg.freqX * 0.95)) * cfg.rotAmpY;

        current.x += (target.x - current.x) * ease;
        current.y += (target.y - current.y) * ease;
        current.rx += (target.rx - current.rx) * ease;
        current.ry += (target.ry - current.ry) * ease;

        const mainTx = -current.x * 8;
        const mainTy = -current.y * 9;
        if (elMain) {
            elMain.style.transform = `translate3d(calc(-50% + ${mainTx}px), calc(-50% + ${mainTy}px), 0) scale(${(
                baseScale * 1.02
            ).toFixed(4)})`;
        }

        if (hasR && elR) {
            elR.style.transform = `translate3d(calc(-50% + ${current.x * 12}px), calc(-50% + ${current.y * 10}px), 0) scale(${(
                baseScale * 1.035
            ).toFixed(4)})`;
        }
        if (hasB && elB) {
            elB.style.transform = `translate3d(calc(-50% + ${-current.x * 10}px), calc(-50% + ${-current.y * 7}px), 0) scale(${(
                baseScale * 1.045
            ).toFixed(4)})`;
        }

        if (elOrb) {
            // JS only controls rotation here; entrance/translate/scale live on parents/styles to avoid transform collisions
            elOrb.style.transform = `rotateX(${current.rx}deg) rotateY(${current.ry}deg)`;
        }

        rafId = requestAnimationFrame(animate);
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            if (rafId) cancelAnimationFrame(rafId);
        } else {
            rafId = requestAnimationFrame(animate);
        }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
});


onBeforeUnmount(() => {
    if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
/* ----- STAGE ----- */
/* orb-stage: consistent fallback and predictable layout */
.orb-stage {
    width: calc(var(--orb-size, 200px) * 1.2);
    height: calc(var(--orb-size, 200px) * 1.2);
    /* fixed fallback */
    padding-bottom: calc(var(--orb-size, 200px) * 0.5);
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;

    /* entrance animation (keeps it offscreen initially) */
    transform: translateY(-100px);
    opacity: 0;
    animation: orb-stage-enter 1.0s cubic-bezier(.22, .9, .28, 1) forwards;
    transform-origin: center;
    box-sizing: content-box;
    isolation: isolate;
}

/* ensure descendants use border-box for predictable internal sizing */
.orb-stage *,
.orb-stage *::before,
.orb-stage *::after {
    box-sizing: border-box;
}

.orb-stage,
.orb,
.orb-inner,
.inner-layer,
.halo {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    transform: translateZ(0);
    /* promote to its own layer */
    will-change: transform, opacity;
}

/* also try isolating layout so other parts aren't affected */
.orb-stage {
    isolation: isolate;
}

/* entrance: move from -100px above to 0 with a small overshoot */
@keyframes orb-stage-enter {
    0% {
        transform: translateY(-100px);
        opacity: 0;
    }

    60% {
        transform: translateY(8px);
        opacity: 1;
    }

    100% {
        transform: translateY(0);
        opacity: 1;
    }
}

/* ----- WRAP ----- */
.orb-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 1100px;
    position: relative;

    /* idle bob starts shortly after the stage entrance to avoid conflicting with entry */
    animation: idle-bob 8s ease-in-out 1.05s infinite;
}

@keyframes idle-bob {

    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(2px);
    }
}

/* Ensure orb has a stable, explicit initial transform so rotation doesn't cause a jump */
.orb {
    width: var(--orb-size, 200px);
    height: var(--orb-size, 200px);
    z-index: 4;
    border-radius: 50%;
    position: relative;
    transform-style: preserve-3d;
    transform: rotateX(0deg) rotateY(0deg);
    /* stable baseline */
    transform-origin: center center;
    transition: box-shadow 560ms ease, transform 420ms cubic-bezier(.2, .9, .2, 1);
    will-change: transform;
}

/* orb-inner baseline: center AND include same scale as JS will set initially */
.orb-inner {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--orb-size, 200px);
    height: var(--orb-size, 200px);
    transform: translate(-50%, -50%);
    /* matches JS base scale */
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    isolation: isolate;
    backface-visibility: hidden;
}

@keyframes orb-breathe {
    0% {
        transform: translate(-50%, -50%) scale(1);
    }

    40% {
        transform: translate(-50%, -51.2%) scale(1.01);
    }

    70% {
        transform: translate(-50%, -49.6%) scale(0.9995);
    }

    100% {
        transform: translate(-50%, -50%) scale(1);
    }
}

/* ----- INNER LAYERS ----- */
.inner-group {
    position: absolute;
    inset: 0;
    display: block;
    transform-style: preserve-3d;
    pointer-events: none;
    border-radius: 50%;
}

.inner-layer {
    display: block;
    /* avoid inline image whitespace */
    object-fit: cover;
    /* fill the circle; prevents visible rect */
    position: absolute;
    border-radius: 50%;
    left: 50%;
    top: 50%;
    width: 120%;
    height: 120%;
    transform-origin: center;
    will-change: transform, opacity;
    transition: transform 420ms cubic-bezier(.2, .9, .2, 1), opacity 420ms ease;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(var(--img-inside-scale, 0.85));
}

.inner-main {
    mix-blend-mode: screen;
    opacity: 0.78;
    filter: blur(2.6px) contrast(0.98) saturate(0.88) brightness(0.95);
    transform-origin: center;
    transition: filter 540ms linear, transform 420ms cubic-bezier(.2, .9, .2, 1);
}

.inner-fringe.r {
    opacity: 0.12;
    filter: hue-rotate(150deg) saturate(1.05) contrast(1) brightness(1.02);
}

.inner-fringe.b {
    opacity: 0.10;
    filter: hue-rotate(200deg) saturate(0.85) contrast(1.02) brightness(0.96);
}



/* ----- FROST / PATCH / VIGNETTE / SPECKS ----- */
/* kept the same as before */
.frost {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(circle at 32% 26%,
            rgba(255, 255, 255, 0.02),
            rgba(210, 200, 220, 0.02) 22%,
            rgba(20, 8, 28, 0.04) 85%);
    backdrop-filter: blur(7px) saturate(1.02);
    -webkit-backdrop-filter: blur(7px) saturate(1.02);
    mix-blend-mode: screen;
    opacity: 0.92;
    box-shadow: inset 0 28px 48px rgba(255, 255, 255, 0.01),
        inset 0 -16px 32px rgba(0, 0, 0, 0.06);
    z-index: 7;
}

.cool-patch {
    position: absolute;
    left: 10%;
    top: 18%;
    width: 30%;
    height: 26%;
    border-radius: 50%;
    filter: blur(48px) saturate(1.08);
    background: radial-gradient(circle at 40% 40%,
            rgba(200, 190, 230, 0.58),
            rgba(90, 80, 120, 0.66) 46%,
            rgba(0, 0, 0, 0) 60%);
    mix-blend-mode: screen;
    pointer-events: none;
    z-index: 5;
}

.vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: 50%;
    box-shadow: inset 0 0 140px rgba(0, 0, 0, 0.5);
    mix-blend-mode: multiply;
    z-index: 9;
    opacity: 0.95;
}

.specks {
    position: absolute;
    inset: 0;
    z-index: 12;
    pointer-events: none;
}

.speck {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.3));
    opacity: 0.16;
    filter: blur(1.4px) saturate(1.08);
    animation: speckDrift linear infinite;
}

.speck:nth-child(1) {
    left: 12%;
    top: 22%;
    animation-duration: 10s;
    animation-delay: 0s;
    transform: scale(1.8);
}

.speck:nth-child(2) {
    left: 28%;
    top: 48%;
    animation-duration: 13s;
    animation-delay: 1s;
    transform: scale(0.6);
}

.speck:nth-child(3) {
    left: 64%;
    top: 32%;
    animation-duration: 14s;
    animation-delay: 2s;
    transform: scale(1.5);
}

.speck:nth-child(4) {
    left: 52%;
    top: 62%;
    animation-duration: 12s;
    animation-delay: 0.6s;
    transform: scale(0.5);
}

.speck:nth-child(5) {
    left: 78%;
    top: 18%;
    animation-duration: 11s;
    animation-delay: 1s;
    transform: scale(2);
}

@keyframes speckDrift {
    0% {
        transform: translate(0, 0) scale(1);
        opacity: 0.06;
    }

    50% {
        transform: translate(12px, -6px) scale(1.05);
        opacity: 0.115;
    }

    100% {
        transform: translate(0, 0) scale(1);
        opacity: 0.06;
    }
}

/* ----- HAND (entrance + wiggle) ----- */
.hand {
    position: absolute;
    top: 135%;
    left: 103%;
    width: calc(var(--orb-size, 200px) * 1.5);
    transform: translateX(0) translateY(-50%) rotate(-8deg);
    transform-origin: 8% 18%;
    z-index: 3;
    pointer-events: none;
    will-change: transform;
    opacity: 0;
    /* fades in via handEnter */
    animation: handEnter 1.05s cubic-bezier(.22, .9, .28, 1) forwards;
    filter: saturate(0.78) brightness(0.96) contrast(0.96);
    mix-blend-mode: multiply;
}

.hand img {
    display: block;
    width: 100%;
    height: auto;
    transform-origin: 8% 18%;
    animation: handWiggle 3.6s ease-in-out infinite alternate;
}

@keyframes handEnter {
    0% {
        transform: translateX(60%) translateY(-50%) rotate(-8deg);
        opacity: 0;
    }

    55% {
        transform: translateX(-72%) translateY(-50%) rotate(-1.2deg);
        opacity: 0.98;
    }

    100% {
        transform: translateX(-68%) translateY(-50%) rotate(-0.6deg);
        opacity: 0.98;
    }
}

@keyframes handWiggle {
    0% {
        transform: rotate(0.6deg);
    }

    100% {
        transform: rotate(-1.6deg);
    }
}

/* ----- HALO: glass-morphism lamp glow ----- */
.halo {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(var(--orb-size, 320px) * var(--halo-scale));
    height: calc(var(--orb-size, 320px) * var(--halo-scale));
    transform: translate(-50%, -50%);
    border-radius: 50%;
    pointer-events: none;
    z-index: 1;
    /* behind orb (orb has higher z-index) */
    mix-blend-mode: screen;
    opacity: var(--halo-opacity);
    filter: blur(var(--halo-blur));
    /* layered radial gradients for depth */
    background:
        radial-gradient(circle at 50% 48%,
            rgba(var(--halo-color-1), 0.65) 0%,
            rgba(var(--halo-color-1), 0.36) 18%,
            rgba(var(--halo-color-2), 0.18) 40%,
            rgba(var(--halo-color-2), 0.06) 58%,
            rgba(0, 0, 0, 0) 72%),
        radial-gradient(circle at 50% 62%,
            rgba(255, 255, 255, 0.06) 0%,
            rgba(255, 255, 255, 0.02) 14%,
            rgba(0, 0, 0, 0) 36%);
    /* subtle breathing/pulse */
    animation: halo-pulse var(--halo-pulse-duration) ease-in-out infinite;
    will-change: transform, opacity, filter;
}

/* thin glass ring to sell the frosted edge (pseudo-element cannot be targeted by v-bind so we implement via ::after) */
.halo::after {
    content: "";
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    pointer-events: none;
    /* semi-translucent ring */
    box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.03), 0 0 18px rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(8px) saturate(1.06);
    -webkit-backdrop-filter: blur(8px) saturate(1.06);
    mix-blend-mode: screen;
    opacity: 0.9;
}

/* subtle pulse that slightly scales halo and varies opacity */
@keyframes halo-pulse {
    0% {
        transform: translate(-50%, -50%) scale(1);
        opacity: var(--halo-opacity);
        filter: 40px;
    }

    50% {
        transform: translate(-50%, -50%) scale(var(--halo-pulse-scale));
        opacity: calc(var(--halo-opacity) + 0.26);
        filter: blur(calc(var(--halo-blur) + 30px));
    }

    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: var(--halo-opacity);
        filter: 40px;
    }
}
</style>
