<template>
    <GiftInventoryModal :visible="showItemModal" :gift="selectedGift" :gift_url="createGiftUrl(selectedGift)"
        @close="closeGiftModal" />

    <div v-show="loaded" class="gift-list-parent">
        <div v-if="!gifts || gifts.length < 1" class="empty-gifts">
            <div ref="svgContainer" class="empty-media"></div>
            <span class="empty-text">{{ $t('none-gifts-one') }}</span>
            <span class="empty-text-two">{{ $t('none-gifts-two') }}</span>
            <span class="empty-text-bot-handle" @click="openRelayerChat">@GiftsPredictRelayer</span>
        </div>

        <div v-else class="none-empty-gifts">
            <!-- Virtualized rows -->
            <div class="gifts-list" v-bind="containerProps" role="list" tabindex="0" aria-live="polite">
                <div class="gifts-wrapper" v-bind="wrapperProps">
                    <!-- each virtual item is a row (data === array of up to COLUMNS gifts) -->
                    <div v-for="{ index, data: row } in list" :key="index" class="gift-row"
                        :style="{ height: rowHeight + 'px' }" role="listitem">
                        <!-- Render up to COLUMNS items per row; fill blanks if last row isn't full -->
                        <div v-for="(item, colIdx) in row" :key="item?.uuid ?? `${index}-${colIdx}`"
                            :class="['gift-card', { selected: isSelected(item?.uuid) }]"
                            @click="toggleCardAction(item, item?.uuid)">
                            <div class="gift-image-wrap">
                                <img :src="createGiftUrl(item)" draggable="false" loading="lazy" />
                            </div>

                            <div class="select-gift-button" @click.stop="toggleSelect(item)">
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
            <div class="footer">
                <div v-if="maxGiftsWarnShow === false" class="add-gifts-hint">
                    <span>{{ $t('to-add-new-gifts') }}</span>
                    <span class="selectable" @click="openRelayerChat">@GiftsPredictRelayer</span>
                </div>
                <div v-else>
                    <span class="warn-text">{{ $t('max-withdraw-gifts') }}</span>
                </div>
                <div class="withdrawal-area">
                    <button class="withdraw-button" @click="withdrawGifts"
                        :disabled="selectedOrder.length < 1 || isWithdrawing">
                        <span v-if="isWithdrawing">{{ $t('withdrawing-wait') }}</span>
                        <span v-else>{{ $t('withdraw-gift') }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, onMounted, computed, watchEffect } from 'vue'
import lottie from 'lottie-web'
import pako from 'pako'
import 'vue3-toastify/dist/index.css'
import { toast } from 'vue3-toastify'
import { useVirtualList } from '@vueuse/core'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import GiftInventoryModal from './GiftInventoryModal.vue'
import EmptyGift from '@/assets/FrogToilet.tgs'
import tonBlueIcon from '@/assets/icons/TON_Icon.png'
import plusImg from '@/assets/icons/Transparent_Plus_Icon.png'
import giftImg from '@/assets/icons/Gift_Icon.png'

const props = defineProps({
    gifts: { type: Array, required: true },
    loaded: Boolean,
})
const emit = defineEmits(['open-relayer', 'withdraw-complete'])

const { user, tg } = useTelegram()
const app = useAppStore()

/* ---------- GRID / VIRTUAL CONFIG ---------- */
const COLUMNS = 3
const CARD_HEIGHT = 160
const ROW_GAP = 18
const rowHeight = CARD_HEIGHT + ROW_GAP

/* group gifts into rows of 3 */
const source = computed(() => {
    const arr = props.gifts || []
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
const svgContainer = ref(null)
const selectedOrder = ref([])
const selectedGifts = ref([])
const selectedGift = ref(null)
const showItemModal = ref(false)
const isSelected = (id) => selectedOrder.value.indexOf(id) !== -1

const maxGiftsWarnShow = ref(false)
const isWithdrawing = ref(false)

function toggleCardAction(gift, id) {
    if (!id) return
    const idx = selectedOrder.value.indexOf(id)
    if (idx >= 0) {
        selectedOrder.value.splice(idx, 1)
        selectedGifts.value.splice(idx, 1)
    }
    else openGiftModal(gift)
}
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
    if (!giftObj) return giftImg
    const urlSafeName = String(giftObj.name.replace(/[ -]/g, '')).toLowerCase()
    return `https://nft.fragment.com/gift/${urlSafeName}-${giftObj.number}.webp`
}

/* lottie empty animation */
onMounted(async () => {
    const res = await fetch(EmptyGift)
    const buf = await res.arrayBuffer()
    const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' })
    const animationData = JSON.parse(jsonStr)
    lottie.loadAnimation({ container: svgContainer.value, renderer: 'svg', loop: true, autoplay: true, animationData })
})

function openRelayerChat() { emit('open-relayer') }
function openGiftModal(gift) { selectedGift.value = gift || null; showItemModal.value = true }
function closeGiftModal() { showItemModal.value = false; setTimeout(() => (selectedGift.value = null), 220) }

async function withdrawGifts() {
    // quick guard
    if (!selectedGifts.value || selectedGifts.value.length < 1) {
        const messageText = app.language === 'ru' ? "Подарки не выбраны." : "No gifts selected.";
        toast.info(messageText);
        return;
    }

    const recipientId = user?.id;
    if (!recipientId) {
        const messageText = app.language === 'ru' ? "Телеграм айди получателя не найден." : "Recipient Telegram ID not found.";
        toast.error(messageText);
        return;
    }

    // build compact payload
    const giftsPayload = selectedGifts.value.map(g => ({
        uuid: g.uuid ?? null,
        telegram_message_id: g.telegram_message_id ?? g.telegramMessageId ?? null,
        gift_id_long: g.gift_id_long ?? g.giftId ?? null,
        saved_id: g.saved_id ?? null,
        slug: g.slug ?? null
    }));

    const payload = {
        recipient: recipientId,
        gifts: giftsPayload
    }

    // compute amount: each gift costs 25 stars
    const giftsCount = giftsPayload.length;
    // arithmetic done explicitly: multiply digits (guard against NaN)
    const amountStars = Number((giftsCount * 25).toFixed(2)); // e.g. 3 * 25 = 75.00

    const payStarsPayload = { gifts: giftsPayload, amountStars };

    isWithdrawing.value = true;
    let timerCleanup = null;

    try {
        // 1) Request invoice link + orderId (server should embed orderId into invoice payload)
        const resp = await fetch('https://api.giftspredict.ru/api/pay-withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payStarsPayload)
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            toast.error((app.language === 'ru' ? "Ошибка на сервере: " : "Error on server: ") + (text || `Status ${resp.status}`));
            timerCleanup = setTimeout(() => {
                isWithdrawing.value = false
                if (timerCleanup) {
                    clearTimeout(timerCleanup); timerCleanup = null
                }
            }, 650)
            return;
        }

        const body = await resp.json().catch(() => null);
        if (!body || !body.link) {
            toast.error(app.language === 'ru' ? "Некорректный ответ от сервера." : "Invalid response from server.");
            timerCleanup = setTimeout(() => {
                isWithdrawing.value = false
                if (timerCleanup) {
                    clearTimeout(timerCleanup); timerCleanup = null
                }
            }, 650)
            return;
        }

        // 2) Open invoice in Mini App (status callback triggered by Telegram client)
        const invoiceLink = body.link;

        // 2. open invoice in the Mini App; status callback invoked on change
        tg.openInvoice(invoiceLink, async (status) => {
            try {
                if (status === 'paid') {
                    // user successfully withdrawn gifts
                    try {
                        const resp = await fetch('https://api.giftspredict.ru/api/withdraw-gifts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        })

                        if (!resp.ok) {
                            // try parse error body
                            const text = await resp.text().catch(() => null)
                            const msg = text || `Server returned ${resp.status}`
                            const serverText = app.language === 'ru' ? "Ошибка на сервере: " : "Error on server: "
                            toast.error(serverText + msg)
                            return
                        }

                        const body = await resp.json().catch(() => null)
                        if (!body) {
                            const invalidText = app.language === 'ru' ? "Некорректный ответ от сервера." : "Invalid response from server."
                            toast.error(invalidText)
                            return
                        }

                        if (body.ok) {
                            // success — show success toast and clear selection
                            const successText = app.language === 'ru' ? "Гифты успешно выведены." : "Gifts were withdrawn successfully."
                            toast.success(successText)
                            // emit result so parent can update inventory (remove transferred gifts)
                            emit('withdraw-complete', { payload, result: body.result ?? body })
                            // clear local selections
                            selectedOrder.value = []
                            selectedGifts.value = []
                        } else {
                            // server returned ok=false
                            const err = (body.error || (body.result && body.result.error) || JSON.stringify(body))
                            const serverText = app.language === 'ru' ? "Ошибка на сервере: " : "Error on server: "
                            toast.error(serverText + err)
                        }
                    } catch (err) {
                        const funcErrText = app.language === 'ru' ? "Ошибка сети или неожиданный ответ: " : "Network or unexpected error: "
                        console.error('Error with the withdrawing function: ', err)
                        toast.error(funcErrText + (err?.message ?? String(err)))
                    } finally {
                        // short delay so UI doesn't flash; ensures user sees the button state change
                        timerCleanup = setTimeout(() => {
                            isWithdrawing.value = false
                            if (timerCleanup) { clearTimeout(timerCleanup); timerCleanup = null }
                        }, 650)
                    }
                } else {
                    // statuses: 'cancelled', 'failed' etc. — do nothing, just notify user
                    const canceledText = app.language === 'ru' ? "Вывод подарков отменён." : "Gifts withdrawal canceled.";
                    toast.warn(canceledText);
                    // short delay so UI doesn't flash; ensures user sees the button state change 
                    timerCleanup = setTimeout(() => {
                        isWithdrawing.value = false
                        if (timerCleanup) {
                            clearTimeout(timerCleanup); timerCleanup = null
                        }
                    }, 650)
                }
            } catch (innerErr) {
                console.error('Error handling paid callback', innerErr)
                let messageToast = appStoreObj.language === 'ru' ? 'Ошибка при подтверждении оплаты.' : 'Error confirming payment.'
                toast.error(messageToast)
                timerCleanup = setTimeout(() => {
                    isWithdrawing.value = false
                    if (timerCleanup) {
                        clearTimeout(timerCleanup); timerCleanup = null
                    }
                }, 650)
            }
        })
    } catch (unexpectedErr) {
        console.error('Error handling paid callback', innerErr)
        let messageToast = appStoreObj.language === 'ru' ? 'Неожиданный ответ от сервера.' : 'Unexpected server return.'
        toast.error(messageToast)
        timerCleanup = setTimeout(() => {
            isWithdrawing.value = false
            if (timerCleanup) {
                clearTimeout(timerCleanup); timerCleanup = null
            }
        }, 650)
    }
}
</script>

<style scoped>
.gift-list-parent {
    height: auto;
    user-select: none;
}

.gift-icon {
    width: 40px;
    height: 40px;
    object-fit: cover;
    margin-right: 0.75rem;
    border-radius: 12px;
}

.gift-details {
    flex-grow: 1;
}

.gift-time {
    opacity: 0.5;
    color: white;
    font-size: 0.875rem;
    font-family: Inter;
    font-weight: 400;
}

.gift-amount {
    font-size: 1rem;
    font-family: Inter;
    font-weight: 400;
    color: white;
}

.empty-gifts {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: auto;
    color: white;
    height: 50vh;
}

.empty-media {
    height: calc(1.75rem + 15vh);
    width: calc(1.75rem + 15vh);
}

.empty-text {
    font-weight: 600;
    font-family: "Inter", sans-serif;
    font-size: 1.35rem;
    margin-bottom: 0;
    margin-top: 2vh;
    text-align: center;
    text-justify: center;
    width: 80%;
}

.empty-text-bot-handle,
.empty-text-two {
    font-weight: 600;
    font-size: 1.2rem;
    font-family: "Inter", sans-serif;
    margin-top: 0.25vh;
    text-align: center;
    width: 80%;
}

.empty-text-bot-handle {
    cursor: pointer;
    color: rgb(47, 175, 255);
}

.gifts-list {
    width: 100%;
    height: min(550px, 58vh);
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
    background: rgb(91, 91, 91, 0.3);
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
    min-width: 95px;
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

.footer {
    display: flex;
    flex-direction: column;
    width: 90%;
    align-items: center;
    justify-content: center;
    text-align: center;
    align-self: center;
    justify-self: center;
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    color: rgb(62, 64, 73);
    margin: auto auto;
    margin-top: 1vh;
}

.selectable {
    cursor: pointer;
}

.warn-text {
    color: rgb(229, 194, 36);
}

.add-gifts-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    align-self: center;
    justify-self: center;
}

.withdrawal-area {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 8px;
}

.withdraw-button {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    text-justify: center;
    height: 3rem;
    width: 10rem;
    border-radius: 12px;
    border: none;
    background-color: rgba(77, 84, 97, 0.5);
    color: white;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
}

.withdraw-button:disabled {
    cursor: auto;
    background-color: rgba(64, 70, 80, 0.3);
    color: rgb(217, 217, 217, 0.88);
}

@media (max-height: 830px) {
    .footer {
        margin-top: 1rem;
    }

    .gifts-list {
        height: min(450px, 48vh);
    }
}
</style>
