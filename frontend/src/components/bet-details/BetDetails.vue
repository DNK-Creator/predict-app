<template>
    <!-- single root to avoid fragment non-props attr warnings -->
    <div class="bet-details-root">
        <div v-if="spinnerShow" class="loader-center">
            <LoaderPepe />
        </div>

        <ShowBetModal :visible="showBetModal" :bet="bet" :side="betSide" @close="showBetModal = false"
            @placed="onBetPlaced" />

        <div v-show="!spinnerShow" class="bet-details">

            <div class="header-two">
                <h1 class="header__text" ref="headerContainer" aria-label="bet title">
                    <!-- iterate tokens (word or single-space tokens) -->
                    <template v-for="(token, tIdx) in tokens" :key="tIdx">
                        <!-- word tokens: keep word intact with nowrap and render each char inside -->
                        <span v-if="token.type === 'word'" class="word">
                            <span v-for="(ch, cIdx) in token.chars" :key="`t${tIdx}-c${cIdx}`" class="char"
                                :class="{ visible: (token.start + cIdx) < displayedCount }"
                                :ref="el => setCharRef(el, token.start + cIdx)"
                                v-html="ch === ' ' ? '&nbsp;' : ch"></span>
                        </span>

                        <!-- space tokens: use &nbsp; so the parser doesn't collapse the character -->
                        <span v-else class="space" :class="{ visible: token.start < displayedCount }"
                            :ref="el => setCharRef(el, token.start)" v-html="'&nbsp;'">
                        </span>

                    </template>

                    <!-- JS caret that is absolutely positioned inside the header -->
                    <span class="typing-caret" ref="caretEl" aria-hidden="true"></span>
                </h1>
            </div>

            <!-- overlay that sits under header but above content when keyboard open -->
            <div v-if="isKeyboardOpen" class="keyboard-backdrop" @click="onKeyboardBackdropClick" />

            <!-- Main content -->
            <main ref="scrollArea" class="content" @scroll.passive="handleScroll">
                <!-- 🎉 Celebration Banner -->
                <div v-if="showCelebration" class="celebration-banner">
                    <h2 v-if="user"> {{ $t('congrats') }}, {{ user?.username }}! </h2>
                    <h2 v-else> {{ $t('congrats-user') }} </h2>
                    <p>{{ $t('winning-soon') }}</p>
                </div>

                <section class="content__chart">
                    <MemoryOrb :inside_image="bet.inside_image" :bet_name="bet.name" />
                </section>

                <div class="informations-container">
                    <div class="info-object-one">
                        <div class="chance-row">
                            <span class="volume-value" v-if="volume.Yes && volume.No">{{ Number(volume.Yes + volume.No).toFixed(2) }}</span>
                            <span class="volume-value" v-else-if="volume.Yes">{{ Number(volume.Yes).toFixed(2) }}</span>
                            <span class="volume-value" v-else-if="volume.No">{{ Number(volume.No).toFixed(2) }}</span>
                            <span class="volume-value" v-else>0</span>
                            <img :src="tonIcon" class="ton-image">
                        </div>
                        <span class="info-hint">{{ $t('volume') }}</span>
                    </div>

                    <!-- <-- moved visualization into this card (square above, percent below in a row) -->
                    <div class="info-object-two">
                        <!-- square visualization (2x2 grid) -->
                        <div class="square-wrap" aria-hidden="true" title="Type">
                            <div class="top-right-square" role="img" aria-hidden="true">
                                <span v-for="(c, i) in dotColors" :key="i" class="grid-dot"
                                    :style="{ backgroundColor: c }"></span>
                            </div>
                        </div>

                        <!-- percent + hint in a single row under the square -->
                        <div class="chance-row" role="group" aria-label="Chance">
                            <span class="info-hint">{{ calculatedOdds }}%</span>
                            <span class="info-hint">{{ $t('chance') }}</span>
                        </div>
                    </div>

                    <div class="info-object-three">
                        <span class="info-value">{{ timeRemaining }}</span>
                        <span v-if="timeRemaining !== 'Closed' && timeRemaining !== 'Закрыто'" class="info-hint">{{
                            $t('time-left')
                        }}</span>
                    </div>
                </div>

                <section class="card info-card">
                    <div class="info-header">
                        <h2 class="card__title">{{ $t('information') }}</h2>
                        <button class="info-toggle" @click="showInfo = !showInfo">
                            {{ showInfo ? translateHide() : translateExpand() }}
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
                        <!-- <div class="volume_info">
                            <span>{{ $t('time-left') }}:</span>
                            <span>{{ timeRemaining }}</span>
                        </div>
                        <div class="volume_info">
                            <span>{{ $t('status') }}:</span>
                            <span v-if="bet.result !== 'undefined'">{{ $t('result') }}: "{{ formatUsersSide(bet.result)
                            }}"</span>
                            <span v-else-if="betStatus !== '000' && betStatus !== '111'">{{ translateStatus(betStatus)
                                }}</span>
                            <span v-else-if="betStatus === '111'">{{ $t('open') }}</span>
                            <span v-else>{{ $t('waiting-bet') }}</span>
                        </div>
                        <div class="volume_info">
                            <span>{{ $t('volume') }}:</span>
                            <span v-if="volume.Yes && volume.No">{{ volume.Yes + volume.No }} TON</span>
                            <span v-else-if="volume.Yes">{{ volume.Yes }} TON</span>
                            <span v-else-if="volume.No">{{ volume.No }} TON</span>
                            <span v-else>0 TON</span>
                        </div> -->
                    </div>
                </section>

                <section class="grid">
                    <div v-if="userBetAmount.stake > 0" class="card grid__item grid__full">
                        <span> {{ $t('your-bet') }}: {{ userBetAmount.stake }} TON {{ $t('on-something') }} {{
                            formatUsersSide(userBetAmount.result) }}
                        </span>
                    </div>
                    <div v-else-if="betStatus !== '000'" class="card grid__item grid__full">
                        <span>{{ $t('didnt-place-bet') }}</span>
                    </div>
                </section>

                <section class="card comments">
                    <h2 class="card__title">{{ $t('comments') }}</h2>

                    <div v-if="canComment" class="comments__input-row">
                        <input ref="commentsInput" v-model="newComment" type="text" maxlength="205"
                            :placeholder="translatePlaceholder()" class="comments__input"
                            :disabled="cooldownRemaining > 0" @keyup.enter="tryPostComment" @focus="onCommentsFocus"
                            @blur="onCommentsBlur" />

                        <button class="comments__post" :disabled="isSendDisabled" @click="tryPostComment"
                            :aria-label="cooldownRemaining > 0 ? `${translateWait()} ${formattedCooldown}` : translateSendComment()">
                            <span v-if="cooldownRemaining > 0">{{ formattedCooldown }}</span>
                            <span v-else>{{ $t('send') }}</span>
                        </button>
                    </div>

                    <div v-if="betStatus === '000'" class="comments__warning">
                        {{ $t('comments-limited-one') }}
                    </div>
                    <div v-else-if="!canComment" class="comments__warning">
                        {{ $t('comments-limited-two') }}
                    </div>

                    <div class="comments__list">
                        <CommentItem v-for="c in comments" :key="c.id" :comment="c" @delete-comment="handleDelete" />
                        <div ref="commentsAnchor" class="comments__anchor"></div>
                    </div>
                </section>
            </main>

            <!-- Buy buttons -->
            <div v-if="betStatus !== '000'" class="footer">
                <button :class="['footer__yes', { pressed: pressingYes }]" @click="openBetModal('Yes')"
                    @pointerdown="onPointerDown('yes')" @pointerup="onPointerUp('yes')"
                    @pointercancel="onPointerUp('yes')" @mouseleave="onPointerUp('yes')"
                    @touchstart.passive="onPointerDown('yes')" @touchend.passive="onPointerUp('yes')">
                    {{ $t('yes') }}
                </button>

                <button :class="['footer__no', { pressed: pressingNo }]" @click="openBetModal('No')"
                    @pointerdown="onPointerDown('no')" @pointerup="onPointerUp('no')" @pointercancel="onPointerUp('no')"
                    @mouseleave="onPointerUp('no')" @touchstart.passive="onPointerDown('no')"
                    @touchend.passive="onPointerUp('no')">
                    {{ $t('no') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, onActivated, onDeactivated, computed, nextTick, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
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
import MemoryOrb from './MemoryOrb.vue'
import CommentItem from '@/components/bet-details/CommentItem.vue'
import ShowBetModal from '@/components/bet-details/ShowBetModal.vue'
import LoaderPepe from '../LoaderPepe.vue'
import { parseISO } from 'date-fns'
import { useTelegram } from '@/services/telegram'
import confetti from 'canvas-confetti'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { v4 as uuidv4 } from 'uuid'
import tonIcon from '@/assets/icons/TON_Icon.png'

// accept id as optional prop (router can pass params as props when configured)
const props = defineProps({
    id: {
        type: [String, Number],
        default: null,
    },
})

const app = useAppStore()

const pressingYes = ref(false)
const pressingNo = ref(false)

const route = useRoute()

const commentsInput = ref(null)

// create a reactive boolean the template can use
const isKeyboardOpen = ref(false)

let bodyClassObserver = null

function translatePlaceholder() {
    return app.language === 'ru' ? 'Напишите комментарий..' : 'Post a comment..'
}

function translateStatus(status) {
    if (status === 'Закрыто' || status === 'закрыто') {
        return app.language === 'ru' ? 'Закрыто' : 'Closed'
    }
}

function translateHide() {
    return app.language === 'ru' ? 'Скрыть' : 'Hide'
}
function translateExpand() {
    return app.language === 'ru' ? 'Раскрыть' : 'Expand'
}

function translateWait() {
    return app.language === 'ru' ? 'Ожидайте' : 'Wait'
}

function translateSendComment() {
    return app.language === 'ru' ? 'Отправить комментарий' : 'Send a comment'
}

function onPointerDown(side) {
    if (side === 'yes') pressingYes.value = true
    else pressingNo.value = true
}

function onPointerUp(side) {
    if (side === 'yes') pressingYes.value = false
    else pressingNo.value = false
}

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

const opacities = [0.25, 0.5, 1.0, 0.5];

// helper: parse numeric chance robustly (strip % etc.)
function parseChance(value) {
    if (value == null) return 0
    if (typeof value === 'number') return value
    const s = String(value).replace('%', '').trim()
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : 0
}

// choose base color (hex) by chance
const baseHex = computed(() => {
    const n = parseChance(bet.value.current_odds) * 100
    if (n > 75) return '#2ecc71' // green
    if (n >= 26) return '#1d7abd' // blue (close to previous teal)
    return '#e55353' // red
})

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
    const r = parseInt(full.substr(0, 2), 16);
    const g = parseInt(full.substr(2, 2), 16);
    const b = parseInt(full.substr(4, 2), 16);
    return { r, g, b };
}

const dotColors = computed(() => {
    const rgb = hexToRgb(baseHex.value || '#1d7abd');
    return opacities.map(a => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`);
});


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
    if (side === 'Yes' || side === 'yes' || side === 'YES') {
        return app.language === 'ru' ? 'Да' : 'Yes'
    }
    return app.language === 'ru' ? 'Нет' : 'No'
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
    let decNumber = Number(yes / total).toFixed(2)
    if (total > 0) return decNumber * 100
    const p = Number(bet.current_odds)
    return isFinite(p) ? Math.max(0, Math.min(1, p)) : 0
})

// description helpers
const firstSentence = computed(() => {
    const text = app.language === 'ru' ? bet.value.description || '' : bet.value.description_en || ''
    const matched = text.match(/^(.+?[.!?])(\s|$)/)
    return matched ? matched[1] : text
})

const restDescription = computed(() => {
    const text = app.language === 'ru' ? bet.value.description || '' : bet.value.description_en || ''
    const fs = firstSentence.value
    return text.length > fs.length ? text.slice(fs.length).trim() : ''
})
// time remaining helper
const now = ref(Date.now())
let timer = null

// Russian plural helper (keeps original behaviour)
function ruPlural(n, [one, few, many]) {
    const mod10 = Math.abs(n) % 10
    const mod100 = Math.abs(n) % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

/**
 * formatUnit - return localized unit string for a number
 * type: 'day' | 'hour' | 'minute'
 * language: 'ru' | 'en' (defaults to app.language or 'ru')
 */
function formatUnit(n, type, language = (app?.language ?? 'ru')) {
    const lang = (language === 'ru') ? 'ru' : 'en'

    if (lang === 'ru') {
        if (type === 'day') {
            return `${n} ${ruPlural(n, ['день', 'дня', 'дней'])}`
        } else if (type === 'hour') {
            return `${n} ${ruPlural(n, ['час', 'часа', 'часов'])}`
        } else if (type === 'minute') {
            return `${n} ${ruPlural(n, ['минута', 'минуты', 'минут'])}`
        }
        return `${n}`
    } else {
        // English: simple singular/plural
        const enForms = {
            day: ['day', 'days'],
            hour: ['hour', 'hours'],
            minute: ['minute', 'minutes']
        }
        const forms = enForms[type] || ['unit', 'units']
        return `${n} ${n === 1 ? forms[0] : forms[1]}`
    }
}

const timeRemaining = computed(() => {
    const raw = bet?.value?.close_time
    const language = (app?.language === 'ru') ? 'ru' : 'en'

    if (!raw) return ''

    let closeDate
    try {
        if (typeof raw === 'string') {
            // parseISO may be available in your project (date-fns). Fallback to Date if not.
            closeDate = (typeof parseISO === 'function') ? parseISO(raw) : new Date(raw)
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
    if (diffMs <= 0) return language === 'ru' ? 'Закрыто' : 'Closed'

    const totalMinutes = Math.floor(diffMs / 60000)
    if (totalMinutes < 1) return language === 'ru' ? 'меньше 1 минуты' : 'less than a minute'

    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
    const minutes = totalMinutes % 60

    const parts = []
    if (days > 0) {
        parts.push(formatUnit(days, 'day', language))
        if (hours > 0) parts.push(formatUnit(hours, 'hour', language))
        // dont need minutes if too much time left
        // if (minutes > 0) parts.push(formatUnit(minutes, 'minute', language))
    } else if (hours > 0) {
        parts.push(formatUnit(hours, 'hour', language))
        if (minutes > 0) parts.push(formatUnit(minutes, 'minute', language))
    } else {
        parts.push(formatUnit(minutes, 'minute', language))
    }

    // Join parts with a space; this produces:
    // ru: "3 дня 4 часа 5 минут"
    // en: "3 days 4 hours 5 minutes"
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

        const betResultNorm = normalizeResult(bet.value?.result)
        const userResultNorm = normalizeResult(userBetAmount.value?.result)
        if (
            betResultNorm &&
            betResultNorm !== 'undefined' &&            // keep your original "undefined" guard
            userBetAmount.value.stake > 0 &&
            userResultNorm === betResultNorm
        ) {
            showCelebration.value = true
            setTimeout(() => runConfetti(), 200)
        }

    } catch (err) {
        console.error('Error loading bet data:', err)
    } finally {
        spinnerShow.value = false
    }
}

// helper inside the same scope
function normalizeResult(val) {
    if (val === null || val === undefined) return ''
    return String(val).trim().replace(/[_\s]+/g, '').toLowerCase()
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

    window.addEventListener('resize', onResize);

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

    cancelTyping();
    window.removeEventListener('resize', onResize);

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
            let messageText = app.language === 'ru' ? `Необходимо подождать еще ${err.remaining}` : `Need to wait for ${err.remaining}`
            toast.warn(messageText)
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

// typing speed (ms per character)
const CHAR_DELAY = 35;

// sourceText already derived earlier in your file; if not, keep your existing sourceText logic:
function getBetName() {
    return app.language === 'ru' ? bet.value.name : bet.value.name_en
}

// derive the source text from app.language + bet row (falls back to name if localized missing)
const sourceText = computed(() => {
    // choose localized text: prefer explicit en field when language isn't ru
    const nameRu = String(bet.value?.name ?? '')
    const nameEn = String(bet.value?.name_en ?? '')
    return (app.language === 'ru') ? nameRu : (nameEn || nameRu)
})

// Tokenize into tokens: words (sequence of non-space chars) and single-space tokens.
// This returns an array of { type: 'word'|'space', chars: [...], start: <global char index> }
const tokens = computed(() => {
    const s = String(sourceText.value || '')
    // match either runs of non-space characters (\S+) or single whitespace char (\s)
    const re = /(\S+|\s)/g
    const matches = s.match(re) || []
    let globalIndex = 0
    return matches.map((tok) => {
        const isSpace = /^\s$/.test(tok)
        const chars = Array.from(tok) // for words: array of letters; for space tok: [' ']
        const start = globalIndex
        globalIndex += chars.length
        return { type: isSpace ? 'space' : 'word', chars, start }
    })
})

// total character count (sum of all token char lengths)
const totalChars = computed(() => tokens.value.reduce((sum, t) => sum + t.chars.length, 0))

// exposed typing state consumed by template:
const displayedCount = ref(0);
let typingTimer = null;
let cancelled = false;

// refs & helpers for measuring characters for caret
const charRefs = []; // charRefs[idx] = DOM node for that character (word char or space span)
function setCharRef(el, idx) {
    // Vue may call this with null when nodes unmount — guard
    if (!idx && idx !== 0) return;
    charRefs[idx] = el;
}

const headerContainer = ref(null);
const caretEl = ref(null);

function cancelTyping() {
    cancelled = true;
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
}

async function startTyping() {
    cancelTyping();
    cancelled = false;
    displayedCount.value = 0;
    await nextTick();
    updateCaretPosition();

    const total = totalChars.value;
    for (let i = 0; i < total; i++) {
        await new Promise((res) => { typingTimer = setTimeout(res, CHAR_DELAY); });
        if (cancelled) break;
        displayedCount.value = i + 1;
        await nextTick();
        updateCaretPosition();
    }

    updateCaretPosition();
    typingTimer = null;
}

// measure and position caret to right edge of last visible char (works for spaces too)
function updateCaretPosition() {
    const container = headerContainer.value;
    const caret = caretEl.value;
    if (!container || !caret) return;

    const containerRect = container.getBoundingClientRect();

    if (displayedCount.value === 0) {
        // place at start of first char or at container left
        const first = charRefs[0];
        if (first) {
            const r = first.getBoundingClientRect();
            const left = Math.max(0, r.left - containerRect.left);
            caret.style.left = `${left}px`;
            caret.style.top = `${Math.max(0, r.top - containerRect.top)}px`;
            caret.style.height = `${r.height}px`;
        } else {
            caret.style.left = `0px`;
            caret.style.top = `0px`;
            caret.style.height = `${containerRect.height}px`;
        }
        return;
    }

    // last visible char index (may be a space token)
    const idx = Math.min(displayedCount.value - 1, charRefs.length - 1);
    const el = charRefs[idx];
    if (el) {
        const r = el.getBoundingClientRect();
        const left = Math.max(0, r.right - containerRect.left);
        caret.style.left = `${left}px`;
        caret.style.top = `${Math.max(0, r.top - containerRect.top)}px`;
        caret.style.height = `${r.height}px`;
    } else {
        caret.style.left = `${containerRect.width}px`;
        caret.style.top = `0px`;
        caret.style.height = `${containerRect.height}px`;
    }
}

// Whenever the localized sourceText changes we must replay typing.
// Clear any cached char refs first so measurement is fresh.
watch(
    sourceText,
    async () => {
        // clear char refs so old DOM node pointers aren't reused
        charRefs.length = 0

        // restart typing animation
        // cancelTyping/startTyping handle displayedCount reset and caret update
        await nextTick()
        startTyping()
    },
    { immediate: true }
)

// Optionally also restart when the component's bet id/data changes (if you want double-safety)
watch(
    () => [bet.value?.name, bet.value?.name_en, app.language],
    async () => {
        charRefs.length = 0
        await nextTick()
        startTyping()
    }
)

function onResize() { updateCaretPosition(); }

</script>

<style lang="css" scoped>
.bet-details-root {
    overflow-x: hidden;
    height: 100%;
}

/* Container */
.bet-details {
    display: flex;
    flex-direction: column;
    height: auto;
    position: relative;
    margin-top: 1.25rem;
}

.header-two {
    display: flex;
    min-height: 4rem;
    align-items: center;
    justify-content: center;
    text-align: center;
    user-select: none;
}

/* container needs position:relative so caret (absolute) can be placed inside */
.header__text {
    font-size: 1.5rem;
    font-weight: 400;
    width: 80%;
    color: #F7F9FB;
    font-family: "Compliance Sans", sans-serif;
    white-space: pre-wrap;
    /* preserve spaces and allow wrapping */
    overflow-wrap: anywhere;
    word-break: break-word;
    hyphens: auto;

    position: relative;
    /* for absolute caret */
    display: inline-block;
    line-height: 1.2;
}

/* ensure words don't split mid-word */
.header__text .word {
    display: inline-block;
    white-space: nowrap;
    /* important — prevents wrapping inside a word */
}

/* space token: a measurable inline element, allows breaks between words */
.header__text .space {
    display: inline-block;
    white-space: pre;
    /* preserve the actual space character inside */
    width: auto;
    /* keep the space visually small; its actual width comes from the font */
}

/* each character still inline-block for precise measurement */
.header__text .char {
    display: inline-block;
    visibility: hidden;
}

/* reveal typed characters instantly (no fading) */
.header__text .char.visible {
    visibility: visible;
}

/* caret styling unchanged */
.typing-caret {
    position: absolute;
    width: 1px;
    background: currentColor;
    left: 0;
    top: 0;
    height: 1em;
    pointer-events: none;
    animation: caret-blink 1s steps(2, start) infinite;
}

@keyframes caret-blink {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0;
    }

    100% {
        opacity: 1;
    }
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
    user-select: none;
}

.header-left-group {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 1.75rem;
}

.header-left-group img {
    height: 25px;
    width: 25px;
}

.loader-center {
    /* don't force 100vh/100vw inside the parent scroll container */
    min-height: 200px;
    /* or whatever fits your loading UX */
    width: 100%;
    align-items: center;
    justify-content: center;
}

.content {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding-left: 16px;
    padding-right: 16px;
    /* leave space for footer + navbar, plus keyboard if present */
    --bottom-space: 95px;
    /* default combined footer + navbar space you had before */
    padding-bottom: calc(var(--bottom-space) + var(--keyboard-height, 0px));

    justify-content: center;
    align-items: center;
}

.content__chart {
    display: flex;
    width: 100%;
    margin: auto auto;
    align-self: center;
}

/* Card */
.card {
    width: 90%;
    background: #313131;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    user-select: none;
}

.card__title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #F7F9FB;
    font-family: "Inter", sans-serif;
    font-weight: 600;
}

.informations-container {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 12px;
    width: 100%;
    height: 10rem;
    z-index: 3;
    user-select: none;
}

.info-object-one,
.info-object-two,
.info-object-three {
    position: relative;
    display: flex;
    padding: 8px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    border-radius: 16px;
    gap: 4px;
    width: 9rem;
    height: 7rem;
    background-color: #292a2a;
    font-family: "Inter", sans-serif;
    font-weight: 600;

    /* FROSTED GLASS */
    background: rgba(255, 255, 255, 0.04);
    /* subtle light tint */
    border: 1px solid rgba(255, 255, 255, 0.08);
    /* soft edge */
    overflow: hidden;
    /* contain sheen */
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    backdrop-filter: blur(15px) saturate(120%);
    /* blur the content behind */
    box-shadow:
        0 10px 30px rgba(8, 10, 12, 0.75),
        /* main shadow */
        inset 0 1px 0 rgba(255, 255, 255, 0.02);
    /* tiny inner highlight */

    /* performance hint */
    will-change: transform;
    transform-origin: center;
    /* animation: name duration timing infinite and staggered by per-class delay below */
    animation: float-breathe 6s ease-in-out infinite;
}

/* ---------- Frosted glass base for info cards + .card / .information / .comments ---------- */
.info-object-one,
.info-object-two,
.info-object-three,
.card,
.information,
.comments {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    /* contain overlays */
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    backdrop-filter: blur(10px) saturate(120%);
    box-shadow:
        0 10px 30px rgba(8, 10, 12, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

/* glossy sheen overlay (shared) */
.info-object-one::before,
.info-object-two::before,
.info-object-three::before,
.card::before,
.information::before,
.comments::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: linear-gradient(180deg,
            rgba(255, 255, 255, 0.06) 0%,
            rgba(255, 255, 255, 0.02) 30%,
            rgba(255, 255, 255, 0.00) 60%);
    mix-blend-mode: overlay;
    opacity: 0.9;
}

/* subtle color tints -- small opacity so effect is delicate */
/* Info card tints (three distinct casts) */
.info-object-one::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(120, 80, 255, 0.035), rgba(255, 255, 255, 0));
    mix-blend-mode: soft-light;
}

.info-object-two::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(0, 200, 180, 0.03), rgba(255, 255, 255, 0));
    mix-blend-mode: soft-light;
}

.info-object-three::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255, 120, 80, 0.035), rgba(255, 255, 255, 0));
    mix-blend-mode: soft-light;
}

/* Default tint for other cards/blocks (very subtle) */
.card::after,
.information::after,
.comments::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(100, 120, 255, 0.02), rgba(255, 255, 255, 0));
    mix-blend-mode: soft-light;
}

/* tweak text colors so they read well on top of the frosted background */
.card,
.information,
.comments,
.info-object-one,
.info-object-two,
.info-object-three {
    color: #fff;
    /* keep strong contrast */
}

/* optional: slight color tint per card (uncomment if you want) */

.info-object-one::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(120, 80, 255, 0.04), transparent 70%);
    pointer-events: none;
}

.info-object-two::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(0, 200, 180, 0.03), transparent 70%);
    pointer-events: none;
}

.info-object-three::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255, 120, 80, 0.03), transparent 70%);
    pointer-events: none;
}

/* Fallback for browsers without backdrop-filter */
@supports not ((-webkit-backdrop-filter: blur(10px)) or (backdrop-filter: blur(10px))) {

    .info-object-one,
    .info-object-two,
    .info-object-three,
    .card,
    .information,
    .comments {
        background: linear-gradient(180deg, rgba(41, 42, 42, 0.9), rgba(41, 42, 42, 0.75));
        border: 1px solid rgba(255, 255, 255, 0.04);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
    }

    /* reduce/disable the tint overlays in the fallback so there's no weird blending */
    .info-object-one::after,
    .info-object-two::after,
    .info-object-three::after,
    .card::after,
    .information::after,
    .comments::after {
        display: none;
    }

    .info-object-one::before,
    .info-object-two::before,
    .info-object-three::before,
    .card::before,
    .information::before,
    .comments::before {
        display: none;
    }
}

/* --------------------
   CARD 1 (manual rotation + stagger)
   -------------------- */
.info-object-one {
    /* explicit initial rotation (fallback before animation starts) */
    transform: rotate(2deg);
    animation: float-breathe-one 6s ease-in-out infinite;
    animation-delay: 0s;
}

@keyframes float-breathe-one {
    0% {
        transform: rotate(2deg) translateY(0) scale(1);
    }

    25% {
        transform: rotate(2.4deg) translateY(-3px) scale(1.01);
    }

    50% {
        transform: rotate(2.8deg) translateY(-6px) scale(1.03);
    }

    75% {
        transform: rotate(2.4deg) translateY(-3px) scale(1.01);
    }

    100% {
        transform: rotate(2deg) translateY(0) scale(1);
    }
}

/* --------------------
   CARD 2 (manual rotation + stagger)
   -------------------- */
.info-object-two {
    transform: rotate(-0.25deg);
    animation: float-breathe-two 6s ease-in-out infinite;
    animation-delay: 0.6s;
    gap: 8px;
    /* space between square and percent row */
    padding: 8px 10px;
    /* make a little breathing room */
    /* staggered */
}

/* square wrapper centers the grid */
.square-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0;
    /* spacing handled by parent gap */
}

/* 2x2 square visualization — slightly larger so it's readable above text */
.top-right-square {
    width: 44px;
    height: 44px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 3px;
    box-sizing: border-box;
}

/* grid dots — colors provided via :style (dotColors) */
.top-right-square .grid-dot {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    display: block;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25) inset;
}

/* chance row: percent + hint in a single horizontal row */
.chance-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
}

.ton-image {
    height: 20px;
    width: 20px;
}

@keyframes float-breathe-two {
    0% {
        transform: rotate(-0.25deg) translateY(0) scale(1);
    }

    25% {
        transform: rotate(0.5deg) translateY(-3px) scale(1.01);
    }

    50% {
        transform: rotate(0deg) translateY(-6px) scale(1.03);
    }

    75% {
        transform: rotate(-1deg) translateY(-3px) scale(1.01);
    }

    100% {
        transform: rotate(-0.25deg) translateY(0) scale(1);
    }
}

/* --------------------
   CARD 3 (manual rotation + stagger)
   -------------------- */
.info-object-three {
    transform: rotate(-3deg);
    animation: float-breathe-three 6s ease-in-out infinite;
    animation-delay: 1.2s;
    /* staggered */
}

@keyframes float-breathe-three {
    0% {
        transform: rotate(-3deg) translateY(0) scale(1);
    }

    25% {
        transform: rotate(-3.4deg) translateY(-3px) scale(1.01);
    }

    50% {
        transform: rotate(-3.8deg) translateY(-6px) scale(1.03);
    }

    75% {
        transform: rotate(-3.4deg) translateY(-3px) scale(1.01);
    }

    100% {
        transform: rotate(-3deg) translateY(0) scale(1);
    }
}

.info-object-image {
    position: absolute;
    width: 100%;
    height: 100%;
}

/* accessibility: respect reduced motion */
@media (prefers-reduced-motion: reduce) {

    .info-object-one,
    .info-object-two,
    .info-object-three {
        animation: none;
        transition: none;
    }
}

.info-value {
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 1.05rem;
    line-height: 1;
    text-align: center;
    text-justify: center;
}

.volume-value {
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 1.4rem;
    line-height: 1;
    text-align: center;
    text-justify: center;
}

.info-hint {
    color: rgb(211, 211, 211, 0.78);
    font-size: 0.85rem;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
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
    border-radius: 24px;
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
    margin-bottom: 4px;
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
    width: min(720px, 96%);
    height: 90px;
    display: flex;
    gap: 10px;
    justify-content: space-around;
    align-items: center;
    padding: 8px 12px;
    z-index: 3;

    background: rgba(0, 0, 0, 0.72);
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
    touch-action: manipulation;
    /* promote to its own layer on iOS */
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
    font-family: "Inter", Helvetica, Arial, sans-serif;
    font-weight: 600;
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
    background: linear-gradient(180deg, #4d4c51, #3a3b43);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 8px 0 #242222,
        0 10px 22px rgba(0, 0, 0, 0.45);
    border: none;
}

/* Pressed (active) */
.footer__yes:active,
.footer__no:active {
    transform: translate3d(0, 10px, 0);
    -webkit-transform: translate3d(0, 10px, 0);
    transform: translateY(10px);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 2px 0 rgba(0, 0, 0, 0.6);
    /* smaller rail when pressed */
}

/* pressed state (driven by JS) — use translate3d to ensure hardware accel */
.footer__yes.pressed,
.footer__no.pressed {
    transform: translate3d(0, 10px, 0);
    -webkit-transform: translate3d(0, 10px, 0);
    /* match your :active box-shadow but smaller */
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.06),
        0 2px 0 rgba(0, 0, 0, 0.6);
    transition: transform 120ms ease, box-shadow 120ms ease;
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

    .info-object-one,
    .info-object-two,
    .info-object-three,
    .card,
    .information,
    .comments {
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
        animation: none !important;
        transition: none !important;
    }

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
    border-radius: 48px;
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
