<template>
    <div class="referral-card">
        <h3 class="card-title">
            INVITE FRIENDS AND EARN TON
            <img :src="tonWhiteIcon" alt="TON Icon" class="ton-white-icon" />
        </h3>
        <ul class="benefits-list">
            <li class="benefit-item">
                <span class="icon referral-icon">🎯</span>
                <div class="benefit-content">
                    <span class="benefit-title">Referral commissions</span>
                    <span class="benefit-desc">Earn 5% in TON from their bet winnings</span>
                </div>
            </li>
            <li class="divider"></li>
            <li class="benefit-item">
                <span class="icon points-icon">⭐</span>
                <div class="benefit-content">
                    <span class="benefit-title">Limitless earnings</span>
                    <span class="benefit-desc">Invite your entire community to join your bets</span>
                </div>
            </li>
            <li class="divider"></li>
            <li class="benefit-item">
                <span class="icon cashback-icon">💰</span>
                <div class="benefit-content">
                    <span class="benefit-title">Cashback - earn stars from users purchases</span>
                    <span class="benefit-desc">Anyone can participate and make a TON of stars</span>
                </div>
            </li>
        </ul>
        <button class="invite-button" @click="$emit('invite')">Invite friends</button>
    </div>
    <div class="follow-card" @click="openChannel">
        <h3 class="card-title">
            FOLLOW OUR CHANNEL, LETS CONNECT!
            <img :src="tonWhiteIcon" alt="TON Icon" class="ton-white-icon" />
        </h3>
        <button class="follow-button">@gifts_predict</button>
    </div>
</template>

<script setup>
import { defineEmits } from 'vue'
import { useTelegram } from '@/services/telegram'
import tonWhiteIcon from '@/assets/icons/TON_White_Icon.png'

const emit = defineEmits(['invite'])
const channelLink = 'https://t.me/giftspredict'
const { tg } = useTelegram()

function openChannel() {
    if (channelLink.includes('t.me')) {
        tg.openTelegramLink(channelLink)
    } else {
        tg.openLink(channelLink)
    }
}
</script>

<style scoped>
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
    gap: 6px;
    margin-bottom: 1rem;
}

.follow-card {
    max-width: 480px;
    width: 85vw;
    height: 12vh;
    margin: 0 auto;
    padding-left: 12px;
    padding-right: 12px;
    padding-top: 10px;
    background-color: #292a2a;
    border-radius: 12px;
    color: #f9fafb;
    display: flex;
    flex-direction: column;
}

.follow-button {
    margin-top: 2rem;
    width: 70%;
    height: 50%;
    border-radius: 20px;
    border: none;
    margin: auto auto;
    background-color: #333333;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Inter Variable', sans-serif;
}

.card-title {
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 600;
    color: #9ca3af;
    opacity: 0.7;
    margin: 0;
}

.ton-white-icon {
    width: 16px;
    height: 16px;
    margin-left: 6px;
}

.benefits-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
}

.benefit-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 0;
}

.divider {
    height: 2px;
    background-color: #313131;
    margin: 4px 0;
}

.icon {
    font-size: 1.2rem;
    flex-shrink: 0;
}

.benefit-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.benefit-title {
    margin-top: 0.3rem;
    font-size: 1.1rem;
    font-weight: 400;
    color: #f9fafb;
    font-family: 'Inter Variable', sans-serif;
}

.benefit-desc {
    font-size: 0.9rem;
    color: #9ca3af;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.invite-button {
    margin-bottom: 12px;
    width: 95%;
    padding: 16px 0;
    background-color: #3b82f6;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    align-self: center;
    font-family: 'Inter Variable', sans-serif;
}

.invite-button:hover {
    background-color: #2563eb;
}
</style>
