<template>
    <Teleport to="body" v-if="visible">
        <Transition name="modal-fade">
            <div class="overlay" @click.self="close">
                <div class="modal">
                    <header class="modal-header">
                        <h2 class="modal-title">{{ holiday.name }}</h2>
                        <button class="modal-close" @click="close">✖</button>
                    </header>
                    <div v-if="holiday.image_path" class="modal-image"
                        :style="{ backgroundImage: `url(${holiday.image_path})` }" />
                    <section class="modal-body">
                        <span class="date-text"> {{ holidayDateTransform(holiday.date) }} </span>
                        <p>{{ holiday.description }}</p>
                    </section>
                    <button class="action-btn" @click="shareHolidayMessage"> Поделиться праздником </button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { useTelegram } from '@/services/telegram.js'

const webApp = useTelegram().tg

const props = defineProps({
    visible: Boolean,
    holiday: {
        type: Object,
        required: true,
        // expected shape: { name, description, image_path }
    }
})
const emit = defineEmits(['close'])

function holidayDateTransform(holDate) {
    // 1) Normalize to a Date object
    const date = (holDate instanceof Date)
        ? holDate
        : new Date(holDate);

    // 2) Month names lookup
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const month = monthNames[date.getUTCMonth()];

    // 3) Day of month
    const day = date.getUTCDate();

    // 4) Ordinal suffix logic
    let suffix = 'th';
    if (day % 10 === 1 && day % 100 !== 11) suffix = 'st';
    else if (day % 10 === 2 && day % 100 !== 12) suffix = 'nd';
    else if (day % 10 === 3 && day % 100 !== 13) suffix = 'rd';

    // 5) Build result
    return `${month} ${day}${suffix}`;
}


function close() {
    emit('close')
}

async function shareHolidayMessage() {
    try {
        // 1) Prepare the inline message on your server
        const resp = await fetch('/api/prepareShare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mediaUrl: props.holiday.image_path,
                caption: `<b>${props.holiday.name}</b>\n\n${props.holiday.description}`,
                user_id: 936063094,
                peer_types: ['user', 'group']
            })
        })
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            throw new Error(err.error || 'prepareShare failed')
        }
        const { preparedMessageId } = await resp.json()

        // 2) Check support
        if (typeof webApp.shareMessage !== 'function') {
            return console.warn('shareMessage not supported')
        }

        // 3) Open Telegram share dialog
        await webApp.shareMessage(preparedMessageId)
        console.log('Share dialog opened!')

        // 4) Optional: handle callbacks
        webApp.onEvent('shareMessageSent', () => {
            console.log('User shared successfully!')
            // you could close the modal here
            emit('close')
        })
        webApp.onEvent('shareMessageFailed', (e) => {
            console.warn('Share failed or canceled', e)
        })

    } catch (err) {
        console.error('Error in shareHolidayMessage:', err)
    }
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
    color: White;
    font-family: Inter;
}

.date-text {
    opacity: 0.8;
    color: rgb(255, 255, 255);
    font-family: Inter;
    font-weight: 400;
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.7rem;
    line-height: 1;
    cursor: pointer;
    color: White;
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
    color: White;
    font-family: Inter;
}

.action-btn {
    margin-bottom: 1.25rem;
    width: 75%;
    padding: 16px 0;
    background-color: #0098EA;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    align-self: center;
    font-family: Inter;
}

.action-btn:hover {
    background-color: #028fdc;
}
</style>
