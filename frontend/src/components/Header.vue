<template>
    <header v-if="!hideHeader" class="app-header">
        <!-- Show if the current page is profile view -->
        <button v-if="showSettings" class="icon-button" @click="onSettingsClick">
            <!-- Gear Icon -->
            <img :src="settingsImg" class="icon-button">
        </button>
        <!-- Else show the user logo -->
        <img v-else-if="user" :src="user.photo_url" alt="Profile" class="profile-pic" />
        <div v-else class="profile-avatar">
            {{ (user?.first_name ?? 'A').charAt(0) }}
        </div>

        <div class="spacer"></div>

        <div class="balance-container" @click="onDepositClick">
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
import tonImg from '@/assets/icons/TON_Icon.png'
import plusImg from '@/assets/icons/Plus_Icon.png'

const props = defineProps({
    balance: {
        type: Number,
        default: 0
    }
})
const emit = defineEmits(['settings-click', 'deposit-click'])

const route = useRoute()

const { user } = useTelegram()

const settingsRoutes = ['deposit', 'bets-history', 'profile']
const headerHideRoutes = ['deposit']

const showSettings = computed(() =>
    settingsRoutes.includes(route.name)
)

const hideHeader = computed(() =>
    headerHideRoutes.includes(route.name)
)

function onSettingsClick() {
    emit('settings-click')
}

function onDepositClick() {
    emit('deposit-click')
}
</script>

<style scoped>
.app-header {
    display: flex;
    align-items: center;
    padding: 0 16px;
    height: 56px;
    color: #ffffff;
}

.profile-avatar {
    width: 1.3rem;
    height: 1.3rem;
    font-size: 1rem;
    text-align: center;
    text-justify: center;
    border-radius: 40%;
    object-fit: cover;
    border: 2px solid #374151;
    padding: 10px;
    font-family: Inter;
}

.profile-pic {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 40%;
    object-fit: cover;
    border: 2px solid #374151;
    padding: 10px;
}

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
    color: #10b981;
}

.balance-text {
    font-weight: 500;
    font-size: 0.95rem;
    margin-left: 7px;
    font-family: Inter;
}

.plus-button .icon {
    width: 20px;
    height: 20px;
    color: #10b981;
    margin-left: 5px;
}
</style>
