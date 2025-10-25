<template>
    <header v-if="!hideHeader" class="app-header">
        <!-- Show if the current page is profile view -->
        <div class="profile-left-group" v-if="showSettings">
            <button class="icon-button-two" @click="onSettingsClick">
                <img :src="settingsImg" class="icon-button-two">
            </button>
            <button class="icon-button-two" @click="onHistoryClick">
                <img :src="historyImg" class="icon-button-two">
            </button>
        </div>
        <!-- Else show the user logo -->
        <img v-else-if="user" :src="user.photo_url" alt="Profile" class="profile-pic" @click="onProfileClick" />
        <div v-else class="profile-avatar" @click="onProfileClick">
            {{ (user?.first_name ?? 'A').charAt(0) }}
        </div>

        <div class="spacer"></div>

        <div v-if="balance <= 0 && (address === null || address === undefined)" class="wallet-connect-container"
            @click="walletConnect">
            <img :src="tonIcon" class="wallet-address-icon">
            <p class="wallet-address">{{ $t("connect-wallet") }}</p>
        </div>
        <div v-else class="balance-container" @click="onDepositClick">
            <!-- Diamond Icon SVG -->
            <img :src="tonImg" class="diamond-icon">
            <span class="balance-text">{{ balance }} TON</span>
            <button class="icon-button plus-button">
                <!-- Plus Icon SVG -->
                <img :src="plusImg" class="icon">
            </button>
        </div>

    </header>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTelegram } from '@/services/telegram.js'
import settingsImg from '@/assets/icons/Settings_Icon.png'
import historyImg from '@/assets/icons/History_Icon.png'
import tonImg from '@/assets/icons/TON_Icon.png'
import tonIcon from '@/assets/icons/TON_White_Icon.png'
import plusImg from '@/assets/icons/Plus_Icon.png'

const props = defineProps({
    balance: {
        type: Number,
        default: 0
    },
    address: String
})
const emit = defineEmits(['settings-click', 'deposit-click', 'profile-click', 'wallet-connect', 'history-click'])

const route = useRoute()

const { user } = useTelegram()

const settingsRoutes = ['deposit', 'bets-history', 'profile']
const headerHideRoutes = ['deposit', 'privacy', 'bets-history', 'gifts-prices', 'running']

const showSettings = computed(() =>
    settingsRoutes.includes(route.name)
)

const hideHeader = computed(() =>
    headerHideRoutes.includes(route.name)
)

function onSettingsClick() {
    emit('settings-click')
}

function walletConnect() {
    emit('wallet-connect')
}

function onDepositClick() {
    emit('deposit-click')
}

function onProfileClick() {
    emit('profile-click')
}

function onHistoryClick() {
    emit('history-click')
}
</script>

<style scoped>
.app-header {
    display: flex;
    align-items: center;
    padding: 0 16px;
    height: 56px;
    color: #ffffff;
    user-select: none;
}

/* wrapper for letter-avatar fallback (keeps same size as image) */
.profile-avatar {
    cursor: pointer;
    width: 2.3rem;
    height: 2.3rem;
    font-size: 0.95rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 40%;
    background: #111827;
    color: #fff;
    box-sizing: border-box;
    border: 2px solid #374151;
    padding: 0;
    /* no internal padding — so text centers correctly */
    flex-shrink: 0;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

/* actual profile image */
.profile-pic {
    cursor: pointer;
    width: 2.3rem;
    height: 2.3rem;
    display: block;
    /* prevents baseline whitespace */
    object-fit: cover;
    /* crop and fill the box */
    border-radius: 40%;
    box-sizing: border-box;
    /* so border doesn't change content size */
    border: 2px solid #374151;
    padding: 0;
    /* remove padding so image fills the box */
    flex-shrink: 0;
}

.profile-pic img {
    height: 100%;
    width: 100%;
}

.profile-left-group {
    display: flex;
    gap: 8px;
}

.icon-button-two,
.icon-button {
    background: none;
    border: none;
    padding: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
}

.icon-button-two {
    padding: 0px;
}

.icon {
    width: 24px;
    height: 24px;
}

.spacer {
    flex: 1;
}

.balance-container {
    display: flex;
    align-items: center;
    background-color: #1E2337;
    padding: 2px 7px;
    border-radius: 24px;
    height: 30px;
    cursor: pointer;
}

.diamond-icon {
    width: 20px;
    height: 20px;
    margin-left: 6px;
}

.balance-text {
    font-size: 0.95rem;
    margin-left: 7px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.plus-button .icon {
    width: 20px;
    height: 20px;
    margin-left: 5px;
}

.wallet-connect-container {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    background-color: #323437;
    border-radius: 28px;
    padding: 8px 12px 8px 12px;
    margin: auto auto;
    cursor: pointer;
    width: 45%;
    max-width: 165px;
    background-color: #3b82f6;
    text-align: center;
}

.wallet-address {
    margin: 0.25rem 0;
    font-size: 0.75rem;
    font-weight: bold;
    width: min(100%, 180px);
}

.wallet-address-icon {
    height: 12px;
    width: 12px;
    -webkit-user-drag: none;
    user-select: none;
    -moz-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
}
</style>
