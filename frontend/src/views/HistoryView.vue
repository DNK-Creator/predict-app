<template>
    <!-- WITHDRAWAL MODAL  -->
    <WithdrawModal v-model="showWithdrawalModal" :address="parsedWalletAddress" :balance="app.points"
        @withdraw="handleWithdraw" />

    <!-- WALLET INFORMATION MODAL & BLUR OVERLAY  -->
    <YourWalletModal :show="showWalletInfo" :address="parsedWalletAddress" :balance="walletBalance"
        @reconnect-wallet="reconnectWallet" @close="closeWalletInfo" />

    <div class="wallet-wrapper">
        <div class="wallet-top-header" @click="openWalletInfo">
            <div class="status-container">
                <img :src="walletIcon">
                <span class="wallet-status-text"> {{ walletStatus }} </span>
            </div>

            <div class="wallet-action-text" v-if="app.walletAddress"> Подключён </div>
            <div class="wallet-action-text" v-else> Подключить + </div>
        </div>
        <div class="wallet">
            <h3 class="wallet-balance-hint">Баланс Gifts Predict</h3>
            <h1 class="wallet-balance">{{ app.points }} TON</h1>
            <div class="wallet-buttons">
                <button class="wallet-button-withdraw" @click="openWithdrawalModal">Вывод ↑</button>
            </div>
        </div>
    </div>
    <TransactionsTable :transactions="transactions" />
</template>

<script setup>
import 'vue3-toastify/dist/index.css'
import supabase from '@/services/supabase'
import { toast } from 'vue3-toastify'
import { ref, onMounted, computed, onActivated, watch } from 'vue'
import { getLastWithdrawalTime } from '@/api/requests'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import { Address } from '@ton/core'
import { getTonConnect } from '@/services/ton-connect-ui'
import { v4 as uuidv4 } from 'uuid'
import { fetchBotMessageTransaction } from '@/services/payments'
import { useTon } from '@/services/useTon'
import TransactionsTable from '@/components/TransactionsTable.vue'
import YourWalletModal from '@/components/YourWalletModal.vue'
import WithdrawModal from '@/components/WithdrawalModal.vue'
import walletIcon from '@/assets/icons/Wallet_Icon_Gray.png'

const app = useAppStore()

const { ton, ensureTon } = useTon()

const transactions = ref([])
const spinnerShow = ref(true)
const showWithdrawalModal = ref(false)
const showWalletInfo = ref(false)

const API_BASE = 'https://api.giftspredict.ru'

const walletBalance = ref(null)

const walletAddress = computed(() => {
    return app.walletAddress ?? null
})

const walletStatus = computed(() => {
    if (app.walletAddress) {
        return `${app.walletAddress.slice(0, 4)}...${app.walletAddress.slice(-3)}`
    }
    return 'Подключите кошелёк'
})

const lastWithdrawalRequest = ref(null)
const { user } = useTelegram()

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

async function openWalletInfo() {
    if (walletAddress.value !== null) {
        showWalletInfo.value = true
    }
    else {
        // after (works)
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
    if (app.walletAddress === null || app.walletAddress === undefined) {
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

async function reconnectWallet() {
    // If already connected, drop the session
    ensureTon()
    if (ton.value.connected) {
        app.walletAddress = null
        await ton.value.disconnect()

        const { error } = await supabase
            .from('users')
            .update({ wallet_address: null })
            .eq('telegram', user?.id ?? 99)
        if (error) {
            console.error('Error updating wallet_address:', error)
        }

    }
    // Then always open the wallet selector
    const wallet = await ton.value.connectWallet()
    if (wallet) {
        await handleConnected(wallet)
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

// ——— Withdraw flow ———
async function onWithdraw(amount) {

    if (app.points < amount) {
        toast.error('Недостаточно средств')
        return
    }

    // if still on cooldown, exit early
    if (!canRequestWithdrawal(lastWithdrawalRequest.value)) {
        return;
    }

    lastWithdrawalRequest.value = new Date(Date.now()).toISOString()

    const parsedAddress = (Address.parse(app.walletAddress)).toString({ urlSafe: true, bounceable: false })

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
        fetchBotMessageTransaction(`💎 Запрос на получение ${amountTON} TON сохранен.\nТекущий баланс: ${app.points} TON`, user?.id)
    } catch (err) {
        console.warn('Failed to send bot message for user. Error: ' + err)
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

// add this helper near the other functions
async function handleConnected(wallet) {
    // normalize address
    let addr = wallet?.account?.address || null

    let parsedAddress = null

    if (addr !== null && addr !== undefined) {
        try {
            parsedAddress = (Address.parse(addr)).toString({ urlSafe: true, bounceable: false })
        } catch (err) {
            console.warn('Failed to parse address', err)
        }

        if (parsedAddress !== null && parsedAddress !== undefined) {
            app.walletAddress = parsedAddress
        }

        // fetch balance (guard with try/catch)
        try {
            const tonBal = await fetchTonBalance(app.walletAddress)
            walletBalance.value = typeof tonBal === 'number' ? +tonBal.toFixed(2) : null
        } catch (err) {
            console.warn('Failed to fetch TON balance', err)
            walletBalance.value = null
        }
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

onMounted(async () => {
    await loadTransactions()
    lastWithdrawalRequest.value = await getLastWithdrawalTime()

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
    if (ton.value?.connected && app.walletAddress) {
        const freshBal = await fetchTonBalance(app.walletAddress)
        walletBalance.value = +freshBal.toFixed(2)
    }
})

watch(
    () => walletAddress.value,
    async (addr) => {
        if (!addr) {
            walletStatus.value = 'Подключите кошелёк'
            walletBalance.value = null
            return
        }

        // set status quickly (shortened form)
        try {
            const parsed = Address.parse(addr).toString({ urlSafe: true, bounceable: false })
            walletStatus.value = `Ваш кошелёк ${parsed.slice(0, 4)}...${parsed.slice(-3)}`
        } catch (_) {
            walletStatus.value = 'Подключите кошелёк'
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
.wallet-wrapper {
    position: relative;
    max-width: 480px;
    width: 90vw;
    margin: 0.8rem auto 0.5rem;
    overflow: hidden;
    /* clip the header */
    height: 11rem;
    /* enough to show wallet plus header peek */
    user-select: none;
}

.wallet {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 1.6rem;
    /* push down so header peeks out */
    left: 0;
    right: 0;
    height: 9rem;
    background: linear-gradient(to top, #146dd9, #1aa0e8);
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
    border-radius: 1.1rem 1.3rem 0 0;
    cursor: pointer;
}

.wallet-status-text {
    color: #7d7d7d;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    max-height: 20px;
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
    font-size: 0.95rem;
    align-self: center;
    text-align: center;
    margin: 0.5rem;
    margin-top: 0.95rem;

}

.wallet-balance {
    color: white;
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    align-self: center;
    text-align: center;
}

.wallet-buttons {
    width: 100%;
    text-align: center;
    margin-top: 0.75rem;
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
    color: black;
}

.wallet-button-withdraw {
    height: 3rem;
    width: 8rem;
    cursor: pointer;
    border-radius: 17px;
    border: none;
    margin-right: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    color: rgba(235, 235, 235, 0.95);
    background-color: rgb(255, 255, 255, 0.15);
}

.status-container {
    display: flex;
    gap: 8px;
    height: 20px;
    padding: 2px 0px 0px 25px;
    align-items: center;
    justify-content: center;
}

.status-container img {
    height: 12px;
    width: 12px;
}
</style>