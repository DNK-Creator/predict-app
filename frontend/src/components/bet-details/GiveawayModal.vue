<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="onClose" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="settings-modal" role="dialog" aria-modal="true" aria-label="Giveaway">
                <div class="footer">
                    <h2>{{ $t('giveaway') }}</h2>
                    <button class="close-btn" @click="onClose">✖</button>
                </div>

                <!-- giveaway-information container -->
                <div class="giveaway-information" :style="{ '--fill-percent': fillPercent }">
                    <div class="giveaway-top">
                        <div class="giveaway-top__text">
                            {{ $t('giveaway-rules') }}
                            <span class="giveaway-prize-name">{{ gift_name }}</span>.
                        </div>
                        <div class="giveaway-top__media">
                            <img class="giveaway-prize-image" :src="image_link" alt="Prize" />
                            <div class="giveaway-prize-value">~{{ gift_value }} TON</div>
                        </div>
                    </div>

                    <div class="giveaway-slider-wrap">
                        <div class="giveaway-slider">
                            <div class="giveaway-track">
                                <div class="giveaway-fill"></div>
                            </div>
                        </div>
                        <div class="giveaway-hint-clip">
                            <div class="giveaway-hint">
                                {{ $t('tickets-left') }}: {{ tickets_left }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- description -->
                <div class="giveaway-description">
                    {{ $t('giveaway-description') }}
                </div>

                <!-- tickets indicator -->
                <div class="giveaway-tickets-indicator">
                    {{ $t('tickets-total') }}: {{ total_tickets }}
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
    show: Boolean,
    gift_value: Number,
    total_tickets: Number,
    tickets_left: Number,
    gift_name: String,
    image_link: String,
})
const emit = defineEmits(["close"])

function onClose() {
    emit("close")
}

// percent fill (left-anchored)
const fillPercent = computed(() =>
    Math.max(0, Math.min(100, Math.round((props.tickets_left / props.total_tickets) * 100)))
)
</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
    z-index: 10;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(3px);
}

/* Modal container, 45vh tall, pinned bottom */
.settings-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: max(52vh, 500px);
    max-width: 480px;
    margin: auto auto;
    align-self: center;
    background: #292a2a;
    color: White;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 12;
    user-select: none;
}

.settings-modal h2 {
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
    font-family: "Inter", sans-serif;
    font-weight: 600;
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

.action-btn-one,
.action-btn-two {
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
}

.action-btn-one {
    flex: 0 0 auto;
    /* do NOT grow or shrink; width = content */
    gap: 5px;
    background-color: #3b3c3c;
    color: white;
}

.action-btn-two {
    flex: 1 1 auto;
    /* grow to fill remaining space */
    gap: 8px;
}

.action-btn-two span {
    color: black;
    outline: none;
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
    font-size: 1rem;
    color: rgb(209, 209, 209);
    font-family: "Inter", sans-serif;
    font-weight: 600;
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

/* GIVEAWAY STYLES */

.giveaway-information {
    width: 96%;
    margin: 12px auto 20px auto;
    padding: 12px 14px 10px 14px;
    box-sizing: border-box;
    border-radius: 12px;
    position: relative;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.06));
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: visible;
    -webkit-backdrop-filter: blur(8px) saturate(110%);
    backdrop-filter: blur(8px) saturate(110%);
}


/* top row: left text, right stacked media (image above value) */
.giveaway-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}


/* left text */
.giveaway-top__text {
    font-family: "Inter", sans-serif;
    font-weight: 700;
    font-size: 0.95rem;
    color: #F7F9FB;
    flex: 1 1 auto;
}


/* prize name highlight inside text */
.giveaway-prize-name {
    color: #ffd88a;
    font-weight: 900;
}


/* RIGHT media: stack vertically (image above, value below) */
.giveaway-top__media {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    /* <-- stack */
    gap: 6px;
    flex: 0 0 auto;
    margin-left: 12px;
    min-width: 56px;
}


/* prize image */
.giveaway-prize-image {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    object-fit: cover;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.04);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.05));
}

/* prize value below image */
.giveaway-prize-value {
    font-weight: 800;
    color: #ffebc2;
    font-size: 0.95rem;
    line-height: 1;
    margin-top: 2px;
    text-align: center;
}


/* slider-wrap stacks slider and hint vertically and stretches to full width */
.giveaway-slider-wrap {
    width: 100%;
    height: 4rem;
    display: flex;
    flex-direction: column;
    /* stack: slider on top, hint below */
    align-items: stretch;
    /* make children full-width */
    justify-content: flex-start;
    padding-top: 6px;
    box-sizing: border-box;
}

/* the visible slider container — give it a defined height and relative positioning */
.giveaway-slider {
    width: 100%;
    /* take full width of wrapper */
    position: relative;
    /* positioning context for .giveaway-track and .giveaway-fill */
    height: 18px;
    /* explicit height for the slider container */
    display: flex;
    align-items: center;
}


/* track sits inside .giveaway-slider and provides the clipping box */
.giveaway-track {
    position: relative;
    width: 100%;
    height: 10px;
    /* visible track height */
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 6px 14px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    /* confines .giveaway-fill */
    z-index: 1;
}

/* .giveaway-fill anchored to the LEFT and scales left->right */
.giveaway-fill {
    position: absolute;
    left: 0;
    /* anchor to left edge of the track */
    top: 0;
    bottom: 0;
    width: 100%;
    /* full width, visible portion controlled by scaleX */
    transform-origin: left center;
    /* scale from left -> right */
    /* numeric css var 0..100 (no '%'). e.g. --fill-percent: 40 */
    transform: scaleX(calc(var(--fill-percent, 40) / 100));
    background: linear-gradient(90deg, #ffd36b 0%, #ff9a68 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 6px 12px rgba(255, 150, 40, 0.12);
    border-radius: inherit;
    transition: transform 480ms cubic-bezier(.2, .9, .3, 1);
    z-index: 2;
    will-change: transform;
}

/* hint clip sits below the track and spans full width */
.giveaway-hint-clip {
    width: 100%;
    height: 40px;
    /* slightly larger clip so the half-visible hint is stable */
    overflow: hidden;
    pointer-events: none;
    position: relative;
    margin-top: 6px;
    /* space below the slider */
    z-index: 5;
    /* ensure it sits above the slider fill if overlap occurs */
}

.giveaway-hint {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.92);
    font-weight: 700;
    transform: translateY(45%);
    /* show roughly the top half of the label */
    text-align: center;
    padding-left: 4px;
    width: 100%;
    line-height: 1.1;
}

.giveaway-sidebar {
    position: absolute;
    right: 12px;
    top: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
}


/* responsive adjustments */
@media (max-width: 520px) {
    .giveaway-prize-image {
        width: 48px;
        height: 48px;
    }
}

.giveaway-description {
    margin-top: 1.25rem;
    font-size: 0.95rem;
    line-height: 1.45rem;
    color: #f7f9fb;
}

.giveaway-tickets-indicator {
    display: flex;
    align-items: center;
    text-align: center;
    justify-content: center;
    text-justify: center;
    margin: auto auto;
    margin-top: 1rem;
    font-weight: 700;
    font-size: 0.9rem;
    color: rgba(212, 212, 212, 0.88);
}
</style>
