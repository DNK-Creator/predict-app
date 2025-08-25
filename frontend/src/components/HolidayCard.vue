<template>
    <div class="card" @click="$emit('click')" tabindex="0">
        <div class="card-bg" :style="{ backgroundImage: `url(${bgImage})` }" />
        <div class="card-overlay"></div>
        <div class="card-content">
            <h3 class="card-title">{{ title }}</h3>
            <p class="card-date">{{ formattedDate }}</p>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    title: String, // already translated in parent script
    bgImage: String,
    date: [Date, String, Number],
    language: String
})
defineEmits(['click'])

const formattedDate = computed(() => formatDate(props.date, props.language))

function formatDate(inputDate, language) {
    if (!inputDate) return ''

    const date = (inputDate instanceof Date) ? new Date(inputDate) : new Date(inputDate)
    if (Number.isNaN(date.getTime())) return ''

    const toLocalMidnight = (d) => {
        const dd = new Date(d)
        dd.setHours(0, 0, 0, 0)
        return dd
    }

    const today = toLocalMidnight(new Date())
    const target = toLocalMidnight(date)
    const MS_PER_DAY = 24 * 60 * 60 * 1000

    // integer day difference (target - today)
    const diffDays = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)

    // Russian pluralization helper for "день/дня/дней"
    function ruPlural(n, forms) {
        n = Math.abs(n) % 100
        const n10 = n % 10
        if (n > 10 && n < 20) return forms[2]
        if (n10 === 1) return forms[0]
        if (n10 >= 2 && n10 <= 4) return forms[1]
        return forms[2]
    }

    // choose locale and produce the date part ("23 июля" or "July 23")
    const lang = (language === 'ru') ? 'ru' : 'en'
    let datePart = ''
    try {
        if (lang === 'ru') {
            datePart = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date)
        } else {
            datePart = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date)
        }
    } catch (e) {
        // fallback manual month lists
        if (lang === 'ru') {
            const monthsGenitive = [
                'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
            ]
            datePart = `${date.getDate()} ${monthsGenitive[date.getMonth()]}`
        } else {
            const monthsEn = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ]
            datePart = `${monthsEn[date.getMonth()]} ${date.getDate()}`
        }
    }

    // build relative part
    if (lang === 'ru') {
        let relative = ''
        if (diffDays === 0) relative = 'сегодня'
        else if (diffDays === 1) relative = 'завтра'
        else if (diffDays === -1) relative = 'вчера'
        else if (diffDays > 1) relative = `через ${diffDays} ${ruPlural(diffDays, ['день', 'дня', 'дней'])}`
        else /* diffDays < -1 */ relative = `${Math.abs(diffDays)} ${ruPlural(diffDays, ['день', 'дня', 'дней'])} назад`

        return `${datePart}, ${relative}`
    } else {
        // English relative
        let relative = ''
        if (diffDays === 0) relative = 'today'
        else if (diffDays === 1) relative = 'tomorrow'
        else if (diffDays === -1) relative = 'yesterday'
        else if (diffDays > 1) relative = `in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`
        else /* diffDays < -1 */ relative = `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} ago`

        return `${datePart}, ${relative}`
    }
}
</script>


<style scoped>
.card {
    position: relative;
    width: 100%;
    box-sizing: box;
    height: 160px;
    margin: 12px 0;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* Hover / focus feedback */
.card:hover {
    transform: scale(1.02);
    transition: transform 0.2s ease;
}

.card:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.5);
}

/* --- Enter (mount) animation --- */
.card-enter-from {
    transform: translateY(20px);
    opacity: 0;
}

.card-enter-active {
    transition: transform 0.4s ease, opacity 0.4s ease;
}

.card-enter-to {
    transform: translateY(0);
    opacity: 1;
}

/* --- Leave animation (optional) --- */
.card-leave-active {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.card-leave-to {
    transform: translateY(20px);
    opacity: 0;
}

/* Card inner styling */
.card-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
}

.card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 15%, transparent);
}

.card-content {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    color: #fff;
    z-index: 1;
}

.card-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: bold;
}

.card-date {
    margin: 4px 0 0;
    font-size: 0.9rem;
    line-height: 1.2;
    color: rgb(216, 216, 216, 0.88);
}
</style>
