// services/useInventory.js
import { ref, watch } from 'vue'
import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'
import { useAppStore } from '@/stores/appStore'
import { v4 as uuidv4 } from 'uuid'

const inventory = ref([])
const loading = ref(false)
const error = ref(null)
let loadedOnce = false

let appendInProgress = false

function normalizeAndSort(invRaw) {
    if (!invRaw) return []
    const arr = Array.isArray(invRaw) ? invRaw.slice() : Object.values(invRaw || {})
    const normalized = arr.map((it, i) => ({
        uid: it.uid ?? it.id ?? `${Date.now()}-${i}`,
        type: it.type ?? it.id ?? 'unknown',
        name: it.name ?? (it.type ?? it.id ?? 'Unknown'),
        value: it.value ?? it.valueLabel ?? it.amount ?? '',
        created_at: it.created_at ?? it.added_at ?? it.addedAt ?? it.createdAt ?? null,
        __raw: it
    }))
    normalized.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0
        const tb = b.created_at ? Date.parse(b.created_at) : 0
        return tb - ta
    })
    return normalized
}

export function useInventory() {

    const { user } = useTelegram()
    const app = useAppStore()

    // load once whenever user becomes available
    watch(
        () => (user?.value ?? user),
        (val) => {
            if (val) {
                // load once for new user
                loadInventory().catch(err => {
                    error.value = err
                })
            } else {
                // reset on logout
                inventory.value = []
                loadedOnce = false
            }
        },
        { immediate: true }
    )

    async function loadInventory() {
        // Avoid multiple simultaneous identical loads
        if (loading.value) return
        const telegramId = user?.id ?? 99
        if (!telegramId) {
            inventory.value = []
            return
        }

        loading.value = true
        error.value = null

        const { data, error: err } = await supabase
            .from('users')
            .select('inventory')
            .eq('telegram', telegramId)
            .single()

        loading.value = false

        if (err) {
            console.error('loadInventory error', err)
            error.value = err
            inventory.value = []
            return
        }

        inventory.value = normalizeAndSort(Array.isArray(data?.inventory) ? data.inventory : data?.inventory ?? [])
        loadedOnce = true
        return inventory.value
    }

    /**
 * withdrawGift(gift)
 * - gift: object containing at least one of { uid, created_at, type } (prefer uid)
 * Behavior:
 * 1) Fetch user's current inventory
 * 2) Remove a single matching item (by uid if present, else by created_at, else first matching type)
 * 3) Update users.inventory in DB (read-modify-write)
 * 4) Insert a game_history row with type = 'Withdrawal'
 * 5) Sync local inventory ref
 */
    async function withdrawGift(gift) {
        if (!gift || typeof gift !== 'object') {
            throw new Error('withdrawGift: gift object required')
        }

        const telegramId = user?.id ?? 99
        if (!telegramId) throw new Error('withdrawGift: no telegram id available')

        // 1) fetch current inventory from DB (authoritative)
        const { data: fetchData, error: fetchErr } = await supabase
            .from('users')
            .select('inventory')
            .eq('telegram', telegramId)
            .single()

        if (fetchErr) {
            console.error('withdrawGift: fetch inventory error', fetchErr)
            throw fetchErr
        }

        const oldInv = Array.isArray(fetchData?.inventory) ? fetchData.inventory : []

        // 2) try to remove exactly one matching item
        let removed = false
        const updated = []
        // prefer matching by uid if provided
        const matchUid = gift.uid ?? null
        const matchCreatedAt = gift.created_at ?? null
        const matchType = (gift.type ?? gift.gift_id ?? '').toString().toLowerCase()

        for (const it of oldInv) {
            if (removed) {
                // already removed one, keep rest
                updated.push(it)
                continue
            }

            // item may use different key names in DB; normalize possible candidates
            const itUid = it.uid ?? it.id ?? null
            const itCreated = it.created_at ?? it.added_at ?? it.addedAt ?? null
            const itType = (it.type ?? it.id ?? '').toString().toLowerCase()

            // match priority: uid -> created_at -> type (first occurrence)
            if (matchUid && itUid && itUid === matchUid) {
                removed = true
                // skip pushing this item (removing it)
                continue
            }

            if (!removed && matchCreatedAt && itCreated && itCreated === matchCreatedAt) {
                removed = true
                continue
            }

            if (!removed && matchType && itType === matchType) {
                removed = true
                continue
            }

            // otherwise keep item
            updated.push(it)
        }

        if (!removed) {
            // nothing removed — return error so caller can decide
            const err = new Error('withdrawGift: item not found in server inventory')
            console.warn(err.message, { gift, oldInv })
            throw err
        }

        // 3) write back updated inventory to DB
        const { data: upData, error: upErr } = await supabase
            .from('users')
            .update({ inventory: updated })
            .eq('telegram', telegramId)
            .select('inventory')
            .single()

        if (upErr) {
            console.error('withdrawGift: update users.inventory error', upErr)
            throw upErr
        }

        // 4) insert game_history row for withdrawal
        const historyUuid = uuidv4()
        const historyPayload = {
            uuid: historyUuid,
            user_id: telegramId,
            user_points: app?.points ?? null,
            type: 'Withdrawal',
            gift_id: matchType || (gift.gift_id ?? null),
            processed_at: null
        }

        const { data: histData, error: histErr } = await supabase
            .from('game_history')
            .insert([historyPayload])

        if (histErr) {
            console.error('withdrawGift: insert game_history error', histErr)
            // NOTE: inventory removal already succeeded — bubble error to caller
            throw histErr
        }

        // 5) call backend botmessage endpoint to notify user
        // message text as requested
        const messageText = `Your request to withdraw ${gift.name} has been successfully accepted. Your gift will arrive within a day!`
        let botResult = null
        try {
            const resp = await fetch('https://api.giftspredict.ru/api/botmessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageText,
                    userID: String(telegramId)
                })
            })

            const json = await resp.json().catch(() => null)
            if (!resp.ok) {
                console.error('withdrawGift: botmessage endpoint returned error', resp.status, json)
                botResult = { ok: false, status: resp.status, details: json }
            } else {
                botResult = { ok: true, result: json?.result ?? json }
            }
        } catch (err) {
            console.error('withdrawGift: failed to call botmessage endpoint', err)
            botResult = { ok: false, error: String(err) }
        }

        // 6) update local inventory ref so UI stays in sync
        inventory.value = normalizeAndSort(Array.isArray(upData?.inventory) ? upData.inventory : [])

        // return some helpful info
        return {
            success: true,
            removedGift: gift,
            newInventory: inventory.value,
            historyRow: Array.isArray(histData) ? histData[0] : histData
        }
    }


    async function appendGift(item) {
        if (!item) throw new Error('appendGift: item required')
        if (appendInProgress) {
            console.warn('appendGift: append already in progress, skipping redundant call')
            return null
        }
        appendInProgress = true

        const telegramId = user?.id ?? 99
        if (!telegramId) {
            appendInProgress = false
            throw new Error('appendGift: no telegram id')
        }

        // Ensure created_at present
        const itemToSave = {
            ...item,
            created_at: item.created_at ?? new Date().toISOString()
        }

        // QUICK DEDUPE: if top item already same type+created_at, skip
        if (inventory.value.length > 0) {
            const top = inventory.value[0]
            if (top.type === itemToSave.type && top.created_at === itemToSave.created_at) {
                appendInProgress = false
                return inventory.value
            }
        }

        // --- optimistic local update: show user the new item immediately ---
        try {
            // Prepend locally so UI updates right away
            inventory.value = [itemToSave, ...inventory.value]

            // Try RPC (atomic)
            const { data: rpcData, error: rpcErr } = await supabase.rpc(
                'append_user_inventory_by_telegram',
                {
                    telegram_bigint: parseInt(telegramId, 10),
                    item: itemToSave
                }
            )

            if (rpcErr) {
                // RPC failed: log and fallback to read-modify-write update
                console.warn('appendGift: rpc failed, falling back to update. rpcErr:', rpcErr)

                // fetch current DB inventory
                const { data: fetchData, error: fetchErr } = await supabase
                    .from('users')
                    .select('inventory')
                    .eq('telegram', telegramId)
                    .single()

                if (fetchErr) {
                    console.error('appendGift fallback fetch error', fetchErr)
                    appendInProgress = false
                    throw fetchErr
                }

                const oldInv = Array.isArray(fetchData?.inventory) ? fetchData.inventory : []
                const updated = [itemToSave, ...oldInv]

                const { data: upData, error: updateErr } = await supabase
                    .from('users')
                    .update({ inventory: updated })
                    .eq('telegram', telegramId)
                    .select('inventory')
                    .single()

                if (updateErr) {
                    console.error('appendGift fallback update error', updateErr)
                    appendInProgress = false
                    throw updateErr
                }

                // sync local inventory with DB response
                inventory.value = normalizeAndSort(Array.isArray(upData?.inventory) ? upData.inventory : [])
                appendInProgress = false
                return inventory.value
            }

            // RPC succeeded — rpcData is updated inventory (jsonb array)
            inventory.value = normalizeAndSort(Array.isArray(rpcData) ? rpcData : rpcData ?? [])
            appendInProgress = false
            return inventory.value
        } catch (e) {
            // On unexpected error: remove any optimistic entry we added (best-effort)
            try {
                if (inventory.value[0] && inventory.value[0].created_at === itemToSave.created_at && inventory.value[0].type === itemToSave.type) {
                    inventory.value = inventory.value.slice(1)
                }
            } catch (_) { /* ignore */ }

            appendInProgress = false
            console.error('appendGift unexpected error', e)
            throw e
        }
    }

    // --- new: game_history logging helpers ---
    /**
     * logGameAttempt({ uuid, gift_id })
     * Inserts a new row into public.game_history with type = 'Game'.
     * uuid must be generated client-side (see RunningView.vue).
     */
    async function logGameAttempt({ uuid, gift_id = null } = {}) {
        if (!uuid) {
            throw new Error('logGameAttempt: uuid required')
        }

        // telegram user id (match your existing pattern)
        const telegramId = user?.id ?? 99
        const points = app?.points ?? null

        const payload = {
            uuid,
            user_id: telegramId,
            user_points: points,
            type: 'Game',
            gift_id: gift_id,
            processed_at: null
        }

        try {
            const { data, error } = await supabase
                .from('game_history')
                .insert([payload])

            if (error) {
                console.error('logGameAttempt insert error', error)
                throw error
            }
            return data
        } catch (err) {
            console.error('logGameAttempt unexpected error', err)
            throw err
        }
    }

    /**
     * updateGameAttemptType(uuid, newType)
     * Updates the row with matching uuid and sets `type` and `user_points` (keeps processed_at null)
     */
    async function updateGameAttemptType(uuid, newType) {
        if (!uuid) {
            console.warn('updateGameAttemptType: no uuid provided')
            return null
        }
        if (!newType) {
            console.warn('updateGameAttemptType: no newType provided')
            return null
        }

        try {
            const { data, error } = await supabase
                .from('game_history')
                .update({ type: newType })
                .eq('uuid', uuid)
                .select() // return updated row(s)
            if (error) {
                console.error('updateGameAttemptType error', error)
                throw error
            }
            return data
        } catch (err) {
            console.error('updateGameAttemptType unexpected error', err)
            throw err
        }
    }

    return {
        inventory,
        loading,
        error,
        loadInventory,
        appendGift,
        logGameAttempt,
        updateGameAttemptType,
        withdrawGift
    }
}
