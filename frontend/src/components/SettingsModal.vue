<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="$emit('close')" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="settings-modal">
                <div class="footer">
                    <h2>Настройки</h2>
                    <button class="close-btn" @click="$emit('close')">✖</button>
                </div>
                <div class="items-group">
                    <h2 class="item-header">ЯЗЫК</h2>
                    <div class="options-grid">
                        <!-- <button class="option" :class="{ active: selectedLanguage === 'EN' }"
                            @click="selectLanguage('EN')">
                            <img :src="EnIcon" alt="">
                            <span>EN</span>
                        </button> -->
                        <button class="option" :class="{ active: selectedLanguage === 'RU' }"
                            @click="selectLanguage('RU')">
                            <img :src="RuIcon" alt="">
                            <span>RU</span>
                        </button>
                    </div>
                </div>
                <div class="items-group">
                    <h2 class="item-header">УВЕДОМЛЕНИЯ ПО СОБЫТИЯМ</h2>
                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedNotifyBets === 'yes' }"
                            @click="selectNotifyBets('yes')">
                            <span>ВКЛ</span>
                        </button>
                        <button class="option" :class="{ active: selectedNotifyBets === 'no' }"
                            @click="selectNotifyBets('no')">
                            <span>ВЫКЛ</span>
                        </button>
                    </div>
                </div>
                <div class="items-group">
                    <div class="buttons-group">
                        <button class="action-btn-one" @click="$emit('open-privacy')">
                            <img :src="PrivacyIcon">
                            Соглашение
                        </button>
                        <button class="action-btn-two" @click="$emit('open-support')">
                            <img :src="ContactIcon">
                            <span>Поддержка</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import RuIcon from '@/assets/icons/Ru_Icon.png'
// import EnIcon from '@/assets/icons/En_Icon.png'
import ContactIcon from '@/assets/icons/Contact_Icon.png'
import PrivacyIcon from '@/assets/icons/Privacy_Icon.png'
import { ref } from 'vue'

defineProps({
    /** whether the modal is visible */
    show: Boolean,
})
const emit = defineEmits(['close', 'open-privacy', 'open-support'])

// track selected
const selectedLanguage = ref('RU')

// handler
function selectLanguage(code) {
    selectedLanguage.value = code
    // optionally notify parent: emit('update:lang', code)
}

// track selected
const selectedNotifyBets = ref('yes')

// handler
function selectNotifyBets(option) {
    selectedNotifyBets.value = option
    // optionally notify parent: emit('update:lang', code)
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
    height: 42vh;
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
</style>
