<template>
    <Teleport to="body">
        <transition name="fade">
            <div v-if="show" class="tutorial-backdrop" @keydown="onKeydown" tabindex="-1"
                ref="backdropEl">
                <div class="tutorial-card" role="dialog" aria-modal="true">

                    <!-- top dots -->
                    <div class="top-controls">
                        <div class="top-dots" aria-hidden="true">
                            <span v-for="(_, idx) in images" :key="idx"
                                :class="['dot', { active: idx === currentIndex }]" />
                        </div>
                    </div>

                    <!-- content area: image + animated title/subtitle -->
                    <div class="content-area" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
                        <!-- content-area: image + animated title/subtitle -->
                        <div class="image-card-wrap">
                            <transition :name="transitionName" mode="out-in" appear>
                                <div :key="currentIndex" class="image-float-wrap">
                                    <!-- Render Lottie component when a tgs is present for this slide -->
                                    <LottieTgs v-if="tgsFiles?.[currentIndex]" :src="tgsFiles[currentIndex]"
                                        :key="'tgs-' + currentIndex" />
                                    <!-- Otherwise render the normal image; class toggles float -->
                                    <img v-else :src="images[currentIndex]" :alt="`tutorial ${currentIndex + 1}`"
                                        :class="['image-card', { 'float-enabled': currentIndex === 0 || currentIndex === 1 }]"
                                        :style="floatStyles[currentIndex]" />
                                </div>
                            </transition>
                        </div>

                        <!-- animated title -->
                        <transition :name="transitionName" mode="out-in" appear>
                            <h1 :key="currentIndex" class="headline">{{ titles[currentIndex] }}</h1>
                        </transition>

                        <!-- animated description -->
                        <transition :name="transitionName" mode="out-in" appear>
                            <p :key="currentIndex + '-desc'" class="subtitle">{{ subtitles[currentIndex] }}</p>
                        </transition>

                        <!-- footer (below description) -->
                        <div class="tutorial-footer" role="group" aria-label="Tutorial footer">
                            <button class="primary-action" @click="onNext" type="button">
                                <span v-if="!isLastStep">Далее ></span>
                                <span v-else>Начать предсказывать!</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
        <div ref="svgContainer" v-if="tgsFiles?.[currentIndex]" class="lottie-clip">
            <div class="lottie-container"></div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import DuckMedia from '@/assets/DuckClicking.tgs'
import LottieTgs from './LottieTgs.vue'

const props = defineProps({
    show: { type: Boolean, required: true },
    images: { type: Array, required: true },
    startIndex: { type: Number, default: 0 },
    backdropClose: { type: Boolean, default: true },

    // Optional: pass arrays to override defaults
    titles: {
        type: Array,
        default: () => [
            "Привет! Это Gifts Predict",
            "Пополнение и вывод",
            "Вместе - веселее"
        ]
    },
    subtitles: {
        type: Array,
        default: () => [
            "Здесь ты можешь предсказывать будущие события из мира Telegram, Подарков и Криптовалюты.",
            "Пополняй баланс, используя TON или Телеграм подарки. Выдача призов происходит ежедневно.",
            "С помощью реферальной программы пользователи могут приглашать друзей, делиться своей реферальной ссылкой и зарабатывать процент с выигрыша других."
        ]
    },

    // NEW: optional array of .tgs urls/imports — e.g. [null, null, LoadingPepe]
    tgsFiles: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'finished'])

const currentIndex = ref(props.startIndex ?? 0)
watch(() => props.startIndex, (v) => { currentIndex.value = v ?? 0 })

const isLastStep = computed(() => currentIndex.value === (props.images.length - 1))

// direction used to select animation
const direction = ref('next')
const transitionName = computed(() => (direction.value === 'next' ? 'slide-left' : 'slide-right'))

function onNext() {
    if (currentIndex.value < Math.max(0, props.images.length - 1)) {
        direction.value = 'next'
        currentIndex.value += 1
        return
    }
    emit('finished')
    emit('close')
}

function onClose() {
    if (!props.backdropClose) return
    emit('close')
}

/* Swipe support (simple) */
let touchStartX = null
let touchStartY = null
const MIN_SWIPE_DIST = 40

function onTouchStart(e) {
    const t = e.touches?.[0]
    if (!t) return
    touchStartX = t.clientX
    touchStartY = t.clientY
}

function onTouchEnd(e) {
    const t = e.changedTouches?.[0]
    if (!t || touchStartX === null) return
    const dx = t.clientX - touchStartX
    const dy = t.clientY - touchStartY
    touchStartX = null
    touchStartY = null
    if (Math.abs(dx) < Math.abs(dy)) return
    if (dx < -MIN_SWIPE_DIST) {
        onNext()
    } else if (dx > MIN_SWIPE_DIST) {
        if (currentIndex.value > 0) {
            direction.value = 'prev'
            currentIndex.value -= 1
        }
    }
}

/* Keyboard */
function onKeydown(e) {
    if (!props.show) return
    if (e.key === 'ArrowRight') onNext()
    else if (e.key === 'ArrowLeft') {
        if (currentIndex.value > 0) {
            direction.value = 'prev'
            currentIndex.value -= 1
        }
    } else if (e.key === 'Escape') onClose()
}

const backdropEl = ref(null)
function focusTrap() {
    try { backdropEl.value?.focus?.() } catch (e) { }
}

// generate per-image small randomization for animation duration/delay
const floatStyles = ref([])

function genFloatStyles() {
    const baseFast = 3.0
    const prefersReduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    floatStyles.value = props.images.map((_, i) => {
        if (i === 0 || i === 1) {
            if (prefersReduce) return {}
            const duration = (baseFast + Math.random() * 0.6).toFixed(2) + 's'
            const delay = (Math.random() * 0.6 - 0.3).toFixed(2) + 's'
            // set CSS variables used by the float-enabled class
            return { '--float-duration': duration, '--float-delay': delay }
        }
        return {}
    })
}

watch(() => props.images, () => {
    genFloatStyles()
})

onMounted(() => {
    genFloatStyles()
    if (props.show) focusTrap()
    window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    try { lottieInstance?.destroy?.() } catch (e) { /* ignore */ }
})

watch(() => props.show, (val) => {
    if (val) focusTrap()
})
</script>

<style scoped>
/* Prevent any horizontal overflow from modal itself */
.tutorial-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 6, 10, 0.98);
    z-index: 60;
    backdrop-filter: blur(6px);

    /* important: clip any horizontal overflow from transitions */
    overflow-x: hidden;
    /* disable iOS/Android horizontal overscroll while modal is open */
    overscroll-behavior-x: none;
    /* On touch devices, only allow vertical gestures (helps avoid horizontal page pan) */
    touch-action: pan-y;
    user-select: none;
}

/* Card: let it size to content, but cap height/width so it never overflows viewport */
.tutorial-card {
    width: calc(100% - 32px);
    /* small gap from viewport edges */
    max-width: 640px;
    /* make room for a bigger image on wide screens */
    max-height: 90vh;
    /* prevent overflow; allow internal scroll if needed */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* center contents inside the card */
    position: relative;
    padding: 18px;
    box-sizing: border-box;
    background: transparent;
    user-select: none;
    overflow-x: hidden;
    /* allow scroll inside card on very small screens */
    border-radius: 14px;
    /* optional - nice UI touch */
}

/* TOP dots */
.top-controls {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 12px;
}

.top-dots {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.18);
    transition: transform .18s cubic-bezier(.2, .9, .3, 1), background-color .18s;
    display: inline-block;
}

.dot.active {
    width: 10px;
    height: 10px;
    transform: scale(1.1);
    background: #2E90FF;
    box-shadow: 0 6px 18px rgba(46, 144, 255, 0.18);
}

/* Content area keeps the same layout but no forced height */
.content-area {
    width: 100%;
    padding: 0 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    touch-action: pan-y;
    overscroll-behavior-x: none;
}

/* Image container */
.image-card-wrap {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 6px 0;
    border-radius: 14px;
    /* same as tutorial-card */

    /* clip sliding images so they can't increase viewport width */
    overflow: visible;
    /* create a new containing block / stacking context to avoid layout shifts */
    transform: translateZ(0);
}

/* Image: responsive and larger by default, with max-height to avoid overflow */
/* keep your image styles and the float animation (image-card was already defined) */
.image-card {
    width: max(42vw, 380px);
    max-width: 100%;
    max-height: 40vh;
    height: auto;
    border-radius: 14px;

    box-shadow: 0 14px 40px rgba(2, 6, 23, 0.6);
    object-fit: contain;
    display: block;
    will-change: transform;
    transform-origin: center center;
    backface-visibility: hidden;
    /* default fallback (overridden by inline styles for floating slides) */
    animation: none;
}

/* Floating animation on the image itself (subtle vertical + rotation) */
.image-float-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    /* ensure the wrapper doesn't introduce extra layout shifts */
    transform: translateZ(0);
}

/* Titles */
.headline {
    color: white;
    text-align: center;
    font-size: 1.15rem;
    line-height: 1.2;
    font-weight: 700;
    margin: 0;
    padding: 0 14px;
}

.subtitle {
    color: rgba(255, 255, 255, 0.68);
    text-align: center;
    font-size: 0.95rem;
    margin: 0;
    white-space: pre-line;
    padding: 0 18px;
}

/* Footer/button sizing unchanged except we keep it inside the card */
.tutorial-footer {
    margin-top: 2vh;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    padding-left: 16px;
    padding-right: 16px;
    box-sizing: border-box;
}

/* Primary blue action button — single background color */
.primary-action {
    width: 100%;
    max-width: 360px;
    background: #2E90FF;
    /* blue tone */
    color: #ffffff;
    /* white text for contrast */
    border: none;
    padding: 14px 18px;
    border-radius: 14px;
    font-weight: 700;
    font-size: 1.05rem;
    cursor: pointer;
    box-shadow: 0 10px 28px rgba(46, 144, 255, 0.16);
}

/* Float-enabled class — uses CSS variables provided inline */
.float-enabled {
    /* fallback */
    animation: floaty 3s ease-in-out 0s infinite alternate;
    /* override with variables if present */
    animation: floaty var(--float-duration, 3s) ease-in-out var(--float-delay, 0s) infinite alternate;
}


/* -----------------------
   Transitions (image/title/description use the same classes)
   ----------------------- */

/* slide-left (for next) */
.slide-left-enter-active,
.slide-left-leave-active {
    transition: transform 420ms cubic-bezier(.2, .9, .3, 1), opacity 320ms ease;
}

/* Use translate3d to force GPU compositing and avoid layout shifts */
.slide-left-enter-from {
    transform: translate3d(20%, 0, 0) scale(1.02);
    opacity: 0;
}

.slide-left-enter-to {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
}

.slide-left-leave-from {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
}

.slide-left-leave-to {
    transform: translate3d(-18%, 0, 0) scale(0.98);
    opacity: 0;
}

.slide-right-enter-from {
    transform: translate3d(-20%, 0, 0) scale(1.02);
    opacity: 0;
}

.slide-right-enter-to {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
}

.slide-right-leave-from {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
}

.slide-right-leave-to {
    transform: translate3d(18%, 0, 0) scale(0.98);
    opacity: 0;
}

/* fade backdrop */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 260ms ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
    opacity: 1;
}

/* A very subtle float: move up a few px and rotate a degree or two */
@keyframes floaty {
    0% {
        transform: translate3d(0, 0, 0) rotate(0.0deg);
    }

    40% {
        transform: translate3d(0, -8px, 0) rotate(1.75deg);
    }

    60% {
        transform: translate3d(0, -4px, 0) rotate(-1.0deg);
    }

    100% {
        transform: translate3d(0, 0, 0) rotate(0.0deg);
    }
}

/* Responsive tweak: allow the image to grow on wide screens if desired */
@media (min-width: 900px) {
    .tutorial-card {
        max-width: 720px;
    }

    .image-card {
        width: min(88vw, 640px);
        max-height: 60vh;
    }
}

/* respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
    .image-card {
        animation: none !important;
    }

    /* prevent lottie autoplay if user prefers reduced motion — handled in script by not autoplaying */
}
</style>
