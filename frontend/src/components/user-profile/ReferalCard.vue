<template>
    <div v-if="hasFriends" class="referrals-container">
        <header class="referrals-header">
            <div class="hdr-left">
                <h3 class="hdr-title">Рефералы и комиссия</h3>
                <p class="hdr-sub">Всего бонусов получено</p>
            </div>

            <div class="hdr-right">
                <div class="total-bonus">
                    <span class="bonus-amount">{{ formatTon(totalBonus) }}</span>
                    <img :src="tonWhiteIcon" alt="TON" class="ton-icon" />
                </div>
            </div>
        </header>

        <div class="referrals-body" :class="{
            'is-scrollable': isScrollable, 'scrolled-top': scrolledTop, 'scrolled-bottom': scrolledBottom,
            'nudge-active': nudgeActive
        }" ref="referralsBodyRef">

            <!-- animated scrollbar nudge element (only present when nudgeActive or showNudge) -->
            <div v-if="showNudge" class="scroll-nudge" aria-hidden="true"></div>

            <div v-if="loading" class="loading-row">Загрузка...</div>

            <ul v-else class="referrals-list">
                <li v-for="f in friendsList" :key="f.telegram" class="referral-row">
                    <div class="ref-left">
                        <div class="ref-username">{{ f.username || ('@' + f.telegram) }}</div>
                        <div class="ref-id">ID: {{ f.telegram }}</div>
                    </div>

                    <div class="ref-right">
                        <div class="commission">
                            <div class="commission-amount">{{ formatTon(f.commission) }} TON</div>
                            <div class="commission-label">Ваш бонус (3%)</div>
                        </div>
                    </div>
                </li>

                <li v-if="app.referrals.length === 0" class="empty-row">
                    У вас пока нет активных рефералов.
                </li>
            </ul>
        </div>
        <footer class="referrals-footer">
            <button class="invite-button" @click="inviteFriends">{{ inviteText }}</button>
        </footer>
    </div>
    <div v-else class="referral-card">
        <h3 class="card-title">
            ПРИГЛАШАЙ ДРУЗЕЙ И ПОЛУЧАЙ TON
            <img :src="tonWhiteIcon" alt="TON Icon" class="ton-white-icon" />
        </h3>
        <ul class="benefits-list">
            <li class="benefit-item">
                <span class="icon referral-icon">🎯</span>
                <div class="benefit-content">
                    <span class="benefit-title">Комиссия с рефералов</span>
                    <span class="benefit-desc">Зарабатывайте 3% с выигрыша приглашенных пользователей</span>
                </div>
            </li>
            <li class="divider"></li>
            <li class="benefit-item">
                <span class="icon points-icon">⭐</span>
                <div class="benefit-content">
                    <span class="benefit-title">Неограниченный доход</span>
                    <span class="benefit-desc">Приглашайте всех своих друзей участвовать в предсказаниях с
                        вами</span>
                </div>
            </li>
            <li class="divider"></li>
            <li class="benefit-item">
                <span class="icon cashback-icon">💰</span>
                <div class="benefit-content">
                    <span class="benefit-title">Кешбек - зарабатывай честно за активность других</span>
                    <span class="benefit-desc">Чем больше зарабатывают друзья - тем больше приходит вам!</span>
                </div>
            </li>
        </ul>
        <button class="invite-button" @click="inviteFriends">{{ inviteText }}</button>
    </div>
    <div class="follow-card" @click="openChannel">
        <h3 class="card-title">
            Подписывайтесь и не пропускайте самые важные новости
        </h3>
        <button class="follow-button">@gifts_predict</button>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { getUsersByTelegrams } from '@/api/requests'
import { useTelegram } from '@/services/telegram'
import tonWhiteIcon from '@/assets/icons/TON_White_Icon.png'

const app = useAppStore()
const { user: tgUser, tg } = useTelegram()

const loading = ref(false)
const inviteText = ref('Пригласить друзей')
const friendsList = ref([]) // { telegram, username, total_winnings, commission }

const referralsBodyRef = ref(null)
const isScrollable = ref(false)
const scrolledTop = ref(true)   // true when at top (no top-fade)
const scrolledBottom = ref(true) // true when at bottom (no bottom-fade)

const showNudge = ref(false)            // controls DOM presence of nudge
const nudgeActive = ref(false)          // triggers CSS class to highlight scrollbar
let _nudgeTimeout = null

const NUDGE_STORAGE_KEY = 'referrals_scroll_nudge_shown'
const NUDGE_DURATION = 1500 // ms

function scheduleNudgeOnce() {
    localStorage.removeItem('referrals_scroll_nudge_shown')
    // already shown historically?
    try {
        if (localStorage.getItem(NUDGE_STORAGE_KEY)) return
    } catch (e) { /* ignore private mode */ }
    // only show if scrollable
    if (!isScrollable.value) return

    // guard: don't show multiple times
    if (showNudge.value || nudgeActive.value) return

    // show nudge
    showNudge.value = true
    // allow DOM to paint, then start animation class
    requestAnimationFrame(() => {
        nudgeActive.value = true
    })

    // after duration hide and persist flag
    _nudgeTimeout = setTimeout(() => {
        nudgeActive.value = false
        // keep element in DOM a tiny bit longer for fade-out, then remove
        setTimeout(() => (showNudge.value = false), 240)
        try { localStorage.setItem(NUDGE_STORAGE_KEY, '1') } catch (e) { }
    }, NUDGE_DURATION)
}

function updateScrollState() {
    const el = referralsBodyRef.value
    if (!el) return
    // is there overflow?
    isScrollable.value = el.scrollHeight > el.clientHeight + 1
    scrolledTop.value = el.scrollTop <= 4
    scrolledBottom.value = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 4)

    // When it becomes scrollable for the first time, schedule the nudge
    if (isScrollable.value) {
        // small delay so visual overflow is stable
        setTimeout(() => scheduleNudgeOnce(), 160)
    }
}

function onReferralsScroll() {
    updateScrollState()
}

const totalBonus = computed(() => {
    // Use 0 when missing. total_bonus may be numeric string -> parseFloat
    const raw = app.user?.total_bonus ?? app.user?.total_bonus ?? 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
})

const hasFriends = computed(() => {
    const friendsObj = app.user?.friends ?? {}
    try {
        return Object.keys(friendsObj ?? {}).length > 0
    } catch (e) {
        return false
    }
})

async function loadFriendsDetails() {
    const friendsObj = app.user?.friends ?? {}
    const keys = Object.keys(friendsObj ?? {})
    if (!keys.length) {
        friendsList.value = []
        return
    }

    loading.value = true
    try {
        // fetch referred users rows (get their total_winnings)
        const rows = await getUsersByTelegrams(keys)
        // map by telegram for quick lookup
        const map = new Map(rows.map(r => [String(r.telegram), r]))

        // build friends list preserving order from JSON object
        friendsList.value = keys.map(k => {
            const refEntry = friendsObj[k] ?? {}
            let slicedNickname = refEntry.slice(0, 16)
            if (refEntry.length > 16) {
                slicedNickname = slicedNickname + '..'
            }
            const row = map.get(String(k)) ?? {}
            // total_winnings may come as string (numeric). parseFloat safely
            const tw = Number(row?.total_winnings ?? 0)
            const twSafe = Number.isFinite(tw) ? tw : 0
            const commission = +(twSafe * 0.03)
            return {
                telegram: k,
                username: slicedNickname ?? (`Anonymous`),
                total_winnings: twSafe,
                commission,
            }
        })
    } catch (err) {
        console.error('Failed to load friend details', err)
        friendsList.value = []
    } finally {
        loading.value = false
    }
}

/* Invite / share */
function inviteFriends() {
    inviteText.value = 'Ссылка скопирована!'
    shareReferal()
    setTimeout(() => (inviteText.value = 'Пригласить друзей'), 1800)
}

function shareReferal() {
    const ref = tgUser?.id ?? ''
    const shareLink = 'https://t.me/giftspredict_bot?startapp=' + ref
    const messageText = `%0AПрисоединяйся ко мне в Gifts Predict и **зарабатывай TON!**`
    try {
        tg.openTelegramLink(`https://t.me/share/url?url=${shareLink}&text=${messageText}`)
    } catch (e) {
        // fallback: open share link in new tab
        window.open(`https://t.me/share/url?url=${shareLink}&text=${messageText}`, '_blank')
    }
}

function openChannel() {
    try {
        tg.openTelegramLink('https://t.me/giftspredict')
    } catch (e) {
        // fallback: open share link in new tab
        window.open('https://t.me/giftspredict', '_blank')
    }
}

/* formatting helper */
function formatTon(val) {
    const n = Number(val ?? 0)
    if (!Number.isFinite(n)) return '0'
    // show up to 2 decimals but drop trailing zeros
    return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '.00')
}

/* load on mount and when user changes */
onMounted(() => {
    if (hasFriends.value) loadFriendsDetails()

    // call initially after next tick
    setTimeout(updateScrollState, 80)

    if (referralsBodyRef.value) {
        referralsBodyRef.value.addEventListener('scroll', onReferralsScroll, { passive: true })
    }
})

onBeforeUnmount(() => {
    if (referralsBodyRef.value) {
        referralsBodyRef.value.removeEventListener('scroll', onReferralsScroll)
    }
    if (_nudgeTimeout) clearTimeout(_nudgeTimeout)
})

// also update when the friends list changes
watch(() => friendsList.value.length, () => {
    // small delay so DOM has repainted
    setTimeout(updateScrollState, 60)
})

watch(
    () => app.user && JSON.stringify(app.user.friends ?? {}),
    (nv, ov) => {
        if (hasFriends.value) loadFriendsDetails()
        else friendsList.value = []
    }
)
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

/* Parent: don't force a small vh height on mobile; use padding + optional min-height */
.follow-card {
    max-width: 480px;
    width: 89vw;
    /* remove fixed height: 12vh; use padding so content defines height naturally */
    padding: 18px;
    padding-top: 14px;
    padding-bottom: 14px;
    margin: 0 auto;
    background-color: #292a2a;
    border-radius: 12px;
    color: #f9fafb;
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* ensure it doesn't shrink too small on tiny screens */
    min-height: 72px;
    /* optional */
    box-sizing: border-box;
}

/* Button: use padding, min-height and align-self to center horizontally */
.follow-button {
    /* drop percent height */
    height: auto;
    padding: 18px 60px;
    width: 80%;
    /* vertical + horizontal padding — controls visible size */
    min-height: 44px;
    /* mobile touch-friendly */
    border-radius: 20px;
    border: none;
    margin: 0 auto;
    margin-top: 0.5rem;
    /* center horizontally only */
    background-color: #3b82f6;
    color: #ffffff;
    font-size: 1rem;
    cursor: pointer;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

/* Hover */
.follow-button:hover {
    background-color: #2563eb;
}

/* Mobile tweak (if you still want a slightly larger button on small screens) */
@media (max-width: 420px) {
    .follow-button {
        padding: 12px 20px;
        min-height: 48px;
        font-size: 1rem;
    }
}

.card-title {
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    font-family: "Inter", sans-serif;
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
    color: #f9fafb;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.benefit-desc {
    font-size: 0.9rem;
    color: #9ca3af;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

/* footer invite button */
.referrals-footer {
    display: flex;
    justify-content: center;
    align-items: center;
    padding-top: 6px;
    max-width: 480px;
    width: 85vw;
    margin: auto auto;
    align-self: center;
}

.invite-button {
    margin-bottom: 12px;
    width: 95%;
    padding: 16px 0;
    background-color: #3b82f6;
    color: #ffffff;
    font-size: 1rem;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    align-self: center;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.invite-button:hover {
    background-color: #2563eb;
}

/* TABLE OF REFERRALS VALUES */
.referrals-container {
    max-width: 480px;
    width: 89vw;
    margin: 0 auto 1rem;
    background-color: #292a2a;
    color: #f9fafb;
    border-radius: 12px;
    padding: 12px;
    box-sizing: border-box;
    font-family: "Inter", sans-serif;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* header */
.referrals-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.hdr-left .hdr-title {
    margin: 0;
    color: #f9fafb;
    font-size: 1rem;
    font-weight: 600;
}

.hdr-sub {
    margin: 2px 0 0;
    color: #9ca3af;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.8;
}

.hdr-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.total-bonus {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background-color: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
}

.bonus-amount {
    font-weight: 700;
    font-size: 1rem;
    color: #f9fafb;
}

.ton-icon {
    width: 18px;
    height: 18px;
}

/* Enhanced referrals-body scroll styling */
.referrals-body {
    position: relative;
    max-height: 27vh;
    overflow-y: auto;
    padding-right: 6px;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
    /* create comfortable inner padding so first/last items don't touch fades */
    padding-top: 6px;
    padding-bottom: 10px;
}

/* Thin elegant scrollbar for WebKit */
.referrals-body::-webkit-scrollbar {
    width: 8px;
}

.referrals-body::-webkit-scrollbar-track {
    background: transparent;
    margin: 6px 0;
    border-radius: 8px;
}

.referrals-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    border: 2px solid transparent;
    /* creates inner gap effect */
    background-clip: padding-box;
}

.referrals-body:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
}

/* Firefox scrollbar thin + subtle color */
.referrals-body {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.06) transparent;
}

.referrals-body:hover {
    scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
}

/* top & bottom gradient fades using pseudo elements */
.referrals-body::before,
.referrals-body::after {
    content: "";
    pointer-events: none;
    position: absolute;
    left: 0;
    right: 6px;
    /* leave space for thin scrollbar */
    height: 18px;
    z-index: 5;
    transition: opacity 220ms ease;
}

/* top fade (covers top of list) */
.referrals-body::before {
    top: 0;
    background: linear-gradient(180deg, rgba(41, 42, 42, 0.92) 0%, rgba(41, 42, 42, 0) 100%);
    opacity: 0;
    /* hidden by default */
}

/* bottom fade (covers bottom of list) */
.referrals-body::after {
    bottom: 0;
    background: linear-gradient(0deg, rgba(41, 42, 42, 0.92) 0%, rgba(41, 42, 42, 0) 100%);
    opacity: 0;
    /* hidden by default */
}

/* show fades when scrollable AND not at the edges */
/* top fade: show when not at top */
.referrals-body.is-scrollable.scrolled-top~.referrals-body::before {
    opacity: 0;
}

/* placeholder so devtools easier to read */

/* show top fade when scrollable and NOT scrolledTop */
.referrals-body.is-scrollable:not(.scrolled-top)::before {
    opacity: 1;
}

/* show bottom fade when scrollable and NOT scrolledBottom */
.referrals-body.is-scrollable:not(.scrolled-bottom)::after {
    opacity: 1;
}

/* subtle inner shadow when list scrolls (adds depth) */
.referrals-body.is-scrollable:not(.scrolled-top) {
    box-shadow: inset 0 8px 16px -12px rgba(0, 0, 0, 0.6);
}

.referrals-body.is-scrollable:not(.scrolled-bottom) {
    box-shadow: inset 0 -8px 16px -12px rgba(0, 0, 0, 0.6);
}

/* compact visible nudge that sits near the native scrollbar track */
.scroll-nudge {
    position: absolute;
    right: -10px;
    /* sit just inside the container near the scrollbar */
    top: 10px;
    /* initial top position */
    width: 10px;
    /* thumb width */
    height: 36px;
    /* thumb height */
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.08));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    opacity: 0;
    pointer-events: none;
    z-index: 60;
    transform-origin: center top;
    transform: translateY(0) scale(0.98);
    transition: opacity 160ms ease, transform 240ms cubic-bezier(.2, .9, .25, 1);
}

/* run animation when class is toggled on container */
.referrals-body.nudge-active .scroll-nudge {
    opacity: 1;
    animation: scroll-nudge-slide 1200ms cubic-bezier(.2, .9, .25, 1) forwards;
}

@keyframes scroll-nudge-slide {
    0% {
        transform: translateY(0) scale(0.98);
        opacity: 0;
    }

    10% {
        opacity: 1;
        transform: translateY(6px) scale(1.02);
    }

    45% {
        transform: translateY(28px) scale(1);
        opacity: 1;
    }

    /* slide down */
    75% {
        transform: translateY(18px) scale(0.995);
    }

    100% {
        transform: translateY(22px) scale(0.995);
        opacity: 0;
    }
}

/* temporarily brighten the native scrollbar when nudge active (WebKit) */
.referrals-body.nudge-active::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.22);
}

/* temporary subtle highlight to native WebKit scrollbar during nudge */
.referrals-body.nudge-active::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
}

/* slightly stronger while hovered */
.referrals-body.nudge-active:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.22);
}


.referrals-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* small visual separator when many items — thinner divider between rows */
.referrals-list>li+li {
    border-top: 1px solid rgba(255, 255, 255, 0.02);
    padding-top: 10px;
}

/* ensure last item has extra bottom padding so fade doesn't overlap text */
.referrals-list>li:last-child {
    padding-bottom: 8px;
}

/* accessibility: focus styles for keyboard users */
.referral-row:focus-within {
    outline: 2px solid rgba(59, 130, 246, 0.28);
    outline-offset: 2px;
}

.referral-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.15);
    padding: 10px;
    border-radius: 10px;
}

/* referral-row hover lift */
.referral-row {
    transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.referral-row:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    background: rgba(255, 255, 255, 0.03);
}

.ref-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.ref-username {
    font-weight: 600;
    color: #f9fafb;
}

.ref-id {
    font-size: 0.78rem;
    color: #9ca3af;
    opacity: 0.9;
}

/* right side: two stacked numbers */
.ref-right {
    display: flex;
    gap: 12px;
    align-items: center;
}

.winnings,
.commission {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.winnings-amount,
.commission-amount {
    font-weight: 700;
    font-size: 0.98rem;
    color: #f9fafb;
}

.winnings-label,
.commission-label {
    font-size: 0.75rem;
    color: #9ca3af;
    opacity: 0.85;
}

/* footer invite button */
.referrals-footer {
    display: flex;
    justify-content: center;
    align-items: center;
    padding-top: 6px;
}

/* small loading / empty */
.loading-row,
.empty-row {
    color: #9ca3af;
    padding: 10px;
    text-align: center;
    font-size: 0.95rem;
}
</style>
