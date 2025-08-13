<template>
    <Teleport to="body" v-if="visible">
        <Transition name="modal-fade">
            <div class="overlay" @click.self="close">
                <div class="modal">
                    <header class="modal-header">
                        <h2 class="modal-title">{{ holiday.name }}</h2>
                        <button class="modal-close" @click="close" aria-label="Close">✖</button>
                    </header>

                    <div v-if="holiday.image_path" class="modal-image"
                        :style="{ backgroundImage: `url(${holiday.image_path})` }" />

                    <section class="modal-body">
                        <span class="date-text"> {{ holidayDateTransform(holiday.date) }} </span>
                        <p>{{ holiday.description }}</p>
                    </section>

                    <button class="action-btn" @click="shareHolidayMessage">
                        Поделиться праздником
                    </button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { useTelegram } from '@/services/telegram.js'

const { user } = useTelegram()
const { tg } = useTelegram()

const props = defineProps({
    visible: Boolean,
    holiday: {
        type: Object,
        required: true
        // expected shape: { name, description, image_path, date }
    }
})
const emit = defineEmits(['close'])

/**
 * Format a holiday date into Russian short form: "23 июля", "15 августа", "1 декабря"
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

    // Intl provides proper Russian month in genitive ("июля"), and respects locale
    try {
        return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(d)
    } catch (e) {
        // fallback to manual small lookup (shouldn't be needed in modern environments)
        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ]
        const day = d.getDate()
        const month = months[d.getMonth()]
        return `${day} ${month}`
    }
}

function close() {
    emit('close')
}

function shareHolidayMessage() {
    let ref = user?.id ?? ""
    let shareLink = 'https://t.me/GiftsPredict_Bot?startapp=' + ref
    let messageText = `%0AУже ${holidayDateTransform(props.holiday.date)} будет ${props.holiday.name} 🔔%0A%0AПОДАРКИ В 03:00 ❓❓❓`
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
}

.modal {
    background: #292a2a;
    width: 85%;
    max-width: 500px;
    max-height: 70vh;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    margin-top: 20vh;
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
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    font-weight: 600;
}

.date-text {
    display: block;
    margin-bottom: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    font-weight: 500;
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
    overflow-y: auto;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #ffffff;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
}

.action-btn {
    margin: 16px auto 20px;
    width: 75%;
    padding: 12px 0;
    background-color: #0098EA;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    align-self: center;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
}

.action-btn:hover {
    background-color: #028fdc;
}
</style>
