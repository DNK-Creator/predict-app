// src/services/bets-requests.js
import { apiFetch, placeBetNotification } from '@/api/requests'
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

/**
 * Create bet request — uses shared apiFetch which attaches Authorization header and enforces timeout.
 * Returns { ok: true, status, data } on success, or { ok: false, status, error, message, data? } on failure.
 */
export async function requestCreateBet(eventObj, { timeoutMs = 10000 } = {}) {
    if (!user) {
        return { ok: false, status: 0, error: 'no_user', message: 'No telegram user available' }
    }

    // Build payload defensively
    const payload = {
        name: String(eventObj?.name ?? '').trim(),
        descriptionCondition: String(eventObj?.descriptionCondition ?? '').trim(),
        descriptionPeriod: String(eventObj?.descriptionPeriod ?? '').trim(),
        descriptionContext: String(eventObj?.descriptionContext ?? '').trim(),
        side: String(eventObj?.side ?? '').trim(),
        stake: String(Number(eventObj?.stake ?? 0).toFixed(2)),
        gifts_bet: eventObj?.gifts_bet ?? null
    }

    try {
        const resp = await apiFetch('/api/create-event', {
            method: 'POST',
            body: payload,
            timeoutMs
        })

        // success
        if (resp && resp.ok) {
            return { ok: true, status: resp.status, data: resp.data }
        }

        // defensive: handle unexpected non-throwing resp shape (unlikely)
        return {
            ok: false,
            status: resp?.status ?? 0,
            error: resp?.data?.error ?? 'server_error',
            message: resp?.data?.message ?? 'Server returned an error',
            data: resp?.data ?? null
        }
    } catch (err) {
        // timeout / abort
        if (err && err.name === 'AbortError') {
            return { ok: false, status: 0, error: 'timeout', message: 'Request timed out' }
        }

        // if apiFetch threw a structured error (with status/body), preserve it
        const status = err?.status ?? 0
        const body = err?.body ?? null
        const errCode = body?.error ?? 'network_error'
        const message = body?.message ?? (err?.message ?? 'Network error')

        return { ok: false, status, error: errCode, message, data: body }
    }
}

export async function fetchActiveBets({ offset = 0, limit = 10 } = {}) {
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
    try {
        const resp = await apiFetch(`/api/bets/created?offset=${encodeURIComponent(offset)}&limit=${encodeURIComponent(limit)}`, {
            method: 'GET'
        });
        return resp.data?.rows ?? [];
    } catch (err) {
        console.error('fetchCreatedEvents error', err);
        throw err;
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
        const resp = await apiFetch(`/api/bets/user-active`, { method: 'GET' })
        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getUsersActiveBets error', err)
        throw err
    }
}

export async function getUsersHistoryBets() {
    if (!user) return []
    try {
        const resp = await apiFetch(`/api/bets/user-history`, { method: 'GET' })
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
            p_bet_id: Number(betId),
            p_side: String(side),
            p_stake: stake ? String(Number(stake).toFixed(2)) : null,
            p_placed_gifts: placed_gifts ?? null
        }

        const resp = await apiFetch('/api/bets/place', { method: 'POST', body })
        const { placed_bets = [], points = 0, volume = {}, tickets = 0 } = resp.data ?? {}

        // Send notification (existing client function calls backend /api/bet-placed)
        try {
            const payload = JSON.stringify({
                bet_id: Number(betId),
                side: String(side),
                stake: String(Number(stake).toFixed(2)),
                placed_gifts: placed_gifts
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
        const resp = await apiFetch(`/api/user/placed-bets`, { method: 'GET' })
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
        const resp = await apiFetch(`/api/bets/user-bet-amount?betId=${encodeURIComponent(betId)}`, { method: 'GET' })
        return resp.data ?? { stake: 0, placed_gifts: [], result: "0" }
    } catch (err) {
        console.error('getUserBetAmount error', err)
        if (err.body) {
            console.error('server returned body:', err.body)
        }
        throw err
    }
}

export async function getUserLastCommentTime() {
    try {
        const resp = await apiFetch(`/api/user/last-comment`, { method: 'GET' })
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
            usersStake
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
        const resp = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
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
        const resp = await apiFetch(`/api/bets/${betId}/comments?page=${page}&pageSize=${pageSize}`, { method: 'GET' })

        return resp.data?.rows ?? []
    } catch (err) {
        console.error('getComments error', err)
        throw err
    }
}
