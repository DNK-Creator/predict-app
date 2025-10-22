<template>
    <div class="create-root" ref="root" role="region" aria-label="Create event">
        <div class="create-container">
            <!-- Type selector (Prediction / Deal) -->
            <div class="card type-card" role="tablist" aria-label="Event type">
                <div class="type-buttons">
                    <button :class="['type-btn', { active: eventType === 'prediction' }]" @click="openHistoryCreated"
                        role="tab" :aria-selected="eventType === 'prediction'">
                        <img class="history-icon" :src="PastIcon">
                        {{ $t('created-events-history') }}
                    </button>
                </div>
            </div>

            <div class="card form-card">
                <label class="input-label" for="ev-name">{{ $t('event-name') }}</label>
                <textarea id="ev-name" ref="nameEl" v-model="form.name" class="text-input name-input" :maxlength="100"
                    :placeholder="$t('title-placeholder')" @input="autoSizeTextarea($event)" @focus="onNameFocus"
                    @blur="onNameBlur" rows="1" aria-describedby="name-help"></textarea>
                <div id="name-help" class="muted-hint">
                    {{ form.name.length }} / 100
                </div>

                <label class="input-label" for="ev-desc">{{ $t('description-condition') }}</label>
                <textarea id="ev-desc-condition" ref="descConditionEl" v-model="form.descriptionCondition"
                    class="text-input desc-input" :maxlength="250" :placeholder="$t('describe-event-condition')"
                    @input="autoSizeTextarea($event)" @focus="onDescriptionFocus" @blur="onDescriptionBlur" rows="3"
                    aria-describedby="desc-hint"></textarea>

                <label class="input-label" for="ev-desc">{{ $t('description-period') }}</label>
                <textarea id="ev-desc-period" ref="descPeriodEl" v-model="form.descriptionPeriod"
                    class="text-input desc-input" :maxlength="250" :placeholder="$t('describe-event-period')"
                    @input="autoSizeTextarea($event)" @focus="onDescriptionFocus" @blur="onDescriptionBlur" rows="3"
                    aria-describedby="desc-hint"></textarea>

                <label class="input-label" for="ev-desc">{{ $t('description-context') }}</label>
                <textarea id="ev-desc-context" ref="descContextEl" v-model="form.descriptionContext"
                    class="text-input desc-input" :maxlength="250" :placeholder="$t('describe-event-context')"
                    @input="autoSizeTextarea($event)" @focus="onDescriptionFocus" @blur="onDescriptionBlur" rows="3"
                    aria-describedby="desc-hint"></textarea>

                <div class="input-label"> {{ $t('you-are-giving') }}: {{ totalBetText }} </div>

                <div class="row amount-row" role="group" aria-label="Amount">
                    <input ref="amountInput" id="amount" v-model="amount" @input="onAmountInput" @focus="onAmountFocus"
                        @blur="onAmountBlur" class="amount-input" type="text" inputmode="decimal" autocomplete="off"
                        pattern="^\\d*(\\.\\d{0,2})?$" placeholder="1.00" aria-describedby="amount-help" />
                    <img class="amount-icon" :src="TonIcon">
                </div>

                <!-- Virtualized rows -->
                <div v-if="source.length > 0" class="gifts-list" v-bind="containerProps" role="list" tabindex="0" aria-live="polite">
                    <div class="gifts-wrapper" v-bind="wrapperProps">
                        <!-- each virtual item is a row (data === array of up to COLUMNS gifts) -->
                        <div v-for="{ index, data: row } in list" :key="index" class="gift-row"
                            :style="{ height: rowHeight + 'px' }" role="listitem">
                            <!-- Render up to COLUMNS items per row; fill blanks if last row isn't full -->
                            <div v-for="(item, colIdx) in row" :key="item?.uuid ?? `${index}-${colIdx}`"
                                :class="['gift-card', { selected: isSelected(item?.uuid) }]"
                                @click="toggleSelect(item)">
                                <div class="gift-image-wrap">
                                    <img :src="createGiftUrl(item)" draggable="false" loading="lazy" />
                                </div>

                                <div class="select-gift-button">
                                    <img class="select-icon" :src="plusImg" draggable="false" alt="SELECT" />
                                </div>

                                <div class="gift-below-img">
                                    <div class="gift-meta">
                                        <span v-if="item?.name.length < 12" class="gift-name">{{ item?.name }}</span>
                                        <span v-else class="gift-name-small">{{ item?.name }}</span>
                                        <div class="price-container">
                                            <img class="price-icon" :src="tonBlueIcon" alt="TON_ICON" loading="lazy" />
                                            <span class="gift-count">{{ item?.value }} TON</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TYPE-SPECIFIC BLOCKS -->
                <div v-if="eventType === 'prediction' && showPickingSides" class="prediction-block">
                    <label class="input-label">{{ $t('choose-side') }}</label>
                    <div class="yesno-wrap" role="group" aria-label="Choose yes or no">
                        <button :class="['yesno-btn', { active: form.predictionSide === 'yes' }]"
                            @click="form.predictionSide = 'yes'">
                            {{ $t('yes') }}
                        </button>
                        <button :class="['yesno-btn', { active: form.predictionSide === 'no' }]"
                            @click="form.predictionSide = 'no'">
                            {{ $t('no') }}
                        </button>
                    </div>
                </div>
            </div>
            <!-- Half-visible policy hint above the forms -->
            <div class="hint-clip" aria-hidden="false">
                <div class="hint-text">
                    {{ $t('create-hint-policy') }}
                </div>
            </div>
            <!-- footer with CREATE button -->
            <div class="footer-create">
                <button class="footer-create__yes create-btn" @click="onCreate" :disabled="isCreating">
                    {{ $t('create-for') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, onActivated, nextTick } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { useTelegram } from '@/services/telegram'
import { useVirtualList } from '@vueuse/core'
import { requestCreateBet } from '@/services/bets-requests'
import supabase from '@/services/supabase'
import TonIcon from '@/assets/icons/TON_White_Icon.png'
import PastIcon from '@/assets/icons/Past_Icon.png'
import tonBlueIcon from '@/assets/icons/TON_Icon.png'
import plusImg from '@/assets/icons/Transparent_Plus_Icon.png'

const app = useAppStore()
const { user } = useTelegram()

const router = useRouter()

const root = ref(null)
const nameEl = ref(null)
const descConditionEl = ref(null)
const descPeriodEl = ref(null)
const descContextEl = ref(null)

const isCreating = ref(false)

const eventType = ref('prediction') // 'prediction' | 'deal'
const showPickingSides = ref(true)

/* ---------- GRID / VIRTUAL CONFIG ---------- */
const COLUMNS = 3
const CARD_HEIGHT = 160
const ROW_GAP = 18
const rowHeight = CARD_HEIGHT + ROW_GAP

const selectedOrder = ref([])
const selectedGifts = ref([])
const selectedGift = ref(null)
const isSelected = (id) => selectedOrder.value.indexOf(id) !== -1

const displayedGifts = ref([])

// ——— Load gifts from Supabase ———
async function loadGifts() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('inventory')
            .eq('telegram', user?.id ?? 99)
            .single()

        if (error) {
            console.error('Error loading gifts:', error)
            displayedGifts.value = []
            return
        }

        displayedGifts.value = data.inventory
    } catch (err) {
        console.error('Unexpected error in loadGifts:', err)
        displayedGifts.value = []
    }
}

const totalBettingValue = computed(() => {
    const amt = Number(String((amount.value ?? '0')).replace(',', '.')) || 0
    const giftsSum = selectedGifts.value.reduce((acc, g) => {
        const vRaw = g?.value ?? g?.price ?? 0
        const vNum = Number(String(vRaw).replace(',', '.')) || 0
        return acc + vNum
    }, 0)
    return Math.max(0, amt + giftsSum)
})

// Nicely format TON numbers (integers as ints, otherwise up to 2 decimals)
function formatTonValue(n) {
    if (!isFinite(n)) return '0'
    const num = Number(n)
    if (Math.abs(Math.round(num) - num) < 1e-9) return String(Math.round(num))
    return Number(num.toFixed(2)).toString()
}

const totalBetText = computed(() => {
    const tonAmount = Number(String((amount.value ?? '0')).replace(',', '.')) || 0

    const giftParts = selectedGifts.value.map(g => {
        const name = (g?.name ?? 'Gift').toString()
        const number = g?.number ?? (g?.id ?? '')
        return `${name} #${number}`
    })

    const infoParts = []
    if (tonAmount > 0) {
        infoParts.push(`${formatTonValue(tonAmount)} TON`)
        if (giftParts.length) infoParts.push(...giftParts)
    } else {
        if (giftParts.length) infoParts.push(...giftParts)
        else infoParts.push(`0 TON`)
    }

    if (giftParts.length) {
        const total = totalBettingValue.value
        const lang = (typeof app !== 'undefined' && app?.language) ? app.language : 'en'
        const suffix = lang === 'ru'
            ? `- на сумму ${formatTonValue(total)} TON.`
            : `- amounting to ${formatTonValue(total)} TON.`

        return `${infoParts.join(', ')} ${suffix}`
    }
    return tonAmount > 0 ? `${infoParts.join(', ')}` : ''
})

function toggleSelect(giftObj) {
    if (!giftObj.uuid) return
    const idx = selectedOrder.value.indexOf(giftObj.uuid)
    if (idx >= 0) {
        selectedOrder.value.splice(idx, 1)
        selectedGifts.value.splice(idx, 1)
    } else {
        if (selectedOrder.value.length >= 10) {
            maxGiftsWarnShow.value = true
            setTimeout(() => {
                maxGiftsWarnShow.value = false
            }, 2000);
            return
        }
        selectedOrder.value.push(giftObj.uuid)
        selectedGifts.value.push(giftObj)
    }
}

function createGiftUrl(giftObj) {
    if (giftObj.slug) {
        return `https://nft.fragment.com/gift/${giftObj.slug}.small.jpg`
    }
    const urlSafeName = String(giftObj.name.replace(/[ -]/g, '')).toLowerCase()
    const newSlug = urlSafeName + "-" + (giftObj.num ?? giftObj.number)
    return `https://nft.fragment.com/gift/${newSlug}.small.jpg`
}

onMounted(async () => {
    await loadGifts()
})

/* group gifts into rows of 3 */
const source = computed(() => {
    const arr = displayedGifts.value || []
    const rows = []
    for (let i = 0; i < arr.length; i += COLUMNS) {
        rows.push(arr.slice(i, i + COLUMNS))
    }
    return rows
})

/* virtualize by rows (each item is a row) */
const { list, containerProps, wrapperProps } = useVirtualList(source, {
    itemHeight: rowHeight,
    overscan: 1, // render a few rows above/below for smoother scrolling
})

/* ---------- UI state ---------- */

// simple form model
const form = reactive({
    name: '',
    descriptionCondition: '',
    descriptionPeriod: '',
    descriptionContext: '',
    predictionSide: 'yes'
})

form.otherPaymentDisplay = ''

function openHistoryCreated() {
    router.push({ name: 'created-history' })
}

// autosize textareas
function autoSizeTextarea(e) {
    const el = e.target
    el.style.height = 'auto'
    const newH = Math.max(48, Math.min(600, el.scrollHeight))
    el.style.height = newH + 'px'
}

const lastInputtedNumber = ref('')
const amount = ref('1.00')
const amountInput = ref(null)

const AMOUNT_MIN = 0
const AMOUNT_MAX = 99999

function clampNumber(n, min, max) {
    if (Number.isNaN(n)) return min
    return Math.max(min, Math.min(max, n))
}

function sanitizeAndLimitDecimals(raw) {
    // replace commas, keep only digits and dot, prevent multiple dots
    let v = String(raw || '').replace(/,/g, '.').replace(/[^\d.]/g, '')
    v = v.replace(/^0+(\d)/, '$1') // reduce leading zeros but keep "0" alone if typed
    v = v.replace(/(\..*)\./g, '$1') // only one dot
    if (v.includes('.')) {
        const [i, d] = v.split('.')
        v = i + '.' + (d || '').slice(0, 2)
    }
    return v
}

function onAmountInput(e) {
    let v = sanitizeAndLimitDecimals(e.target.value)

    // If empty or just '.' allow user to continue typing but show minimum internally when determining state
    if (v === '' || v === '.') {
        // don't overwrite while typing; just reflect the partial input
        amount.value = v === '.' ? '0.' : ''
        lastInputtedNumber.value = amount.value
        return
    }

    // parse numeric value
    const num = parseFloat(v)
    if (Number.isFinite(num)) {
        // clamp to allowed range immediately so user can't put <1 or >99999
        const clamped = clampNumber(num, AMOUNT_MIN, AMOUNT_MAX)

        // If the parsed numeric differs (i.e. user typed 0.5 -> we clamp to 1),
        // reflect clamped value. Keep up to 2 decimals if user entered decimals.
        // If user typed an integer, keep integer display; we'll format to 2 decimals on blur.
        const hasDecimal = v.includes('.')
        if (num !== clamped) {
            // clamp happened
            v = hasDecimal ? String(clamped.toFixed(2)) : String(clamped)
        } else {
            // keep the user's decimal precision (max 2 decimals from sanitizer)
            v = String(v)
        }

    } else {
        // non-numeric fallback to minimum
        v = String(AMOUNT_MIN)
    }

    // prevent values longer than required (avoid weird huge strings)
    if (v.length > 12) v = v.slice(0, 12)

    amount.value = v
    lastInputtedNumber.value = v
}

const vvState = { listener: null }

function onAmountFocus() {
    document.body.classList.add('keyboard-open')

    // prefer immediate (no-smooth) scrollIntoView to avoid jitter when vp changes
    setTimeout(() => {
        try { amountInput.value?.scrollIntoView({ behavior: 'auto', block: 'nearest' }) } catch (_) { }
    }, 80)

    if (window.visualViewport) {
        let raf = 0
        const update = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const kv = window.visualViewport
                const keyboardHeight = Math.max(0, window.innerHeight - kv.height)
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
            })
        }
        vvState.listener = update
        window.visualViewport.addEventListener('resize', update, { passive: true })
        update()
    }
}

function onAmountBlur() {
    setTimeout(() => {
        if (document.activeElement !== amountInput.value && document.activeElement !== descConditionEl.value
            && document.activeElement !== descPeriodEl.value && document.activeElement !== descContextEl.value &&
            document.activeElement !== nameEl.value) {

            document.body.classList.remove('keyboard-open')
            if (window.visualViewport && vvState.listener) {
                window.visualViewport.removeEventListener('resize', vvState.listener)
                vvState.listener = null
                document.documentElement.style.removeProperty('--keyboard-height')
            }

        }
    }, 100);
}

function onNameFocus() {
    document.body.classList.add('keyboard-open')

    // prefer immediate (no-smooth) scrollIntoView to avoid jitter when vp changes
    setTimeout(() => {
        try { nameEl.value?.scrollIntoView({ behavior: 'auto', block: 'nearest' }) } catch (_) { }
    }, 80)

    if (window.visualViewport) {
        let raf = 0
        const update = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const kv = window.visualViewport
                const keyboardHeight = Math.max(0, window.innerHeight - kv.height)
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
            })
        }
        vvState.listener = update
        window.visualViewport.addEventListener('resize', update, { passive: true })
        update()
    }
}

function onNameBlur() {
    setTimeout(() => {
        if (document.activeElement !== amountInput.value && document.activeElement !== descConditionEl.value
            && document.activeElement !== descPeriodEl.value && document.activeElement !== descContextEl.value &&
            document.activeElement !== nameEl.value) {

            document.body.classList.remove('keyboard-open')
            if (window.visualViewport && vvState.listener) {
                window.visualViewport.removeEventListener('resize', vvState.listener)
                vvState.listener = null
                document.documentElement.style.removeProperty('--keyboard-height')
            }

        }
    }, 100);
}

function onDescriptionFocus(descriptionElement) {
    document.body.classList.add('keyboard-open')

    // prefer immediate (no-smooth) scrollIntoView to avoid jitter when vp changes
    setTimeout(() => {
        try { descriptionElement.value?.scrollIntoView({ behavior: 'auto', block: 'nearest' }) } catch (_) { }
    }, 80)

    if (window.visualViewport) {
        let raf = 0
        const update = () => {
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const kv = window.visualViewport
                const keyboardHeight = Math.max(0, window.innerHeight - kv.height)
                document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
            })
        }
        vvState.listener = update
        window.visualViewport.addEventListener('resize', update, { passive: true })
        update()
    }
}

function onDescriptionBlur() {
    setTimeout(() => {
        if (document.activeElement !== amountInput.value && document.activeElement !== descConditionEl.value
            && document.activeElement !== descPeriodEl.value && document.activeElement !== descContextEl.value
            && document.activeElement !== nameEl.value) {

            document.body.classList.remove('keyboard-open')
            if (window.visualViewport && vvState.listener) {
                window.visualViewport.removeEventListener('resize', vvState.listener)
                vvState.listener = null
                document.documentElement.style.removeProperty('--keyboard-height')
            }

        }
    }, 100);
}

function _labelPointerCaptureHandler(ev) {
    // find label (in case inner node was tapped)
    const label = ev.target?.closest?.('label.input-label')
    if (!label) return

    // Must be able to prevent default on touch events: listener registered with passive:false
    ev.preventDefault?.()
    ev.stopImmediatePropagation?.()

    // blur whatever is currently focused (if interactive)
    const active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        try { active.blur() } catch (e) { /* ignore */ }
    }

    // close nav/popovers to match your other logic
    window.dispatchEvent(new CustomEvent('app-close-nav'))
}


// other payment input
function onOtherPaymentInput(e) {
    const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
    const parts = v.split('.')
    let cleaned = parts.shift() || ''
    if (parts.length) cleaned += '.' + parts.join('').slice(0, 2)
    form.otherPaymentDisplay = cleaned
    form.otherPayment = cleaned === '' ? 0 : parseFloat(cleaned)
}

function setType(tpe) {
    if (eventType.value === tpe) return
    eventType.value = tpe
    nextTick(() => root.value?.scrollTo({ top: 0, behavior: 'auto' }))
}

function addTemporaryOutline(el, duration = 2800) {
    if (!el) return
    el.classList.add('input-error')
    el.setAttribute('aria-invalid', 'true')
    // store timeout id so multiple calls don't create overlapping timeouts
    if (el._outlineTimeout) clearTimeout(el._outlineTimeout)
    el._outlineTimeout = setTimeout(() => {
        el.classList.remove('input-error')
        el.removeAttribute('aria-invalid')
        delete el._outlineTimeout
    }, duration)
}

async function onCreate() {
    // Ensure amount is normalized to number and in range
    let stakeNum = parseFloat(String(amount.value).replace(',', '.'))
    if (!Number.isFinite(stakeNum)) stakeNum = 0
    stakeNum = clampNumber(stakeNum, AMOUNT_MIN, AMOUNT_MAX)

    // Check totalBettingValue (amount + gifts) must be > 1 TON
    const total = totalBettingValue.value
    if (!(total >= 1)) {
        const msg = app.language === 'ru'
            ? 'Общая ставка с подарками должна быть больше 1 TON.'
            : 'Total stake with gifts must be more than 1 TON.'
        toast.warn(msg)
        // highlight amount input so user notices where to fix (could also highlight gift area)
        addTemporaryOutline(amountInput.value)
        return
    }

    // ensure creator can pay creation fee + stake
    const rawTotalCreationPrice = stakeNum
    const totalCreationPrice = Math.round(rawTotalCreationPrice * 100) / 100
    if (app.points < totalCreationPrice) {
        let messageText = app.language === 'ru' ? 'Недостаточно средств для создания события.' : 'Not enough funds to create an event.'
        toast.error(messageText)
        return
    }

    const nameTrimmed = String(form.name || '').trim()
    const descConditionTrimmed = String(form.descriptionCondition || '').trim()
    const descPeriodTrimmed = String(form.descriptionPeriod || '').trim()
    const descContextTrimmed = String(form.descriptionContext || '').trim()

    const nameLen = nameTrimmed.length
    const descConditionLen = descConditionTrimmed.length
    const descPeriodLen = descPeriodTrimmed.length

    const MAX_NAME = 100
    const MAX_DESC = 250

    const invalidEls = []

    if (nameLen === 0 || nameLen > MAX_NAME) {
        invalidEls.push({ el: nameEl.value, reason: nameLen === 0 ? 'empty' : 'toolong' })
    }
    if (descConditionLen === 0 || descConditionLen > MAX_DESC) {
        invalidEls.push({ el: descConditionEl.value, reason: descConditionLen === 0 ? 'empty' : 'toolong' })
    }
    if (descPeriodLen === 0 || descPeriodLen > MAX_DESC) {
        invalidEls.push({ el: descPeriodEl.value, reason: descPeriodLen === 0 ? 'empty' : 'toolong' })
    }

    if (invalidEls.length > 0) {
        invalidEls.forEach(i => addTemporaryOutline(i.el))

        const toastMsg = app.language === 'ru' ? 'Заполните необходимую информацию' : 'Fill out the necessary information'
        toast.error(toastMsg)

        return
    }

    const payload = {
        name: nameTrimmed,
        descriptionCondition: descConditionTrimmed,
        descriptionPeriod: descPeriodTrimmed,
        descriptionContext: descContextTrimmed,
        stake: Number.isFinite(Number(amount.value)) ? Number(amount.value) : 0,
        side: form.predictionSide,
        gifts_bet: selectedGifts.value
    }

    isCreating.value = true

    try {
        const resp = await requestCreateBet(payload, { timeoutMs: 12000 })

        if (resp.ok) {
            toast.success(app.language === 'ru' ? 'Событие отправлено на модерацию' : 'Event submitted for moderation')
            if (resp.data?.user?.points !== undefined) {
                app.points = Number(resp.data.user.points).toFixed(2);
            }

            openHistoryCreated()

            return
        }

        // Not ok -> determine message to show
        let message
        if (resp.error === 'validation_error' || resp.status === 400) {
            message = app.language === 'ru' ? 'Проверьте данные и попробуйте снова' : 'Please check the input and try again'
        } else if (resp.error === 'insufficient_funds') {
            message = app.language === 'ru' ? 'Недостаточно средств для создания события' : 'Not enough points to create the event'
        } else if (resp.error === 'telegram_error') {
            message = app.language === 'ru' ? 'Не удалось уведомить команду поддержки, но событие создано' : 'Event created but notification to support failed'
            toast.success(message)
            return
        } else if (resp.error === 'timeout') {
            message = app.language === 'ru' ? 'Сервер не отвечает, попробуйте позже' : 'Server timed out, try again later'
        } else if (resp.error === 'network_error') {
            message = app.language === 'ru' ? 'Сетевая ошибка, проверьте соединение' : 'Network error — check your connection'
        } else {
            message = resp.message || (app.language === 'ru' ? 'Ошибка на сервере' : 'Server error')
        }

        toast.error(message)

    } catch (e) {
        console.error('onCreate unexpected error', e)
        toast.error(app.language === 'ru' ? 'Неожиданная ошибка' : 'Unexpected error')
    } finally {
        isCreating.value = false
    }
}

onMounted(() => {
    // ensure initial autosize
    if (nameEl.value) nextTick(() => { if (nameEl.value) nameEl.value.style.height = 'auto' })
})
</script>

<style scoped>
/* Root: vertical scroll only if content exceeds viewport */
.create-root {
    width: 100%;
    overflow: visible;
    color: #fff;
    box-sizing: border-box;
}

/* container centers content and keeps consistent paddings like your other components */
.create-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 8px;
    padding-bottom: 8px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
}

/* header */
.header-two {
    display: flex;
    min-height: 4rem;
    align-items: center;
    justify-content: center;
    text-align: center;
    user-select: none;
}

.header__text {
    font-size: 1.15rem;
    color: #F7F9FB;
    font-weight: 700;
    font-family: "Inter", sans-serif;
}

/* card base (frosted glass like your bet-details) */
.card {
    width: 95%;
    background: rgba(49, 49, 49, 0.92);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.04);
    -webkit-backdrop-filter: blur(8px) saturate(120%);
    backdrop-filter: blur(8px) saturate(120%);
    box-sizing: border-box;
}

/* Type selector */
.type-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    width: 100%;
}

.type-btn {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 120px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    color: #ddd;
    cursor: pointer;
    font-weight: 700;
    font-family: "Inter", sans-serif;
    transition: background 0.15s, color 0.15s, transform 160ms ease, box-shadow 160ms ease;
}

.type-btn.active {
    background: #3b82f6;
    color: #fff;
    border-color: transparent;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.18);
}

.history-icon {
    width: 16px;
    height: 16px;
}

/* small half-visible policy hint: clip so only top half visible */
.hint-clip {
    width: 95%;
    overflow: hidden;
    text-justify: start;
    height: 60px;
    margin-top: 4px;
    margin-bottom: 4px;
    position: relative;
    user-select: none;
}

.hint-text {
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    text-align: center;
}

/* form inputs */
.input-label-and,
.input-label {
    font-family: "Inter", sans-serif;
    font-weight: 700;
    color: #F7F9FB;
    margin-top: 16px;
    margin-bottom: 8px;
    width: 94%;
    display: block;
    font-size: 0.9rem;
    user-select: none;
}

.input-label-and {
    margin-bottom: 16px;
}

.input-label.small {
    font-size: 0.85rem;
    font-weight: 600;
}

.muted-hint {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.82rem;
    margin-top: 12px;
    margin-bottom: 6px;
    user-select: none;
}

/* shared text-input + autosize textarea look */
.text-input {
    width: 95%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 10px;
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.04);
    color: #fff;
    font-family: "Inter", sans-serif;
    resize: none;
    overflow-y: auto;
    overflow-x: hidden;
    -ms-overflow-style: none;
    scrollbar-width: none;
    min-height: 2.5rem;
    line-height: 1.3;
}

.text-input:focus {
    outline: none;
    border: 1px solid #4d4d4d;
}

.text-input::-webkit-scrollbar {
    width: 0;
    height: 0;
    /* Remove scrollbar space */
    background: transparent;
    /* Optional: just make scrollbar invisible */
}

/* name special */
.name-input {
    min-height: 3.5rem;
    max-height: 280px;
}

/* description bigger by default */
.desc-input {
    min-height: 4rem;
    max-height: 420px;
}

/* small helper */
.type-hint {
    margin-top: 6px;
    margin-bottom: 8px;
}

/* amount row: left aligned, 30% width input */
.amount-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 95%;
    margin-top: 6px;
    margin-bottom: 12px;
}

.amount-icon {
    width: 16px;
    height: 16px;
    -webkit-user-drag: none;
    user-select: none;
    -moz-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
}

.amount-input {
    width: 30%;
    min-width: 110px;
    padding: 10px 12px;
    box-sizing: border-box;
    border-radius: 10px;
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.04);
    color: #fff;
    font-weight: 700;
    font-family: "Inter", sans-serif;
}

.amount-input:focus {
    outline: none;
    border: 1px solid #4d4d4d;
}

/* Inventory container: shows 2 rows (each row height calculated), 3 columns, scrollable */
.inventory-container {
    width: 95%;
    height: calc((80px * 2) + 12px);
    /* show 2 rows of ~80px + gaps */
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 80px;
    gap: 8px;
    overflow-y: auto;
    padding: 6px;
    box-sizing: border-box;
    margin-bottom: 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.03);
    background: rgba(0, 0, 0, 0.18);
}


/* ---- WebKit (Chrome, Safari) ---- */
.inventory-container::-webkit-scrollbar {
    width: 8px;
    /* thin */
    background: transparent;
}

.inventory-container::-webkit-scrollbar-track {
    background: transparent;
    /* invisible track for a seamless look */
}

.inventory-container::-webkit-scrollbar-thumb {
    background: rgba(45, 131, 236, 0.12);
    /* subtle bluish thumb */
    border-radius: 999px;
    border: 2px solid transparent;
    /* gives padding so thumb looks inset */
    background-clip: padding-box;
    transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    box-shadow: none;
}

/* stronger visibility on hover (discoverability) */
.inventory-container:hover::-webkit-scrollbar-thumb {
    background: rgba(45, 131, 236, 0.28);
    box-shadow: 0 6px 18px rgba(45, 131, 236, 0.12);
}

/* small active feedback */
.inventory-container::-webkit-scrollbar-thumb:active {
    transform: translateX(-1px);
}

/* ---- Firefox ---- */
.inventory-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(45, 131, 236, 0.12) transparent;
}

/* ---- Half-visible overlay (peeks out from the right edge) ----
     This pseudo element visually dims the right edge so the scrollbar appears half-hidden.
     Note: for it to show outside the container the parent must allow overflow: visible.
*/
.inventory-container::after {
    content: "";
    position: absolute;
    top: 0;
    right: -10px;
    /* push half outside (adjust if parent clips) */
    width: 20px;
    /* visible overlay width (half will overlap) */
    height: 100%;
    pointer-events: none;
    border-radius: 0 10px 10px 0;
    background: linear-gradient(to right,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.06) 40%,
            rgba(0, 0, 0, 0.12) 100%);
    transition: opacity 180ms ease;
    opacity: 0.95;
    mix-blend-mode: normal;
    z-index: 4;
    /* sits above the scroll thumb visually */
}

/* make the overlay slightly less visible on hover so the thumb is easier to see */
.inventory-container:hover::after {
    opacity: 0.6;
}

/* inventory cell */
.inv-cell {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.03);
    transition: transform 180ms cubic-bezier(.2, .9, .3, 1), box-shadow 180ms ease, border-color 180ms ease;
    cursor: pointer;
    user-select: none;
    padding: 6px;
    box-sizing: border-box;
}

.inv-cell:focus {
    outline: none;
    box-shadow: 0 6px 18px rgba(59, 130, 246, 0.12);
}

.inv-placeholder {
    width: 56px;
    height: 42px;
    border-radius: 6px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01));
    border: 1px solid rgba(255, 255, 255, 0.04);
    margin-bottom: 8px;
}

.inv-label {
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.9);
}

/* selected state: scale + blue outline glow */
.inv-cell.selected {
    transform: scale(1.06);
    border-color: #2D83EC;
    box-shadow: 0 8px 28px rgba(45, 131, 236, 0.18), 0 0 18px rgba(45, 131, 236, 0.18);
}

.yesno-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 8px;
    margin-top: 16px;
}

.yesno-btn {
    flex: 1 1 0;
    padding: 10px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    color: #ddd;
    font-weight: 700;
    cursor: pointer;
    transition: transform 120ms ease, background 120ms ease;
}

.yesno-btn.active {
    background: #3b82f6;
    color: #fff;
    transform: translateY(-2px);
}

/* deal-specific inputs */
.other-payment-input {
    width: 30%;
    min-width: 110px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.04);
    color: #fff;
    margin-top: 6px;
    box-sizing: border-box;
}

/* gifts toggle */
.gifts-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 95%;
    margin-top: 12px;
}

.toggle-wrap {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.toggle-rail {
    width: 50px;
    height: 28px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    position: relative;
    transition: background 220ms ease, box-shadow 220ms ease;
    padding: 4px;
    box-sizing: border-box;
}

.toggle-rail.on {
    background: linear-gradient(90deg, #2D83EC, #1AC9FF);
    box-shadow: 0 6px 16px rgba(45, 131, 236, 0.18);
}

.toggle-knob {
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    transform: translateX(0);
    transition: transform 220ms cubic-bezier(.2, .9, .3, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.toggle-knob.on {
    transform: translateX(22px);
}

/* gifts textarea */
.gifts-descr {
    width: 95%;
    margin-top: 8px;
    min-height: 6rem;
    max-height: 220px;
}

/* footer fixed like your bet-details footer */
.footer-create {
    width: min(720px, 100%);
    display: flex;
    margin: auto auto;
    gap: 10px;
    justify-content: center;
    align-items: center;
    padding: 8px 12px;
    padding-bottom: 16px;
    margin-bottom: 24px;
    z-index: 5;
    box-sizing: border-box;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.0);
    /* transparent to blend with app */
}

/* create button */
.create-btn {
    width: 100%;
    max-width: 720px;
    padding: 12px 16px;
    background: linear-gradient(180deg, #2D83EC, #1AC9FF);
    color: #fff;
    font-weight: 600;
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(26, 201, 255, 0.16);
    cursor: pointer;
    font-family: "Inter", sans-serif;
    font-size: 1rem;
}

.create-btn[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

/* small fade transition used for gifts reveal */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 240ms ease, transform 220ms ease;
}

.fade-enter-from {
    opacity: 0;
    transform: translateY(-6px);
}

.fade-enter-to {
    opacity: 1;
    transform: translateY(0);
}

.fade-leave-from {
    opacity: 1;
    transform: translateY(0);
}

.fade-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

/* responsive */
@media (max-width: 380px) {
    .inventory-container {
        height: calc((70px * 2) + 120px);
        grid-auto-rows: 80px;
    }

    .text-input.name-input {
        min-height: 80px;
    }

    .name-input {
        font-size: 0.85rem;
        height: 2rem;
    }
}

/* visible error outline for invalid inputs (temporary) */
.input-error {
    border-color: #ff4d4f !important;
    box-shadow: 0 0 0 4px rgba(255, 77, 79, 0.10), 0 6px 18px rgba(255, 77, 79, 0.06);
    transition: box-shadow 180ms ease, border-color 120ms ease;
}

:root {
    --keyboard-height: 0px
}

html,
body,
.create-root {
    touch-action: manipulation;
    /* tells browser we don't need pinch/zoom for most controls */
    -webkit-tap-highlight-color: transparent;
    /* remove highlight flicker on tap */
}


button,
input,
textarea {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}

/* small pulse animation to draw attention once when error is applied */
@keyframes inputErrorPulse {
    0% {
        box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.14);
    }

    60% {
        box-shadow: 0 0 0 6px rgba(255, 77, 79, 0.06);
    }

    100% {
        box-shadow: 0 0 0 4px rgba(255, 77, 79, 0.10);
    }
}

.input-error {
    animation: inputErrorPulse 520ms ease;
}


.gifts-list {
    width: 100%;
    height: min(250px, 30vh);
    box-sizing: border-box;
    overflow-y: auto;
    /* must be scrollable */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
}

.gifts-wrapper {
    width: 100%;
    box-sizing: border-box;
    padding: 0;
}

.gift-row {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    padding: 12px;
    align-items: start;
}

.gifts-list::-webkit-scrollbar {
    display: none;
}

.gift-card {
    background: rgba(95, 95, 95, 0.2);
    cursor: pointer;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    align-self: center;
    justify-self: center;
    overflow: hidden;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
    user-select: none;
    padding: 0;
    height: 160px;
    min-width: 70px;
    max-width: 110px;
    position: relative;
    transform: translateY(0);
    /* base transform */
    transition: transform 180ms cubic-bezier(.2, .9, .2, 1), box-shadow 180ms cubic-bezier(.2, .9, .2, 1), border-color 180ms cubic-bezier(.2, .9, .2, 1);
    will-change: transform, box-shadow;
}

.gift-card.selected {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 1),
        /* white halo */
        0 10px 20px rgba(0, 0, 0, 0.22);
    transform: translateY(-6px);
    z-index: 2;
}

.gift-card.selected .select-icon {
    opacity: 0;
}

.gift-image-wrap {
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.01);
    border-radius: 8px;
    flex: 0 0 auto;
    display: block;
}

.gift-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 8px;
}

.select-gift-button {
    position: absolute;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    height: 35%;
    width: 40%;
    right: 0px;
    top: 0px;
}

.select-icon {
    width: 18px;
    height: 18px;
    padding: 6px;
}

.gift-below-img {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0px;
}

/* Meta (name / count) sits below the square image and has its own padding */
.gift-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;
    background: transparent;
    flex: 0 0 auto;
}

/* Count stays to the right (or next to name) and remains prominent */
.gift-count {
    font-size: 0.8rem;
    color: white;
    font-weight: 800;
}


.price-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.price-icon {
    width: 12px;
    height: 12px;
}

.gift-name-small,
.gift-name {
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 0.75rem;
    margin-top: 2px;
}

.gift-name-small {
    font-size: 0.7rem;
}
</style>
