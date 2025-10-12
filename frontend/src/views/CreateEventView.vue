<template>
    <div class="create-root" ref="root" role="region" aria-label="Create event">
        <div class="create-container">
            <!-- Type selector (Prediction / Deal) -->
            <div class="card type-card" role="tablist" aria-label="Event type">
                <div class="type-buttons">
                    <button :class="['type-btn', { active: eventType === 'prediction' }]" @click="openHistoryCreated"
                        role="tab" :aria-selected="eventType === 'prediction'">
                        <img class="history-icon" :src="PastIcon">
                        {{ t('created-events-history') }}
                    </button>
                </div>
            </div>

            <div class="card form-card">
                <label class="input-label" for="ev-name">{{ t('event-name') }}</label>
                <textarea id="ev-name" ref="nameEl" v-model="form.name" class="text-input name-input" :maxlength="100"
                    :placeholder="$t('title-placeholder')" @input="autoSizeTextarea($event, 'name')" rows="1"
                    aria-describedby="name-help"></textarea>
                <div id="name-help" class="muted-hint">
                    {{ form.name.length }} / 100
                </div>

                <label class="input-label" for="ev-desc">{{ t('description') }}</label>
                <textarea id="ev-desc" ref="descEl" v-model="form.description" class="text-input desc-input"
                    :maxlength="650" :placeholder="$t('describe-event-input')" @input="autoSizeTextarea($event, 'desc')"
                    rows="3" aria-describedby="desc-hint"></textarea>

                <div id="desc-hint" class="muted-hint type-hint">
                    <template v-if="eventType === 'prediction'">
                        {{ $t('description-hint-prediction') }}
                    </template>
                    <template v-else>
                        {{ $t('describe-deal-input') }}
                    </template>
                </div>

                <div class="input-label"> {{ $t('you-are-giving') }} </div>

                <div class="row amount-row" role="group" aria-label="Amount">
                    <input ref="amountInput" id="amount" v-model="amount" @input="onAmountInput" @focus="onAmountFocus"
                        @blur="onAmountBlur" class="amount-input" type="text" inputmode="decimal" autocomplete="off"
                        pattern="^\\d*(\\.\\d{0,2})?$" placeholder="0.00" aria-describedby="amount-help" />
                    <img class="amount-icon" :src="TonIcon">
                </div>

                <!-- <div class="input-label-and"> {{ $t('and') }}: {{ selectedItemsText }}</div> -->

                <!-- Inventory grid: 3 columns x 2 rows visible -->
                <!-- <div id="inventory" class="inventory-container" role="list"
                    aria-label="Inventory items (tap to select)">
                    <div v-for="(cell, idx) in inventoryCells" :key="cell.id"
                        :class="['inv-cell', { selected: isSelected(cell.id) }]" role="listitem" tabindex="0"
                        @click="toggleSelect(cell.id)" @keydown.enter.prevent="toggleSelect(cell.id)"
                        @keydown.space.prevent="toggleSelect(cell.id)" :aria-pressed="isSelected(cell.id)">
                        <div class="inv-placeholder"></div>
                        <div class="inv-label">Item {{ idx + 1 }}</div>
                    </div>
                </div> -->

                <!-- TYPE-SPECIFIC BLOCKS -->
                <div v-if="eventType === 'prediction' && showPickingSides" class="prediction-block">
                    <label class="input-label">{{ t('choose-side') }}</label>
                    <div class="yesno-wrap" role="group" aria-label="Choose yes or no">
                        <button :class="['yesno-btn', { active: form.predictionSide === 'yes' }]"
                            @click="form.predictionSide = 'yes'">
                            {{ t('yes') }}
                        </button>
                        <button :class="['yesno-btn', { active: form.predictionSide === 'no' }]"
                            @click="form.predictionSide = 'no'">
                            {{ t('no') }}
                        </button>
                    </div>
                </div>

                <!-- <div v-else class="deal-block">
                    <label class="input-label">{{ t('you-are-getting') }}</label>
                    <div class="row amount-row">
                        <input class="other-payment-input" v-model="form.otherPaymentDisplay"
                            @input="onOtherPaymentInput" placeholder="0.00" inputmode="decimal"
                            aria-describedby="other-payment-help" />
                        <img class="amount-icon" :src="TonIcon">
                    </div>

                    <div class="gifts-toggle-row">
                        <div class="input-label small">{{ t('i-will-get-certain-gifts') }}:</div>
                        <div class="toggle-wrap" role="switch" :aria-checked="form.giftsEnabled" tabindex="0"
                            @click="form.giftsEnabled = !form.giftsEnabled"
                            @keydown.space.prevent="form.giftsEnabled = !form.giftsEnabled">
                            <div class="toggle-rail" :class="{ on: form.giftsEnabled }">
                                <div class="toggle-knob" :class="{ on: form.giftsEnabled }"></div>
                            </div>
                        </div>
                    </div>

                    <transition name="fade">
                        <textarea v-if="form.giftsEnabled" class="text-input gifts-descr" v-model="form.giftsText"
                            :placeholder="$t('getting-gifts-hint')" @input="autoSizeTextarea($event, 'gifts')"
                            rows="2"></textarea>
                    </transition>
                </div> -->
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
                    {{ $t('create-for') }} 0.1 TON
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { requestCreateBet } from '@/services/bets-requests'
import TonIcon from '@/assets/icons/TON_White_Icon.png'
import PastIcon from '@/assets/icons/Past_Icon.png'

const app = useAppStore()

const { t } = useI18n()
const router = useRouter()

const root = ref(null)
const nameEl = ref(null)
const descEl = ref(null)

const isCreating = ref(false)

const eventType = ref('prediction') // 'prediction' | 'deal'
const showPickingSides = ref(false)

// simple form model
const form = reactive({
    name: '',
    description: '',
    predictionSide: 'yes'
})

form.otherPaymentDisplay = ''

// inventory placeholder cells (empty). We show 3x2 visible rows; provide more to allow scroll.
const inventoryCells = Array.from({ length: 18 }).map((_, i) => ({ id: `cell-${i + 1}` }))

function openHistoryCreated() {
    router.push({ name: 'created-history' })
}

// selection set
const selectedIds = ref(new Set())

/**
 * Maintain selection **order** so the textual listing follows the order user selected.
 * selectedOrder is an array of IDs in selection order.
 */
const selectedOrder = ref([])

function isSelected(id) {
    return selectedOrder.value.indexOf(id) !== -1
}

function toggleSelect(id) {
    const idx = selectedOrder.value.indexOf(id)
    if (idx >= 0) {
        // deselect
        selectedOrder.value.splice(idx, 1)
    } else {
        // select (append to end)
        selectedOrder.value.push(id)
    }
}

// computed textual listing of selected items (selection order)
/**
 * Example outputs:
 *   "а также: Item 1, Item 2."
 *   "а также: Item 10."
 */
const selectedItemsText = computed(() => {
    if (!selectedOrder.value || selectedOrder.value.length === 0) return ''
    // map ids -> labels based on inventoryCells order (or selection order)
    const names = selectedOrder.value.map(id => {
        const idx = inventoryCells.findIndex(c => c.id === id)
        const label = idx >= 0 ? `Item ${idx + 1}` : id
        return label
    })

    if (names.length === 1) {
        return `${names[0]}.`
    }
    return `${names.join(', ')}.`
})

// autosize textareas
function autoSizeTextarea(e, which) {
    const el = e.target
    el.style.height = 'auto'
    const newH = Math.max(48, Math.min(600, el.scrollHeight))
    el.style.height = newH + 'px'
}

const lastInputtedNumber = ref('')
const amount = ref('')
const amountInput = ref(null)

function onAmountInput(e) {
    let v = e.target.value.replace(/,/g, '.')
        .replace(/[^\d.]/g, '')
        .replace(/^0(\d)/, '0')
        .replace(/(\..*)\./g, '$1')

    if (v.includes('.')) {
        const [i, d] = v.split('.')
        v = i + '.' + d.slice(0, 2)
    }

    if (v === '0' && lastInputtedNumber.value !== '0.') {
        v = '0.'
    } else if (lastInputtedNumber.value === '0.' && v === '0') {
        v = ''
    }

    if (v === '.') {
        v = '0.'
    }

    if (v === '0.00') {
        v = '0.01'
    }

    const num = parseFloat(v)
    if (!isNaN(num) && num > 99999) {
        v = '99999'
    }

    if (v > 0) {
        showPickingSides.value = true
    } else {
        showPickingSides.value = false
    }

    amount.value = v

    lastInputtedNumber.value = v
}

function onAmountFocus() {
    document.body.classList.add('keyboard-open');
    setTimeout(() => {
        try { amountInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
    }, 50);
    if (window.visualViewport) {
        const update = () => {
            const kv = window.visualViewport;
            const keyboardHeight = Math.max(0, window.innerHeight - kv.height);
            document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        };
        amountInput._vvListener = update;
        window.visualViewport.addEventListener('resize', update);
        update();
    }
}

function onAmountBlur() {
    document.body.classList.remove('keyboard-open');
    if (window.visualViewport && amountInput._vvListener) {
        window.visualViewport.removeEventListener('resize', amountInput._vvListener);
        delete amountInput._vvListener;
        document.documentElement.style.removeProperty('--keyboard-height');
    }
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
    // small UX: scroll top of form into view
    nextTick(() => {
        root.value?.scrollTo({ top: 0, behavior: 'smooth' })
    })
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
    const totalCreationPrice = Number(Number(amount.value) + 0.1).toFixed(2)
    if (app.points < totalCreationPrice) {
        let messageText = app.language === 'ru' ? 'Недостаточно средств для создания события.' : 'Not enough funds to create an event.'
        toast.error(messageText)
        return
    }

    const nameTrimmed = String(form.name || '').trim()
    const descTrimmed = String(form.description || '').trim()
    const nameLen = nameTrimmed.length
    const descLen = descTrimmed.length
    const MAX_NAME = 100
    const MAX_DESC = 650

    const invalidEls = []

    if (nameLen === 0 || nameLen > MAX_NAME) {
        invalidEls.push({ el: nameEl.value, reason: nameLen === 0 ? 'empty' : 'toolong' })
    }
    if (descLen === 0 || descLen > MAX_DESC) {
        invalidEls.push({ el: descEl.value, reason: descLen === 0 ? 'empty' : 'toolong' })
    }

    if (invalidEls.length > 0) {
        invalidEls.forEach(i => addTemporaryOutline(i.el))

        const toastMsg = app.language === 'ru' ? 'Заполните необходимую информацию' : 'Fill out the necessary information'
        toast.error(toastMsg)

        return
    }

    const payload = {
        name: nameTrimmed,
        description: descTrimmed,
        stake: Number.isFinite(Number(amount.value)) ? Number(amount.value) : 0,
        side: form.predictionSide
    }

    isCreating.value = true

    try {
        const resp = await requestCreateBet(payload, { timeoutMs: 12000 })

        if (resp.ok) {
            toast.success(app.language === 'ru' ? 'Событие отправлено на модерацию' : 'Event submitted for moderation')
            if (resp.data?.user?.points !== undefined) {
                app.points = resp.data.user.points // or dispatch store action
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

// ensure initial autosize on mount
onMounted(() => {
    if (nameEl.value) {
        nextTick(() => {
            if (nameEl.value) {
                nameEl.value.style.height = 'auto'
            }
        })
    }
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
    padding: 16px;
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
    height: 50px;
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
</style>
