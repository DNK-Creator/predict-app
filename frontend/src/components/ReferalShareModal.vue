<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="close" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="wallet-info-modal">
                <div class="referral-card">
                    <div class="header">
                        <div class="ref-header-image">
                            <img :src="ShareIcon">
                        </div>
                        <button class="close-btn" @click="close">✖</button>
                    </div>
                    <h1 class="card-title">
                        {{ $t('invite-friends') }}
                    </h1>
                    <p class="ref-description">
                        {{ $t('share-your-link') }}
                    </p>
                    <div class="starter-statistics-container">
                        <div class="large-link-show">
                            <span class="large-link-header">{{ $t('your-link') }}</span>
                            <div class="small-link-show">
                                <span>{{ shareUrlStarter }}{{ user?.id ?? '' }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="items-group">
                        <div class="buttons-group">
                            <button class="action-btn-one" @click="copyLink">
                                <span class="copy-text">{{ inviteText }}</span>
                            </button>
                            <button class="action-btn-two" @click="shareReferal">
                                <span>{{ $t('share') }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import ShareIcon from '@/assets/icons/Share_Icon.png'
import { ref, defineEmits, defineProps, computed } from 'vue'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const shareUrlStarter = ref('https://t.me/myoraclerobot?startapp=')

const { user } = useTelegram()

const inviteText = computed(() => {
    return app.language === 'ru' ? 'Скопировать ссылку' : 'Copy link'
})

const props = defineProps({
    /** whether the modal is visible */
    show: Boolean
})

const emit = defineEmits(['close'])

function close() {
    emit('close')
}

function copyLink() {
    const ref = user?.id ?? ''
    const shareLink = shareUrlStarter.value + ref
    navigator.clipboard.writeText(shareLink)
    inviteText.value = app.language === 'ru' ? "Ссылка скопирована!" : "Copied Link!"
    setTimeout(() => (inviteText.value = app.language === 'ru' ? "Скопировать ссылку" : "Copy Link"), 1800)
}

function shareReferal() {
    const ref = user?.id ?? ''
    const shareLink = shareUrlStarter.value + ref
    let messageText = ""
    if (app.language === 'ru') {
        messageText = `%0AЗаходи со мной в Oracle и зарабатывай TON!`
    } else {
        messageText = `%0AJoin me in Oracle and earn TON!`
    }
    try {
        tg.openTelegramLink(`https://t.me/share/url?url=${shareLink}&text=${messageText}`)
    } catch (e) {
        // fallback: open share link in new tab
        window.open(`https://t.me/share/url?url=${shareLink}&text=${messageText}`, '_blank')
    }
}

</script>

<style scoped>
/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    z-index: 20;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.5);
}

.close-btn {
    position: absolute;
    right: 30px;
    top: 30px;
    background: transparent;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: white;
}

/* Modal container, 45vh tall, pinned bottom */
.wallet-info-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72vh;
    background: #292a2a;
    color: White;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 22;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    user-select: none;
    max-width: 480px;
    margin: auto auto;
    align-self: center;
}

.wallet-info-modal h2 {
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
    font-weight: 600;
    font-family: "Inter", sans-serif;
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
    gap: 0.5rem;
    width: 100%;
    margin: auto auto;
    margin-top: 2.5rem;
}

.action-btn-two {
    flex: 1 1 auto;
    /* grow to fill remaining space */
    gap: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 16px;
    padding: 12px;
}

.action-btn-two span {
    font-size: 1.1rem;
    color: black;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* full-width button with spacing & truncation */
.wallet-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background-color: #323333;
    border-color: #3b3c3c;
    border-radius: 12px;
    cursor: pointer;
}

/* left icon */
.wallet-icon {
    width: 1.5rem;
    height: 1.5rem;
}

/* center text: truncate if too long */
.wallet-text {
    flex: 1;
    margin: 0 0.75rem;
    color: white;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* right “copy” icon */
.copy-icon {
    width: 1.25rem;
    height: 1.25rem;
    opacity: 0.8;
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
    font-size: 1.3rem;
    color: rgb(209, 209, 209);
    margin-bottom: 0;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.item-balance {
    font-weight: 400;
    margin-top: 0.5rem;
}

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

.referral-card {
    max-width: 480px;
    width: 85vw;
    margin: 0 auto;
    padding-left: 12px;
    padding-right: 12px;
    padding-top: 10px;
    background-color: #292a2a;
    border-radius: 12px;
    color: #f9fafb;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-bottom: 1rem;
    user-select: none;
}

.ref-header-image {
    display: flex;
    margin: 1rem;
    margin-top: 0;
    width: 40px;
    height: 44px;
    align-items: center;
    justify-content: center;
    background: linear-gradient(#3b82f6, #733bf6);
    padding: 24px;
    border-radius: 20px;
}

.ref-header-image img {
    width: 36px;
    height: 48px;
    margin: auto auto;
}

.card-title {
    display: flex;
    align-items: center;
    font-size: 1.55rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
    text-align: center;
}

.ref-description {
    color: rgba(207, 207, 207, 0.88);
    text-align: center;
    width: 100%;
    margin-top: 0.5rem;
    margin-bottom: 1.05rem;
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
}


.highlighted-words {
    background-image: linear-gradient(to right, #3b82f6, #733bf6);
    color: transparent;
    background-clip: text;
}

.ref-hints {
    font-size: 0.75rem;
    color: rgb(213, 213, 213, 0.88);
    font-family: "Montserrat", sans-serif;
    font-weight: 600;
}

.value-and-image img {
    height: 20px;
    width: 20px;
}

.starter-statistics-container {
    display: flex;
    gap: 16px;
    margin-bottom: 0.35rem;
    margin: auto auto;
}

.stats-box {
    display: flex;
    flex-direction: column;
    padding: 18px 36px 18px 36px;
    width: 5rem;
    gap: 12px;
    align-items: center;
    justify-content: center;
    background-color: rgb(73, 74, 74, 0.88);
    border-radius: 16px;
}

.action-btn-one,
.action-btn-two {
    display: flex;
    width: max(80%, 130px);
    height: 100px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    border-radius: 16px;
    font-size: 1.1rem;
    padding: 12px 20px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    text-align: center;
}

.action-btn-one {
    background-color: #3b3c3c;
    color: white;
}

.copy-text {
    width: min(90%, 180px);
}

.action-btn-two span {
    color: black;
    outline: none;
}

.buttons-group {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 90%;
    margin: auto auto;
    margin-top: 1.25rem;
}

.large-link-show {
    width: 90%;
    background-color: #4d4f4f;
    padding: 16px;
    border-radius: 16px;
    margin: auto auto;
}

.large-link-header {
    color: rgb(217, 216, 216, 0.88);
}

.small-link-show {
    background-color: #353737;
    border-radius: 16px;
    text-align: center;
    padding: 20px;
    margin-top: 0.6rem;
}

@media (max-height: 700px) {
    .wallet-info-modal {
        height: max(450px, 85vh);
    }

    .card-title {
        font-size: 0.85rem;
    }

    .large-link-show {
        padding: 8px;
        font-size: 0.8rem;
    }

    .ref-description {
        font-size: 0.8rem;
    }

    .action-btn-one {
        font-size: 0.85rem;
    }

    .action-btn-two {
        font-size: 0.75rem;
    }
}
</style>
