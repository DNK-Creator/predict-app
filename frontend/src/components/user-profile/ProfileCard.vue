<template>

    <!-- DEPOSIT MODAL -->
    <DepositsModalTwo v-model="showDepositModal" :address="parsedWalletAddress" :balance="walletBalance"
        @deposit="handleDeposit" @close="closeDepositsWindow" @anim-start="onModalAnimStart" @anim-end="onModalAnimEnd"
        @connect-new-wallet="reconnectWallet" @open-prices="openGiftsPrices" @open-wallet-info="openWalletInfo" />


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
                    <span>{{ totalVolume }}</span>
                    <img :src="tonWhiteIcon" class="icon-diamond">
                </div>
                <div class="stat-label">Общий объем</div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewPreviousBets">
                <div class="stat-value">
                    <span>{{ betsMade }}</span>
                    <img :src="betIcon" class="icon-box">
                </div>
                <div class="stat-label">Предсказано всего ></div>
            </div>

            <div class="divider"></div>

            <div class="stat-item" @click="viewWonPreviousBets">
                <div class="stat-value">
                    <span>{{ betsWon }}</span>
                    <img :src="wonIcon" class="icon-box">
                </div>
                <div class="stat-label">Предсказано правильно ></div>
            </div>
        </div>

        <div class="deposit-button" @click="openDepositModal">
            <div class="deposit-button-content">
                <img :src="arrowIcon">
                <h2>Пополнить</h2>
            </div>
        </div>
    </div>
</template>

<script setup>

import { defineProps, defineEmits, ref, onMounted, onActivated, computed, watch } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { Address } from '@ton/core'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import supabase from '@/services/supabase'
import { getTonConnect } from '@/services/ton-connect-ui'
import { useRouter } from 'vue-router'
import DepositsModalTwo from '../DepositsModalTwo.vue'
import YourWalletModal from '../YourWalletModal.vue'
import tonWhiteIcon from '@/assets/icons/TON_White_Icon.png'
import betIcon from '@/assets/icons/Bet_Icon.png'
import wonIcon from '@/assets/icons/Won_Icon.png'
import arrowIcon from '@/assets/icons/Arrow_Up.png'

const { user, tg } = useTelegram()

const appStoreObj = useAppStore()

const props = defineProps({
    user: Object,
    totalVolume: Number,
    betsMade: Number,
    betsWon: Number,
})

const router = useRouter()

const showDepositModal = ref(false)

const walletAddress = computed(() => {
    return appStoreObj.walletAddress ?? null
})

const modalAnimating = ref(false)

const API_BASE = 'https://api.giftspredict.ru'

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

function openGiftsPrices() {
    router.push({ name: 'gifts-prices' })
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
    console.log('[Parent] openDepositModal clicked, modalAnimating=', modalAnimating.value)
    if (modalAnimating.value) return
    showDepositModal.value = true
    console.log('[Parent] showDepositModal now =', showDepositModal.value)
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

// Called when user clicks “Пополнить”
async function handleDeposit(amount) {
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
        onDeposit(amount)
    }
}

async function openWalletInfo() {
    if (walletAddress.value !== null) {
        showWalletInfo.value = true
    }
    else {
        const wallet = await ton.value.connectWallet()
        if (wallet) {
            await handleConnected(wallet)
        }
    }
}

async function closeWalletInfo() {
    showWalletInfo.value = false
}

// add this helper near the other functions
async function handleConnected(wallet) {
    // normalize address
    let addr = wallet?.account?.address ?? null

    let parsedAddress = null
    if (addr !== null && addr !== undefined) {
        try {
            parsedAddress = (Address.parse(addr)).toString({ urlSafe: true, bounceable: false })
            walletStatus.value = `Ваш кошелёк ${parsedAddress.slice(0, 4)}...${parsedAddress.slice(-3)}`
        } catch (err) {
            console.warn('Failed to parse address', err)
            walletStatus.value = 'Подключите кошелёк'
        }

        if (parsedAddress !== null && parsedAddress !== undefined) {
            appStoreObj.walletAddress = parsedAddress
        }

        // fetch balance (guard with try/catch)
        try {
            const tonBal = await fetchTonBalance(appStoreObj.walletAddress)
            walletBalance.value = typeof tonBal === 'number' ? +tonBal.toFixed(2) : null
        } catch (err) {
            console.warn('Failed to fetch TON balance', err)
            walletBalance.value = null
        }
    } else {
        walletStatus.value = 'Подключите кошелёк'
        walletBalance.value = null
    }

    // update Supabase users.wallet_address (keep your previous logic)
    if (user || !user) {
        const { error } = await supabase
            .from('users')
            .update({ wallet_address: parsedAddress })
            .eq('telegram', user?.id ?? 99)
        if (error) {
            console.error('Error updating wallet_address:', error)
        }
    }
}

// ——— Deposit flow ———
async function onDeposit(amount) {
    // 1) If no wallet yet, open selector
    if (!ton.value) {
        ton.value = await getTonConnect();
    }

    const amountTON = +amount

    if (!amountTON || amountTON === undefined || amountTON <= 0.1) {
        toast.warn('Пополнения от 0.1 TON.')
        return
    }

    // create deposit intent server-side (server will create the transaction row)
    let intent
    try {
        intent = await createDepositIntentOnServer(amountTON)
    } catch (err) {
        console.error('Failed to create deposit intent', err)
        toast.error('Не удалось создать пополнение — попробуйте позже.')
        return
    }

    const txId = intent.uuid
    const depositAddress = intent.deposit_address // backend-sent address (hot wallet or generated address)
    if (!txId || !depositAddress) {
        console.error('Invalid intent response', intent)
        toast.error('Ошибка сервера — обратитесь в поддержку.')
        return
    }

    // build TON payload with the comment = UUID
    const commentCell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(txId)
        .endCell()

    const req = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: 'mainnet',
        messages: [{
            address: depositAddress,
            amount: toNano(amountTON).toString(),
            payload: commentCell.toBoc().toString('base64')
        }]
    }

    try {
        // prompt wallet & broadcast
        await ton.value.sendTransaction(req)

        // Tell the user the transaction was broadcast
        toast.info('Транзакция отправлена. Ожидайте подтверждения — баланс обновится автоматически.')

        // do NOT wait for TONCenter from frontend. Rely on backend worker to detect on-chain and update DB.
        // Your realtime supabase subscription will pick up the final status row update.

    } catch (e) {
        if (e instanceof UserRejectsError) {
            // user cancelled
            console.warn('[deposit] user rejected tx')

            // inform backend the intent was cancelled (optional but recommended)
            await cancelDepositIntentOnServer(txId)

            toast.info('Транзакция отменена.')
        } else {
            console.error('Transaction error:', e)
            toast.error('Ошибка отправки транзакции. Проверьте кошелек и попробуйте снова.')
        }
    }
}

/**
 * Optional: notify server that the user cancelled the wallet prompt
 * POST /api/deposit-cancel { uuid }
 * server should set status = 'Отмененное пополнение' for that uuid
 */
async function createDepositIntentOnServer(amount) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let userParsedAddr = null
    if (appStoreObj.walletAddress !== null && appStoreObj.walletAddress !== undefined) {
        userParsedAddr = (Address.parse(appStoreObj.walletAddress)).toString({ urlSafe: true, bounceable: false })
    }
    try {
        console.log('[client] POST /api/deposit-intent ->', { amount, user_id: user?.id ?? 99, usersWallet: userParsedAddr });

        const resp = await fetch(`${API_BASE}/api/deposit-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, user_id: user?.id ?? 99, usersWallet: userParsedAddr }),
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

            console.log('[client] deposit-intent response status', resp.status, 'body:', json ?? text);

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
        console.log('[client] POST /api/deposit-cancel -> ', txId);

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

            console.log('[client] deposit-cancel response status', resp.status, 'body:', json ?? text);

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
    console.log('Reconnecting')
    if(!ton.value) {
        ton.value = await getTonConnect()
    }
    // If already connected, drop the session
    if (ton.value.connected || appStoreObj.walletAddress !== null) {
        appStoreObj.walletAddress = null
        await ton.value.disconnect();
        const { error } = await supabase
            .from('users')
            .update({ wallet_address: null })
            .eq('telegram', user?.id ?? 99)
        if (error) {
            console.error('Error updating wallet_address:', error)
        }
    }
    walletStatus.value = 'Подключите кошелек'
    walletBalance.value = null
    // Then always open the wallet selector
    const wallet = await ton.value.connectWallet()
    if (wallet) {
        await handleConnected(wallet)
    }
}


// ---------------------
// Backend-backed balance fetch
// ---------------------
async function fetchTonBalance(address) {
    if (!address) return;
    try {
        const url = `${API_BASE}/api/balance?address=${encodeURIComponent(address)}`;
        const resp = await fetch(url);
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
    document.querySelectorAll('tc-widget-root').forEach(el => el.remove())

    const defineCustomElement = CustomElementRegistry.prototype.define;
    CustomElementRegistry.prototype.define = function define(name, constructor, options) {
        if (name == 'tc-root') {
            return;
        }
        return defineCustomElement.call(this, name, constructor, options);
    };

    setupTonConnectListener()

    spinnerShow.value = false;
})

onActivated(async () => {
    // every time DepositView is shown again…
    if (ton.value?.connected && appStoreObj.walletAddress) {
        const freshBal = await fetchTonBalance(appStoreObj.walletAddress)
        walletBalance.value = +freshBal.toFixed(2)
    }
})

function setupTonConnectListener() {
    // grab your one & only TonConnectUI
    ton.value = getTonConnect();

    // 2) only register status change once
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
            const bal = await fetchTonBalance(addr)
            walletBalance.value = (typeof bal === 'number') ? +bal.toFixed(2) : null
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
    padding-bottom: 4px;
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
    margin: 0 auto 12px;
}


.profile-name {
    font-size: 1.5rem;
    margin-bottom: 16px;
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
    margin: 0 16px;
    align-self: center;
}

.stat-item+.stat-item {
    margin-left: 16px;
}

.stat-value {
    display: flex;
    align-items: center;
    font-size: 1.3rem;
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
    font-size: 0.875rem;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    color: #9ca3af;
}

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
.deposit-button:hover {
    background-color: rgb(51, 115, 218);
}

.deposit-button-content {
    display: flex;
    gap: 10px;
    align-content: center;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.deposit-button-content img {
    width: 9px;
    height: 14px;
}

.deposit-button-content h2 {
    font-size: 1.05rem;
    text-justify: center;
    margin: 0;
    color: white;
}
</style>
