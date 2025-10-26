// src/services/bets-requests.js
import { createNewEvent, placeBetNotification } from '@/api/requests'
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()
const BACKEND_URL = 'https://api.myoracleapp.com'

/**
 * Small fetch helper: timeout + JSON parsing + unified error shape.
 * Accepts `signal` to allow the caller to pass AbortController.
 */
async function apiFetch(path, { method = 'GET', body = null, signal = null, headers = {}, timeoutMs = 10000 } = {}) {
    const url = `${BACKEND_URL}${path}`
    const controller = new AbortController()
    const finalSignal = signal ?? controller.signal
    const id = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const opts = { method, headers: { ...headers }, signal: finalSignal }
        if (body != null) {
            opts.body = typeof body === 'string' ? body : JSON.stringify(body)
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json'
        }
        const resp = await fetch(url, opts)
        const text = await resp.text().catch(() => null)
        let json = null
        try { json = text ? JSON.parse(text) : null } catch (e) { json = null }

        if (!resp.ok) {
            const err = new Error(`HTTP ${resp.status}`)
            err.status = resp.status
            err.body = json ?? text
            throw err
        }
        return { ok: true, status: resp.status, data: json, rawText: text }
    } catch (err) {
        if (err.name === 'AbortError') {
            const e = new Error('Request aborted/timed out')
            e.name = 'AbortError'
            throw e
        }

        // If fetch's response created an error earlier we set err.status/body there,
        // but ensure we pass it through and include textual body if available.
        // Some bundlers present Response-derived errors differently; normalize:
        const e = new Error(err.message || 'Network error')
        e.original = err
        // preserve status/body if present
        if (err.status) e.status = err.status
        if (err.body) e.body = err.body
        throw e
    } finally {
        clearTimeout(id)
    }
}

export async function requestCreateBet(eventObj, { timeoutMs = 10000 } = {}) {
    if (!user) return
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const payload = {
            telegram: Number(user?.id),
            name: String(eventObj.name),
            descriptionCondition: String(eventObj.descriptionCondition),
            descriptionPeriod: String(eventObj.descriptionPeriod),
            descriptionContext: String(eventObj.descriptionContext),
            side: String(eventObj.side),
            stake: String(Number(eventObj.stake).toFixed(2)),
            gifts_bet: eventObj.gifts_bet
        }

        // createNewEvent (in src/api/requests.js) calls /api/create-event
        const resp = await createNewEvent(controller, payload)

        clearTimeout(id);

        let body = null;
        try { body = await resp.json(); } catch (e) { body = null; }

        if (resp.ok) {
            return { ok: true, status: resp.status, data: body };
        }

        const errCode = body?.error || 'server_error';
        const message = body?.message || (body?.error_description || 'Server returned an error');
        return { ok: false, status: resp.status, error: errCode, message, data: body };

    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            return { ok: false, status: 0, error: 'timeout', message: 'Request timed out' };
        }
        return { ok: false, status: 0, error: 'network_error', message: String(err.message || err) };
    }
}

export async function fetchActiveBets({ offset = 0, limit = 10 } = {}) {
    const to = offset + limit - 1
    try {
        const resp = await apiFetch(`/api/bets/active?offset=${offset}&limit=${limit}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('fetchActiveBets error', err)
        throw err
    }
}

export async function fetchPastBets({ offset = 0, limit = 8 } = {}) {
    try {
        const resp = await apiFetch(`/api/bets/past?offset=${offset}&limit=${limit}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('fetchPastBets error', err)
        throw err
    }
}

export async function fetchCreatedEvents({ offset = 0, limit = 8 } = {}) {
    if (!user) return []
    try {
        const resp = await apiFetch(`/api/bets/created?telegram=${encodeURIComponent(user?.id)}&offset=${offset}&limit=${limit}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('fetchCreatedEvents error', err)
        throw err
    }
}

export async function getBetsHolders(betId) {
    if (betId === undefined || betId === null) return []
    try {
        const resp = await apiFetch(`/api/bets/get-holders/${encodeURIComponent(betId)}`, { method: 'GET' })
        console.log('The responce from bets holders is: ' + resp)
        console.log('The new value for holders.value is: ' + resp.data?.rows ?? [])
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getBetsHolders error', err)
        throw err
    }
}

export async function getUsersActiveBets() {
    if (!user) return []
    try {
        const resp = await apiFetch(`/api/bets/user-active?telegram=${encodeURIComponent(user?.id)}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getUsersActiveBets error', err)
        throw err
    }
}

export async function getUsersHistoryBets() {
    if (!user) return []
    try {
        const resp = await apiFetch(`/api/bets/user-history?telegram=${encodeURIComponent(user?.id)}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getUsersHistoryBets error', err)
        throw err
    }
}

export async function getBetById(betId) {
    try {
        const resp = await apiFetch(`/api/bets/information/${encodeURIComponent(betId)}`, { method: 'GET' })
        return resp.data?.row ?? null
    } catch (err) {
        console.error('getBetById error', err)
        throw err
    }
}

export async function placeBetRequest(betId, side, stake, placed_gifts) {
    if (!user) return
    if (!betId || !side) throw new Error('missing args');
    if (!stake && !placed_gifts) throw new Error('missing args');

    try {
        const body = {
            p_telegram: Number(user?.id),
            p_bet_id: Number(betId),
            p_side: String(side),
            p_stake: stake ? String(Number(stake).toFixed(2)) : null,
            p_photo_url: user?.photo_url ?? null,
            p_username: user?.username ?? 'Anonymous',
            p_placed_gifts: placed_gifts ?? null
        }

        const resp = await apiFetch('/api/bets/place', { method: 'POST', body })
        const { placed_bets = [], points = 0, volume = {}, tickets = 0, raw } = resp.data ?? {}

        // Send notification (existing client function calls backend /api/bet-placed)
        try {
            const payload = JSON.stringify({
                telegram: Number(user?.id ?? 0),
                bet_id: Number(betId),
                side: String(side),
                stake: String(Number(stake).toFixed(2)),
                placed_gifts: placed_gifts,
                chat_id: '@myoracle_chat'
            })
            // placeBetNotification (from src/api/requests) posts to /api/bet-placed
            await placeBetNotification(payload)
        } catch (err) {
            // non-fatal; log and continue
            console.warn('placeBetRequest: notification error', err)
        }

        return {
            placed_bets,
            points: parseFloat(points),
            volume,
            tickets
        }
    } catch (err) {
        console.error('placeBetRequest error', err)
        throw err
    }
}

/* caching helper used by availableComments */
let _cachedBets = null
async function _refreshCachedBets() {
    if (!user) return []
    try {
        const resp = await apiFetch(`/api/user/placed-bets?telegram=${encodeURIComponent(user?.id)}`, { method: 'GET' })
        // server should return { placed_bets: [...] } but in case return array
        _cachedBets = resp.data?.placed_bets ?? resp.data ?? []
    } catch (err) {
        console.warn('_refreshCachedBets error', err)
        _cachedBets = []
    }
}

export async function availableComments(betId) {
    if (!user) return false
    if (_cachedBets === null) {
        await _refreshCachedBets()
    }
    const hasBet = (_cachedBets || []).some(b => Number(b.bet_id) === Number(betId))
    return hasBet
}

export async function getUserBetAmount(betId) {
    if (!user) return
    try {
        const resp = await apiFetch(`/api/bets/user-bet-amount?telegram=${encodeURIComponent(user?.id)}&betId=${encodeURIComponent(betId)}`, { method: 'GET' })
        return resp.data ?? { stake: 0, placed_gifts: [], result: "0" }
    } catch (err) {
        console.error('getUserBetAmount error', err)
        if (err.body) {
            console.error('server returned body:', err.body)
        }
        throw err
    }
}

export async function getUserLastCommentTime(userTelegramId) {
    if (!userTelegramId) return null
    try {
        const resp = await apiFetch(`/api/user/last-comment?telegram=${encodeURIComponent(userTelegramId)}`, { method: 'GET' })
        return resp.data?.last_commented_at ?? null
    } catch (err) {
        console.error('getUserLastCommentTime error:', err)
        throw err
    }
}

export async function postNewComment(betId, text, commentId, usersStake = null) {
    if (!user) return
    try {
        const body = {
            betId,
            text,
            commentId,
            usersStake,
            telegram: Number(user?.id),
            username: user?.username ?? 'Anonymous',
            photo_url: user?.photo_url ?? null
        }
        const resp = await apiFetch('/api/comments', { method: 'POST', body })
        return resp.data?.comment ?? null
    } catch (err) {
        // if COOLDOWN returned as 403 with body, normalize
        if (err.status === 403 && err.body && err.body.error === 'COOLDOWN') {
            const e = new Error('Cooldown active')
            e.code = 'COOLDOWN'
            e.remaining = err.body.remaining
            throw e
        }
        console.error('postNewComment error', err)
        throw err
    }
}

export async function deleteComment(commentId) {
    if (!user) return
    try {
        const resp = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}?telegram=${encodeURIComponent(user?.id)}`, { method: 'DELETE' })
        return resp.data?.deleted === true
    } catch (err) {
        if (err.status === 403 && err.body && err.body.error === 'DELETION_EXPIRED') {
            const e = new Error('Deletion window expired (48 hours)')
            e.code = 'DELETION_EXPIRED'
            throw e
        }
        console.error('deleteComment error', err)
        throw err
    }
}

export async function getComments(betId, page = 0, pageSize = 10) {
    try {
        const resp = await apiFetch(`/api/comments?betId=${encodeURIComponent(betId)}&page=${page}&pageSize=${pageSize}`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getComments error', err)
        throw err
    }
}
