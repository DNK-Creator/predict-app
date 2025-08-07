<template>
    <!-- <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow" class="bet-details">
         WITHDRAWAL MODAL 
        <WithdrawModal v-model="showWithdrawalModal" :address="parseWalletAddress(walletAddress)"
            :balance="walletBalance" @withdraw="handleWithdraw" @max="setMax" />

         DEPOSIT MODAL
        <DepositModal v-model="showDepositModal" :address="parseWalletAddress(walletAddress)" :balance="walletBalance"
            @deposit="handleDeposit" @deposit-stars="handleDepositStars" />

         WALLET INFORMATION MODAL & BLUR OVERLAY 
        <YourWalletModal :show="showWalletInfo" :balance="walletBalance" :address="parseWalletAddress(walletAddress)"
            @reconnect-wallet="reconnectWallet" @close="closeWalletInfo" />

        <div class="wallet-wrapper">
            <div class="wallet-top-header" @click="openWalletInfo">
                <div class="wallet-status-text"> {{ walletStatus }} </div>
                <div class="wallet-action-text" v-if="walletBalance"> {{ walletBalance }} TON </div>
                <div class="wallet-action-text" v-else> Connect + </div>
            </div>
            <div class="wallet">
                <h3 class="wallet-balance-hint">Gifts Predict balance</h3>
                <h1 class="wallet-balance">{{ app.points }} TON</h1>
                <div class="wallet-buttons">
                    <button class="wallet-button-deposit" @click="openDepositModal">Deposit +</button>
                    <button class="wallet-button-withdraw" @click="openWithdrawalModal">Withdraw ↑</button>
                </div>
            </div>
        </div>
        <h1 class="actions-top">Recent Actions</h1>
        <TransactionsTable :transactions="transactions" />
    </div> -->
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useTelegram } from '@/services/telegram'
import { getLastWithdrawalTime } from '@/api/requests'
// import { getTonConnect } from '@/services/ton-connect-ui'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '@/stores/appStore'
import supabase from '@/services/supabase'
import { fetchInvoiceLink } from '@/services/payments'

// Components
import TransactionsTable from '@/components/TransactionsTable.vue';
import WithdrawModal from '@/components/WithdrawalModal.vue'
import DepositModal from '@/components/DepositModal.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'
import YourWalletModal from '@/components/YourWalletModal.vue';

// TON‑Connect & TON core
// import { UserRejectsError } from '@tonconnect/ui'
// import { beginCell, toNano, Address } from '@ton/core'

// const { user } = useTelegram()
// const { tg } = useTelegram()

// const app = useAppStore()

// const spinnerShow = ref(true)

// const lastWithdrawalRequest = ref()
// const ton = ref(null)
// const transactions = ref([])
// const walletAddress = ref(null)

// const showWalletInfo = ref(false)

// function parseWalletAddress(addr) {
//     let parsedAddress
//     if (addr) {
//         parsedAddress = (Address.parse(addr)).toString({ urlSafe: true, bounceable: false })
//     }
//     return parsedAddress
// }

// const showWithdrawalModal = ref(false)
// const showDepositModal = ref(false)
// const walletStatus = ref('Connect your wallet')
// const walletBalance = ref(null)

// const TONCENTER = import.meta.env.VITE_TONCENTER_URL
// const API_KEY = import.meta.env.VITE_TONCENTER_API_KEY
// const HOT_WALLET = import.meta.env.VITE_HOT_WALLET

// async function openWithdrawalModal() {
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet()
//         } catch (e) {
//             console.error("Could not connect:", e)
//         }
//         return
//     }
//     else {
//         showWithdrawalModal.value = true
//     }
// }

// async function openDepositModal() {
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet()
//         } catch (e) {
//             console.error("Could not connect:", e)
//         }
//         return
//     }
//     else {
//         showDepositModal.value = true
//     }
// }

// async function openWalletInfo() {
//     if (walletAddress.value !== null) {
//         showWalletInfo.value = true
//     }
//     else {
//         await ton.value.connectWallet();
//     }
// }

// async function closeWalletInfo() {
//     showWalletInfo.value = false
// }

// // Called when user clicks “Вывод”
// async function handleWithdraw(amount) {
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet();
//         } catch (e) {
//             console.error("Could not connect:", e);
//         }
//         return;
//     }
//     else {
//         console.log(amount)
//         onWithdraw(amount)
//     }
// }

// // Called when user clicks “Пополнить”
// async function handleDeposit(amount) {
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet();
//         } catch (e) {
//             console.error("Could not connect:", e);
//         }
//         return;
//     }
//     else {
//         console.log(amount)
//         onDeposit(amount)
//     }
// }

// // Called when user clicks “Пополнить”
// async function handleDepositStars(amount) {
//     //  if (!user) return;
//     onDepositStars(amount)
// }

// function setMax() {
//     // set max withdrawal
// }

// // ——— Load transactions from Supabase ———
// async function loadTransactions() {
//     // if (!user) return
//     const { data, error } = await supabase
//         .from('transactions')
//         .select('uuid, amount, status, created_at, type')
//         .eq('user_id', user?.id ?? 99)
//         .order('created_at', { ascending: false })

//     if (error) {
//         console.error('Error loading transactions:', error)
//     } else {
//         transactions.value = data
//     }
// }

// async function reconnectWallet() {
//     // If already connected, drop the session
//     if (ton.value.connected) {
//         walletAddress.value = null
//         await ton.value.disconnect();
//     }
//     walletStatus.value = 'Connect your wallet'
//     walletBalance.value = null
//     // Then always open the wallet selector
//     await ton.value.connectWallet();
// }

// /**
//  * Poll TONCenter `/getTransactions` until you see a TextComment payload
//  * matching your `uuid`.  Then verify exit_code/aborted.
//  */
// async function waitForUUID(uuid, timeoutMs = 60_000) {
//     const start = Date.now()
//     // We’ll page through the most recent 10 txns each poll
//     const limit = 10

//     console.log(`[poll] looking for comment "${uuid}" at ${HOT_WALLET}`)

//     while (Date.now() - start < timeoutMs) {

//         // 1) Fetch inbound transactions to HOT_WALLET
//         const url = new URL(`${TONCENTER}/getTransactions`)
//         url.searchParams.set('address', HOT_WALLET)
//         url.searchParams.set('limit', limit)
//         url.searchParams.set('archival', 'true')
//         url.searchParams.set('api_key', API_KEY)

//         let resp, json
//         try {
//             resp = await fetch(url.toString())
//             json = await resp.json()
//         } catch (e) {
//             console.warn('[poll] network:', e)
//             await new Promise(r => setTimeout(r, 2000))
//             continue
//         }

//         if (!resp.ok || json.error) {
//             console.warn('[poll] error:', resp.status, json.error)
//             await new Promise(r => setTimeout(r, 2000))
//             continue
//         }

//         // pick out the array of transactions
//         const txs = Array.isArray(json.result)
//             ? json.result
//             : Array.isArray(json.result.transactions)
//                 ? json.result.transactions
//                 : []

//         // look for my UUID in the TextComment payload
//         const found = txs.find(tx => {
//             const realComment = tx.in_msg?.message
//             return realComment == uuid // returns the transaction from array in which the comment is our uuid
//         })

//         console.log('[poll] found entry:', found)

//         if (found) {
//             return 'success'
//         }

//         // not yet found, wait a bit
//         await new Promise(r => setTimeout(r, 3000))
//     }

//     throw new Error('Timeout waiting for on‑chain UUID')
// }

// // ——— Deposit flow ———
// async function onDeposit(amount) {
//     console.log(ton.value, user)
//     // 1) If no wallet yet, open selector
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet();   // :contentReference[oaicite:4]{index=4}
//         } catch (e) {
//             console.error("Could not connect:", e);
//         }
//         return;
//     }
//     if (!ton.value) return
//     // if (!ton.value || !user) return
//     console.log('NOOOO')

//     const amountTON = amount
//     const txId = uuidv4()

//     console.log(txId)

//     let parsedAddress
//     if (walletAddress.value !== null) {
//         parsedAddress = (Address.parse(walletAddress.value)).toString({ urlSafe: true, bounceable: false })
//     }

//     // 1) insert "Pending"
//     await supabase.from('transactions').insert({
//         uuid: txId,
//         user_id: user?.id ?? 99,
//         amount: amountTON,
//         status: 'Payment Pending',
//         type: 'Deposit',
//         deposit_address: parsedAddress,
//         created_at: new Date().toISOString()
//     })

//     // 2) build TON payload with the comment = UUID
//     const commentCell = beginCell()
//         .storeUint(0, 32)
//         .storeStringTail(txId)
//         .endCell()

//     const req = {
//         validUntil: Math.floor(Date.now() / 1000) + 600,
//         network: 'mainnet',
//         messages: [{
//             address: HOT_WALLET,
//             amount: toNano(amountTON).toString(),
//             payload: commentCell.toBoc().toString('base64')
//         }]
//     }

//     console.log(req)
//     console.log(req.messages.payload)

//     try {
//         // 3) prompt wallet & broadcast
//         await ton.value.sendTransaction(req)
//         console.log('[deposit] transaction sent, now polling for UUID…')

//         // 4) wait until the on‑chain message with TextComment=txId appears
//         const status = await waitForUUID(txId)
//         console.log('[deposit] on-chain status is', status)

//         if (status !== 'success') {
//             // Transaction failed on chain
//             await supabase
//                 .from('transactions')
//                 .update({ status: 'Failed' })
//                 .eq('uuid', txId)
//             alert('Transaction failed on‑chain; no points awarded.')
//             return
//         }

//         // 6) on‑chain success → mark Completed
//         await supabase
//             .from('transactions')
//             .update({ status: 'Payment Completed' })
//             .eq('uuid', txId)

//         let newPoints = app.points + 10
//         const { error: updErr } = await supabase
//             .from('users')
//             .update({ points: newPoints })
//             .eq('telegram', user?.id ?? 99)
//         if (updErr) {
//             console.error('Error updating points:', updErr)
//         } else {
//             app.points += 10
//         }

//     } catch (e) {
//         if (e instanceof UserRejectsError) {
//             // user cancelled
//             await supabase
//                 .from('transactions')
//                 .update({ status: 'Payment Cancelled' })
//                 .eq('uuid', txId)
//             console.warn('[deposit] user rejected tx')
//         } else {
//             console.error('Transaction error:', e)
//         }
//     }
// }

// async function onDepositStars(amount) {
//     try {
//         // 1. fetch the invoice URL from your backend
//         const invoiceLink = await fetchInvoiceLink(amount)
//         console.log(invoiceLink)
//         // 2. open the invoice in the Mini App
//         //    the 2nd arg is an optional callback that receives a status string
//         tg.openInvoice(invoiceLink, (status) => {
//             if (status === 'paid') {
//                 console.log('🎉 Payment successful for', amount * 2, 'Coins!')
//             }
//             // otherwise do nothing
//         })
//     }
//     catch (err) {
//         console.error('Failed to create or open invoice:', err)
//     }
// }

// function canRequestWithdrawal(lastWithdrawalRequest) {
//     const MS_PER_DAY = 24 * 60 * 60 * 1000;
//     const now = Date.now();
//     const last = new Date(lastWithdrawalRequest).getTime();
//     const elapsed = now - last;

//     if (elapsed >= MS_PER_DAY) {
//         // more than 24h have passed
//         return true;
//     }

//     // compute remaining time
//     const remainingMs = MS_PER_DAY - elapsed;
//     const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
//     const remainingMinutes = Math.floor(
//         (remainingMs % (60 * 60 * 1000)) / (60 * 1000)
//     );

//     alert(
//         `You may request a new withdrawal in ${remainingHours}h ${remainingMinutes}m.`
//     );
//     return false;
// }

// // ——— Withdraw flow ———
// async function onWithdraw(amount) {
//     // 1) If no wallet yet, open selector
//     console.log('Hello??' + parseWalletAddress(walletAddress.value))
//     if (!walletAddress.value) {
//         try {
//             await ton.value.connectWallet();   // :contentReference[oaicite:5]{index=5}
//         } catch (e) {
//             console.error("Could not connect:", e);
//         }
//         return;
//     }

//     if (app.points < amount) {
//         alert(`Insufficient points (need ≥ ${amount})`)
//         return
//     }

//     // if still on cooldown, exit early
//     if (!canRequestWithdrawal(lastWithdrawalRequest.value)) {
//         return;
//     }

//     const parsedAddress = (Address.parse(walletAddress.value)).toString({ urlSafe: true, bounceable: false })

//     const txId = uuidv4()
//     const amountTON = amount

//     lastWithdrawalRequest.value = new Date(Date.now()).toISOString()

//     await supabase
//         .from('users')
//         .update({ last_withdrawal_request: lastWithdrawalRequest.value })
//         .eq('telegram', user?.id ?? 99)

//     // insert withdrawal request
//     await supabase.from('transactions').insert({
//         uuid: txId,
//         user_id: user?.id ?? 99,
//         amount: amountTON,
//         status: 'Withdrawal Pending',
//         type: 'Withdrawal',
//         withdrawal_pending: true,
//         withdrawal_address: parsedAddress,
//         created_at: new Date().toISOString()
//     })

//     // deduct balance immediately
//     app.points -= amountTON
//     await supabase.from('users')
//         .update({ points: app.points })
//         .eq('telegram', user?.id ?? 99)
// }

// async function fetchTonBalance(address) {
//     if (address === null) return;
//     const url = new URL(`${TONCENTER}/getAddressBalance`);
//     url.searchParams.set('address', address);
//     url.searchParams.set('api_key', API_KEY);

//     const resp = await fetch(url.toString());
//     const json = await resp.json();
//     if (!json.ok) throw new Error(json.error || 'Balance fetch failed');

//     // json.result is a string of nanotons
//     const rawTon = Number(json.result) / 1e9;       // ⇒ TON as a Number
//     const roundedTon = Number(rawTon.toFixed(2));  // round to 2 decimal places

//     return roundedTon;
// }

// onMounted(async () => {
//     await loadTransactions()
//     lastWithdrawalRequest.value = await getLastWithdrawalTime()

//     // kill any orphaned widget roots
//     document.querySelectorAll('tc-widget-root').forEach(el => el.remove())

//     const defineCustomElement = CustomElementRegistry.prototype.define;
//     CustomElementRegistry.prototype.define = function define(name, constructor, options) {
//         if (name == 'tc-root') {
//             return;
//         }
//         return defineCustomElement.call(this, name, constructor, options);
//     };

//     setupTonConnectListener()

//     // Subscribe to realtime updates (Supabase JS v2)
//     if (user || !user) {
//         // Create or reuse a channel
//         const channel = supabase
//             .channel('transactions-' + user?.id ?? 99)            // a unique name
//             .on(
//                 'postgres_changes',                          // listen to Postgres changes
//                 {
//                     event: '*',                                // INSERT, UPDATE, DELETE
//                     schema: 'public',                          // your schema
//                     table: 'transactions',
//                     filter: `user_id=eq.${user?.id ?? 99}`            // only this user’s rows
//                 },
//                 async (payload) => {
//                     console.log('Realtime payload:', payload)
//                     await loadTransactions()
//                 }
//             )

//         // finally subscribe
//         channel.subscribe()
//     }

//     spinnerShow.value = false;
// })

// onActivated(async () => {
//     // every time DepositView is shown again…
//     console.log(ton.value)
//     console.log(walletAddress.value)
//     if (ton.value?.connected && walletAddress.value) {
//         const freshBal = await fetchTonBalance(walletAddress.value)
//         walletBalance.value = +freshBal.toFixed(2)
//     }
// })

// function setupTonConnectListener() {
//     // grab your one & only TonConnectUI
//     ton.value = getTonConnect();

//     // 2) only register status change once
//     if (!ton.value._statusListenerRegistered) {
//         ton.value._statusListenerRegistered = true
//         ton.value.onStatusChange(async (wallet) => {
//             walletAddress.value = wallet?.account.address || null
//             let parsedAddress
//             console.log(parseWalletAddress(walletAddress.value))
//             if (walletAddress.value !== null) {
//                 parsedAddress = (Address.parse(walletAddress.value)).toString({ urlSafe: true, bounceable: false })
//                 console.log('Мразь ' + parsedAddress)
//                 walletStatus.value = `Your wallet ${parsedAddress.slice(0, 4)}...${parsedAddress.slice(-3)}`
//                 const tonBal = await fetchTonBalance(walletAddress.value);
//                 walletBalance.value = +`${tonBal.toFixed(2)}`;
//             }
//             else {
//                 walletStatus.value = 'Connect your wallet'
//                 walletBalance.value = null
//             }

//             // update Supabase users.wallet_address
//             if (user || !user) {
//                 const { error } = await supabase
//                     .from('users')
//                     .update({ wallet_address: parsedAddress })
//                     .eq('telegram', user?.id ?? 99)
//                 console.log(parseWalletAddress(walletAddress.value) + ' Hey')
//                 if (error) {
//                     console.error('Error updating wallet_address:', error)
//                 }
//             }
//         })
//     }
//     else {
//         console.log('Wtf' + parseWalletAddress(walletAddress.value))
//     }
// }


</script>

<style lang="css" scoped>
.actions-top {
    color: white;
    width: 90vw;
    font-size: 1.5rem;
    margin: 1.5rem auto 0.75vh auto;
    font-family: 'Inter Variable', sans-serif;
}

.wallet-wrapper {
    position: relative;
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
    padding: 4px 0px 0px 25px;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.wallet-action-text {
    color: #ffffff;
    padding: 4px 25px 0px 0px;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
}

.wallet-balance-hint {
    color: white;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 400;
    opacity: 0.5;
    font-size: 1rem;
    align-self: center;
    text-align: center;
}

.wallet-balance {
    color: white;
    margin: 0;
    font-size: 2.25rem;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 600;
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
    font-family: 'Inter Variable', sans-serif;
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
    font-family: 'Inter Variable', sans-serif;
    color: white;
    background-color: rgb(255, 255, 255, 0.3);
}
</style>