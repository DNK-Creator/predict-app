// src/services/bets-requests.js
import supabase from '@/services/supabase'
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

let _cachedBets = null

// client-side: utils/requestCreateBet.js (or inline)
export async function requestCreateBet(eventObj, { timeoutMs = 10000 } = {}) {
    if (!user) return
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const resp = await fetch('https://api.giftspredict.ru/api/create-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                telegram: Number(user?.id),
                name: String(eventObj.name),
                descriptionCondition: String(eventObj.descriptionCondition),
                descriptionPeriod: String(eventObj.descriptionPeriod),
                descriptionContext: String(eventObj.descriptionContext),
                side: String(eventObj.side),
                stake: String(Number(eventObj.stake).toFixed(2)),
                gifts_bet: eventObj.gifts_bet
            })
        });

        clearTimeout(id);

        let body = null;
        try {
            body = await resp.json();
        } catch (e) {
            body = null;
        }

        if (resp.ok) {
            return { ok: true, status: resp.status, data: body };
        }

        // for non-2xx responses, normalize error object
        const errCode = body?.error || 'server_error';
        const message = body?.message || (body?.error_description || 'Server returned an error');
        return { ok: false, status: resp.status, error: errCode, message, data: body };

    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            return { ok: false, status: 0, error: 'timeout', message: 'Request timed out' };
        }
        // network failure
        return { ok: false, status: 0, error: 'network_error', message: String(err.message || err) };
    }
}

export async function fetchActiveBets({ offset = 0, limit = 10 } = {}) {
    const to = offset + limit - 1
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('result', 'undefined')
        .eq('is_approved', true)
        .order('volume_number', { ascending: false })
        .range(offset, to)

    if (error) throw error
    return data || []
}

export async function fetchPastBets({ offset = 0, limit = 8 } = {}) {
    const to = offset + limit - 1
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .neq('result', 'undefined')
        .eq('is_approved', true)
        .order('volume_number', { ascending: false })
        .range(offset, to)

    if (error) throw error
    return data || []
}

export async function fetchCreatedEvents({ offset = 0, limit = 8 } = {}) {
    if (!user) return []
    const to = offset + limit - 1
    const { data, error } = await supabase
        .from('bets')
        .select('id, name, name_en, description, creator_first_stake, creator_side, is_approved, status')
        .eq('creator_telegram', user?.id)
        .order('creator_first_stake', { ascending: false })
        .range(offset, to)

    if (error) throw error
    return data || []
}

// Fetch all rows from bets_holders for a given bet_id
export async function getBetsHolders(betId) {
    // defensive: accept string or number
    if (betId === undefined || betId === null) return []

    const { data, error } = await supabase
        .from('bets_holders')
        .select('id, created_at, user_id, bet_id, stake, giveaway_tickets, side, username, photo_url')
        .eq('bet_id', betId)
        .order('stake', { ascending: false }) // oldest first; change if you prefer newest first

    if (error) throw error
    return data || []
}

export async function getUsersActiveBets() {
    if (!user) return []
    // 1️⃣ fetch the user’s placed_bets
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id)
        .single();
    if (userError) throw userError;

    // 2️⃣ pull out the bet IDs
    const betIds = (userData.placed_bets || []).map(b => b.bet_id);
    if (betIds.length === 0) return [];

    // 3️⃣ fetch bets whose prizes_given = false
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('id, name, name_en, date')
        .in('id', betIds)
        .eq('prizes_given', false);
    if (betsError) throw betsError;

    // 4️⃣ merge in each user’s stake & side
    return bets.map(bet => {
        const entry = userData.placed_bets.find(e => e.bet_id === bet.id);
        return {
            id: bet.id,
            name: bet.name,
            name_en: bet.name_en,
            date: bet.date,            // a string “YYYY‑MM‑DD”
            stake: entry.stake,
            side: entry.side,
        };
    });
}

export async function getUsersHistoryBets() {
    if (!user) return []
    // 1️⃣ fetch placed_bets
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id)
        .single()
    if (userError) throw userError

    const entries = userData.placed_bets || []
    const betIds = entries.map(e => e.bet_id)
    if (!betIds.length) return []

    // 2️⃣ fetch only resolved bets
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('id, name, name_en, date, result, prizes_given')
        .in('id', betIds)
        .eq('prizes_given', true)
    if (betsError) throw betsError

    // 3️⃣ merge stake/side + compute win/lose (case-insensitive comparison)
    return bets.map(bet => {
        // tolerant id compare (handles string/number mix)
        const e = entries.find(x => x.bet_id == bet.id)

        // normalize both sides to lowercase trimmed strings
        const entrySide = e && e.side ? String(e.side).trim().toLowerCase() : null
        const betResult = bet.result ? String(bet.result).trim().toLowerCase() : null

        const won = entrySide && betResult ? entrySide === betResult : false

        return {
            id: bet.id,
            name: bet.name,
            name_en: bet.name_en,
            date: bet.date,
            stake: e ? e.stake : 0,
            side: e ? e.side : null,
            won
        }
    })
}

// 1) Fetch the bet’s static info
export async function getBetById(betId) {
    const { data, error } = await supabase
        .from('bets')
        .select('id, name, name_en, description, description_en, image_path, inside_image, result, prizes_given, date, volume_with_gifts, close_time, current_odds, giveaway_total_tickets, giveaway_tickets_left, giveaway_prize_image, giveaway_prize_name, giveaway_chat_link, giveaway_gift_value')
        .eq('id', betId)
        .single()
    if (error) throw error
    return data
}

// client: call RPC
export async function placeBetRequest(betId, side, stake, placed_gifts) {
    if (!user) return
    if (!betId || !side) throw new Error('missing args');
    if (!stake && !placed_gifts) throw new Error('missing args');

    const { data, error } = await supabase.rpc('place_bet_rpc', {
        p_telegram: Number(user?.id), // your telegram id from tg session
        p_bet_id: Number(betId),
        p_side: String(side),
        p_stake: String(Number(stake).toFixed(2)), // send numeric string with 2 decimals
        p_photo_url: user?.photo_url ?? null,
        p_username: user?.username ?? 'Anonymous',
        p_placed_gifts: placed_gifts
    });

    if (error) {
        // handle db-side errors (insufficient funds, closed bet, etc.)
        throw error;
    }

    // RPC returns a row (an array because set-returning); extract first element if needed
    const row = Array.isArray(data) ? data[0] : data;

    try {
        const payload = JSON.stringify({
            telegram: Number(user?.id ?? 0),
            bet_id: Number(betId),
            side: String(side),
            stake: String(Number(stake).toFixed(2)),
            placed_gifts: placed_gifts,
            chat_id: '@giftspredict_chat'
        });

        void fetch('https://api.giftspredict.ru/api/bet-placed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
        }).catch(err => {
            // silently ignore but log for diagnostics
            console.warn('Ignored webhook error (giftspredict):', err);
        });

    } catch (err) {
        // Defensive: nothing should throw, but ignore any synchronous errors here too
        console.warn('Ignored webhook setup error (giftspredict):', err);
    }

    return {
        placed_bets: row?.placed_bets ?? [],
        points: parseFloat(row?.points ?? 0),
        volume: row?.volume ?? { Yes: 0, No: 0 },
        tickets: Number(row?.user_tickets ?? 0)
    };
}

async function _refreshCachedBets() {
    if (!user) return []
    const { data: profile, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id)
        .single()

    if (error) throw error

    // normalize to empty array if null
    _cachedBets = Array.isArray(profile.placed_bets)
        ? profile.placed_bets
        : []
}

export async function availableComments(betId) {
    if (!user) return false
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
    if (!user) return
    // 1) lookup the user’s placed_bets array by their Telegram ID
    const { data: profile, error } = await supabase
        .from('users')
        .select('placed_bets')
        .eq('telegram', user?.id)
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
            placed_gifts: entry.placed_gifts,
            result: entry.side
        }
    } else {
        return {
            stake: 0,
            placed_gifts: [],
            result: "0"
        }
    }
}

// Fetch latest last_commented_at from users table by Telegram id (returns ISO string or null)
export async function getUserLastCommentTime(userTelegramId) {
    if (!userTelegramId) return null

    const { data, error } = await supabase
        .from('users')
        .select('last_commented_at')
        .eq('telegram', userTelegramId)
        .maybeSingle()

    if (error) {
        console.error('getUserLastCommentTime error:', error)
        throw error
    }

    return data?.last_commented_at ?? null
}


// Post a new comment enforcing cooldown using users.last_commented_at.
// Looks up the users row by telegram -> obtains users.id and last_commented_at.
// Inserts comment with user_id = users.id and updates users.last_commented_at on success.
export async function postNewComment(betId, text, commentId, usersStake = null) {
    if (!user) return
    const currentTelegram = user?.id // fallback for testing
    if (!currentTelegram) {
        throw new Error('No authenticated user.')
    }

    try {
        // Fetch user row (id + last_commented_at) by telegram id
        const { data: usr, error: userErr } = await supabase
            .from('users')
            .select('last_commented_at, telegram')
            .eq('telegram', currentTelegram)
            .maybeSingle()

        if (userErr) {
            console.error('Error fetching user row for cooldown check:', userErr)
            throw userErr
        }

        const COOLDOWN_SECONDS = 30 * 60 // 1800 seconds
        if (usr.last_commented_at) {
            const lastTs = new Date(usr.last_commented_at).getTime()
            const elapsedSec = Math.floor((Date.now() - lastTs) / 1000)
            if (elapsedSec < COOLDOWN_SECONDS) {
                const remaining = COOLDOWN_SECONDS - elapsedSec
                const err = new Error('Cooldown active')
                err.code = 'COOLDOWN'
                err.remaining = remaining
                throw err
            }
        }

        // Insert comment using the user's PK id
        const payload = {
            id: commentId,
            bet_id: betId ?? null,
            text,
            user_id: usr.telegram,
            username: user?.username ?? 'Anonymous',
            photo_url: user?.photo_url ?? null,
            created_at: new Date().toISOString(),
            users_stake: usersStake ?? null
        }

        const { data, error } = await supabase.from('comments').insert(payload).single()
        if (error) {
            console.error('Error inserting comment:', error)
            throw error
        }

        // Update users.last_commented_at to now (use users.id)
        const { error: updateErr } = await supabase
            .from('users')
            .update({ last_commented_at: new Date().toISOString() })
            .eq('telegram', usr.telegram)

        if (updateErr) {
            // Not fatal for the comment itself, but log so you can fix DB schema if needed
            console.warn('Could not update users.last_commented_at:', updateErr)
        }

        return data
    } catch (err) {
        // rethrow so client can handle COOLDOWN and NO_USER codes
        throw err
    }
}

// client-side wrapper that verifies the comment's age before deleting
export async function deleteComment(commentId) {
    // fetch created_at first
    const { data, error } = await supabase
        .from('comments')
        .select('created_at')
        .eq('id', commentId)
        .single()

    if (error) throw error

    const createdMs = Date.parse(data.created_at)
    if (Number.isNaN(createdMs)) throw new Error('Invalid comment timestamp')

    const WINDOW_MS = 48 * 60 * 60 * 1000
    if ((Date.now() - createdMs) > WINDOW_MS) {
        const err = new Error('Deletion window expired (48 hours)')
        err.code = 'DELETION_EXPIRED'
        throw err
    }

    // safe to delete
    const { error: delErr } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)

    if (delErr) throw delErr
    return true
}


// 4) Paginated fetch of comments (page 0 = first N)
export async function getComments(betId, page = 0, pageSize = 10) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
        .from('comments')
        .select('id, text, user_id, username, created_at, photo_url, users_stake')
        .eq('bet_id', betId)
        .order('created_at', { ascending: false })
        .range(from, to)
    if (error) throw error
    return data
}