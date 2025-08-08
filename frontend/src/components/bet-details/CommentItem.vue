<template>
    <div class="comment-item">
        <div class="header">
            <div class="user-info">
                <span class="username">{{ comment.username || 'Anonymous' }}</span>
                <span class="timestamp">{{ formattedTime }}</span>
            </div>
            <button v-if="canDelete" class="delete-btn" @click="$emit('delete-comment', comment.id)">
                ✕
            </button>
        </div>
        <p class="content">{{ comment.text }}</p>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useTelegram } from '@/services/telegram'

const props = defineProps({
    comment: {
        type: Object,
        required: true
    }
})

// get current user ID from auth
const { user } = useTelegram()

const formattedTime = computed(() => {
    if (props.comment.created_at) {
        return formatDistanceToNow(parseISO(props.comment.created_at), { addSuffix: true })
    }
    return ''
})

const canDelete = computed(() => {
    return (user?.id ?? 99) && props.comment.user_id === (user?.id ?? 99)
})
</script>

<style scoped lang="css">
.comment-item {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 0.1rem;
    box-shadow: var(--shadow-md);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.comment-item:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
}

.user-info {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
}

.username {
    font-weight: 400;
    font-size: 0.875rem;
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

.timestamp {
    font-size: 0.875rem;
    color: gray;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

.delete-btn {
    background: transparent;
    border: none;
    font-size: 1rem;
    line-height: 1;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    transition: background 0.2s;
}

.delete-btn:hover {
    background: rgba(255, 0, 0, 0.1);
}

.content {
    font-size: 0.875rem;
    color: gray;
    line-height: 1.4;
    white-space: pre-wrap;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}
</style>
