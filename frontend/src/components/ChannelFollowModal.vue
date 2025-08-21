<template>
    <Teleport to="body">
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="onClose" />
        </transition>

        <transition name="slide-up">
            <div v-if="show" class="channel-follow-modal" role="dialog" aria-modal="true">
                <div class="upper-media">
                    <div class="close-btn" @click="onClose">✖</div>
                    <img class="upper-media-img"
                        src="https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/PepeHeroicBanner.png">
                </div>
                <div class="bottom-middle">
                    <div class="items-group">
                        <div class="channel-banner">
                            <span class="channel-title">{{ title }}</span>
                            <span class="channel-description">{{ description }}</span>
                        </div>
                    </div>

                    <div class="items-group">
                        <div class="buttons-group">
                            <button class="action-btn-two" @click="onSubscribe">
                                <span>Подписаться</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
const props = defineProps({
    show: { type: Boolean, required: true },
    channel: { type: String, default: '@giftspredict' },
    description: { type: String, default: 'И не пропустай выход новых событий, крупные розыгрыши и важные обновления.' },
    title: { type: String, default: 'Подпишись на наш канал' }
})

const emit = defineEmits(['close', 'subscribe'])

function onClose() {
    emit('close')
}

function onSubscribe() {
    emit('subscribe')
}
</script>
<style scoped>
/* Bottom modal backdrop */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.45);
    /* darker like in image */
    backdrop-filter: blur(4px);
    z-index: 20;
}

/* Main modal container (bottom sheet) */
.wallet-info-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 420px;
    margin: auto auto;
    align-self: center;
    /* taller to match the reference */
    height: max(55vh, 500px);
    background: linear-gradient(180deg, rgba(41, 41, 41, 0.96) 0%, #1f1f1f 100%);
    color: #ffffff;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.6);
    z-index: 22;
    font-weight: 600;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    user-select: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    user-select: none;
}

/* Header row — small title on left and close on right */
.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
    z-index: 3;
}

/* Primary top title (keeps small, like the reference top text) */
.footer h2 {
    margin: 0;
    font-size: 14px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 700;
    letter-spacing: 0.2px;
}

/* Close button: circular, subtle */
.close-btn {
    position: absolute;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    right: 0;
    padding: 12px;
    height: 38px;
    width: 38px;
    font-size: 24px;
}

.channel-follow-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 420px;
    margin: auto auto;
    align-self: center;
    /* taller to match the reference */
    height: max(55vh, 500px);
    background: linear-gradient(180deg, rgba(41, 41, 41, 0.96) 0%, #1f1f1f 100%);
    color: #ffffff;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.6);
    z-index: 22;
    font-weight: 600;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    user-select: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    user-select: none;
}

/* The hero/banner area with background image */
.channel-follow-modal .channel-banner {
    position: relative;
    overflow: hidden;
    /* use the provided placeholder image */
    background-repeat: no-repeat;
    background-size: cover;
    background-position: center center;
    min-height: 40%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    /* we'll style text so it matches reference */
    justify-content: center;
    gap: 8px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    margin: auto auto;
    align-self: center;
}

/* a subtle dark gradient overlay so text is readable on top of the image */
.channel-follow-modal .channel-banner::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* Big bold primary line on top of banner */
.channel-follow-modal .channel-banner strong {
    position: relative;
    z-index: 2;
    display: block;
    margin: 0;
    color: #ffffff;
    font-size: 20px;
    line-height: 1.05;
    font-weight: 800;
    letter-spacing: -0.2px;
    text-shadow: 0 6px 22px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.02);
    word-break: break-word;
}

/* Description / subtitle (smaller, muted) */
.channel-follow-modal .channel-banner p {
    position: relative;
    z-index: 2;
    margin: 0;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    line-height: 1.25;
    max-width: 92%;
    opacity: 0.95;
}

.bottom-middle {
    display: flex;
    flex-direction: column;
    height: 100%;
    align-items: center;
    justify-content: start;
    padding: 16px;
}

/* Buttons block aligned to bottom of modal */
.buttons-group {
    display: flex;
    gap: 12px;
    width: 100%;
    margin-top: auto;
    /* push to bottom */
    padding-top: 16px;
    align-items: center;
}

.items-group {
    width: 100%;
}

/* Shared button baseline */
.action-btn-two {
    flex: 1 1 0;
    gap: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 14px;
    padding: 14px 16px;
    font-weight: 700;
    font-size: 15px;
    outline: none;
    transition: transform 120ms ease, box-shadow 120ms ease;
    color: #111111;
    background-color: #ffffff;
    margin: 0 16px;
}

/* Primary button (left one in template) - white pill with bold dark text */
.buttons-group>.action-btn-two:first-child {
    box-shadow: 0 6px 18px rgba(255, 255, 255, 0.06);
}

/* Secondary button (right one) - translucent dark / bordered */
.buttons-group>.action-btn-two:last-child {
    border: 1px solid rgba(255, 255, 255, 0.06);
}

/* Pressed effect */
.action-btn-two:active {
    transform: translateY(1px);
    box-shadow: none;
}

/* small subtle footer handle at the very top (drag handle look) */
.wallet-info-modal::before {
    content: "";
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 46px;
    height: 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    z-index: 4;
}

/* bottom watermark text like in reference */
.channel-follow-modal::after {
    content: "@giftspredict";
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    z-index: 3;
    letter-spacing: 0.2px;
}

.channel-title {
    font-size: 1.5rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
}

.channel-description {
    font-size: 1rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
    color: rgba(194, 194, 194, 0.78);
}

/* keep transitions you already had */
.fade-enter-active,
.fade-leave-active {
    transition: background-color 300ms ease-out, backdrop-filter 300ms ease-out;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 300ms ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}

.upper-media-img {
    height: 100%;
    width: 100%;
}

/* responsive tweaks */
@media (min-width: 600px) {
    .wallet-info-modal {
        left: 50%;
        transform: translateX(-50%);
        width: 580px;
        border-radius: 12px 12px 20px 20px;
        max-height: 72vh;
    }

    .channel-follow-modal .channel-banner {
        min-height: 46%;
    }

    .footer h2 {
        font-size: 15px;
    }

    .channel-follow-modal .channel-banner strong {
        font-size: 22px;
    }
}
</style>
