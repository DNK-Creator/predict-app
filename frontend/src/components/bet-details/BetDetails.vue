<template>
    <!-- single root to avoid fragment non-props attr warnings -->
    <div class="bet-details-root">
        <div v-if="spinnerShow" class="loader-center">
            <LoaderPepe />
        </div>

        <ShowBetModal :visible="showBetModal" :bet="bet" :side="betSide" @close="showBetModal = false"
            @placed="onBetPlaced" />

        <div v-show="!spinnerShow" class="bet-details">
            <!-- Header -->
            <div class="header">
                <h1 class="header__text">{{ bet.name }}</h1>
                <!-- CircleGauge instead of image -->
                <CircleGauge :percent="currentBetPercent" />
            </div>

            <!-- overlay that sits under header but above content when keyboard open -->
            <div v-if="isKeyboardOpen" class="keyboard-backdrop" @click="onKeyboardBackdropClick" />

            <!-- Main content -->
            <main ref="scrollArea" class="content" @scroll.passive="handleScroll">
                <!-- 🎉 Celebration Banner -->
                <div v-if="showCelebration" class="celebration-banner">
                    <h2 v-if="user"> Поздравляем, {{ user?.username }}! </h2>
                    <h2 v-else> Поздравляем, игрок! </h2>
                    <p>Выигрыш скоро будет зачислен на твой баланс.</p>
                </div>

                <section class="content__chart">
                    <Chart :data="history" :closeTime="bet.close_time" />
                </section>

                <section class="card info-card">
                    <div class="info-header">
                        <h2 class="card__title">Информация</h2>
                        <button class="info-toggle" @click="showInfo = !showInfo">
                            {{ showInfo ? 'Скрыть' : 'Раскрыть' }}
                            <span :class="['arrow', showInfo ? 'up' : 'down']"></span>
                        </button>
                    </div>

                    <!-- Always show first sentence -->
                    <p class="card__text first-sentence">
                        {{ firstSentence }}
                    </p>

                    <!-- Collapsible remainder -->
                    <div class="info-body" :class="{ 'info-body--collapsed': !showInfo }">
                        <!-- the rest of the description -->
                        <p v-if="restDescription" class="card__text">
                            {{ restDescription }}
                        </p>

                        <!-- your other info fields -->
                        <div class="volume_info">
                            <span>До закрытия:</span>
                            <span>{{ timeRemaining }}</span>
                        </div>
                        <div class="volume_info">
                            <span>Статус:</span>
                            <span v-if="bet.result !== 'undefined'">Результат: "{{ formatUsersSide(bet.result)
                                }}"</span>
                            <span v-else-if="betStatus !== '000' && betStatus !== '111'">{{ betStatus }}</span>
                            <span v-else-if="betStatus === '111'">Открыта</span>
                            <span v-else>Ожидание разрешения ставки</span>
                        </div>
                        <div class="volume_info">
                            <span>Объём:</span>
                            <span v-if="volume.Yes && volume.No">{{ volume.Yes + volume.No }} TON</span>
                            <span v-else-if="volume.Yes">{{ volume.Yes }} TON</span>
                            <span v-else-if="volume.No">{{ volume.No }} TON</span>
                            <span v-else>0 TON</span>
                        </div>
                    </div>
                </section>

                <section class="grid">
                    <div v-if="userBetAmount.stake > 0" class="card grid__item grid__full">
                        <span> Ваша ставка: {{ userBetAmount.stake }} TON на {{ formatUsersSide(userBetAmount.result) }}
                        </span>
                    </div>
                    <div v-else-if="betStatus !== '000'" class="card grid__item grid__full">
                        <span>Вы еще не поставили ставку.</span>
                    </div>
                </section>

                <section class="card comments">
                    <h2 class="card__title">Обсуждения</h2>

                    <div v-if="canComment" class="comments__input-row">
                        <input ref="commentsInput" v-model="newComment" type="text" maxlength="205"
                            placeholder="Напишите комментарий" class="comments__input" :disabled="cooldownRemaining > 0"
                            @keyup.enter="tryPostComment" @focus="onCommentsFocus" @blur="onCommentsBlur" />

                        <button class="comments__post" :disabled="isSendDisabled" @click="tryPostComment"
                            :aria-label="cooldownRemaining > 0 ? `Ожидайте ${formattedCooldown}` : 'Отправить комментарий'">
                            <span v-if="cooldownRemaining > 0">{{ formattedCooldown }}</span>
                            <span v-else>Отправить</span>
                        </button>
                    </div>

                    <div v-if="betStatus === '000'" class="comments__warning">
                        Обсуждения доступны только поставившим ставку.
                    </div>
                    <div v-else-if="!canComment" class="comments__warning">
                        Только пользователи, поставившие ставку, могут комментировать.
                    </div>

                    <div class="comments__list">
                        <CommentItem v-for="c in comments" :key="c.id" :comment="c" @delete-comment="handleDelete" />
                        <div ref="commentsAnchor" class="comments__anchor"></div>
                    </div>
                </section>
            </main>

            <!-- Buy buttons -->
            <div v-if="betStatus !== '000'" class="footer">
                <button class="footer__yes" @click="openBetModal('Yes')">Купить Да</button>
                <button class="footer__no" @click="openBetModal('No')">Купить Нет</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, onActivated, onDeactivated, computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { updateLayoutVars, setKeyboardHeight } from '@/services/useLayoutChanges.js'
import {
    getBetById,
    getHistory,
    postNewComment,
    getComments,
    deleteComment,
    getUserBetAmount,
    availableComments,
    computeBetStatus,
    getUserLastCommentTime,
} from '@/services/bets-requests.js'
import Chart from '@/components/bet-details/BetChart.vue'
import CommentItem from '@/components/bet-details/CommentItem.vue'
import ShowBetModal from '@/components/bet-details/ShowBetModal.vue'
import LoaderPepe from '../LoaderPepe.vue'
import CircleGauge from '@/components/bet-details/CircleGauge.vue'
import { parseISO } from 'date-fns'
import { useTelegram } from '@/services/telegram'
import confetti from 'canvas-confetti'
import { v4 as uuidv4 } from 'uuid'

// accept id as optional prop (router can pass params as props when configured)
const props = defineProps({
    id: {
        type: [String, Number],
        default: null,
    },
})

const route = useRoute()

const commentsInput = ref(null)

// create a reactive boolean the template can use
const isKeyboardOpen = ref(false)

let bodyClassObserver = null

function updateIsKeyboardOpen() {
    // guard for SSR / tests
    if (typeof document === 'undefined' || !document.body) {
        isKeyboardOpen.value = false
        return
    }
    isKeyboardOpen.value = document.body.classList.contains('keyboard-open')
}

function onKeyboardBackdropClick(e) {
    // blur the input if present (must be a user gesture)
    const inputEl = commentsInput?.value
    try {
        if (inputEl && (document.activeElement === inputEl || inputEl === document.activeElement)) {
            inputEl.blur()
        }
    } catch (err) { /* ignore */ }

    // keep our local state & CSS vars consistent
    document.body.classList.remove('keyboard-open')
    setKeyboardHeight(0)
    updateLayoutVars()

    // also update reactive flag right away
    isKeyboardOpen.value = false
}

// Use prop id when provided, otherwise fall back to route.params.id.
// This computed updates reactively when route param or prop changes.
const betId = computed(() => {
    // ensure string/number compatibility depending on your router config
    return props.id ?? route.params.id
})

// UI state & flags
const showInfo = ref(false)
const spinnerShow = ref(true)
const showCelebration = ref(false)

const bet = ref({})
const betStatus = computed(() => {
    return computeBetStatus(bet.value.close_time)
})
//CREATE CHECK FUNCTION TO SEE IF NOW PASSED THE BET.VALUE.CLOSE_TIME

const history = ref([])
const comments = ref([])
const newComment = ref('')
const scrollArea = ref(null)
const commentsAnchor = ref(null)
const volume = ref(0)
const userBetAmount = ref({ stake: 0, result: '0' })
const canComment = ref(false)
const currentOdds = ref(0.5)

const showBetModal = ref(false)
const betSide = ref('Yes')

// --- new reactive variables for cooldown ---
const COOLDOWN_SECONDS = 30 * 60 // 30 minutes * 60 seconds = 1800 seconds
const cooldownRemaining = ref(0)      // seconds left
let cooldownInterval = null
const lastCommentAt = ref(null)      // ISO string or null

// ----- add near the top of setup (state) -----
const initialViewportHeight = ref(window.innerHeight) // fallback baseline
let vvResizeListener = null
let windowResizeListener = null


const { user } = useTelegram()

// computed simple helpers
const isSendDisabled = computed(() => {
    // disabled if no text OR cooldown active
    return (!newComment.value || newComment.value.trim().length === 0) || cooldownRemaining.value > 0
})

// formatted MM:SS
const formattedCooldown = computed(() => {
    const s = Math.max(0, Math.floor(cooldownRemaining.value))
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
})

// start a countdown from `seconds` (clears any previous interval)
function startCooldown(seconds) {
    if (cooldownInterval) {
        clearInterval(cooldownInterval)
        cooldownInterval = null
    }
    cooldownRemaining.value = Math.max(0, Math.floor(seconds))
    if (cooldownRemaining.value <= 0) return

    cooldownInterval = setInterval(() => {
        cooldownRemaining.value = Math.max(0, cooldownRemaining.value - 1)
        if (cooldownRemaining.value <= 0) {
            clearInterval(cooldownInterval)
            cooldownInterval = null
        }
    }, 1000)
}

// compute remaining time from a lastCommentAt timestamp (ISO or Date)
function startCooldownFromTimestamp(lastIso) {
    if (!lastIso) {
        startCooldown(0)
        return
    }
    const last = new Date(lastIso).getTime()
    if (Number.isNaN(last)) {
        startCooldown(0)
        return
    }
    const elapsedSec = Math.floor((Date.now() - last) / 1000)
    const remaining = COOLDOWN_SECONDS - elapsedSec
    if (remaining > 0) startCooldown(remaining)
    else startCooldown(0)
}

// fetch user's last comment time (call during loadData and after posting)
async function refreshUserLastCommentTime() {
    try {
        const last = await getUserLastCommentTime(user?.id ?? 99)
        lastCommentAt.value = last ?? null
        startCooldownFromTimestamp(lastCommentAt.value)
    } catch (err) {
        console.error('Could not fetch last comment time', err)
    }
}

async function onCommentsFocus() {
    document.body.classList.add('keyboard-open')

    // compute keyboard height for initial set:
    let keyboardHeight = 0
    if (window.visualViewport) {
        keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height)
    }
    setKeyboardHeight(keyboardHeight) // sets --keyboard-height
    updateLayoutVars() // re-measure menu/header and set --app-bottom-space

    await nextTick()
    setTimeout(() => {
        commentsInput?.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
}

function onCommentsBlur() {
    document.body.classList.remove('keyboard-open')
    setKeyboardHeight(0)
    updateLayoutVars()
}

function formatUsersSide(side) {
    if (side === 'Yes') {
        return 'Да'
    }
    return 'Нет'
}

/* Volume parsing helpers (same as before) */
function readVolumeObject(vol) {
    let yes = 0
    let no = 0

    if (vol == null) return { Yes: 0, No: 0 }

    try {
        if (typeof vol.get === 'function') {
            yes = Number(vol.get('Yes') ?? vol.get('yes') ?? vol.get('YES') ?? 0) || 0
            no = Number(vol.get('No') ?? vol.get('no') ?? vol.get('NO') ?? 0) || 0
            return { yes, no }
        }
    } catch (e) { /* ignore */ }

    if (typeof vol === 'object') {
        yes = Number(vol.Yes ?? vol.yes ?? vol['YES'] ?? vol['yes'] ?? vol?.YesAmount ?? 0) || 0
        no = Number(vol.No ?? vol.no ?? vol['NO'] ?? vol['no'] ?? vol?.NoAmount ?? 0) || 0
        return { yes, no }
    }

    const total = Number(vol) || 0
    const p = Number(bet.current_odds)
    const prob = isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
    yes = total * prob
    no = total - yes
    return { yes, no }
}

const volParts = computed(() => readVolumeObject(bet.value.volume))

const calculatedOdds = computed(() => {
    const yes = Number(volParts.value.yes) || 0
    const no = Number(volParts.value.no) || 0
    const total = yes + no
    if (total > 0) return yes / total
    const p = Number(bet.current_odds)
    return isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
})

const currentBetPercent = computed(() => Math.round(calculatedOdds.value * 100))

// description helpers
const firstSentence = computed(() => {
    const text = bet.value.description || ''
    const matched = text.match(/^(.+?[.!?])(\s|$)/)
    return matched ? matched[1] : text
})

const restDescription = computed(() => {
    const text = bet.value.description || ''
    const fs = firstSentence.value
    return text.length > fs.length ? text.slice(fs.length).trim() : ''
})

// time remaining helper
const now = ref(Date.now())
let timer = null

function ruPlural(n, [one, few, many]) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

function formatUnit(n, type) {
    if (type === 'day') {
        return `${n} ${ruPlural(n, ['день', 'дня', 'дней'])}`
    } else if (type === 'hour') {
        return `${n} ${ruPlural(n, ['час', 'часа', 'часов'])}`
    } else if (type === 'minute') {
        return `${n} ${ruPlural(n, ['минута', 'минуты', 'минут'])}`
    }
    return `${n}`
}

const timeRemaining = computed(() => {
    const raw = bet?.value?.close_time
    if (!raw) return ''

    let closeDate
    try {
        if (typeof raw === 'string') {
            closeDate = parseISO(raw)
        } else if (typeof raw === 'number') {
            closeDate = new Date(raw)
        } else if (raw instanceof Date) {
            closeDate = raw
        } else {
            closeDate = new Date(String(raw))
        }
    } catch (e) {
        closeDate = new Date(raw)
    }

    if (Number.isNaN(closeDate.getTime())) return ''

    const diffMs = closeDate.getTime() - now.value
    if (diffMs <= 0) return 'Закрыто'

    const totalMinutes = Math.floor(diffMs / 60000)
    if (totalMinutes < 1) return 'меньше 1 минуты'

    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
    const minutes = totalMinutes % 60

    const parts = []
    if (days > 0) {
        parts.push(formatUnit(days, 'day'))
        if (hours > 0) parts.push(formatUnit(hours, 'hour'))
        if (minutes > 0) parts.push(formatUnit(minutes, 'minute'))
    } else if (hours > 0) {
        parts.push(formatUnit(hours, 'hour'))
        if (minutes > 0) parts.push(formatUnit(minutes, 'minute'))
    } else {
        parts.push(formatUnit(minutes, 'minute'))
    }

    return parts.join(' ')
})

// confetti helper
function runConfetti() {
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
    })
}

// comments pagination
let commentsPage = 0

async function loadData(idToLoad) {
    // choose explicit id argument first, otherwise computed betId
    const id = idToLoad ?? betId.value

    // reset per-bet state
    spinnerShow.value = true
    showCelebration.value = false
    commentsPage = 0
    comments.value = []
    newComment.value = ''
    volume.value = 0
    userBetAmount.value = { stake: 0, result: '0' }
    canComment.value = false
    history.value = []

    try {
        bet.value = await getBetById(id)
        volume.value = bet.value.volume
        currentOdds.value = bet.value.current_odds
        history.value = await getHistory(id)
        userBetAmount.value = await getUserBetAmount(id)
        comments.value = await getComments(id, commentsPage)
        canComment.value = await availableComments(id)

        if (bet.value.result !== 'undefined' &&
            userBetAmount.value.stake > 0 &&
            userBetAmount.value.result === bet.value.result) {
            showCelebration.value = true
            setTimeout(() => runConfetti(), 200)
        }
    } catch (err) {
        console.error('Error loading bet data:', err)
    } finally {
        spinnerShow.value = false
    }
}

async function onBetPlaced() {
    canComment.value = true
    // refresh bet and user amounts after placing
    bet.value = await getBetById(betId.value)
    volume.value = bet.value.volume
    userBetAmount.value = await getUserBetAmount(betId.value)
}

// Called when document becomes visible again (browser tab or webview back)
async function handleVisibilityChange() {
    try {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            // re-sync last comment time from the server and restart cooldown
            await refreshUserLastCommentTime()
        }
    } catch (err) {
        console.error('Visibility refresh failed', err)
    }
}

// If component is used inside <KeepAlive>, onActivated runs when it becomes active again
onActivated(async () => {
    // Re-sync server state (important for cooldown)
    await refreshUserLastCommentTime()
})

// When the component is deactivated (kept-alive but not active), clear the interval so it doesn't leak.
// We'll re-create it on activation via refreshUserLastCommentTime -> startCooldown
onDeactivated(() => {
    if (cooldownInterval) {
        clearInterval(cooldownInterval)
        cooldownInterval = null
    }
})

onMounted(async () => {
    await loadData()
    await refreshUserLastCommentTime()
    await nextTick()

    if (scrollArea.value) {
        const observer = new IntersectionObserver(
            async ([entry]) => {
                if (entry.isIntersecting) {
                    await loadMoreComments()
                }
            },
            {
                root: scrollArea.value,
                rootMargin: '200px',
            }
        )
        if (commentsAnchor.value) {
            observer.observe(commentsAnchor.value)
        }
    }

    // set initial value when component mounts
    updateIsKeyboardOpen()

    // watch for body.class changes in case other code toggles keyboard-open
    if (typeof MutationObserver !== 'undefined' && document?.body) {
        bodyClassObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'class') {
                    updateIsKeyboardOpen()
                    break
                }
            }
        })
        bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    }

    timer = setInterval(() => {
        now.value = Date.now()
    }, 1000)

    // remember baseline innerHeight for fallback on browsers without visualViewport
    initialViewportHeight.value = window.innerHeight || document.documentElement.clientHeight;

    // keep listening for window resize as a safe fallback (e.g., some Android WebViews)
    windowResizeListener = () => {
        // keep baseline if keyboard not shown
        if (!document.body.classList.contains('keyboard-open')) {
            initialViewportHeight.value = window.innerHeight || document.documentElement.clientHeight;
        }
    };
    window.addEventListener('resize', windowResizeListener, { passive: true });

    spinnerShow.value = false
})

onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    if (cooldownInterval) clearInterval(cooldownInterval)
    if (windowResizeListener) window.removeEventListener('resize', windowResizeListener)

    if (window.visualViewport && vvResizeListener) {
        window.visualViewport.removeEventListener('resize', vvResizeListener)
        window.visualViewport.removeEventListener('scroll', vvResizeListener)
        vvResizeListener = null
    }

    // cleanup observer
    if (bodyClassObserver) {
        bodyClassObserver.disconnect()
        bodyClassObserver = null
    }

    // also ensure you reset the CSS var (optional)
    document.documentElement.style.setProperty('--keyboard-height', '0px')
})

async function loadMoreComments() {
    commentsPage++
    const more = await getComments(betId.value, commentsPage)
    if (more && more.length) comments.value.push(...more)
}

// wrapper to attempt posting and handle server cooldown error
async function tryPostComment() {
    if (isSendDisabled.value) return
    await postComment()
}

// updated postComment - handles server-side cooldown response
async function postComment() {
    if (!newComment.value) return

    const commentId = uuidv4()
    try {
        // build usersStake object from your current user stake data
        // adapt this to your actual state - below is an example placeholder

        const usersStake = userBetAmount?.value
            ? { side: userBetAmount.value.result, amount: userBetAmount.value.stake }
            : null

        // call server-side function which enforces cooldown and inserts
        const inserted = await postNewComment(betId.value, newComment.value, commentId, usersStake)

        const finalPhoto = (inserted && inserted.photo_url) ? inserted.photo_url : user?.photo_url

        const newObj = {
            text: newComment.value,
            created_at: new Date().toISOString(),
            id: inserted?.id ?? commentId,
            user_id: user?.id ?? 99,
            username: user?.username ?? 'Anonymous',
            users_stake: usersStake,
            photo_url: finalPhoto,
            optimistic: !inserted?.id
        }

        comments.value.unshift(newObj)

        // if server returned different/extra fields, patch the optimistic entry:
        if (inserted) {
            const i = comments.value.findIndex(c => c.id === newObj.id)
            if (i !== -1) comments.value[i] = { ...comments.value[i], ...inserted, optimistic: false }
        }

        // reset input
        newComment.value = ''

        // update last comment timestamp and restart client cooldown from now
        lastCommentAt.value = new Date().toISOString()
        startCooldownFromTimestamp(lastCommentAt.value)
    } catch (err) {
        // If server threw a cooldown error, it will have a custom 'code' and 'remaining' we set below
        if (err && err.code === 'COOLDOWN' && typeof err.remaining === 'number') {
            // start countdown with what server says (in seconds)
            startCooldown(err.remaining)
            // optional: show toast/message to user that they must wait
            console.warn(`You must wait ${err.remaining} seconds before posting another comment.`)
        } else {
            // fallback: log and optionally show generic error UI
            console.error('Failed to post comment', err)
        }
    }
}

async function handleDelete(commentId) {
    try {
        await deleteComment(commentId)
        comments.value = comments.value.filter(c => c.id !== commentId)
    } catch (err) {
        console.error(err)
    }
}

function openBetModal(side) {
    betSide.value = side
    showBetModal.value = true
}

// Watch for changes to the effective bet id and reload the data when it changes.
// This is the core of "Option A" so the component stays mounted but responds to param/prop changes.
watch(betId, async (newId, oldId) => {
    if (!newId || newId === oldId) return
    await loadData(newId)
    await refreshUserLastCommentTime()
})
</script>

<style lang="css" scoped>
/* Container */
.bet-details {
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: relative;
    margin-top: 1.25rem;
}

/* Header (allow wrapping; don't force full-viewport width) */
.header {
    display: flex;
    background: #292a2a;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0;
    /* vertical padding instead of fixed height */
    width: 100%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    flex-shrink: 0;
    min-height: 5rem;
    /* preserve the original minimum height */
    box-sizing: border-box;
}

/* Title: take remaining space, but don't force the gauge to shrink.
   min-width: 0 is required so the flex child can actually shrink and wrap. */
.header__text {
    flex: 1 1 auto;
    /* grow when there's space, shrink and wrap when needed */
    min-width: 0;
    /* allow wrapping inside flex container */
    margin-left: 1.5rem;
    margin-right: 0.75rem;
    font-size: 1.2rem;
    font-weight: 600;
    color: #F7F9FB;
    font-family: "Inter", sans-serif;
    white-space: normal;
    /* allow wrapping to next line */
    overflow-wrap: anywhere;
    /* break long words / symbols safely */
    word-break: break-word;
    /* fallback to avoid overflow on weird tokens */
    hyphens: auto;
    /* optional: adds hyphenation where supported */
}

.loader-center {
    height: 100vh;
    width: 100vw;
    align-items: center;
    justify-content: center;
}

.content {
    flex: 1;
    padding-left: 16px;
    padding-right: 16px;
    /* leave space for footer + navbar, plus keyboard if present */
    --bottom-space: 95px;
    /* default combined footer + navbar space you had before */
    padding-bottom: calc(var(--bottom-space) + var(--keyboard-height, 0px));
}

.content__chart {
    margin: 24px 0;
}

/* Card */
.card {
    background: #313131;
    border-radius: 12px;
    padding: 16px;
    padding-top: 14px;
    margin-bottom: 26px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.card__title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #F7F9FB;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.volume_info,
.card__text {
    font-size: 0.95rem;
    color: #9ca3af;
    line-height: 1.5;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

.grid .card {
    margin-bottom: 0;
}

.volume_info {
    display: flex;
    justify-content: space-between;
}

/* Grid */
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 20px;
}

.grid__item {
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #F7F9FB;
    font-family: "Inter", sans-serif;
    font-size: 1rem;
    font-weight: 400;
    gap: 10px;
}

/* but any .grid__full should span both columns */
.grid__full {
    background: linear-gradient(to right, #2D83EC, #1AC9FF);
    grid-column: 1 / -1;
}

.info-card {
    position: relative;
    overflow: hidden;
}

.info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info-toggle {
    background: none;
    border: none;
    color: #F7F9FB;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    font-family: "Inter", sans-serif;
}

.arrow {
    display: inline-block;
    margin-left: 4px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    transition: transform 0.2s ease;
}

.arrow.down {
    border-top: 6px solid #F7F9FB;
}

.arrow.up {
    border-bottom: 6px solid #F7F9FB;
}

/* The collapsible container */
.info-body {
    transition: max-height 0.3s ease, opacity 0.3s ease;
    max-height: 1000px;
    /* big enough to show all content */
    opacity: 1;
    overflow: hidden;
}

/* When collapsed, shrink to zero height */
.info-body--collapsed {
    max-height: 0;
    opacity: 0;
}

/* style the always-visible first sentence if you like */
.first-sentence {
    margin-bottom: 20px;
}

/* Comments */
.comments__input-row {
    display: flex;
    margin-top: 1rem;
    margin-bottom: 1rem;
}

.comments__input {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 8px 0 0 8px;
    font-size: 0.95rem;
    font-family: "Inter", sans-serif;
    font-weight: 400;
}

.comments__post {
    padding: 10px 16px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 0 8px 8px 0;
    cursor: pointer;
}

.comments__warning {
    background: #f0f0f0;
    color: #666;
    font-size: 0.75rem;
    padding: 12px;
    border-radius: 12px;
    margin-bottom: 1rem;
    margin-top: 1rem;
    text-align: center;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.comments__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.comments__anchor {
    height: 1px;
}

/* Footer */
.footer {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom, 0px));
    width: min(920px, 96%);
    height: 100px;
    display: flex;
    gap: 10px;
    justify-content: space-around;
    align-items: center;
    padding: 8px 12px;
    z-index: 3;

    background: rgba(0, 0, 0, 0.82);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    backdrop-filter: blur(10px) saturate(120%);
    box-shadow: 0 8px 24px rgba(16, 6, 6, 0.48);
    box-sizing: border-box;
    border: none;
    /* explicit: no border */
    border-radius: 0px;
    border-start-start-radius: 16px;
    border-start-end-radius: 16px;
    /* footer itself has square edges */
}

/* ---------- Button base (adapted preset for <button>) ---------- */
.footer__yes,
.footer__no {
    position: relative;
    /* needed for ::after rail */
    z-index: 2;
    /* keep above the rail */
    display: inline-block;
    margin: 0;
    min-width: 44px;
    flex: 1 1 0;
    text-align: center;
    text-decoration: none;
    color: #ffffff;
    font-family: Inter, Helvetica, Arial, sans-serif;
    font-weight: 700;
    font-size: 16px;
    /* readable on mobile */
    padding: 14px 22px;
    cursor: pointer;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    user-select: none;
    border: none;
    border-radius: 8px;
    overflow: visible;
    transition: transform 120ms ease, box-shadow 160ms ease, background-color 120ms ease;
    -webkit-font-smoothing: antialiased;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 0 rgba(0, 0, 0, 0.35);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
}

/* Button base (keep) */
.footer__yes,
.footer__no {
    position: relative;
    display: inline-block;
    z-index: 2;
    flex: 1 1 0;
    padding: 14px 22px;
    border: none;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 160ms ease, background-color 120ms ease;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    user-select: none;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
}

/* YES button — with built-in "rail" shadow using a second box-shadow layer */
.footer__yes {
    background: linear-gradient(180deg, #2d8d29, #107b1d);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        /* top highlight */
        0 8px 0 #0d5f17,
        /* solid rail-like block */
        0 10px 22px rgba(0, 0, 0, 0.45);
    /* soft ambient blur */
    border: none;
}

/* NO button — same approach */
.footer__no {
    background: linear-gradient(180deg, #a53131, #bb2b2b);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 8px 0 #902525,
        0 10px 22px rgba(0, 0, 0, 0.45);
    border: none;
}

/* Pressed (active) */
.footer__yes:active,
.footer__no:active {
    transform: translateY(10px);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 2px 0 rgba(0, 0, 0, 0.6);
    /* smaller rail when pressed */
}

/* Remove any existing ::after rules so nothing overlaps */
.footer__yes::after,
.footer__no::after {
    display: none !important;
}

/* Tweak for small screens so the rail doesn't overflow too much */
@media (max-width: 420px) {

    .footer__yes::after,
    .footer__no::after {
        bottom: -12px;
        left: -3px;
        padding: 3px;
    }
}

/* Focus-visible for accessibility (subtle blue halo) */
.footer__yes:focus,
.footer__no:focus {
    outline: none;
}

.footer__yes:focus-visible,
.footer__no:focus-visible {
    box-shadow:
        0 10px 18px rgba(0, 0, 0, 0.4),
        0 0 0 4px rgba(0, 152, 234, 0.12);
    /* TON-blue halo, subtle */
    border-radius: 8px;
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {

    .footer__yes,
    .footer__no {
        transition: none !important;
    }
}

/* 🎉 Celebration banner */
.celebration-banner {
    margin: 16px 0;
    padding: 16px;
    background: linear-gradient(135deg, #22c55e, #10b981);
    color: #F7F9FB;
    border-radius: 12px;
    text-align: center;
    animation: fadeInDown 0.5s ease-out;
}

.celebration-banner h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
}

.celebration-banner p {
    margin: 4px 0 0;
    font-size: 0.95rem;
}

/* small slide-down effect */
@keyframes fadeInDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* put overlay below footer so footer remains clickable */
.keyboard-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2;
    /* below footer (3) but above content with default stacking */
    background: transparent;
    touch-action: manipulation;
}
</style>
