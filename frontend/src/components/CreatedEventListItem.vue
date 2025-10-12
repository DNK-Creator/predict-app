<template>
    <div class="history-item" role="listitem">
        <div class="info-header">
            <div class="bet-group">
                <span>🔮</span>
                <div class="bet-name">
                    <span>{{ betNameDisplay || '—' }}</span>
                </div>
            </div>
        </div>
        <div class="main-content">
            <div class="main">
                <div class="top">
                    <div class="bet-amount">{{ stakeDisplay }}</div>
                    <div v-if="showSide()" class="bet"><span> {{ $t('side') }} • {{ translateSide(side) }}
                        </span></div>
                </div>
                <span class="bet-status">{{ displayedStatus }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/appStore'

const app = useAppStore()

const props = defineProps({
    stake: [String, Number],
    bet_name: { type: String, default: '' },
    bet_name_en: { type: String, default: '' },
    side: { type: String, default: '' },
    status: { type: String, default: '' }
})

const betNameDisplay = computed(() => {
    let neededName = props.bet_name
    if (props.status.toLowerCase() === 'accepted' || props.status.toLowerCase() === 'approved') {
        neededName = app.language === 'ru' ? props.bet_name : props.bet_name_en
    }
    if (neededName == null) return '—'
    if (neededName.length > 100) {
        return neededName.slice(0, 100) + '..'
    }
    return neededName
})

const displayedStatus = computed(() => {
    if (props.status == null || props.status.length == undefined) return ''

    if (props.status === 'Accepted' || props.status === 'Approved' || props.status === 'Passed') {
        return app.language === 'ru' ? 'Статус: Одобрено.' : 'Status: Approved.'
    } else if (props.status === 'Rejected' || props.status === 'Reject') {
        return app.language === 'ru' ? 'Статус: Отклонено.' : 'Status: Rejected.'
    } else if (props.status === 'Waiting' || props.status === 'Hold' || props.status === 'Moderation') {
        return app.language === 'ru' ? 'Статус: Модерация.' : 'Status: Moderation.'
    }

    return props.status
})

const stakeDisplay = computed(() => {
    if (props.stake == null || props.stake == undefined || props.stake <= 0) return app.language === 'ru' ? 'Начальная ставка не поставлена'
        : 'Initial bet was not made'
    let betWord = app.language === 'ru' ? 'Ставка ' : 'Bet '
    return typeof props.stake === 'number' ? betWord + props.stake.toFixed(2) + ' TON' : betWord + String(props.stake) + ' TON'
})

function yesTranslated() {
    return app.language === 'ru' ? 'Да' : 'Yes'
}

function noTranslated() {
    return app.language === 'ru' ? 'Нет' : 'No'
}

function showSide() {
    if (props.stake == undefined || props.stake == null || props.stake <= 0 ||
        props.side == undefined || props.side == null || props.side.length <= 0) {
        return false
    }
    return true
}

function translateSide() {
    if (props.side.toLowerCase() === 'yes') {
        return yesTranslated()
    }
    return noTranslated()
}
</script>

<style scoped>
.history-item {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    margin: 12px 0;
    gap: 12px;
    align-items: center;
    justify-content: flex-start;
    padding: 20px 20px 20px 20px;
    border-radius: 12px;
    background: #2f2f32;
    font-family: "Inter", sans-serif;
    user-select: none;
    position: relative;
}

/* other styles preserved... (kept minimal repeating of earlier selectors) */
.info-header {
    display: flex;
    justify-content: space-between;
    width: 100%;
}

.bet-group {
    display: flex;
    align-self: start;
    justify-self: start;
    align-items: center;
    justify-content: center;
    gap: 6px;
    max-width: 100%;
}

.bet_icon {
    height: 26px;
    width: 20px;
}

.main-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
}

.avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.bet-status {
    color: white;
    margin-top: 4px;
}

.name {
    color: white;
    font-weight: 600;
}

.time {
    font-size: 1rem;
    max-width: 120px;
    color: rgba(210, 210, 210, 0.78);
    font-family: "Inter", sans-serif;
    font-weight: 600;
    align-self: center;
}

.bet-amount {
    font-size: 1rem;
    color: rgb(139, 255, 133);
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.bet-name {
    color: white;
    font-weight: 600;
    font-size: 1rem;
}

.bottom {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    align-items: center;
    position: relative;
}

.bet {
    color: #ffffff;
}

.stake {
    font-weight: 600;
    font-size: 0.8rem;
    color: rgba(210, 210, 210, 0.78);
    font-family: "Inter", sans-serif;
}

/* ---- bottom-winnings ---- */
.bottom-winnings {
    display: flex;
    justify-content: space-between;
    /* gifts row at left, arrow at right */
    align-items: center;
    width: 100%;
    gap: 12px;
    margin-top: 8px;
    padding-top: 8px;
    box-sizing: border-box;
}

/* gifts row container */
.gifts-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    overflow: hidden;
    min-height: 40px;
}

/* single gift */
.gift {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    flex: 0 0 40px;
    background: rgba(255, 255, 255, 0.03);
}

.gift img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

/* overlay used for the 8th item when there are more than 8 gifts */
.gift-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    /* half black */
    display: flex;
    align-items: center;
    justify-content: center;
}

.more-text {
    color: white;
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1;
}

/* right arrow — uses currentColor so color below applies */
.arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(210, 210, 210, 0.78);
    /* matches .time and .stake color */
    flex: 0 0 auto;
    margin-left: 8px;
}

@media (max-width: 400px) {
    .history-item {
        padding: 12px;
        height: auto;
    }

    .avatar {
        width: 38px;
        height: 38px;
    }

    .gift {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
    }

    .more-text {
        font-size: 0.85rem;
    }

    .expand-btn {
        left: 12px;
        bottom: 12px;
        padding: 6px 6px;
    }
}
</style>
