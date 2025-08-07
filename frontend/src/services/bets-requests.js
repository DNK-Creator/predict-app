// src/services/bets-requests.js
import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'
import { parseISO, differenceInMilliseconds } from 'date-fns'

const { user } = useTelegram()

let _cachedBets = null

export async function getUsersActiveBets() {
    // 1️⃣ fetch the user’s placed_bets
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id ?? 99)
        .single();
    if (userError) throw userError;

    // 2️⃣ pull out the bet IDs
    const betIds = (userData.placed_bets || []).map(b => b.bet_id);
    if (betIds.length === 0) return [];

    // 3️⃣ fetch bets whose prizes_given = false
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('id, name, date')
        .in('id', betIds)
        .eq('prizes_given', false);
    if (betsError) throw betsError;

    // 4️⃣ merge in each user’s stake & side
    return bets.map(bet => {
        const entry = userData.placed_bets.find(e => e.bet_id === bet.id);
        return {
            id: bet.id,
            name: bet.name,
            date: bet.date,            // a string “YYYY‑MM‑DD”
            stake: entry.stake,
            side: entry.side,
        };
    });
}

export async function getUsersHistoryBets() {
    // 1️⃣ fetch placed_bets
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id ?? 99)
        .single()
    if (userError) throw userError

    const entries = userData.placed_bets || []
    const betIds = entries.map(e => e.bet_id)
    if (!betIds.length) return []

    // 2️⃣ fetch only resolved bets
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('id, name, date, result, prizes_given')
        .in('id', betIds)
        .eq('prizes_given', true)
    if (betsError) throw betsError

    // 3️⃣ merge stake/side + compute win/lose
    return bets.map(bet => {
        const e = entries.find(x => x.bet_id === bet.id)
        const won = e?.side === bet.result
        return {
            id: bet.id,
            name: bet.name,
            date: bet.date,
            stake: e.stake,
            side: e.side,
            won
        }
    })
}

// 1) Fetch the bet’s static info
export async function getBetById(betId) {
    const { data, error } = await supabase
        .from('bets')
        .select('id, name, description, image_path, result, prizes_given, date, volume, close_time, current_odds')
        .eq('id', betId)
        .single()
    if (error) throw error
    return data
}

/**
 * Given an ISO timestamp for close_time,
 * returns either:
 *   - "Closed"         (if past)
 *   - "X h Y m left"   (if still open)
 */
export function computeBetStatus(closeTimeIso) {
    if (!closeTimeIso) return '111'
    const now = new Date()
    const close = parseISO(closeTimeIso)
    const diffMs = differenceInMilliseconds(close, now)

    if (diffMs <= 0) {
        return '000'
    }

    if (diffMs >= 48 * 60 * 60 * 1000) {
        return '111'
    }

    const totalMins = Math.floor(diffMs / 60000)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60

    // e.g. "3 h 27 m left"
    return `${hours} h ${mins} m left`
}

// Fetch the JSON and transform into [{ timestamp, value }, …]
export async function getHistory(betId) {
    const { data, error } = await supabase
        .from('bets')
        .select('bet_history')
        .eq('id', betId)
        .single()

    if (error) throw error

    const historyObj = data.bet_history || {}
    // Convert and sort by timestamp ascending
    const historyArr = Object.entries(historyObj)
        .map(([ts, val]) => ({ timestamp: ts, value: val }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    return historyArr
}

export async function placeBetRequest(betId, side, stake) {
    // 0) Get the authenticated user

    // ─── NEW: 0.5) Fetch and check close_time ─────────────
    const { data: betMeta, error: timeErr } = await supabase
        .from('bets')
        .select('close_time')
        .eq('id', betId)
        .single()
    if (timeErr) throw timeErr

    const now = new Date()
    const closeTime = new Date(betMeta.close_time)
    if (now > closeTime) {
        throw new Error('Cannot place or update a bet after close_time')
    }

    // 1) Fetch placed_bets & points by Telegram ID
    const { data: profile, error: fetchErr } = await supabase
        .from('users')
        .select('placed_bets, points')
        .eq('telegram', user?.id ?? 99)
        .single()    // <- ensures a single object
    if (fetchErr) throw fetchErr

    // 2) Ensure enough points
    if ((profile.points || 0) < stake) {
        throw new Error('Insufficient points for this bet')
    }

    const existing = Array.isArray(profile.placed_bets) ? profile.placed_bets : []

    // 3) Find or append/update entry
    const idx = existing.findIndex((b) => b.bet_id === betId)
    let updatedBets

    if (idx >= 0) {
        if (existing[idx].side !== side) {
            throw new Error('Cannot bet the opposite side on the same market')
        }
        // same side ⇒ bump stake
        updatedBets = [...existing]
        updatedBets[idx] = {
            ...existing[idx],
            stake: existing[idx].stake + stake,
            placed_at: new Date().toISOString()
        }
    } else {
        updatedBets = [
            ...existing,
            { bet_id: betId, side, stake, placed_at: new Date().toISOString() }
        ]
    }

    // 4) Deduct points
    const updatedPoints = (profile.points || 0) - stake

    // 4) Now bump the bets.volume JSON
    // 4a) fetch current volume
    const { data: betRow, error: betErr } = await supabase
        .from('bets')
        .select('volume')
        .eq('id', betId)
        .single()
    if (betErr) throw betErr

    const currentVol = betRow.volume || { Yes: 0, No: 0 }
    const newVol = {
        ...currentVol,
        [side]: (currentVol[side] || 0) + stake
    }

    // 4b) write it back
    const { error: volErr } = await supabase
        .from('bets')
        .update({ volume: newVol })
        .eq('id', betId)
    if (volErr) throw volErr

    // 5) Write back—still filter on telegram ID
    const { error: updateErr } = await supabase
        .from('users')
        .update({ placed_bets: updatedBets, points: updatedPoints })
        .eq('telegram', user?.id ?? 99)
    if (updateErr) throw updateErr

    // 6) Refresh our in‑memory cache so cannotComment sees the new bet
    await _refreshCachedBets()

    return {
        placed_bets: updatedBets,
        points: updatedPoints,
        volume: newVol
    }
}

async function _refreshCachedBets() {
    const { data: profile, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id ?? 99)
        .single()

    if (error) throw error

    // normalize to empty array if null
    _cachedBets = Array.isArray(profile.placed_bets)
        ? profile.placed_bets
        : []
}

/**
 * Returns true if the user is NOT allowed to comment on betId
 * (i.e. they’ve NOT placed a bet), false otherwise.
 */
export async function availableComments(betId) {
    // lazy‑load cache on first call
    if (_cachedBets === null) {
        await _refreshCachedBets()
    }

    // check for an entry matching this betId
    const hasBet = _cachedBets.some(b => b.bet_id === +betId)
    return hasBet
}

// 6) Get current user’s stake & side on a specific bet
export async function getUserBetAmount(betId) {
    // 1) lookup the user’s placed_bets array by their Telegram ID
    const { data: profile, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id ?? 99)
        .single()

    if (error) throw error

    // 2) default if nothing there
    const placed = Array.isArray(profile.placed_bets) ? profile.placed_bets : []

    // 3) find the entry for this bet
    const entry = placed.find((b) => b.bet_id === +betId)

    // 4) if found, return its stake & side; otherwise default
    if (entry) {
        return {
            stake: entry.stake,
            result: entry.side
        }
    } else {
        return {
            stake: 0,
            result: "0"
        }
    }
}


// 3) Post a new comment
export async function postNewComment(betId, text, commentId) {
    const currentUserId = user?.id ?? 99
    const payload = {
        bet_id: betId,
        text,
        ...(currentUserId ? { user_id: currentUserId } : {}),
        created_at: new Date().toISOString(),
        id: commentId
    }
    const { data, error } = await supabase
        .from('comments')
        .insert(payload)
        .single()
    if (error) throw error
    return data
}

// 5) Delete own comment
export async function deleteComment(commentId) {
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
    if (error) throw error
}

// 4) Paginated fetch of comments (page 0 = first N)
export async function getComments(betId, page = 0, pageSize = 10) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
        .from('comments')
        .select('id, text, user_id, created_at')
        .eq('bet_id', betId)
        .order('created_at', { ascending: false })
        .range(from, to)
    if (error) throw error
    return data
}
