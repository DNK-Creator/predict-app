<template>
    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="onClose" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
                <div class="footer">
                    <h2>{{ $t('settings') }}</h2>
                    <button class="close-btn" @click="onClose" :disabled="saving">✖</button>
                </div>

                <div class="items-group">
                    <h2 class="item-header">{{ $t('language-caps') }}</h2>
                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedLanguage === 'EN' }"
                            @click="selectLanguage('EN')" :disabled="saving" aria-pressed="selectedLanguage === 'EN'">
                            <img :src="EnIcon" alt="EN">
                            <span>EN</span>
                        </button>

                        <button class="option" :class="{ active: selectedLanguage === 'RU' }"
                            @click="selectLanguage('RU')" :disabled="saving" aria-pressed="selectedLanguage === 'RU'">
                            <img :src="RuIcon" alt="RU">
                            <span>RU</span>
                        </button>
                    </div>
                </div>

                <div class="items-group">
                    <h2 class="item-header">{{ $t('events-alerts-caps') }}</h2>
                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedNotifyBets === 'yes' }"
                            @click="selectNotifyBets('yes')" :disabled="saving">
                            <span>{{ $t('on') }}</span>
                        </button>
                        <button class="option" :class="{ active: selectedNotifyBets === 'no' }"
                            @click="selectNotifyBets('no')" :disabled="saving">
                            <span>{{ $t('off') }}</span>
                        </button>
                    </div>
                </div>

                <!-- NEW: Game Demo-Mode (local only, not persisted to DB) -->
                <div class="items-group">
                    <h2 class="item-header">{{ $t('game-demo') }}</h2>
                    <div class="options-grid">
                        <button class="option" :class="{ active: selectedDemoMode === 'no' }"
                            @click="selectDemoMode('no')" :disabled="saving" aria-pressed="selectedDemoMode === 'no'">
                            <span>{{ $t('off') }}</span>
                        </button>
                        <button class="option" :class="{ active: selectedDemoMode === 'yes' }"
                            @click="selectDemoMode('yes')" :disabled="saving" aria-pressed="selectedDemoMode === 'yes'">
                            <span>{{ $t('on') }}</span>
                        </button>
                    </div>
                </div>

                <div class="items-group">
                    <div class="buttons-group">
                        <button class="action-btn-one" @click="$emit('open-privacy')" :disabled="saving">
                            <img :src="PrivacyIcon" alt="">
                            {{ $t('agreement') }}
                        </button>
                        <button class="action-btn-two" @click="$emit('open-support')" :disabled="saving">
                            <img :src="ContactIcon" alt="">
                            <span>{{ $t('support') }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
import RuIcon from '@/assets/icons/Ru_Icon.png'
import EnIcon from '@/assets/icons/En_Icon.png'
import ContactIcon from '@/assets/icons/Contact_Icon.png'
import PrivacyIcon from '@/assets/icons/Privacy_Icon.png'
import { ref, watch, computed } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

const props = defineProps({
    /** whether the modal is visible */
    show: Boolean,
})
const emit = defineEmits(['close', 'open-privacy', 'open-support'])

const store = useAppStore()
const { t } = useI18n({ useScope: 'global' })

// saving state
const saving = ref(false)

// initialize selectedLanguage from the store (store.language is normalized e.g. 'en'/'ru')
const selectedLanguage = ref((store.language ?? 'en').toUpperCase())

// keep selectedLanguage in sync if store changes elsewhere
watch(
    () => store.language,
    (v) => {
        selectedLanguage.value = (v ?? 'en').toUpperCase()
    },
    { immediate: true }
)

// language selection handler
async function selectLanguage(code) {
    if (!code) return
    if (selectedLanguage.value === code) return

    saving.value = true
    selectedLanguage.value = code

    // convert to normalized lower-case lang code (en, ru)
    const langCode = String(code).toLowerCase()

    try {
        // call store action which persists to Supabase and updates store.language
        const ok = await store.changeLanguage(langCode)
        if (ok) {
            toast.success(t('language-saved') || 'Language saved')
        } else {
            toast.error(t('language-save-failed') || 'Failed to save language')
        }
    } catch (err) {
        console.error('selectLanguage error', err)
        toast.error(t('language-save-failed') || 'Failed to save language')
    } finally {
        saving.value = false
    }
}

// Notifications toggle (keeps the original logic)
const selectedNotifyBets = ref('yes')
function selectNotifyBets(option) {
    selectedNotifyBets.value = option
    // TODO: persist user preference if you store it server-side
}

// --- Demo Mode (local-only) ---
// This setting is intentionally NOT persisted to the DB. It's kept in-memory on the Pinia store
// so the rest of the app can read `store.demoMode` while the page/session is active. On page
// refresh the store resets and demo mode returns to default 'no' as requested.

const selectedDemoMode = ref(store.demoMode ? 'yes' : 'no')

// When the modal opens, ensure the UI reflects the current store value
watch(
    () => props.show,
    (v) => {
        if (v) selectedDemoMode.value = store.demoMode ? 'yes' : 'no'
    }
)

function selectDemoMode(option) {
    selectedDemoMode.value = option
    // update the app store in-memory flag (no DB persistence)
    store.setDemoMode(option === 'yes')
}

function onClose() {
    // do not allow closing while saving to avoid race conditions
    if (saving.value) return
    emit('close')
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
</style>
