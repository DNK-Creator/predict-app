// src/api/requests.js (client side file)
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

const MY_ID = user?.id
const BACKEND_URL = 'https://api.myoracleapp.com'

async function apiFetch(path, { method = 'GET', body = null, signal = null, headers = {} } = {}) {
    const url = `${BACKEND_URL}${path}`
    const controller = new AbortController()
    const timeoutMs = 10000 // default timeout 10s; caller can pass signal to cancel earlier

    // If caller passed a signal, we want to race signals (caller signal OR our timeout)
    let racedSignal = controller.signal
    if (signal) {
        // race: if caller aborts, we abort our controller
        signal.addEventListener('abort', () => controller.abort())
    }

    const id = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const opts = { method, headers: { ...headers }, signal: racedSignal }
        if (body != null) {
            opts.body = typeof body === 'string' ? body : JSON.stringify(body)
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json'
        }

        const resp = await fetch(url, opts)

        // try parse JSON if possible
        const text = await resp.text().catch(() => null)
        let json = null
        try { json = text ? JSON.parse(text) : null } catch (err) { json = null }

        if (!resp.ok) {
            const err = new Error(`HTTP ${resp.status}`)
            err.status = resp.status
            err.body = json ?? text
            throw err
        }

        return { ok: true, status: resp.status, data: json, rawText: text }
    } catch (err) {
        // unify AbortError message
        if (err.name === 'AbortError') {
            const e = new Error('Request aborted/timed out')
            e.name = 'AbortError'
            throw e
        }
        throw err
    } finally {
        clearTimeout(id)
    }
}

export async function userFirstTimeOpening(telegramId) {
    const idToCheck = telegramId ?? user?.id ?? null
    if (!idToCheck) {
        console.warn('userFirstTimeOpening called without a telegram id; returning false')
        return false
    }

    try {
        const { data } = await apiFetch(`/api/user/first-time?telegram=${encodeURIComponent(idToCheck)}`)
        // server returns { isFirstTime: boolean }
        return Boolean(data?.isFirstTime)
    } catch (err) {
        console.error('userFirstTimeOpening error', err)
        return false
    }
}

export async function getOrCreateUser(languageCode = null) {
    try {
        const body = { telegram: Number(user?.id), language: languageCode ?? null }
        const { data } = await apiFetch('/api/user/get-or-create', { method: 'POST', body })
        // server returns the user row or null
        return data?.user ?? null
    } catch (err) {
        console.error('getOrCreateUser error', err)
        throw err
    }
}

export async function registerRef(inviterTelegram, inviterUsername, inviteeTelegram, inviteeUsername) {
    if (!inviterTelegram || !inviteeTelegram) {
        console.warn('registerRef: missing inviter or invitee id', inviterTelegram, inviteeTelegram)
        return
    }
    try {
        const payload = {
            inviter_telegram: Number(inviterTelegram),
            inviter_username: inviterUsername ?? 'Anonymous',
            invitee_telegram: Number(inviteeTelegram),
            invitee_username: inviteeUsername ?? 'Anonymous'
        }
        const { data } = await apiFetch('/api/user/register-ref', { method: 'POST', body: payload })
        return data?.result ?? null
    } catch (err) {
        console.error('registerRef error', err)
        throw err
    }
}

export async function getUsersPoints() {
    try {
        const resp = await apiFetch(`/api/user/points?telegram=${encodeURIComponent(user?.id)}`)
        return { data: resp.data?.row ?? null, error: null }
    } catch (err) {
        console.error('getUsersPoints error', err)
        return { data: null, error: err }
    }
}

export async function getUsersBetsSummary() {
    if (!MY_ID) return { countBets: 0, totalVolume: 0 }
    try {
        const resp = await apiFetch(`/api/user/bets-summary?telegram=${encodeURIComponent(MY_ID)}`)
        const { countBets = 0, totalVolume = 0 } = resp.data ?? {}
        return { countBets, totalVolume }
    } catch (err) {
        console.error('getUsersBetsSummary error', err)
        return { countBets: 0, totalVolume: 0 }
    }
}

export async function getUsersWonBetsCount() {
    if (!MY_ID) return 0
    try {
        const resp = await apiFetch(`/api/user/won-bets-count?telegram=${encodeURIComponent(MY_ID)}`)
        return resp.data?.bets_won ?? 0
    } catch (err) {
        console.error('getUsersWonBetsCount error', err)
        return 0
    }
}

export async function getUsersWalletAddress() {
    if (!MY_ID) return null
    try {
        const resp = await apiFetch(`/api/user/wallet-address?telegram=${encodeURIComponent(MY_ID)}`)
        return resp.data?.wallet_address ?? null
    } catch (err) {
        console.error('getUsersWalletAddress error', err)
        return null
    }
}

export async function getUsersByTelegrams(telegrams = []) {
    if (!Array.isArray(telegrams) || telegrams.length === 0) return []
    try {
        const { data } = await apiFetch('/api/users/by-telegrams', { method: 'POST', body: { telegrams } })
        return data?.rows ?? []
    } catch (err) {
        console.error('getUsersByTelegrams error', err)
        return []
    }
}

export async function updateUsersWallet(wallet_to_update) {
    try {
        await apiFetch('/api/user/update-wallet', {
            method: 'POST',
            body: { telegram: user?.id, wallet_address: wallet_to_update }
        })
    } catch (err) {
        console.error('updateUsersWallet error: ', err)
    }
}

export async function getGiftsPrices() {
    try {
        const resp = await apiFetch('/api/gifts/prices')
        return Array.isArray(resp.data?.prices) ? resp.data.prices : []
    } catch (err) {
        console.error('getGiftsPrices error: ', err)
        return []
    }
}

export async function getUsersInventory() {
    if (!user?.id) return []
    try {
        const resp = await apiFetch(`/api/user/inventory?telegram=${encodeURIComponent(user?.id)}`)
        return resp.data?.inventory ?? []
    } catch (err) {
        console.error('getUsersInventory error: ', err)
        return []
    }
}

export async function isBetAvailable(numericId) {
    try {
        const resp = await apiFetch(`/api/bet/${encodeURIComponent(numericId)}/availability`)
        return { data: resp.data, error: null }
    } catch (err) {
        console.error('isBetAvailable error', err)
        return { data: null, error: err }
    }
}

export async function updateUsername(name) {
    try {
        const resp = await apiFetch('/api/user/update-username', {
            method: 'POST',
            body: { telegram: user?.id, username: name }
        })
        return resp.data?.ok ? null : new Error('update failed')
    } catch (err) {
        console.error('updateUsername error', err)
        return err
    }
}

export async function getUsersLanguage() {
    try {
        const resp = await apiFetch(`/api/user/language?telegram=${encodeURIComponent(user?.id)}`)
        return { data: resp.data?.language ?? null, error: null }
    } catch (err) {
        console.error('getUsersLanguage error', err)
        return { data: null, error: err }
    }
}

export async function changeUsersLanguage(code) {
    try {
        const resp = await apiFetch('/api/user/change-language', { method: 'POST', body: { telegram: user?.id, language: code } })
        return { error: resp.data?.error ?? null }
    } catch (err) {
        console.error('changeUsersLanguage error', err)
        return { error: err }
    }
}

export async function fetchUserReferrals() {
    try {
        const resp = await apiFetch(`/api/user/referrals?telegram=${encodeURIComponent(user?.id)}`)
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchUserReferrals error', err)
        return { data: null, error: err }
    }
}

export async function fetchBetsHolders(from = 0, to = 19) {
    try {
        const resp = await apiFetch(`/api/bets-holders?from=${from}&to=${to}`)
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchBetsHolders error', err)
        return { data: null, error: err }
    }
}

export async function fetchAllHolidays() {
    try {
        const resp = await apiFetch('/api/holidays')
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchAllHolidays error', err)
        return { data: null, error: err }
    }
}

export async function fetchUsersTransactions(appObj) {
    try {
        const resp = await apiFetch(`/api/user/transactions?telegram=${encodeURIComponent(user?.id)}`)
        appObj.transactions = resp.data?.rows ?? []
    } catch (err) {
        console.error('fetchUsersTransactions error: ' + err)
        appObj.transactions = []
    }
}

export async function checkUserInChannel() {
    const url = `${BACKEND_URL}/api/channelMembership?userId=${user?.id}`
    const resp = await fetch(url)

    return resp
}

export async function fetchTonPrice() {
    const resp = await fetch(`${BACKEND_URL}/api/tonprice`)

    return resp
}

export async function getGiftInfo(gift_slug) {
    const resp = await fetch(`${BACKEND_URL}/api/telegram/nft/${encodeURIComponent(gift_slug)}`)

    return resp
}

export async function withdrawUsersGifts(withdrawal_payload) {
    const resp = await fetch(`${BACKEND_URL}/api/withdraw-gifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withdrawal_payload),
    })

    return resp
}

export async function payStarsForWithdrawal(stars_payload) {
    const resp = await fetch(`${BACKEND_URL}/api/pay-withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stars_payload)
    })

    return resp
}

export async function withdrawUserTon(amount, amount_cut, parsedAddress, idempotencyKey) {
    const resp = await fetch(`${BACKEND_URL}/api/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            telegram: user?.id,
            amount,
            amount_cut,
            address: parsedAddress,
            idempotencyKey
        })
    })

    return resp
}

export async function depositUserStars(amountStarsRounded) {
    const resp = await fetch(`${BACKEND_URL}/api/stars-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountStars: amountStarsRounded, user_id: user?.id })
    })

    return resp
}

export async function createDepositIntent(controller, amount, userParsedAddr) {
    const resp = await fetch(`${BACKEND_URL}/api/deposit-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, user_id: user?.id, usersWallet: userParsedAddr }),
        signal: controller.signal,
    })

    return resp
}

export async function cancelDepositIntent(controller, txId) {
    const resp = await fetch(`${BACKEND_URL}/api/deposit-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId }),
        signal: controller.signal,
    })

    return resp
}

export async function fetchUsersBalanceWalletTon(address, { signal = null, timeoutMs = 10000 } = {}) {
    if (!address) throw new Error('address required')

    const url = `${BACKEND_URL}/api/balance?address=${encodeURIComponent(address)}`
    const controller = new AbortController()
    const finalSignal = signal ?? controller.signal
    const id = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const resp = await fetch(url, { method: 'GET', signal: finalSignal })
        return resp
    } catch (err) {
        // Normalize abort error
        if (err.name === 'AbortError') {
            const e = new Error('Request aborted/timed out')
            e.name = 'AbortError'
            throw e
        }
        throw err
    } finally {
        clearTimeout(id)
    }
}

export async function sendBotMessage(messageText) {
    const resp = await fetch(`${BACKEND_URL}/api/botmessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText, userID: user?.id }),
    })

    return resp
}

export async function createStarsDepositLink(amount) {
    const resp = await fetch(`${BACKEND_URL}/api/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    })

    return resp
}

export async function placeBetNotification(bet_info_payload) {
    const resp = await fetch(`${BACKEND_URL}/api/bet-placed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bet_info_payload,
    })

    return resp
}

export async function createNewEvent(controller, payload) {
    const resp = await fetch(`${BACKEND_URL}/api/create-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload)
    })

    return resp
}