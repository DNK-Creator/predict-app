<template>
    <!-- WITHDRAWAL MODAL  -->
    <WithdrawModal v-model="showWithdrawalModal" :address="parsedWalletAddress" :balance="appStoreObj.points"
        @withdraw="handleWithdraw" />

    <!-- DEPOSIT MODAL -->
    <DepositsModalTwo v-model="showDepositModal" :address="parsedWalletAddress" :balance="walletBalance"
        @deposit="handleDeposit" @deposit-stars="handleStarsDeposit" @close="closeDepositsWindow"
        @anim-start="onModalAnimStart" @anim-end="onModalAnimEnd" @connect-new-wallet="reconnectWallet"
        @open-wallet-info="openWalletInfo" />

    <!-- WALLET INFORMATION MODAL & BLUR OVERLAY  -->
    <YourWalletModal :show="showWalletInfo" :balance="walletBalance" :address="parsedWalletAddress"
        @reconnect-wallet="reconnectWallet" @close="closeWalletInfo" />

    <div class="profile-card">
        <img v-if="user?.photo_url" :src="user.photo_url" alt="Profile" class="profile-pic" />
        <div v-else class="profile-avatar">
            {{ (user?.first_name ?? 'A').charAt(0) }}
        </div>
        <h2 class="profile-name">{{ user?.first_name ?? 'Anonymous' }}</h2>

        <div class="stats-row">
            <div class="stat-item">
                <div class="stat-value">
                    <span>{{ Number(totalVolume).toFixed(2) }}</span>
                    <img :src="tonWhiteIcon" class="icon-diamond">
                </div>
                <div class="stat-label">{{ $t("total-volume") }}</div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewPreviousBets">
                <div class="stat-value">
                    <span>{{ betsMade }}</span>
                    <img :src="betIcon" class="icon-box">
                </div>
                <div class="stat-label">{{ $t("bet-all") }}</div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewWonPreviousBets">
                <div class="stat-value">
                    <span>{{ betsWon }}</span>
                    <img :src="wonIcon" class="icon-box">
                </div>
                <div class="stat-label">{{ $t("bet-won") }}</div>
            </div>
        </div>
        <div class="action-buttons">
            <div class="deposit-button" @click="openDepositModal">
                <div class="deposit-button-content">
                    <img :src="arrowIcon">
                    <h2>{{ $t("deposit") }}</h2>
                </div>
            </div>
            <div class="withdraw-button" @click="openWithdrawalModal">
                <div class="withdraw-button-content">
                    <img :src="withdrawIcon">
                    <h2>{{ $t("withdraw-two") }}</h2>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>

import { defineProps, defineEmits, ref, onMounted, onUnmounted, onActivated, computed, watch } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { Address, beginCell, toNano } from '@ton/core'
import { UserRejectsError } from '@tonconnect/sdk'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import { getTonConnect } from '@/services/ton-connect-ui'
import { useTon } from '@/services/useTon'
import { fetchInvoiceLink, fetchBotMessageTransaction } from '@/services/payments'
import { v4 as uuidv4 } from 'uuid'
import DepositsModalTwo from '../DepositsModalTwo.vue'
import YourWalletModal from '../YourWalletModal.vue'
import WithdrawModal from '@/components/WithdrawalModal.vue'
import tonWhiteIcon from '@/assets/icons/TON_White_Icon.png'
import betIcon from '@/assets/icons/Bet_Icon.png'
import wonIcon from '@/assets/icons/Won_Icon.png'
import arrowIcon from '@/assets/icons/Arrow_Up.png'
import withdrawIcon from '@/assets/icons/Wallet_Icon_Gray.png'
import { updateUsersWallet } from '@/api/requests'

const { user, tg } = useTelegram()

const { ton, ensureTon } = useTon()

const appStoreObj = useAppStore()

const props = defineProps({
    user: Object,
    totalVolume: Number,
    betsMade: Number,
    betsWon: Number,
    parentShow: Boolean,
})

const showDepositModal = ref(false)

const walletAddress = computed(() => {
    return appStoreObj.walletAddress ?? null
})

const modalAnimating = ref(false)

const showWithdrawalModal = ref(false)

const API_BASE = 'https://api.myoracleapp.com'

const walletBalance = ref(null)
const walletStatus = ref('Подключите кошелек')
const spinnerShow = ref(true)

const showWalletInfo = ref(false)

const emit = defineEmits(['view-previous-bets', 'view-won-bets'])

function viewPreviousBets() {
    emit('view-previous-bets')
}

function viewWonPreviousBets() {
    emit('view-won-bets')
}

// called when transition begins (enter or leave)
function onModalAnimStart() {
    modalAnimating.value = true
}

// called when transition fully finishes
function onModalAnimEnd() {
    modalAnimating.value = false
}

function openDepositModal() {
    if (modalAnimating.value) return
    showDepositModal.value = true
}

function closeDepositsWindow() {
    if (modalAnimating.value) return
    showDepositModal.value = false
    // no setTimeout
}

const parsedWalletAddress = computed(() => {
    const a = walletAddress.value
    if (!a) return null
    try {
        return Address.parse(a).toString({ urlSafe: true, bounceable: false })
    } catch (err) {
        console.warn('parse error', err)
        return null
    }
})

let depositInFlight;

async function handleDeposit(amount) {
    if (depositInFlight) return
    depositInFlight = true

    ensureTon()

    // Check if wallet is actually connected in current session
    const isConnected = ton.value.connected

    if (!isConnected || !walletAddress.value) {
        try {
            console.warn('Wallet not connected, attempting connection...')
            const wallet = await ton.value.connectWallet()
            if (wallet) {
                await handleConnected(wallet)
                // Add a small delay to ensure connection is fully established
                await new Promise(resolve => setTimeout(resolve, 500))
                await onDeposit(amount)
            }
        } catch (e) {
            console.error('Could not connect:', e)
            toast.error('Не удалось подключить кошелёк.')
            return // Important: return here to prevent further execution
        }
    } else {
        await onDeposit(amount)
    }
    depositInFlight = false
}

async function handleStarsDeposit(amount) {
    if (!user) return
    await onDepositStars(amount)
}

async function openWalletInfo() {
    if (walletAddress.value !== null) {
        showWalletInfo.value = true
    }
    else {
        ensureTon()
        const wallet = await ton.value.connectWallet()
        if (wallet) {
            await handleConnected(wallet)
        }
    }
}

async function closeWalletInfo() {
    showWalletInfo.value = false
}

async function openWithdrawalModal() {
    if (appStoreObj.walletAddress === null || appStoreObj.walletAddress === undefined) {
        try {
            ensureTon()
            const wallet = await ton.value.connectWallet()
            if (wallet) {
                await handleConnected(wallet)
            }
        } catch (e) {
            console.error("Could not connect:", e)
        }
        return
    }
    else {
        showWithdrawalModal.value = true
    }
}

// Called when user clicks “Вывод”
async function handleWithdraw(amount) {
    ensureTon()
    if (!walletAddress.value) {
        try {
            const wallet = await ton.value.connectWallet()
            if (wallet) {
                await handleConnected(wallet)
            }
        } catch (e) {
            console.error("Could not connect:", e);
        }
        return;
    }
    else {
        onWithdraw(amount)
    }
}

async function onWithdraw(amount) {
    if (!user) return
    const amount_cut = amount - 0.01
    if (amount_cut <= 0.05) return
    if (appStoreObj.points < amount) {
        let errorText = appStoreObj.language === 'ru' ? 'Недостаточно средств' : 'Insufficient funds'
        toast.error(errorText);
        return;
    }

    const parsedAddress = (Address.parse(appStoreObj.walletAddress)).toString({ urlSafe: true, bounceable: false });
    const idempotencyKey = uuidv4();

    // POST to your server endpoint
    let resp, data;

    try {
        resp = await fetch(`${API_BASE}/api/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram: user?.id,
                amount: amount,
                amount_cut,
                address: parsedAddress,
                idempotencyKey
            })
        });
    } catch (err) {
        // network-level error (DNS, offline, CORS, etc.)
        console.error('Network error while calling withdraw:', networkErr);
        const netMsg = appStoreObj.language === 'ru' ? 'Сетевая ошибка' : 'Network error';
        toast.error(`${netMsg}: ${networkErr.message || 'unknown'}`);
        return;
    }

    // Try to parse JSON, but tolerate non-JSON responses
    try {
        data = await resp.json();
    } catch (parseErr) {
        // response wasn't JSON — try to read text fallback
        try {
            const txt = await resp.text();
            data = { raw: txt };
        } catch (e) {
            data = { raw: null };
        }
    }

    if (!resp.ok) {
        // tolerant extraction of error code
        const errCode = (data && (data.error || data.code || data.error_code)) ? String(data.error || data.code || data.error_code) : null;

        // map known error codes to human messages (localized)
        const errorMap = {
            insufficient_funds: {
                ru: 'Недостаточно средств',
                en: 'Insufficient funds'
            },
            stars_deposit: {
                ru: 'Вы недавно пополняли звёздами — вывод недоступен (21 день)',
                en: 'Recent stars deposit — withdrawal unavailable for 21 days'
            },
            // add other server error codes here...
        };

        if (errCode && errorMap[errCode]) {
            const msg = appStoreObj.language === 'ru' ? errorMap[errCode].ru : errorMap[errCode].en;
            toast.error(msg);
        } else {
            // unknown server error: show message returned by server if any, else generic
            const serverMsg = (data && (data.message || data.raw || data.error)) ? (data.message || data.raw || data.error) : 'unknown';
            const defaultMsg = appStoreObj.language === 'ru' ? 'Ошибка вывода: ' : 'Withdrawal failed: ';
            toast.error(defaultMsg + serverMsg);
        }
        return;
    }

    // optimistic update or fetch fresh user points from server
    appStoreObj.points = Number((appStoreObj.points - amount).toFixed(2));
    let successText = appStoreObj.language === 'ru' ? 'Запрос на вывод сохранён.' : 'Withdrawal request saved.'
    toast.success(successText);

    try {
        let botMessageText = appStoreObj.language === 'ru' ? `💎 Запрос на вывод ${amount_cut} TON сохранён.\nТекущий баланс: ${appStoreObj.points} TON` :
            `💎 Request to withdraw ${amount_cut} TON is saved.\nCurrent balance: ${appStoreObj.points} TON`
        fetchBotMessageTransaction(botMessageText, user?.id)
    } catch (err) {
        console.warn('Failed to send bot message for user. Error: ' + err)
    }
}

// add this helper near the other functions
async function handleConnected(wallet) {
    if (!wallet) {
        walletStatus.value = 'Подключите кошелёк'
        walletBalance.value = null
        appStoreObj.walletAddress = null
        return
    }
    // normalize address
    let addr = wallet?.account?.address ?? null
    let parsedAddress = null

    if (addr) {
        try {
            parsedAddress = (Address.parse(addr)).toString({ urlSafe: true, bounceable: false })
            walletStatus.value = `Ваш кошелёк ${parsedAddress.slice(0, 4)}...${parsedAddress.slice(-3)}`

            // Update reactive state immediately
            walletAddress.value = parsedAddress
            appStoreObj.walletAddress = parsedAddress

            // fetch balance
            try {
                const tonBal = await fetchTonBalance(parsedAddress)
                walletBalance.value = typeof tonBal === 'number' ? +tonBal.toFixed(2) : null
            } catch (err) {
                console.warn('Failed to fetch TON balance', err)
                walletBalance.value = null
            }

            // update saved users wallet info
            if (user) {
                await updateUsersWallet(parsedAddress)
            }

        } catch (err) {
            console.warn('Failed to parse address', err)
            walletStatus.value = 'Подключите кошелёк'
            walletBalance.value = null
        }
    } else {
        walletStatus.value = 'Подключите кошелёк'
        walletBalance.value = null
        walletAddress.value = null
    }
}

// ——— Deposit flow ———
async function onDeposit(amount) {
    const amountTON = +amount

    if (!amountTON || amountTON === undefined || amountTON < 0.1) {
        let messageText = appStoreObj.language === 'ru' ? 'Пополнения от 0.1 TON.' : 'Deposit from 0.1 TON.'
        toast.warn(messageText)
        return
    }

    // create deposit intent server-side (server will create the transaction row)
    let intent
    try {
        intent = await createDepositIntentOnServer(amountTON)
    } catch (err) {
        let messageText = appStoreObj.language === 'ru' ? 'Не удалось создать пополнение — попробуйте позже.' : 'Failed to create deposit intent.'
        console.error('Failed to create deposit intent', err)
        toast.error(messageText)
        return
    }

    const txId = intent.uuid
    const depositAddress = intent.deposit_address // backend-sent address (hot wallet or generated address)
    if (!txId || !depositAddress) {
        let messageText = appStoreObj.language === 'ru' ? 'Ошибка сервера — обратитесь в поддержку.' : 'Server is unavailable - contact support.'
        console.error('Invalid intent response', intent)
        toast.error(messageText)
        return
    }

    // build TON payload with the comment = UUID
    const commentCell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(txId)
        .endCell()

    // Build base request WITHOUT forcing a network yet
    const baseReq = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
            address: depositAddress,
            amount: toNano(amountTON).toString(),
            payload: commentCell.toBoc().toString('base64')
        }]
    };

    // --- detect wallet network ---
    // const walletObj = ton.value?.wallet || null;
    // const walletInfo = ton.value?.walletInfo || null;

    // const walletNetwork =
    //     walletObj?.items?.[0]?.network ??
    //     walletObj?.network ??
    //     walletInfo?.network ??
    //     null;

    // if (walletNetwork) {
    //     baseReq.network = walletNetwork;
    // } else {
    //     baseReq.network = 'mainnet'
    // }

    // baseReq.network = 'mainnet'

    try {
        await ton.value.sendTransaction(baseReq)
        let messageText = appStoreObj.language === 'ru' ? 'Транзакция отправлена. Ожидайте подтверждения.' : 'Transaction was sent. Wait for approval.'
        toast.info(messageText)
        return
    } catch (e) {
        // User canceled
        if (e instanceof UserRejectsError) {
            console.warn('[deposit] user rejected tx')
            await cancelDepositIntentOnServer(txId)
            let messageText = appStoreObj.language === 'ru' ? 'Транзакция отменена.' : 'Transaction was canceled.'
            toast.info(messageText)
            return
        }

        console.error('[deposit] initial sendTransaction error:', e)

        // All attempts failed
        let messageText = appStoreObj.language === 'ru' ? 'Дожидайтесь подтверждения транзакции или попробуйте снова.' : 'Wait for the transaction cofirmation or try again.'
        toast.info(messageText)
    }
}

async function onDepositStars(amount) {
    if (!user) return
    try {
        // 1. create invoice link
        let invoiceLink = await fetchInvoiceLink(amount)

        // 2. open invoice in the Mini App; status callback invoked on change
        tg.openInvoice(invoiceLink, async (status) => {
            try {
                if (status === 'paid') {
                    // amount might be string or number; enforce Number and 2 decimals
                    const amountNum = Number(amount)
                    const amountStarsRounded = Number(amountNum.toFixed(2))

                    const headers = { 'Content-Type': 'application/json' }

                    const resp = await fetch(`${API_BASE}/api/stars-payment`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ amountStars: amountStarsRounded, user_id: user?.id })
                    })

                    const json = await resp.json().catch(() => null)
                    if (!resp.ok) {
                        console.error('stars-payment failed', resp.status, json)
                        let messageToast = appStoreObj.language === 'ru' ? 'Не удалось обработать оплату. Свяжитесь с поддержкой.' : 'Unable to process payment. Please contact support.'
                        toast.error(messageToast)
                        return
                    }
                    let messageToast = appStoreObj.language === 'ru' ? 'Пополнение успешно! Баланс обновлён.' : 'Top-up successful! Balance updated.'
                    // success
                    toast.success(messageToast)
                    // Optionally refresh user points in store
                    try {
                        // If you have a store method to fetch points, call it:
                        await appStoreObj.fetchPoints()
                    } catch (e) { /* ignore */ }
                } else {
                    // other statuses: 'cancelled' etc., do nothing
                    console.debug('invoice status', status)
                }
            } catch (innerErr) {
                console.error('Error handling paid callback', innerErr)
                let messageToast = appStoreObj.language === 'ru' ? 'Ошибка при подтверждении оплаты.' : 'Error confirming payment.'
                toast.error(messageToast)
            }
        })
    } catch (err) {
        console.error('Failed to create or open invoice:', err)
        let messageToast = appStoreObj.language === 'ru' ? 'Не удалось создать ссылку на оплату.' : 'Unable to create a payment link.'
        toast.error(messageToast)
    }
}


/**
 * Optional: notify server that the user cancelled the wallet prompt
 * POST /api/deposit-cancel { uuid }
 * server should set status = 'Отмененное пополнение' for that uuid
 */
async function createDepositIntentOnServer(amount) {
    if (!user) return
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let userParsedAddr = null
    if (appStoreObj.walletAddress !== null && appStoreObj.walletAddress !== undefined) {
        userParsedAddr = (Address.parse(appStoreObj.walletAddress)).toString({ urlSafe: true, bounceable: false })
    }
    try {
        const resp = await fetch(`${API_BASE}/api/deposit-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, user_id: user?.id, usersWallet: userParsedAddr }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        let text;
        try {
            text = await resp.text(); // read raw body first
            // try parse JSON, but fall back to raw text for logging
            const json = (() => {
                try { return JSON.parse(text); } catch (e) { return null; }
            })();

            if (!resp.ok) {
                // bubble readable message to caller
                const errMsg = (json && json.error) ? json.error : text || `HTTP ${resp.status}`;
                throw new Error(errMsg);
            }

            // return parsed JSON
            return json ?? {};
        } catch (readErr) {
            // body read/parse error
            console.error('[client] failed to read/parse response body', readErr);
            throw new Error('Invalid server response');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('[client] createDepositIntentOnServer: request timed out');
            throw new Error('timeout');
        }
        console.error('[client] createDepositIntentOnServer error', err);
        throw err;
    }
}

async function cancelDepositIntentOnServer(txId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {

        const resp = await fetch(`${API_BASE}/api/deposit-cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txId }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        let text;
        try {
            text = await resp.text(); // read raw body first
            // try parse JSON, but fall back to raw text for logging
            const json = (() => {
                try { return JSON.parse(text); } catch (e) { return null; }
            })();

            if (!resp.ok) {
                // bubble readable message to caller
                const errMsg = (json && json.error) ? json.error : text || `HTTP ${resp.status}`;
                throw new Error(errMsg);
            }

            // return parsed JSON
            return json ?? {};
        } catch (readErr) {
            // body read/parse error
            console.error('[client] failed to read/parse response body', readErr);
            throw new Error('Invalid server response');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('[client] cancelDepositIntentOnServer: request timed out');
            throw new Error('timeout');
        }
        console.error('[client] cancelDepositIntentOnServer error', err);
        throw err;
    }
}

async function reconnectWallet() {
    if (!ton.value) {
        ton.value = getTonConnect()
    }
    // If already connected, drop the session
    if (ton.value.connected || appStoreObj.walletAddress !== null) {
        appStoreObj.walletAddress = null
        await ton.value.disconnect();
        if (!user) return
        await updateUsersWallet(null)
    }
    walletStatus.value = 'Подключите кошелек'
    walletBalance.value = null
    // Then always open the wallet selector
    ensureTon()
    const wallet = await ton.value.connectWallet()
    if (wallet) {
        await handleConnected(wallet)
    }
}

async function fetchTonBalance(address) {
    if (!address) return;
    try {
        const url = `${API_BASE}/api/balance?address=${encodeURIComponent(address)}`;
        let resp;
        try {
            resp = await fetch(url)
        } catch (err) {
            console.warn('Backend is unavailable or network error: ' + err)
            return
        }

        if (!resp.ok) {
            const err = await resp.json().catch(() => null);
            throw new Error(err?.error || `Balance endpoint error ${resp.status}`);
        }

        const json = await resp.json();
        // backend returns { balance: number } in TON
        return Number(json.balance);
    } catch (err) {
        console.error('fetchTonBalance error', err);
        throw err;
    }
}

onMounted(async () => {
    setupTonConnectListener()

    // Try to restore existing connection
    try {
        ensureTon()
        const currentWallet = ton.value.wallet
        if (currentWallet) {
            await handleConnected(currentWallet)
        }
    } catch (error) {
        console.warn('No existing wallet connection to restore')
    }

    spinnerShow.value = false;
})

// Also clean up on unmount
onUnmounted(() => {
    if (ton.value && ton.value._statusListenerRegistered) {
        // You might want to disconnect or clean up listeners here
        isTonConnectSetup = false
    }
})

// onActivated(async () => {
//     if (ton.value?.connected && appStoreObj.walletAddress) {
//         let freshBal
//         try {
//             freshBal = await fetchTonBalance(appStoreObj.walletAddress)
//         } catch (err) {
//             console.log('Backend not reachable or server error while fetchign TON : ' + err)
//             return
//         }
//         if (freshBal === undefined || freshBal === null) return
//         walletBalance.value = +freshBal.toFixed(2)
//     }
// })

let isTonConnectSetup = false

function setupTonConnectListener() {
    if (isTonConnectSetup) return
    ensureTon()
    isTonConnectSetup = true

    // only register status change once
    if (!ton.value._statusListenerRegistered) {
        ton.value._statusListenerRegistered = true
        ton.value.onStatusChange(async (wallet) => {
            try {
                await handleConnected(wallet)
            } catch (err) {
                console.error('onStatusChange handler failed', err)
            }
        })
    }
}

watch(() => appStoreObj.openDepositFlag,
    async (val) => {
        if (val === true) {
            appStoreObj.openDepositFlag = false
            if (showDepositModal.value === true) return
            if (props.parentShow === false) {
                setTimeout(() => {
                    openDepositModal()
                }, 450);
            }
            else {
                openDepositModal()
            }
        }
    },
    { immediate: true }
)

watch(
    () => walletAddress.value,
    async (addr) => {
        if (!addr) {
            walletStatus.value = 'Подключите кошелек'
            walletBalance.value = null
            return
        }

        // set status quickly (shortened form)
        try {
            const parsed = Address.parse(addr).toString({ urlSafe: true, bounceable: false })
            walletStatus.value = `Ваш кошелёк ${parsed.slice(0, 4)}...${parsed.slice(-3)}`
        } catch (_) {
            walletStatus.value = 'Подключите кошелек'
        }

        // fetch fresh balance
        try {
            let freshBal
            try {
                freshBal = await fetchTonBalance(addr)
            } catch (err) {
                console.error('Backend not reachable or server error while fetchign TON : ' + err)
                return
            }
            if (freshBal === undefined || freshBal === null) return
            walletBalance.value = +freshBal.toFixed(2)
        } catch (err) {
            walletBalance.value = null
        }
    },
    { immediate: true }
)

</script>

<style scoped>
.profile-card {
    max-width: 480px;
    width: 85vw;
    margin: 0 auto;
    padding: 24px;
    padding-bottom: 0px;
    border-radius: 12px;
    text-align: center;
    color: #ffffff;
    user-select: none;
}

.profile-avatar {
    width: 88px;
    height: 88px;
    font-family: 'Inter Variable', sans-serif;
    border-radius: 30%;
    object-fit: cover;
    border: 2px solid #374151;
    margin: 0 auto 12px;
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
}

.profile-pic {
    width: 88px;
    height: 88px;
    border-radius: 30%;
    object-fit: cover;
    margin: 0 auto 0px;
}


.profile-name {
    font-size: 1.5rem;
    margin-bottom: 16px;
    margin-top: 12px;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.stats-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
}

.stat-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.divider {
    width: 2px;
    height: 32px;
    background-color: #242b36;
    margin: 0 12px;
    align-self: center;
}

.stat-item+.stat-item {
    margin-left: 12px;
}

.stat-value {
    display: flex;
    align-items: center;
    font-size: 1.15rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    gap: 0.25rem;
}

.icon-diamond,
.icon-box {
    width: 1rem;
    height: 1rem;
}

.stat-label {
    margin-top: 4px;
    font-size: 0.8rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    color: #9ca3af;
}

.action-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.withdraw-button,
.deposit-button {
    text-align: center;
    font-size: 0.95rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    width: 90%;
    margin: auto auto;
    color: #9ca3af;
    padding: 18px 24px 18px 24px;
    background-color: #3b82f6;
    border-radius: 32px;
    cursor: pointer;
}

/* Hover */
.withdraw-button:hover,
.deposit-button:hover {
    background-color: rgb(51, 115, 218);
}

.withdraw-button-content,
.deposit-button-content {
    display: flex;
    gap: 10px;
    align-content: center;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.withdraw-button-content {
    gap: 8px;
}

.deposit-button-content img {
    width: 9px;
    height: 14px;
}

.withdraw-button-content img {
    width: 14px;
    height: 14px;
}

.withdraw-button-content h2,
.deposit-button-content h2 {
    font-size: 1.05rem;
    text-justify: center;
    margin: 0;
    color: white;
}
</style>
