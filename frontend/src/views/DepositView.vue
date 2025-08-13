<template>
    <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow" class="deposit-details">
        <!-- WITHDRAWAL MODAL  -->
        <WithdrawModal v-model="showWithdrawalModal" :address="parseWalletAddress(walletAddress)"
            :balance="walletBalance" @withdraw="handleWithdraw" @max="setMax" />

        <!-- DEPOSIT MODAL -->
        <DepositModal v-model="showDepositModal" :address="parseWalletAddress(walletAddress)" :balance="walletBalance"
            @deposit="handleDeposit" @deposit-stars="handleDepositStars" />

        <!-- WALLET INFORMATION MODAL & BLUR OVERLAY  -->
        <YourWalletModal :show="showWalletInfo" :balance="walletBalance" :address="parseWalletAddress(walletAddress)"
            @reconnect-wallet="reconnectWallet" @close="closeWalletInfo" />

        <div class="wallet-wrapper">
            <div class="wallet-top-header" @click="openWalletInfo">
                <div class="wallet-status-text"> {{ walletStatus }} </div>
                <div class="wallet-action-text" v-if="walletBalance"> {{ walletBalance }} TON </div>
                <div class="wallet-action-text" v-else> Подключить + </div>
            </div>
            <div class="wallet">
                <h3 class="wallet-balance-hint">Баланс Gifts Predict</h3>
                <h1 class="wallet-balance">{{ app.points }} TON</h1>
                <div class="wallet-buttons">
                    <button class="wallet-button-deposit" @click="openDepositModal">Пополнить +</button>
                    <button class="wallet-button-withdraw" @click="openWithdrawalModal">Вывод ↑</button>
                </div>
            </div>
        </div>
        <h1 class="actions-top">История</h1>
        <h2 class="actions-top-warning">Не закрывайте это окно во время подтверждения транзакции.</h2>
        <TransactionsTable :transactions="transactions" />
    </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { useTelegram } from '@/services/telegram'
import { getLastWithdrawalTime } from '@/api/requests'
import { getTonConnect } from '@/services/ton-connect-ui'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '@/stores/appStore'
import supabase from '@/services/supabase'
import { fetchInvoiceLink, fetchBotMessageTransaction } from '@/services/payments'

// Components
import TransactionsTable from '@/components/TransactionsTable.vue';
import WithdrawModal from '@/components/WithdrawalModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'
import YourWalletModal from '@/components/YourWalletModal.vue';

// TON‑Connect & TON core
import { UserRejectsError } from '@tonconnect/ui'
import { beginCell, toNano, Address } from '@ton/core'

const { user } = useTelegram()
const { tg } = useTelegram()

const app = useAppStore()

const spinnerShow = ref(true)

const lastWithdrawalRequest = ref()
const ton = ref(null)
const transactions = ref([])
const walletAddress = ref(null)

const showWalletInfo = ref(false)

function parseWalletAddress(addr) {
    let parsedAddress
    if (addr) {
        parsedAddress = (Address.parse(addr)).toString({ urlSafe: true, bounceable: false })
    }
    return parsedAddress
}

const showWithdrawalModal = ref(false)
const showDepositModal = ref(false)
const walletStatus = ref('Подключите кошелек')
const walletBalance = ref(null)

const API_BASE = 'https://api.giftspredict.ru'

async function openWithdrawalModal() {
    if (!walletAddress.value) {
        try {
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

async function openDepositModal() {
    if (!walletAddress.value) {
        try {
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
        showDepositModal.value = true
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

// Called when user clicks “Вывод”
async function handleWithdraw(amount) {
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

// Called when user clicks “Пополнить”
async function handleDepositStars(amount) {
    //  if (!user) return;
    onDepositStars(amount)
}

function setMax() {
    // set max withdrawal
}

// ——— Load transactions from Supabase ———
async function loadTransactions() {
    // if (!user) return
    const { data, error } = await supabase
        .from('transactions')
        .select('uuid, amount, status, created_at, type')
        .eq('user_id', user?.id ?? 99)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error loading transactions:', error)
    } else {
        transactions.value = data
    }
}

// add this helper near the other functions
async function handleConnected(wallet) {
    // normalize address
    walletAddress.value = wallet?.account?.address || null

    let parsedAddress = null
    if (walletAddress.value !== null) {
        try {
            parsedAddress = (Address.parse(walletAddress.value)).toString({ urlSafe: true, bounceable: false })
            walletStatus.value = `Ваш кошелёк ${parsedAddress.slice(0, 4)}...${parsedAddress.slice(-3)}`
        } catch (err) {
            console.warn('Failed to parse address', err)
            walletStatus.value = 'Подключите кошелёк'
        }

        // fetch balance (guard with try/catch)
        try {
            const tonBal = await fetchTonBalance(walletAddress.value)
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

async function reconnectWallet() {
    // If already connected, drop the session
    if (ton.value.connected) {
        walletAddress.value = null
        await ton.value.disconnect();
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
// Deposit: request deposit-intent from backend & send TX from wallet
// ---------------------
/**
 * POST /api/deposit-intent
 * body: { amount: number, user_id?: number }
 * response: { uuid: string, deposit_address: string, created_at: string }
 *
 * The backend MUST:
 *  - create the transactions row with handled=false
 *  - return the uuid and deposit_address (HOT_WALLET address or per-user address)
 */
async function createDepositIntentOnServer(amount) {
    const resp = await fetch(`${API_BASE}/api/deposit-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount,
            user_id: user?.id ?? 99
        })
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || `deposit-intent failed: ${resp.status}`);
    }
    return resp.json();
}

/**
 * Optional: notify server that the user cancelled the wallet prompt
 * POST /api/deposit-cancel { uuid }
 * server should set status = 'Отмененное пополнение' for that uuid
 */
async function cancelDepositIntentOnServer(uuid) {
    try {
        await fetch(`${API_BASE}/api/deposit-cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid })
        });
    } catch (err) {
        console.warn('Failed to notify server about cancelled deposit intent', err);
    }
}

// ——— Deposit flow ———
async function onDeposit(amount) {
    // 1) If no wallet yet, open selector
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
    if (!ton.value) return

    const amountTON = amount

    // create deposit intent server-side (server will create the transaction row)
    let intent
    try {
        intent = await createDepositIntentOnServer(amountTON)
    } catch (err) {
        console.error('Failed to create deposit intent', err)
        toast.error('Не удалось создать намерение пополнения — попробуйте позже.')
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

            toast.info('Транзакция отменена пользователем.')
        } else {
            console.error('Transaction error:', e)
            toast.error('Ошибка отправки транзакции. Проверьте кошелек и попробуйте снова.')
        }
    }
}

async function onDepositStars(amount) {
    try {
        // 1. fetch the invoice URL from your backend
        const invoiceLink = await fetchInvoiceLink(amount)
        console.log(invoiceLink)
        // 2. open the invoice in the Mini App
        //    the 2nd arg is an optional callback that receives a status string
        tg.openInvoice(invoiceLink, (status) => {
            if (status === 'paid') {
                console.log('🎉 Payment successful for', amount * 2, 'Coins!')
            }
            // otherwise do nothing
        })
    }
    catch (err) {
        console.error('Failed to create or open invoice:', err)
    }
}

function canRequestWithdrawal(lastWithdrawalRequest) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const last = new Date(lastWithdrawalRequest).getTime();
    const elapsed = now - last;

    if (elapsed >= MS_PER_DAY) {
        // more than 24h have passed
        return true;
    }

    // compute remaining time
    const remainingMs = MS_PER_DAY - elapsed;
    const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
    const remainingMinutes = Math.floor(
        (remainingMs % (60 * 60 * 1000)) / (60 * 1000)
    );

    toast.error(`Вывод доступен через ${remainingHours} ч. ${remainingMinutes} мин.`)
    return false;
}

// ——— Withdraw flow ———
async function onWithdraw(amount) {
    // 1) If no wallet yet, open selector
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

    if (app.points < amount) {
        toast.error(`Недостаточно средств (нужно ≥ ${amount})`)
        return
    }

    // if still on cooldown, exit early
    if (!canRequestWithdrawal(lastWithdrawalRequest.value)) {
        return;
    }

    lastWithdrawalRequest.value = new Date(Date.now()).toISOString()

    const parsedAddress = (Address.parse(walletAddress.value)).toString({ urlSafe: true, bounceable: false })

    const txId = uuidv4()
    const amountTON = amount

    await supabase
        .from('users')
        .update({ last_withdrawal_request: lastWithdrawalRequest.value })
        .eq('telegram', user?.id ?? 99)

    // insert withdrawal request
    await supabase.from('transactions').insert({
        uuid: txId,
        user_id: user?.id ?? 99,
        amount: amountTON,
        status: 'Ожидание вывода',
        type: 'Withdrawal',
        withdrawal_pending: true,
        withdrawal_address: parsedAddress,
        created_at: new Date().toISOString()
    })

    // deduct balance immediately
    app.points -= amountTON
    await supabase.from('users')
        .update({ points: app.points })
        .eq('telegram', user?.id ?? 99)

    try {
        fetchBotMessageTransaction(`💎 Запрос на получение ${amountTON} TON сохранен. %0A Текущий баланс: ${newPoints} TON`, user?.id)
    } catch (err) {
        console.warn('Failed to send bot message for user. Error: ' + err)
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
    await loadTransactions()
    lastWithdrawalRequest.value = await getLastWithdrawalTime()

    // kill any orphaned widget roots
    document.querySelectorAll('tc-widget-root').forEach(el => el.remove())

    const defineCustomElement = CustomElementRegistry.prototype.define;
    CustomElementRegistry.prototype.define = function define(name, constructor, options) {
        if (name == 'tc-root') {
            return;
        }
        return defineCustomElement.call(this, name, constructor, options);
    };

    setupTonConnectListener()

    // Subscribe to realtime updates (Supabase JS v2)
    if (user || !user) {
        // Create or reuse a channel
        const channel = supabase
            .channel('transactions-' + user?.id ?? 99)            // a unique name
            .on(
                'postgres_changes',                          // listen to Postgres changes
                {
                    event: '*',                                // INSERT, UPDATE, DELETE
                    schema: 'public',                          // your schema
                    table: 'transactions',
                    filter: `user_id=eq.${user?.id ?? 99}`            // only this user’s rows
                },
                async (payload) => {
                    console.log('Realtime payload:', payload)
                    await loadTransactions()
                }
            )

        // finally subscribe
        channel.subscribe()
    }

    spinnerShow.value = false;
})

onActivated(async () => {
    // every time DepositView is shown again…
    if (ton.value?.connected && walletAddress.value) {
        const freshBal = await fetchTonBalance(walletAddress.value)
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


</script>

<style lang="css" scoped>
.actions-top {
    color: white;
    width: 90vw;
    font-size: 1.5rem;
    margin: 1.05rem auto 0.25rem auto;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.actions-top-warning {
    color: white;
    opacity: 0.5;
    width: 90vw;
    font-size: 0.95rem;
    margin: 0rem auto 2.45vh auto;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.wallet-wrapper {
    position: relative;
    max-width: 480px;
    width: 90vw;
    margin: 0.8rem auto 0;
    overflow: hidden;
    /* clip the header */
    height: 13rem;
    /* enough to show wallet plus header peek */
}

.wallet {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 1.6rem;
    /* push down so header peeks out */
    left: 0;
    right: 0;
    height: 11rem;
    background: linear-gradient(to top, #2D83EC, #1AC9FF);
    border-radius: 20px;
    z-index: 1;
    /* on top of header */

    align-items: center;
    justify-items: center;
}

/* same .wallet-top-header as before, but no z-index needed */
.wallet-top-header {
    display: flex;
    justify-content: space-between;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 65px;
    background: #292a2a;
    border-radius: 1.3rem 1.3rem 0 0;
    cursor: pointer;
}

.wallet-status-text {
    color: #7d7d7d;
    padding: 2px 0px 0px 25px;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.wallet-action-text {
    color: #ffffff;
    padding: 2px 25px 0px 0px;
    font-weight: 600;
    font-family: "Inter", sans-serif;
}

.wallet-balance-hint {
    color: white;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    opacity: 0.5;
    font-size: 1rem;
    align-self: center;
    text-align: center;
}

.wallet-balance {
    color: white;
    margin: 0;
    font-size: 2.25rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    align-self: center;
    text-align: center;
}

.wallet-buttons {
    width: 100%;
    text-align: center;
    margin-top: 1rem;
}

.tonconnect-button {
    align-items: center;
    margin: auto auto;
    align-self: center;
    width: 30vw;
}

.wallet-button-deposit {
    height: 3.2rem;
    width: 8rem;
    cursor: pointer;
    border-radius: 17px;
    border: none;
    margin-right: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    background-color: white;
}

.wallet-button-withdraw {
    height: 3.2rem;
    width: 8rem;
    cursor: pointer;
    border-radius: 17px;
    border: none;
    margin-right: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    color: white;
    background-color: rgb(255, 255, 255, 0.3);
}
</style>