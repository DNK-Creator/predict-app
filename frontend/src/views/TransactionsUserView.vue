<template>
    <!-- WITHDRAWAL MODAL  -->
    <WithdrawModal v-model="showWithdrawalModal" :address="parsedWalletAddress" :balance="app.points"
        @withdraw="handleWithdraw" />

    <!-- WALLET INFORMATION MODAL & BLUR OVERLAY  -->
    <YourWalletModal :show="showWalletInfo" :address="parsedWalletAddress" :balance="walletBalance"
        @reconnect-wallet="reconnectWallet" @close="closeWalletInfo" />

    <!-- animated wrapper -->
    <transition name="history-fade" appear>
        <div v-show="showView" class="transactions-view-container">
            <div v-if="transactions.length > 0" class="wallet-wrapper">
                <div class="wallet-top-header" @click="openWalletInfo">
                    <div class="status-container">
                        <img :src="walletIcon">
                        <div class="wallet-action-text" v-if="app.walletAddress"> {{ $t("connected") }} </div>
                        <div class="wallet-action-text" v-else> {{ $t("connect-plus") }} </div>
                    </div>
                </div>
                <div class="wallet">
                    <h3 class="wallet-balance-hint">{{ $t("oracle-balance") }}</h3>
                    <h1 class="wallet-balance">{{ app.points }} TON</h1>
                    <div class="wallet-buttons">
                        <button class="wallet-button-withdraw" @click="openWithdrawalModal">{{ $t("withdraw")
                            }}</button>
                    </div>
                </div>
            </div>

            <TransactionsTable :transactions="transactions" :loaded="transactionsShow" />
        </div>
    </transition>
</template>


<script setup>
import 'vue3-toastify/dist/index.css'
import supabase from '@/services/supabase'
import { toast } from 'vue3-toastify'
import { ref, onMounted, computed, onActivated, watch, nextTick } from 'vue'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import { Address } from '@ton/core'
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
const transactionsShow = ref(false)

// inside setup: add this ref
const showView = ref(false)

const showWithdrawalModal = ref(false)
const showWalletInfo = ref(false)

const API_BASE = 'https://api.myoracleapp.com'

const walletBalance = ref(null)

const walletAddress = computed(() => {
    return app.walletAddress ?? null
})

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
    if (!user) return
    // If already connected, drop the session
    ensureTon()
    if (ton.value.connected) {
        app.walletAddress = null
        await ton.value.disconnect()

        const { error } = await supabase
            .from('users')
            .update({ wallet_address: null })
            .eq('telegram', user?.id)
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
    if (!user) return
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
            .eq('telegram', user?.id)
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
    if (!user) return
    // if (!user) return
    const { data, error } = await supabase
        .from('transactions')
        .select('uuid, amount, status, gift_url, created_at, type')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error loading transactions:', error)
    } else {
        transactions.value = data
    }
}

onMounted(async () => {
    // await loadTransactions()
    await loadTransactions()

    // Subscribe to realtime updates (Supabase JS v2)
    if (user) {
        // Create or reuse a channel
        const channel = supabase
            .channel('transactions-' + user?.id)            // a unique name
            .on(
                'postgres_changes',                          // listen to Postgres changes
                {
                    event: '*',                                // INSERT, UPDATE, DELETE
                    schema: 'public',                          // your schema
                    table: 'transactions',
                    filter: `user_id=eq.${user?.id}`            // only this user’s rows
                },
                async (payload) => {
                    // await loadTransactions()
                    await loadTransactions()
                }
            )

        // finally subscribe
        channel.subscribe()
    }

    spinnerShow.value = false
    transactionsShow.value = true
})

// toggle the view when spinner hides (avoid flicker by waiting a paint)
watch(spinnerShow, async (spinnerIsVisible) => {
    if (spinnerIsVisible) {
        // still loading -> hide content
        showView.value = false
        return
    }
    // spinner hidden -> show content after paint
    await nextTick()
    requestAnimationFrame(() => { showView.value = true })
}, { immediate: true })

// update onMounted remains (you already set spinnerShow=false and transactionsShow=true there)
// but the watch will pick it up and showView will become true

// enhance onActivated so animation replays when returning to this kept-alive view
onActivated(async () => {
    // otherwise replay appear animation
    showView.value = false
    await nextTick()
    requestAnimationFrame(() => { showView.value = true })

    // every time page is shown again…
    if (ton.value?.connected && app.walletAddress) {
        const freshBal = await fetchTonBalance(app.walletAddress)
        walletBalance.value = +freshBal.toFixed(2)
    }
})

watch(
    () => walletAddress.value,
    async (addr) => {
        if (!addr) {
            walletBalance.value = null
            return
        }

        // set status quickly (shortened form)
        try {
            const parsed = Address.parse(addr).toString({ urlSafe: true, bounceable: false })
        } catch (_) { }

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

/* history view appear animation */
.history-fade-enter-active,
.history-fade-leave-active {
    transition: opacity 260ms cubic-bezier(.22, .9, .32, 1), transform 260ms ease;
    will-change: opacity, transform;
}

.history-fade-enter-from,
.history-fade-leave-to {
    opacity: 0;
    transform: translateY(10px) scale(0.996);
    pointer-events: none;
}

.history-fade-enter-to,
.history-fade-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.transactions-view-container {
    /* keep layout same as before; use min-height if you need consistent height */
    min-height: 1px;
    margin-top: 1rem;
}
</style>