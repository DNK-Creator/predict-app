<template>
    <div class="holder-item" role="button" tabindex="0" @click="onClick" @keydown.enter.prevent="onClick"
        :aria-label="`Open ${holder.username || 'Anonymous'}`">
        <div class="avatar" role="img" :aria-label="`Avatar for ${holder.username || 'user'}`">
            <img v-if="holder.photo_url" :src="holder.photo_url" :alt="`${holder.username || 'Anonymous'} avatar`"
                loading="lazy" />
            <div v-else class="avatar-placeholder" aria-hidden="true">
                {{ initial }}
            </div>
        </div>

        <div class="holder-body">
            <div class="holder-row">
                <span class="username">{{ holder.username || 'Anonymous' }}</span>
                <span class="holder-stake" :class="holder.side === 'yes' ? 'stake-yes' : 'stake-no'">
                    {{ sideNormalized(holder.side) === 'yes' ? yesTranslated() : noTranslated() }} • {{
                        formatAmount(holder.amount) }}
                    TON
                </span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const props = defineProps({
    holder: { type: Object, required: true }
})

const emit = defineEmits(['open'])

function yesTranslated() {
    return app.language === 'ru' ? 'ДА' : 'YES'
}

function noTranslated() {
    return app.language === 'ru' ? 'НЕТ' : 'NO'
}

const initial = computed(() => {
    const name = props.holder?.username || ''
    return name ? String(name).trim().charAt(0).toUpperCase() : '?'
})

function sideNormalized(side) {
    return side.toLowerCase()
}

function onClick() {
    emit('open', props.holder?.username ?? null)
}

function formatAmount(v) {
    const num = Number(v ?? 0)
    return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

</script>

<style scoped>
.holder-item {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px;
    border-radius: 10px;
    cursor: pointer;
    user-select: none;
}

.holder-item:active {
    transform: translateY(1px);
}

.avatar {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
}

.avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(0, 152, 234, 0.12), rgba(0, 152, 234, 0.06));
    color: #eaf6ff;
    font-weight: 600;
    font-size: 1.05rem;
    font-family: "Inter", sans-serif;
}

.holder-body {
    flex: 1 1 auto;
    min-width: 0;
}

.holder-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    width: 100%;
}

.username {
    font-weight: 600;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.holder-stake {
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
}

.stake-yes {
    background-color: rgba(28, 153, 43, 0.6);
}

.stake-no {
    background-color: rgba(200, 56, 56, 0.6);
}
</style>
