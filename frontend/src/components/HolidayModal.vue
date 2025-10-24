<template>
    <Teleport to="body" v-if="visible">
        <Transition name="modal-fade">
            <div class="overlay" @click.self="close">
                <div class="modal">
                    <header class="modal-header">
                        <h2 class="modal-title">{{ translatedTitle(holiday.name, holiday.name_en) }}</h2>
                        <button class="modal-close" @click="close" aria-label="Close">✖</button>
                    </header>

                    <div v-if="holiday.image_path" class="modal-image"
                        :style="{ backgroundImage: `url(${holiday.image_path})` }" />

                    <section class="modal-body">
                        <span class="date-text"> {{ holidayDateTransform(holiday.date) }} </span>
                        <p>{{ translatedDescription(holiday.description, holiday.description_en) }}</p>
                    </section>

                    <button class="action-btn" @click="shareHolidayMessage">
                        <div class="btn-content">
                            <img :src="shareImg">
                            <span>{{ $t("share-holiday") }}</span>
                        </div>
                    </button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { useTelegram } from '@/services/telegram.js'
import { useAppStore } from '@/stores/appStore'
import shareImg from '@/assets/icons/Share_Icon.png'

const app = useAppStore()

const { user } = useTelegram()
const { tg } = useTelegram()

const props = defineProps({
    visible: Boolean,
    language: String,
    holiday: {
        type: Object,
        required: true
        // expected shape: { name, description, image_path, date }
    }
})
const emit = defineEmits(['close'])

function translatedTitle(titleRu, titleEn) {
    return props.language === "ru" ? titleRu : titleEn
}

function translatedDescription(descriptionRu, descriptionEn) {
    return props.language === "ru" ? descriptionRu : descriptionEn
}

/**
 * Format a holiday date depending on props.language:
 * - "ru" => "23 июля"
 * - "en" => "July 23"
 *
 * Accepts Date objects, numeric timestamps, or date strings (ISO). Returns empty string for invalid input.
 */
function holidayDateTransform(holDate) {
    if (holDate == null) return ''

    // normalize to a Date object
    let d
    if (holDate instanceof Date) {
        d = holDate
    } else if (typeof holDate === 'number') {
        d = new Date(holDate)
    } else if (typeof holDate === 'string') {
        // try ISO / standard parsing
        d = new Date(holDate)
    } else {
        // fallback: attempt coercion
        d = new Date(String(holDate))
    }

    if (Number.isNaN(d.getTime())) return ''

    // choose locale and options based on props.language
    const lang = props.language === 'ru' ? 'ru' : 'en' // default to 'en' for anything else
    const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
    const options = lang === 'ru'
        ? { day: 'numeric', month: 'long' }      // "23 июля"
        : { month: 'long', day: 'numeric' }     // "July 23"

    try {
        return new Intl.DateTimeFormat(locale, options).format(d)
    } catch (e) {
        // fallback to manual small lookup (shouldn't be needed in modern environments)
        if (lang === 'ru') {
            const monthsRu = [
                'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
            ]
            const day = d.getDate()
            const month = monthsRu[d.getMonth()]
            return `${day} ${month}`
        } else {
            const monthsEn = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ]
            const day = d.getDate()
            const month = monthsEn[d.getMonth()]
            return `${month} ${day}`
        }
    }
}

function close() {
    emit('close')
}

function shareHolidayMessage() {
    let ref = user?.id ?? ""
    let shareLink = 'https://t.me/myoraclerobot?startapp=' + ref
    let messageText = ''
    if (app.language === 'ru') {
        messageText = `%0AУже ${holidayDateTransform(props.holiday.date)} будет ${props.holiday.name} 🔔%0A%0AПОДАРКИ В 03:00 ❓❓❓`
    } else {
        messageText = `%0ASoon as ${holidayDateTransform(props.holiday.date)} there will be a ${props.holiday.name_en} 🔔%0A%0AGIFTS AT 3 AM ❓❓❓`
    }
    tg.openTelegramLink(`https://t.me/share/url?url=${shareLink}&text=${messageText}`)
    close()
}


</script>

<style scoped>
/* Fade animation */
.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
}

.overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.84);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 20px;
    z-index: 1000;
    user-select: none;
}

.modal {
    background: #292a2a;
    width: 85%;
    max-width: 500px;
    max-height: max(70vh, 550px);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    margin: auto auto;
    user-select: none;
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #292a2a;
    border-bottom: 1px solid #313131;
}

.modal-title {
    margin: 0;
    font-size: 1.2rem;
    color: #ffffff;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.date-text {
    display: block;
    margin-bottom: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
    color: #ffffff;
    padding: 6px;
    border-radius: 6px;
    user-select: none;
}

.modal-close:hover {
    background: rgba(255, 255, 255, 0.03);
}

.modal-image {
    width: 100%;
    height: 250px;
    background-size: cover;
    background-position: center;
}

.modal-body {
    padding: 16px;
    padding-bottom: 12px;
    overflow-y: auto;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #ffffff;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.action-btn {
    margin: 0px auto 20px auto;
    width: 75%;
    padding: 12px 16px;
    background-color: #0098EA;
    color: #ffffff;
    font-size: 1.25rem;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    align-self: center;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.action-btn:hover {
    background-color: #028fdc;
}

.btn-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.btn-content span {
    font-size: 1rem;
}

.btn-content img {
    height: 16px;
    width: 12px;
}
</style>
