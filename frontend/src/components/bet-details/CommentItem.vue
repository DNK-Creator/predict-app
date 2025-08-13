<template>
    <div class="comment-item">
        <div class="row">
            <!-- Avatar column -->
            <div class="avatar" role="img" :aria-label="`Avatar for ${props.comment.username || 'user'}`"
                @click="clickUsername(props.comment.username)">
                <img v-if="avatarUrl && !imageError" :src="avatarUrl"
                    :alt="`${props.comment.username || 'Anonymous'} avatar`" @error="imageError = true"
                    loading="lazy" />
                <div v-else class="avatar-placeholder" aria-hidden="true">
                    {{ initial }}
                </div>
            </div>

            <!-- Body column -->
            <div class="comment-body">
                <div class="header">
                    <div class="user-info">
                        <span v-if="props.comment.username !== 'Anonymous'" class="username clickable"
                            @click="clickUsername(props.comment.username)">
                            {{ props.comment.username }}
                        </span>
                        <span v-else class="username">Anonymous</span>

                        <!-- STAKE LABEL (shows only if users_stake exists and has side + amount) -->
                        <span v-if="stake" class="stake-label" :class="stake.side === 'yes' ? 'stake-yes' : 'stake-no'"
                            :title="stakeTooltip" aria-hidden="true">
                            <!-- format amount nicely -->
                            {{ stakeLabel }}
                        </span>

                        <span class="timestamp">{{ formattedTime }}</span>
                    </div>

                    <button v-if="canDelete" class="delete-btn" @click="$emit('delete-comment', props.comment.id)">
                        ✕
                    </button>
                </div>

                <p class="content">{{ props.comment.text }}</p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseISO } from 'date-fns'
import { useTelegram } from '@/services/telegram'

// props
const props = defineProps({
    comment: { type: Object, required: true }
})

const { user } = useTelegram()
const { tg } = useTelegram()

// image fallback
const imageError = ref(false)
const avatarUrl = computed(() => props.comment?.photo_url || null)
watch(() => avatarUrl.value, () => { imageError.value = false })

const initial = computed(() => {
    const name = props.comment?.username || ''
    return name ? String(name).trim().charAt(0).toUpperCase() : '?'
})

/* ---------------------------
   SHORT TIME FORMAT FUNCTION
   output examples:
   - "now" (under 10s)
   - "30s ago"
   - "2m ago"
   - "51m ago"
   - "2h ago"
   - "4d ago"
   - "3w ago"
   - "5mo ago"
   - "2y ago"
   --------------------------- */
function shortRelativeTime(iso) {
    if (!iso) return ''
    // parse, support string or Date
    const t = (typeof iso === 'string') ? parseISO(iso) : new Date(iso)
    if (isNaN(t)) return ''
    const diff = Math.floor((Date.now() - t.getTime()) / 1000) // seconds
    if (diff < 10) return 'сейчас'
    if (diff < 60) return `${diff}с назад`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}м назад`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}ч назад`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}д назад`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}н назад`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}мес назад`
    const years = Math.floor(days / 365)
    return `${years}г назад`
}

const formattedTime = computed(() => {
    return props.comment?.created_at ? shortRelativeTime(props.comment.created_at) : ''
})

/* ---------------------------
   STAKE DISPLAY
   COMMENT.users_stake expected shape (jsonb):
   { side: 'Yes' | 'No', amount: 123.45 }
   or null/undefined.
   --------------------------- */
const stake = computed(() => {
    try {
        const s = props.comment?.users_stake
        // could be string or object — normalize
        if (!s) return null
        if (typeof s === 'string') return JSON.parse(s)
        return s
    } catch (e) {
        return null
    }
})

// formatted small label (e.g. "+0.5 TON" or "100.00") — adapt as needed
const stakeLabel = computed(() => {
    if (!stake.value) return ''
    const amt = Number(stake.value.amount ?? stake.value.amt ?? 0)
    // format with no trailing decimals if integer, else 2 decimal places
    const nice = Number.isInteger(amt) ? String(amt) : amt.toFixed(2)
    return `${stake.value.side === 'yes' ? 'ДА' : 'НЕТ'} • ${nice} TON`
})

const stakeTooltip = computed(() => {
    if (!stake.value) return ''
    return `Side: ${stake.value.side}, Amount: ${stake.value.amount}`
})

// tick to make computed reactive (updates once a minute — enough for 48h window)
const nowTick = ref(Date.now())
let _tickTimer = null
onMounted(() => {
    // update every 30s so the button disappears close to the real time
    _tickTimer = setInterval(() => { nowTick.value = Date.now() }, 30_000)
})
onBeforeUnmount(() => {
    if (_tickTimer) clearInterval(_tickTimer)
})

/** normalize created_at to milliseconds (accepts ISO string, Date, unix seconds or ms) */
function parseToMs(value) {
    if (!value && value !== 0) return NaN
    if (typeof value === 'number') {
        // if looks like seconds -> to ms
        return value < 1e12 ? value * 1000 : value
    }
    // try Date parsing for strings
    const d = Date.parse(String(value))
    return Number.isNaN(d) ? NaN : d
}

/* canDelete: user must be owner AND comment not older than 48h */
const canDelete = computed(() => {
    // quick owner check
    const currentUserId = user?.id ?? 99
    if (!currentUserId) return false
    if (props.comment.user_id !== currentUserId) return false

    // age check
    const createdMs = parseToMs(props.comment?.created_at)
    if (Number.isNaN(createdMs)) return false // if created_at invalid, be conservative
    const ageMs = nowTick.value - createdMs
    const WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours
    return ageMs <= WINDOW_MS
})

function clickUsername(name) {
    if (!name) return
    if (name === 'Anonymous') return
    tg.openTelegramLink(`https://t.me/${name}`)
}
</script>

<style scoped lang="css">
.comment-item {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 0.25rem;
    box-shadow: var(--shadow-md);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-sizing: border-box;
    width: 100%;
    word-wrap: break-word;
}

/* horizontal layout: avatar + body */
.row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
}

/* avatar column */
.avatar {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* real image */
.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, #2a2a2a, #141414);
    cursor: pointer;
}

/* fallback placeholder with initial */
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
    text-transform: uppercase;
    border: 1px solid rgba(255, 255, 255, 0.04);
}

/* comment body takes remaining width */
.comment-body {
    flex: 1 1 auto;
    min-width: 0;
    /* allow truncation/ellipsis for long usernames */
}

.comment-item:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
}

.user-info,
.header>.delete-btn {
    min-width: 0;
}

.user-info {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    flex-shrink: 1;
}

.username {
    font-weight: 400;
    font-size: 0.875rem;
    color: white;
    font-family: "Inter", sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
}

.clickable {
    cursor: pointer;
}

.timestamp {
    font-size: 0.875rem;
    color: gray;
    font-family: "Inter", sans-serif;
    font-weight: 400;
    white-space: nowrap;
}

.delete-btn {
    background: transparent;
    border: none;
    font-size: 1rem;
    line-height: 1;
    color: white;
    cursor: pointer;
    padding: 0.55rem;
    border-radius: 50%;
    transition: background 0.2s;
}

.content {
    font-size: 0.875rem;
    color: gray;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-family: "Inter", sans-serif;
    font-weight: 400;
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
}

/* STAKE LABEL */
.stake-label {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    margin-left: 6px;
    margin-right: 6px;
    white-space: nowrap;
}

/* green for yes, red for no; use 0.5 opacity backgrounds */
.stake-yes {
    background-color: rgba(28, 153, 43, 0.5);
    /* green with 0.5 alpha */
    color: #fff;
}

.stake-no {
    background-color: rgba(200, 56, 56, 0.5);
    /* red with 0.5 alpha */
    color: #fff;
}
</style>
