<template>
    <!-- animated wrapper -->
    <transition name="history-fade" appear>
        <div v-show="showView" class="gifts-view-container">
            <GiftsInventoryTable :gifts="displayedGifts" :loaded="giftsShow" @open-relayer="openRelayerChat"
                @withdraw-complete="onWithdrawComplete" />
        </div>
    </transition>
</template>


<script setup>
import 'vue3-toastify/dist/index.css'
import { toast } from 'vue3-toastify'
import { ref, onMounted, onActivated, watch, nextTick } from 'vue'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import GiftsInventoryTable from '@/components/GiftsInventoryTable.vue'
import { getUsersInventory } from '@/api/requests'

const app = useAppStore()
const { user, tg } = useTelegram()

const spinnerShow = ref(true)
const giftsShow = ref(false)
const showView = ref(false)

const displayedGifts = ref([])

function openRelayerChat() {
    tg.openTelegramLink(`https://t.me/oracle_relayer`)
}

async function loadGifts() {
    if (!user) return
    try {
        displayedGifts.value = getUsersInventory()
    } catch (err) {
        console.error('Unexpected error in loadGifts:', err)
        displayedGifts.value = []
    }
}

/**
 * Handler for child's emit: { payload, result }
 * - optimistically removes the withdrawn gifts from UI (if uuids available)
 * - shows a success/info toast
 * - schedules a refresh (loadGifts) in 2 seconds to re-sync DB state
 */
function onWithdrawComplete(evt) {
    try {
        const payload = evt?.payload ?? null
        const result = evt?.result ?? null

        // If server indicated overall failure, show message and schedule a refresh anyway
        if (result && result.ok === false) {
            toast.error('Withdraw failed on server: ' + (result.error ?? 'unknown'))
            // schedule a refresh to reconcile state
            setTimeout(() => loadGifts().catch(() => toast.error('Failed to refresh inventory')), 2000)
            return
        }

        // optimistic UI removal if payload contains gift UUIDs
        const uuids = (payload?.gifts || []).map(g => g.uuid).filter(Boolean)
        if (uuids.length > 0) {
            displayedGifts.value = displayedGifts.value.filter(g => !uuids.includes(g.uuid))
        }

        // Inspect per-gift results if present and notify user accordingly
        let perGiftErrors = []
        if (result && Array.isArray(result.results)) {
            for (const r of result.results) {
                if (!r.ok) {
                    const id = r.gift ?? '(unknown)'
                    perGiftErrors.push(`${id}: ${r.error ?? 'failed'}`)
                }
            }
        }

        if (perGiftErrors.length > 0) {
            console.error(`Some gifts failed: ${perGiftErrors.slice(0, 3).join('; ')}${perGiftErrors.length > 3 ? '...' : ''}`)
            // toast.error(`Some gifts failed: ${perGiftErrors.slice(0, 3).join('; ')}${perGiftErrors.length > 3 ? '...' : ''}`)
        } else {
            console.log('Withdraw request submitted — inventory will refresh shortly')
        }

        // schedule re-sync after ~2 seconds to pick up final DB state
        setTimeout(async () => {
            try {
                await loadGifts()
                const refreshedTxt = app.language === 'ru' ? "Инвентарь обновлён." : "Inventory refreshed."
                toast.success(refreshedTxt)
            } catch (e) {
                console.error('refresh error', e)
                const refreshedTxt = app.language === 'ru' ? "Не удалось обновить инвентарь." : "Failed to refresh inventory."
                toast.error(refreshedTxt)
            }
        }, 2000)
    } catch (err) {
        console.error('onWithdrawComplete error', err)
        const unexpectedErrText = app.language === 'ru' ? "Неожиданная ошибка при завершении вывода." : "Unexpected error handling withdraw-complete."
        toast.error(unexpectedErrText)
        // attempt to re-sync
        setTimeout(() => loadGifts().catch(() => null), 2000)
    }
}

onMounted(async () => {
    await loadGifts()
    spinnerShow.value = false
    giftsShow.value = true
})

// toggle the view when spinner hides (avoid flicker by waiting a paint)
watch(spinnerShow, async (spinnerIsVisible) => {
    if (spinnerIsVisible) {
        showView.value = false
        return
    }
    await nextTick()
    requestAnimationFrame(() => { showView.value = true })
}, { immediate: true })

onActivated(async () => {
    showView.value = false
    await nextTick()
    requestAnimationFrame(() => { showView.value = true })
})

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

.gifts-view-container {
    /* keep layout same as before; use min-height if you need consistent height */
    min-height: 1px;
    margin-top: 1rem;
    height: 100%;
}

.loading-indicator {
    text-align: center;
    padding: 1rem;
    color: #7d7d7d;
    font-family: "Inter", sans-serif;
}

.end-of-list {
    text-align: center;
    padding: 1rem;
    color: #7d7d7d;
    font-family: "Inter", sans-serif;
    font-style: italic;
}
</style>