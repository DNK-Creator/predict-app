<template>
    <div class="profile-card">
        <img v-if="user?.photo_url" :src="user.photo_url" alt="Profile" class="profile-pic" />
        <div v-else class="profile-avatar">
            {{ (user?.first_name ?? 'A').charAt(0) }}
        </div>
        <h2 class="profile-name">{{ user?.first_name ?? 'Anonymous' }}</h2>

        <div class="stats-row">
            <div class="stat-item">
                <div class="stat-value">
                    <span>{{ totalVolume }}</span>
                    <img :src="tonWhiteIcon" class="icon-diamond">
                </div>
                <div class="stat-label">Общий объем</div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewPreviousBets">
                <div class="stat-value">
                    <span>{{ betsMade }}</span>
                    <img :src="betIcon" class="icon-box">
                </div>
                <div class="stat-label">Предсказано всего ></div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewWonPreviousBets">
                <div class="stat-value">
                    <span>{{ betsWon }}</span>
                    <img :src="wonIcon" class="icon-box">
                </div>
                <div class="stat-label">Предсказано правильно ></div>
            </div>
        </div>
    </div>
</template>

<script setup>

import { defineProps, defineEmits } from 'vue'
import tonWhiteIcon from '@/assets/icons/TON_White_Icon.png'
import betIcon from '@/assets/icons/Bet_Icon.png'
import wonIcon from '@/assets/icons/Won_Icon.png'

const props = defineProps({
    user: Object,
    totalVolume: Number,
    betsMade: Number,
    betsWon: Number,
})

const emit = defineEmits(['view-previous-bets', 'view-won-bets'])

function viewPreviousBets() {
    emit('view-previous-bets')
}

function viewWonPreviousBets() {
    emit('view-won-bets')
}

</script>

<style scoped>
.profile-card {
    max-width: 480px;
    width: 85vw;
    margin: 0 auto;
    padding: 24px;
    border-radius: 12px;
    text-align: center;
    color: #ffffff;
}

.profile-avatar {
    width: 88px;
    height: 88px;
    font-family: 'Inter Variable', sans-serif;
    border-radius: 30%;
    object-fit: cover;
    border: 2px solid #374151;
    margin: 0 auto 12px;
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
}

.profile-pic {
    width: 88px;
    height: 88px;
    border-radius: 30%;
    object-fit: cover;
    margin: 0 auto 12px;
}


.profile-name {
    font-size: 1.5rem;
    margin-bottom: 16px;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.stats-row {
    display: flex;
    justify-content: space-between;
}

.stat-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.divider {
    width: 2px;
    height: 32px;
    background-color: #242b36;
    margin: 0 16px;
    align-self: center;
}

.stat-item+.stat-item {
    margin-left: 16px;
}

.stat-value {
    display: flex;
    align-items: center;
    font-size: 1.3rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    gap: 0.25rem;
}

.icon-diamond,
.icon-box {
    width: 1rem;
    height: 1rem;
}

.stat-label {
    margin-top: 4px;
    font-size: 0.875rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    color: #9ca3af;
}
</style>
