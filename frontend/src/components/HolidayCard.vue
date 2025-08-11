<template>
    <div class="card" @click="$emit('click')" tabindex="0">
        <div class="card-bg" :style="{ backgroundImage: `url(${bgImage})` }" />
        <div class="card-overlay" />
        <div class="card-content">
            <h3 class="card-title">{{ title }}</h3>
            <p class="card-desc">{{ shortDesc }}</p>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    title: String,
    shortDesc: String,
    bgImage: String,
    date: Date,
})
defineEmits(['click'])
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
    background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent);
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

.card-desc {
    margin: 4px 0 0;
    font-size: 0.9rem;
    line-height: 1.2;
}
</style>
