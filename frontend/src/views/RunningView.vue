<template>
    <!-- background video: always in DOM so it may begin fetching immediately -->
    <div class="bg-video-viewport" aria-hidden="true">
        <video ref="bgVideo" class="bg-portrait-video" :src="videoLink" autoplay muted loop playsinline preload="auto"
            @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata"></video>

        <!-- overlay positioned above the video (absolute inside the same container) -->
        <div class="loader-overlay" :class="{ 'loader-hidden': !isLoading }" aria-hidden="true">
            <LoaderPepe />
        </div>
    </div>

    <!-- SETTINGS MODAL & BLUR OVERLAY -->
    <GameModal :show="showInventoryModal" @close="closeInventory" />

    <NotEnoughMoneyModal :show="showNotEnoughMoneyModal" @close="closeNotEnoughMoney" />

    <!-- overlay monitor -->
    <div v-show="!isLoading" class="in-game-monitor" :class="{ 'is-visible': visible }" aria-hidden="false">
        <div class="ui-gift-wrapper" :class="{ 'is-revealed': imageReveal }"
            :style="{ '--reveal-ms': REVEAL_MS + 'ms' }">
            <img v-if="selectedGift" class="ui-gift image-inner" :src="selectedGift.src" :alt="selectedGift.id" />
            <img v-else class="ui-gift image-inner" :src="Gift_UI_Cookie" alt="gift" />
            <img v-show="isBoosted" class="ui-gift scope-target" :src="Scope_Target" alt="">
        </div>

        <!-- localized strings -->
        <span class="monitor-text chance" :class="{ 'is-visible': textVisible }">
            {{ displayedChance }}
        </span>
        <span class="monitor-text value" :class="{ 'is-visible': textVisible }">
            {{ displayedValue }}
        </span>
    </div>

    <!-- Chase character (appears centered on screen when a gift reveals) -->
    <div v-if="charVisible" class="chase-character" :style="containerStyle" @transitionend="onContainerTransitionEnd">
        <img :src="currentRunningSprite" alt="chase character" class="chase-img"
            :class="{ 'arrived': arrived, 'descending': descending, 'fade-out': fadeOut, 'boosted': isBoosted }" />
    </div>

    <div class="buttons-container">
        <!-- INVENTORY BUTTON -->
        <button v-if="!isLoading" class="inventory-button" :disabled="isBoosted" @click="openInventory"
            @mousedown="pressed = true" @mouseup="pressed = false" @mouseleave="pressed = false"
            @touchstart.passive="pressed = true" @touchend.passive="pressed = false"
            @touchcancel.passive="pressed = false" aria-label="Primary action">
            <img class="inventory-img" :src="BackpackIcon">
        </button>

        <!-- FAB -->
        <button v-if="!isLoading" class="action-button" :disabled="!fabEnabled" @click="boostVideo"
            @mousedown="pressed = true" @mouseup="pressed = false" @mouseleave="pressed = false"
            @touchstart.passive="pressed = true" @touchend.passive="pressed = false"
            @touchcancel.passive="pressed = false" aria-label="Primary action">
            <span class="action-label">{{ $t('boost') }}</span>
            <div class="price-container">
                <span>1</span>
                <img :src="TonIcon" class="ton-image-action">
            </div>
        </button>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/appStore'
import { useInventory } from '@/services/useInventory'
import { v4 as uuidv4 } from 'uuid'
import { useTelegram } from '@/services/telegram'
import supabase from '@/services/supabase'
import GameModal from '@/components/GameModal.vue'
import confetti from 'canvas-confetti'
import LoaderPepe from '@/components/LoaderPepe.vue'
import NotEnoughMoneyModal from '@/components/NotEnoughMoneyModal.vue'

import Gift_UI_Cookie from '@/assets/game/Cookie_Retro.png'
import Gift_UI_Snake from '@/assets/game/Snake_Retro.png'
import Gift_UI_Cat from '@/assets/game/Cat_Retro.png'
import Scope_Target from '@/assets/game/ScopeTarget.gif'

import Gift_Running_Cookie from '@/assets/game/Cookie_Black.png'
import Gift_Running_Snake from '@/assets/game/Snake_Black.png'
import Gift_Running_Cat from '@/assets/game/Cat_Black.png'

import Gift_Close_Cookie from '@/assets/game/Cookie_Close.png'
import Gift_Close_Snake from '@/assets/game/Snake_Close.png'
import Gift_Close_Cat from '@/assets/game/Cat_Close.png'

import BackpackIcon from '@/assets/icons/Backpack_Icon.png'
import TonIcon from '@/assets/icons/TON_White_Icon.png'

const app = useAppStore()
const { user } = useTelegram()
const { t } = useI18n()

const lastGameUuid = ref(null)

const { appendGift, logGameAttempt, updateGameAttemptType } = useInventory()
const showInventoryModal = ref(false)
const showNotEnoughMoneyModal = ref(false)

/* TIMINGS */
const REVEAL_MS = 600
const WRAPPER_FADE_MS = 420
const TEXT_FADE_MS = 320
const TEXT_DELAY_MS = 80
const FAB_ACTIVE_MS = 2300
const VISIBLE_FROM = 1
const VISIBLE_TO = 9.5
const EPS = 0.15
const CLEAR_SELECTED_DELAY = Math.max(REVEAL_MS, WRAPPER_FADE_MS, TEXT_FADE_MS) + 80

/* Character animation timings */
const ENTRY_MS = 600 // entry horizontal travel
const RAISE_MS = 500 // small raise to be 100px above
const DESCEND_MS = 1900 // when boosted, descend duration

/* video ref */
const videoLink = ref('https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/Gameplay_V3_Compressed.mp4')
const bgVideo = ref(null)

// keep references to handler so we can remove them
let _videoListeners = []
let _fallbackTimer = null

/* UI / state */
const isLoading = ref(true)
const visible = ref(false)
const imageReveal = ref(false)
const textVisible = ref(false)
const selectedGift = ref(null)
const lastCaught = ref(null)
const fabEnabled = ref(false)

/* runs */
const loopRun = ref(0)
const lastSeenTime = ref(0)
const lastShownRun = ref(-1)
const showInThisRun = ref(false)
const isBoosted = ref(false)

/* timers */
let textTimer = null
let fabTimer = null
let clearSelectedTimer = null
let charTimers = []

/* character state */
const charVisible = ref(false)
const charStartX = ref(0) // -100 or 100 initial
const charX = ref(0) // current horizontal offset in px
const charY = ref(0) // current vertical offset in px (relative to center)
const arrived = ref(false)
const descending = ref(false)
const fadeOut = ref(false)

// containerStyle drives the actual transform & opacity applied to .chase-character
// it must exist (the template reads it) and pick sensible transition durations
const containerStyle = computed(() => {
    const tx = `translate(-50%, -50%) translate(${charX.value}px, ${charY.value}px)`
    // choose transition duration per phase: entry (X) -> raise (Y) -> descent
    const duration = descending.value ? `${DESCEND_MS}ms` : (!arrived.value ? `${ENTRY_MS}ms` : `${RAISE_MS}ms`)
    return {
        transform: tx,
        transition: `transform ${duration} cubic-bezier(.2,.9,.32,1), opacity 420ms ease`,
        opacity: fadeOut.value ? '0' : '1'
    }
})

const charScheduled = ref(false)

/* map gifts -> running sprites */
const RUNNING_SPRITES = {
    cookie: Gift_Running_Cookie,
    snake: Gift_Running_Snake,
    cat: Gift_Running_Cat
}

// "close" sprites used only while boosted/descending
const CLOSE_SPRITES = {
    cookie: Gift_Close_Cookie,
    snake: Gift_Close_Snake,
    cat: Gift_Close_Cat
}

const currentRunningSprite = computed(() => {
    const id = selectedGift.value?.id

    // BOOSTED or descending -> use Close sprite
    if ((isBoosted.value || descending.value) && id) {
        return CLOSE_SPRITES[id] ?? Gift_Close_Cookie
    }

    // default -> running (black) sprite
    return RUNNING_SPRITES[id] ?? Gift_Running_Cookie
})

function cleanupVideoListeners() {
    const el = bgVideo.value
    if (el && _videoListeners.length) {
        for (const { ev, fn, opts } of _videoListeners) {
            el.removeEventListener(ev, fn, opts)
        }
    }
    _videoListeners = []
    if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null }
}

function openInventory() {
    showInventoryModal.value = true
}

function closeInventory() {
    showInventoryModal.value = false
}

function closeNotEnoughMoney() {
    showNotEnoughMoneyModal.value = false
}

// confetti helper
function runConfetti() {
    confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 },
    })
}

// function called after loader finishes transition (optional)
function onLoaderTransitionEnd(e) {
    // If you want to do something only once the overlay has fully faded out,
    // you can detect it here (optional). e.g. set a flag to hide pointer-events permanently.
    // const el = e.currentTarget
    // if (!isLoading.value) { /* overlay fully hidden */ }
}

onMounted(async () => {
    await nextTick()
    const el = bgVideo.value
    if (!el) {
        console.warn('bgVideo ref not found on mount; hiding loader as fallback.')
        // small graceful fallback
        isLoading.value = false
        return
    }

    // helper: reveal after paint so layout is stable
    const revealAfterPaint = async () => {
        if (!isLoading.value) return
        // yield to nextTick so DOM updates applied
        await nextTick()
        // wait two animation frames so browser lays out + paints the video
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        if (isLoading.value) {
            isLoading.value = false
        }
        cleanupVideoListeners()
    }

    // mark ready when condition met
    const markReady = () => {
        // only proceed if still loading
        if (!isLoading.value) return
        const ready = el.readyState >= 3 // HAVE_FUTURE_DATA or better
        if (ready) {
            // reveal only after paint (avoids visible resize)
            revealAfterPaint().catch(() => {
                isLoading.value = false
                cleanupVideoListeners()
            })
        }
    }

    // event handlers
    const onCanPlayThrough = markReady
    const onCanPlay = markReady
    const onLoadedData = markReady
    const onPlaying = markReady
    const onError = (ev) => {
        console.error('Video load error', ev)
        // if an error occurs, reveal the UI so the app isn't stuck (or show an error UI)
        // small delay so user sees loader briefly
        setTimeout(() => { isLoading.value = false }, 250)
        cleanupVideoListeners()
    }

    const add = (ev, fn, opts) => {
        el.addEventListener(ev, fn, opts)
        _videoListeners.push({ ev, fn, opts })
    }

    add('canplaythrough', onCanPlayThrough)
    add('canplay', onCanPlay)
    add('loadeddata', onLoadedData)
    add('playing', onPlaying)
    add('error', onError)

    // maybe already ready (cache)
    if (el.readyState >= 3) {
        markReady()
        return
    }

    // fallback: don't get stuck forever — after 15s reveal the UI
    _fallbackTimer = setTimeout(() => {
        if (isLoading.value) {
            console.warn('Video did not report ready events within timeout — hiding loader as fallback.')
            revealAfterPaint().catch(() => { isLoading.value = false })
        }
    }, 15000)
})

onUnmounted(() => {
    clearAllTimers()
    clearCharTimers()
    cleanupVideoListeners()
})

function clearAllTimers() {
    if (textTimer) { clearTimeout(textTimer); textTimer = null }
    if (fabTimer) { clearTimeout(fabTimer); fabTimer = null }
    if (clearSelectedTimer) { clearTimeout(clearSelectedTimer); clearSelectedTimer = null }
}
function clearCharTimers() {
    for (const t of charTimers) clearTimeout(t)
    charTimers = []
}

/* GIFTS */
const GIFTS = [
    { id: 'cookie', src: Gift_UI_Cookie, weight: 40, actualChance: 0.55, visibleChance: 30, valueLabel: '2.5 TON' },
    { id: 'snake', src: Gift_UI_Snake, weight: 40, actualChance: 0.52, visibleChance: 45, valueLabel: '1.5 TON' },
    { id: 'cat', src: Gift_UI_Cat, weight: 20, actualChance: 0.51, visibleChance: 6, valueLabel: '50 TON' },
]

async function boostVideo() {
    const el = bgVideo.value
    if (!el) return

    // create uuid for attempt
    const attemptUuid = uuidv4()
    lastGameUuid.value = attemptUuid

    // gift id at the moment of attempt (may be null)
    const giftId = selectedGift.value?.id ?? null

    // Try to optimistically record the game attempt row in game_history (fire-and-forget)
    // If you already call logGameAttempt elsewhere, keep as you prefer.
    logGameAttempt({ uuid: attemptUuid, gift_id: giftId })
        .catch(err => console.error('logGameAttempt failed', err))

    const telegramId = user?.id ?? 99
    try {
        const { data, error } = await supabase.rpc('deduct_point_or_flag_hacker', {
            p_uuid: attemptUuid,
            p_telegram: Number(telegramId)
        })

        if (error) {
            console.error('RPC error deduct_point_or_flag_hacker', error)
            // treat as failure: show modal and don't proceed with boost
            showNotEnoughMoneyModal.value = true
            return
        }

        // data typically comes back as JSON (jsonb) — Supabase returns it in data
        // depending on client it may be returned as an array or scalar; handle both.
        const res = Array.isArray(data) ? data[0] : data

        if (!res || res.status === 'hacker') {
            // server flagged hacker (not enough points or user not found)
            console.warn('Server flagged hacker or not enough points', res)
            // game_history row should already be updated to 'HACKER' by the RPC
            showNotEnoughMoneyModal.value = true
            return
        }

        if (res.status === 'deducted') {
            // Optionally sync client-side points to what server returned
            if (typeof res.points_remaining !== 'undefined' && res.points_remaining !== null) {
                // update your Pinia app store points to match authoritative server
                app.points = Number(res.points_remaining)
            }

            // Proceed with the boost (we have server-side deduction)
            isBoosted.value = true
            fabEnabled.value = false
            fabTimer = null

            // set speed x2
            el.playbackRate = 2.0

            // reset playback and boosted flag after DESCEND_MS - 200MS
            setTimeout(() => {
                if (el) el.playbackRate = 1.0
            }, DESCEND_MS - 200)

            setTimeout(() => {
                isBoosted.value = false
            }, DESCEND_MS);
        } else {
            // Unexpected response: be safe and block boost
            console.warn('Unexpected RPC response', res)
            showNotEnoughMoneyModal.value = true
            return
        }
    } catch (err) {
        console.error('Unexpected error calling deduct RPC', err)
        showNotEnoughMoneyModal.value = true
        return
    }
}

function pickWeightedGift() {
    const total = GIFTS.reduce((s, g) => s + g.weight, 0)
    let r = Math.random() * total
    for (const g of GIFTS) {
        if (r < g.weight) return g
        r -= g.weight
    }
    return GIFTS[0]
}

function decideForRun(runIndex) {
    if (runIndex === 0) return false
    if (lastShownRun.value === runIndex - 1) return false
    return Math.random() < 0.8
}

/* i18n helpers (unchanged) */
function tryTranslate(keys, params = {}) {
    if (!t || typeof t !== 'function') return null

    for (const key of keys) {
        try {
            const res = t(key, params)
            if (!res || typeof res !== 'string') continue
            const looksUninterpolated = /(\{\{?|\%\{)/.test(res)
            if (!looksUninterpolated) return res
        } catch (e) { }
    }
    return null
}

function formatChanceLabel(percent) {
    const keysToTry = ['chance']
    const translated = String(tryTranslate(keysToTry, { percent })) + ` ~${percent}%`
    if (translated) return translated

    if (app?.language === 'ru') return `Шанс ~${percent}%`
    return `Chance ~${percent}%`
}

function formatValueLabel(valueLabel) {
    const keysToTry = ['value']
    const translated = String(tryTranslate(keysToTry, { value: valueLabel })) + ` ~${valueLabel}`
    if (translated) return translated

    if (app?.language === 'ru') return `Значение ~${valueLabel}`
    return `Value ~${valueLabel}`
}

const displayedChance = computed(() => {
    if (selectedGift.value) return formatChanceLabel(selectedGift.value.visibleChance)
    return app?.language === 'ru' ? 'Шанс ~—' : 'Chance ~—'
})
const displayedValue = computed(() => {
    if (selectedGift.value) return formatValueLabel(selectedGift.value.valueLabel)
    return app?.language === 'ru' ? 'Значение ~—' : 'Value ~—'
})

/* reset on new source/seek */
function onLoadedMetadata() {
    loopRun.value = 0
    lastSeenTime.value = 0
    lastShownRun.value = -1
    showInThisRun.value = decideForRun(0)
    visible.value = false
    imageReveal.value = false
    textVisible.value = false
    selectedGift.value = null
    lastCaught.value = null
    fabEnabled.value = false
    clearAllTimers()
    // reset character schedule
    charScheduled.value = false
}

function onTimeUpdate() {
    const el = bgVideo.value
    if (!el) return
    const t = el.currentTime

    if (t + EPS < lastSeenTime.value) {
        loopRun.value += 1
        showInThisRun.value = decideForRun(loopRun.value)

        if (clearSelectedTimer) { clearTimeout(clearSelectedTimer); clearSelectedTimer = null }

        if (showInThisRun.value) {
            selectedGift.value = pickWeightedGift()
            lastCaught.value = Math.random() < (selectedGift.value?.actualChance ?? 0)
        } else {
            if (clearSelectedTimer) clearTimeout(clearSelectedTimer)
            clearSelectedTimer = setTimeout(() => {
                selectedGift.value = null
                lastCaught.value = null
                clearSelectedTimer = null
            }, CLEAR_SELECTED_DELAY)
        }

        visible.value = false
        imageReveal.value = false
        textVisible.value = false

        fabEnabled.value = false
        if (fabTimer) { clearTimeout(fabTimer); fabTimer = null }

        // reset any character scheduling for new loop
        charScheduled.value = false
    }

    lastSeenTime.value = t

    const shouldBeVisible = showInThisRun.value && t >= VISIBLE_FROM && t < VISIBLE_TO
    if (shouldBeVisible !== visible.value) visible.value = shouldBeVisible

    // spawn character 1s before the video ends (only if this run is showing)
    const dur = el.duration || 0
    if (dur > 0 && showInThisRun.value && !charVisible.value && !charScheduled.value && t >= 0.02) {
        // ensure selectedGift exists (or pick one fallback) so sprite matches monitor
        if (!selectedGift.value) selectedGift.value = pickWeightedGift()
        showCharacter()
    }
}

/* animations / show/hide sequences */
watch(visible, (val) => {
    if (val) {
        if (lastShownRun.value !== loopRun.value) lastShownRun.value = loopRun.value
        if (clearSelectedTimer) { clearTimeout(clearSelectedTimer); clearSelectedTimer = null }
        startShowSequence()
    } else {
        if (textTimer) { clearTimeout(textTimer); textTimer = null }
        textVisible.value = false
        imageReveal.value = false

        if (fabTimer) { clearTimeout(fabTimer); fabTimer = null }
        fabEnabled.value = false

        if (clearSelectedTimer) clearTimeout(clearSelectedTimer)
        clearSelectedTimer = setTimeout(() => {
            selectedGift.value = null
            lastCaught.value = null
            clearSelectedTimer = null
        }, CLEAR_SELECTED_DELAY)
    }
})

watch(textVisible, (val) => {
    if (val) {
        fabEnabled.value = true
        if (fabTimer) clearTimeout(fabTimer)
        fabTimer = setTimeout(() => {
            fabEnabled.value = false
            fabTimer = null
        }, FAB_ACTIVE_MS)
    } else {
        if (fabTimer) { clearTimeout(fabTimer); fabTimer = null }
        fabEnabled.value = false
    }
})

function startShowSequence() {
    textVisible.value = false
    imageReveal.value = true
    if (textTimer) clearTimeout(textTimer)
    textTimer = setTimeout(() => {
        textVisible.value = true
        textTimer = null
    }, REVEAL_MS + TEXT_DELAY_MS)
}

/* --- Character choreography --- */
watch(imageReveal, async (val) => {
    // removed: character no longer spawns simultaneously with reveal
    // kept watcher so imageReveal still controls other UI
    if (!val) {
        hideCharacter()
    }
})

watch(isBoosted, (val) => {
    // start descent when boosted AND character is visible
    if (val && charVisible.value) startDescent()
})

function showCharacter() {
    clearCharTimers()
    arrived.value = false
    descending.value = false
    fadeOut.value = false

    // mark scheduled so we don't spawn twice in same run
    charScheduled.value = true

    // pick random side
    const fromLeft = Math.random() < 0.5
    charStartX.value = fromLeft ? -100 : 100

    // set starting positions: start lower (40px below center), will raise by 40px to resting
    charX.value = charStartX.value
    charY.value = 120
    charVisible.value = true

    // horizontal entry -> center
    const t = setTimeout(() => {
        charX.value = 0
    }, 20)
    charTimers.push(t)

    // after horizontal entry completes, mark arrived and raise slightly (40px)
    const t2 = setTimeout(() => {
        arrived.value = true
        // raise by 80px (from 120 -> 40)
        charY.value = 40
    }, ENTRY_MS + 30)
    charTimers.push(t2)
}

function hideCharacter() {
    clearCharTimers()
    // fade out gracefully
    fadeOut.value = true
    // clear scheduled flag so next run can show again
    charScheduled.value = false
    // let CSS fade then remove
    const t = setTimeout(() => {
        charVisible.value = false
        arrived.value = false
        descending.value = false
        fadeOut.value = false
    }, 420)
    charTimers.push(t)
}

function startDescent() {
    // ensure idempotent: if already descending, skip (avoid double appends/timers)
    if (descending.value) return
    descending.value = true
    fadeOut.value = false

    // set transition to DESCEND_MS by simply set target charY
    // if character currently at 0, move to +150 (downwards)
    const targetY = 200
    const step = setTimeout(() => {
        charY.value = targetY
    }, 10)
    charTimers.push(step)

    const outcomeTimer = setTimeout(async () => {
        if (lastCaught.value) {
            showInventoryModal.value = true
            setTimeout(() => runConfetti(), 200)

            // Friendly display names for each gift id
            const DISPLAY_NAMES = {
                cookie: 'Ginger Cookie',
                cat: 'Scared Cat',
                snake: 'Pet Snake'
            }

            const id = selectedGift.value?.id ?? 'unknown'

            const item = {
                name: DISPLAY_NAMES[id] ?? (selectedGift.value?.name ?? id ?? 'Unknown'),
                type: id,
                value: selectedGift.value?.valueLabel ?? '—',
                created_at: new Date().toISOString()
            }

            try {
                // append via composable (atomic) – updates shared inventory locally too
                await appendGift(item)
            } catch (err) {
                console.error('appendGift error', err)
            }

            // update the game_history row -> Game_Success
            if (lastGameUuid.value) {
                try {
                    await updateGameAttemptType(lastGameUuid.value, 'Game_Success')
                } catch (err) {
                    console.error('updateGameAttemptType Game_Success error', err)
                }
                lastGameUuid.value = null
            }
        } else {
            // update the game_history row -> Game_Failed
            if (lastGameUuid.value) {
                try {
                    await updateGameAttemptType(lastGameUuid.value, 'Game_Failed')
                } catch (err) {
                    console.error('updateGameAttemptType Game_Failed error', err)
                }
                lastGameUuid.value = null
            }
        }

        // fade out and remove character
        fadeOut.value = true

        const cleanup = setTimeout(() => {
            charVisible.value = false
            arrived.value = false
            descending.value = false
            fadeOut.value = false
        }, 420)
        charTimers.push(cleanup)
    }, DESCEND_MS)
    charTimers.push(outcomeTimer)
}


function onContainerTransitionEnd(e) {
    // used to detect end of specific transform transitions if needed.
    // currently we use timers to sequence; keep it lightweight.
}
</script>

<style scoped>

.bg-video-viewport {
    position: fixed;
    /* keeps video fixed to viewport */
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    /* keeps your centering */
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    z-index: 0;
    /* video layer base */
}

/* video base */
.bg-portrait-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
    /* video underneath the overlay */
}

/* overlay when placed inside .bg-video-viewport */
.bg-video-viewport .loader-overlay {
    position: absolute;
    inset: 0;
    /* cover the whole container */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    /* above the video */
    background-color: #181818;
    transition: opacity 300ms ease, visibility 300ms;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
}

.bg-video-viewport .loader-overlay.loader-hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
}

/* small tweak: hide pointer-events on video while loading to prevent accidental taps */
.bg-video-viewport.loading video {
    pointer-events: none;
}

.buttons-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: fixed;
    left: 50%;
    bottom: calc(100px + 1vh);
    transform: translateX(-50%);
    min-width: 70%;
    height: 64px;
    user-select: none;
    z-index: 15;
}

.inventory-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 1 1;
    gap: 10px;
    width: 59px;
    height: 59px;
    border-radius: 16px;
    border: none;
    cursor: pointer;
    color: white;
    font-weight: 600;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial;
    -webkit-tap-highlight-color: transparent;
    box-sizing: border-box;
    background: linear-gradient(135deg, #404041 0%, #0c0c0c 100%);
    box-shadow: 0 10px 30px rgba(2, 54, 120, 0.28), 0 4px 10px rgba(3, 102, 214, 0.18);
    transition: transform 160ms cubic-bezier(.2, .9, .32, 1),
        box-shadow 220ms cubic-bezier(.2, .9, .32, 1),
        filter 220ms ease;
    outline: none;
}

.price-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 1rem;
}

.inventory-img {
    width: 24px;
    height: 20px;
}

.ton-image-action {
    width: 15px;
    height: 14px;
}

.in-game-monitor {
    position: fixed;
    top: 19vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 12;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
}

.ui-gift-wrapper {
    width: 160px;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 420ms cubic-bezier(.2, .9, .32, 1);
    will-change: opacity;
    pointer-events: none;
}

.in-game-monitor.is-visible .ui-gift-wrapper {
    opacity: 1;
}

.scope-target {
    position: absolute;
    width: 65%;
    height: auto;
    z-index: 20;
    opacity: 0.5;
}

.image-inner {
    position: relative;
    display: block;
    width: 65%;
    height: auto;
    -webkit-mask-image: linear-gradient(#000, #000);
    -webkit-mask-size: 100% 0%;
    -webkit-mask-position: bottom center;
    -webkit-mask-repeat: no-repeat;
    mask-image: linear-gradient(#000, #000);
    mask-size: 100% 0%;
    mask-position: bottom center;
    mask-repeat: no-repeat;
    transition:
        -webkit-mask-size var(--reveal-ms, 600ms) cubic-bezier(.2, .9, .32, 1),
        mask-size var(--reveal-ms, 600ms) cubic-bezier(.2, .9, .32, 1);
    will-change: mask-size, -webkit-mask-size;
}

.ui-gift-wrapper.is-revealed .image-inner {
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
}

@supports not (mask-size: 100% 100%) {
    .image-inner {
        clip-path: inset(0 0 100% 0);
        -webkit-clip-path: inset(0 0 100% 0);
        transition: clip-path var(--reveal-ms, 600ms) cubic-bezier(.2, .9, .32, 1);
    }

    .ui-gift-wrapper.is-revealed .image-inner {
        clip-path: inset(0 0 0 0);
        -webkit-clip-path: inset(0 0 0 0);
    }
}

.monitor-text {
    font-family: 'Press Start 2P', system-ui;
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 320ms cubic-bezier(.2, .9, .32, 1), transform 320ms cubic-bezier(.2, .9, .32, 1);
    pointer-events: none;
    text-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}

.monitor-text.is-visible {
    opacity: 1;
    transform: translateY(0);
}

.monitor-text.chance.is-visible {
    transition-delay: 0ms;
}

.monitor-text.value.is-visible {
    transition-delay: 80ms;
}

@media (prefers-reduced-motion: reduce) {

    .image-inner,
    .ui-gift-wrapper,
    .monitor-text {
        transition: none !important;
        -webkit-mask-size: 100% 100% !important;
        mask-size: 100% 100% !important;
        clip-path: none !important;
        opacity: 1 !important;
        transform: none !important;
    }
}

/* Chase character styles */
.chase-character {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 14;
    pointer-events: none;
    /* transform will be provided inline to allow JS-controlled travel */
    transition-property: transform, opacity;
    transition-timing-function: cubic-bezier(.2, .9, .32, 1);
    /* default durations (overridden inline by containerStyle when needed) */
    transition-duration: 700ms, 420ms;
    opacity: 1;
    will-change: transform, opacity;
}

.chase-character[style*="opacity: 0"] {
    pointer-events: none;
}

.chase-img {
    width: calc(25px + 5vh);
    height: auto;
    transform-origin: 50% 50%;
    will-change: transform, opacity;
    /* a subtle drop shadow */
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
    filter: blur(5px);
    /* Applies a 5-pixel Gaussian blur */
}

/* remove blur / make crisp when boosting */
.chase-img.boosted {
    /* override the blur filter used by default */
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
    /* remove gaussian blur */
    -webkit-filter: none;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45));
}


/* running bob: small up/down + slight scale to feel like running */
@keyframes runningBob {
    0% {
        transform: translateY(0) scale(1);
    }

    50% {
        transform: translateY(-8px) scale(0.995);
    }

    100% {
        transform: translateY(0) scale(1);
    }
}

.chase-img.arrived {
    animation: runningBob 600ms ease-in-out infinite;
}

/* when descending we still want the bob to continue — keep same animation but make it a bit faster */
.chase-img.descending {
    animation: runningBob 420ms ease-in-out infinite;
}

/* fade-out class to smoothly hide the character */
.chase-img.fade-out {
    opacity: 0;
    transition: opacity 420ms ease;
}

/* reduce-motion respects */
@media (prefers-reduced-motion: reduce) {

    .chase-img.arrived,
    .chase-img.descending {
        animation: none !important;
        transform: none !important;
    }
}

/* -------------------- Floating Action Button -------------------- */
.action-button {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 78px;
    min-height: 48px;
    border-radius: 20px;
    padding: 10px 30px;
    border: none;
    cursor: pointer;
    color: white;
    font-weight: 600;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial;
    -webkit-tap-highlight-color: transparent;
    box-sizing: border-box;
    background: linear-gradient(135deg, #3db3ff 0%, #0066d6 100%);
    box-shadow: 0 10px 30px rgba(2, 54, 120, 0.28), 0 4px 10px rgba(3, 102, 214, 0.18);
    transition: transform 160ms cubic-bezier(.2, .9, .32, 1),
        box-shadow 220ms cubic-bezier(.2, .9, .32, 1),
        filter 220ms ease;
    outline: none;
}

.inventory-button:disabled,
.action-button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    filter: grayscale(0.12);
    pointer-events: none;
}

@keyframes fabGlow {
    0% {
        box-shadow: 0 8px 22px rgba(3, 102, 214, 0.18), 0 4px 10px rgba(3, 102, 214, 0.12);
    }

    50% {
        box-shadow: 0 14px 40px rgba(3, 102, 214, 0.22), 0 6px 18px rgba(3, 102, 214, 0.14);
    }

    100% {
        box-shadow: 0 8px 22px rgba(3, 102, 214, 0.18), 0 4px 10px rgba(3, 102, 214, 0.12);
    }
}

.action-button:focus-visible {
    box-shadow: 0 10px 30px rgba(2, 54, 120, 0.28), 0 0 0 6px rgba(3, 102, 214, 0.12);
}

.action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: white;
    flex-shrink: 0;
}

.action-icon svg {
    display: block;
    color: white;
}

.action-label {
    font-size: 0.95rem;
    line-height: 1;
    color: white;
}

@media (max-width: 420px) {
    .action-button {
        padding: 12px 16px;
        height: 58px;
        gap: 8px;
        font-size: 0.95rem;
    }

    .action-icon {
        width: 28px;
        height: 28px;
    }
}

@media (prefers-reduced-motion: reduce) {

    .action-button,
    .action-button::before {
        animation: none !important;
        transition: none !important;
    }
}
</style>
