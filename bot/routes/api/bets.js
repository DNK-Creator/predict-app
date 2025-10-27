// routes/api/bets.js
import express from "express"
import Joi from "joi"
import { createClient } from '@supabase/supabase-js'
import { requireTelegramSession } from "../../server/middleware/telegramAuth.js"

const router = express.Router()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase server keys are not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
})

// param middleware — runs for routes with :id
router.param('id', (req, res, next, value) => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return res.status(400).json({ error: 'invalid id' })
    }
    const n = Number(value)
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid id' })
    req.betId = n
    next()
})

// small util
function parseIntOrNull(v) {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

// normalize server JSON responses
function sendServerError(res, err, msg = 'internal') {
    console.error(msg, err)
    return res.status(500).json({ error: msg, details: String(err?.message ?? err) })
}

/**
 * GET /api/bets/active?offset=0&limit=10
 * returns { rows: [...] }
 */
router.get('/bets/active', async (req, res) => {
    try {
        const offset = parseIntOrNull(req.query.offset) ?? 0
        const limit = parseIntOrNull(req.query.limit) ?? 10
        const to = offset + limit - 1

        const { data, error } = await supabaseAdmin
            .from('bets')
            .select('*')
            .eq('result', 'undefined')
            .eq('is_approved', true)
            .order('volume_number', { ascending: false })
            .range(offset, to)

        if (error) return sendServerError(res, error, 'db_query_failed')
        return res.json({ rows: data ?? [] })
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_active_bets')
    }
})

/**
 * GET /api/bets/past?offset=0&limit=8
 */
router.get('/bets/past', async (req, res) => {
    try {
        const offset = parseIntOrNull(req.query.offset) ?? 0
        const limit = parseIntOrNull(req.query.limit) ?? 8
        const to = offset + limit - 1

        const { data, error } = await supabaseAdmin
            .from('bets')
            .select('*')
            .neq('result', 'undefined')
            .eq('is_approved', true)
            .order('volume_number', { ascending: false })
            .range(offset, to)

        if (error) return sendServerError(res, error, 'db_query_failed')
        return res.json({ rows: data ?? [] })
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_past_bets')
    }
})

// GET /api/bets/created?offset=0&limit=8
router.get('/bets/created', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            // requireTelegramSession should normally prevent this; 401 is appropriate
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // parse & sanitize pagination
        const offset = Math.max(0, parseIntOrNull(req.query.offset) ?? 0);
        let limit = parseIntOrNull(req.query.limit) ?? 8;
        limit = Math.max(1, Math.min(limit, 20)); // enforce sensible max (20)

        const to = offset + limit - 1;

        const { data, error } = await supabaseAdmin
            .from('bets')
            .select('id, name, name_en, description, creator_first_stake, creator_side, is_approved, status')
            .eq('creator_telegram', telegram)
            .order('creator_first_stake', { ascending: false })
            .range(offset, to);

        if (error) return sendServerError(res, error, 'db_query_failed');
        return res.json({ rows: data ?? [] });
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_created_bets');
    }
});

/**
 * GET /api/bets/user-active
 * returns bets with user's stake merged in
 */
router.get('/bets/user-active', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            // requireTelegramSession should normally prevent this; 401 is appropriate
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // 1) fetch user's placed_bets
        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('users')
            .select('placed_bets')
            .eq('telegram', telegram)
            .single()

        if (profileErr) return sendServerError(res, profileErr, 'db_profile_fetch_failed')

        const placed = Array.isArray(profile.placed_bets) ? profile.placed_bets : []
        const betIds = placed.map(b => b.bet_id).filter(id => id != null)
        if (betIds.length === 0) return res.json({ rows: [] })

        // 2) fetch bets not yet prizes_given
        const { data: bets, error: betsErr } = await supabaseAdmin
            .from('bets')
            .select('id, name, name_en, date')
            .in('id', betIds)
            .eq('prizes_given', false)

        if (betsErr) return sendServerError(res, betsErr, 'db_bets_fetch_failed')

        const rows = bets.map(bet => {
            const entry = placed.find(e => e.bet_id == bet.id) || {}
            return {
                id: bet.id,
                name: bet.name,
                name_en: bet.name_en,
                date: bet.date,
                stake: entry.stake,
                side: entry.side,
            }
        })

        return res.json({ rows })
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_user_active_bets')
    }
})

/**
 * GET /api/bets/user-history
 */
router.get('/bets/user-history', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            // requireTelegramSession should normally prevent this; 401 is appropriate
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('users')
            .select('placed_bets')
            .eq('telegram', telegram)
            .single()

        if (profileErr) return sendServerError(res, profileErr, 'db_profile_fetch_failed')

        const entries = Array.isArray(profile.placed_bets) ? profile.placed_bets : []
        const betIds = entries.map(e => e.bet_id).filter(Boolean)
        if (betIds.length === 0) return res.json({ rows: [] })

        const { data: bets, error: betsErr } = await supabaseAdmin
            .from('bets')
            .select('id, name, name_en, date, result, prizes_given')
            .in('id', betIds)
            .eq('prizes_given', true)

        if (betsErr) return sendServerError(res, betsErr, 'db_bets_fetch_failed')

        const rows = bets.map(bet => {
            const e = entries.find(x => x.bet_id == bet.id) || {}
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

        return res.json({ rows })
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_user_history_bets')
    }
})

// POST /api/bets/place
// body: { p_bet_id, p_side, p_stake, p_photo_url, p_username, p_placed_gifts }
// Calls RPC place_bet_rpc and returns structured result
router.post('/bets/place', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }
        const sessionUsername = req.user?.username ?? 'unknown-predictor'

        const sessionPhotoUrl = req.user?.photo_url ?? 'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/TiredPepeResized.png'

        // If client still sends p_telegram, ensure it matches the validated one (defensive)
        if (req.body && req.body.p_telegram !== undefined) {
            const provided = Number(req.body.p_telegram);
            if (Number.isNaN(provided) || provided !== telegram) {
                return res.status(403).json({ error: 'telegram_mismatch' });
            }
            // we will ignore client p_telegram and use server one below
        }

        // Validate request body
        const schema = Joi.object({
            p_bet_id: Joi.number().required(),
            p_side: Joi.string().required(),
            p_stake: Joi.alternatives().try(Joi.number(), Joi.string()).allow(null, '').optional(),
            p_placed_gifts: Joi.any().optional()
        }).options({ stripUnknown: true, convert: true }); // strip unknown fields, allow coercion

        const { error: valErr, value } = schema.validate(req.body || {});
        if (valErr) return res.status(400).json({ error: valErr.message });

        // Build RPC payload by inserting server-validated telegram
        const payload = {
            p_telegram: telegram,
            p_bet_id: Number(value.p_bet_id),
            p_side: value.p_side,
            p_stake: value.p_stake ?? null,
            p_photo_url: sessionPhotoUrl,
            p_username: sessionUsername,
            p_placed_gifts: value.p_placed_gifts ?? null
        };

        // If p_placed_gifts is an object/array, stringify it so RPC receiving JSONB works reliably
        if (payload.p_placed_gifts != null && typeof payload.p_placed_gifts !== 'string') {
            try {
                payload.p_placed_gifts = JSON.stringify(payload.p_placed_gifts);
            } catch (e) {
                // fallback: remove placed_gifts to avoid RPC error
                console.warn('Failed to stringify p_placed_gifts, dropping it', e);
                payload.p_placed_gifts = null;
            }
        }

        // Call RPC
        const { data, error } = await supabaseAdmin.rpc('place_bet_rpc', payload);

        if (error) {
            // RPC/business errors: log & forward sensible info
            console.error('place_bet_rpc error', error);
            return res.status(500).json({ error: 'rpc_failed', details: error.message });
        }

        const row = Array.isArray(data) ? data[0] : data;

        // Normalize response like before
        return res.json({
            placed_bets: row?.placed_bets ?? [],
            points: parseFloat(row?.points ?? 0),
            volume: row?.volume ?? {},
            tickets: Number(row?.user_tickets ?? 0),
            raw: row
        });
    } catch (err) {
        return sendServerError(res, err, 'failed_place_bet');
    }
});

/**
 * GET /api/bets/available-comments?betId=5
 * returns { available: true/false }
 */
router.get('/bets/available-comments', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const betId = parseIntOrNull(req.query.betId)

        if (betId == null) return res.status(400).json({ error: 'betId required' })

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('placed_bets')
            .eq('telegram', telegram)
            .single()

        if (error) return sendServerError(res, error, 'db_profile_fetch_failed')

        const placed = Array.isArray(data?.placed_bets) ? data.placed_bets : []
        const has = placed.some(b => Number(b.bet_id) === Number(betId))
        return res.json({ available: Boolean(has) })
    } catch (err) {
        return sendServerError(res, err, 'failed_available_comments')
    }
})

/**
 * GET /api/bets/user-bet-amount?telegram=123&betId=5
 * returns { stake, placed_gifts, result }
 */
router.get('/bets/user-bet-amount', requireTelegramSession, async (req, res) => {
    try {
        // Log raw incoming query (very helpful for debugging)
        console.log('[DEBUG] GET /api/bets/user-bet-amount raw query:', req.query)

        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // Accept either string or array form (express may parse repeated keys into arrays)
        const rawBetId = Array.isArray(req.query.betId) ? req.query.betId[0] : req.query.betId
        const betId = parseIntOrNull(rawBetId)

        // Defensive validation: explicitly check for null/NaN
        if (betId == null) {
            console.warn('[WARN] user-bet-amount missing/invalid params', { rawBetId, betId })
            return res.status(400).json({
                error: 'betId required',
                received: { rawBetId, betId }
            })
        }

        // Continue as before
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('placed_bets')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('user-bet-amount db error:', error)
            return sendServerError(res, error, 'db_profile_fetch_failed')
        }

        const placed = Array.isArray(data?.placed_bets) ? data.placed_bets : []
        const entry = placed.find(b => Number(b.bet_id) === Number(betId))

        if (entry) {
            return res.json({ stake: entry.stake, placed_gifts: entry.placed_gifts ?? [], result: entry.side })
        } else {
            return res.json({ stake: 0, placed_gifts: [], result: "0" })
        }
    } catch (err) {
        return sendServerError(res, err, 'failed_user_bet_amount')
    }
})

/**
 * GET /api/user/last-comment
 * returns { last_commented_at: ISOstring or null }
 */
router.get('/user/last-comment', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('last_commented_at')
            .eq('telegram', telegram)
            .maybeSingle()

        if (error) return sendServerError(res, error, 'db_profile_fetch_failed')
        return res.json({ last_commented_at: data?.last_commented_at ?? null })
    } catch (err) {
        return sendServerError(res, err, 'failed_user_last_comment')
    }
})

// POST /api/comments
// body: { betId, text, commentId, usersStake, /* no telegram */ }
router.post('/comments', requireTelegramSession, async (req, res) => {
    try {
        // canonical Telegram id & username come from the validated session
        const telegram = Number(req.user?.id);
        const sessionUsername = req.user?.username ?? 'unknown-predictor';
        const sessionPhotoUrl = req.user?.photo_url ?? 'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/TiredPepeResized.png'

        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // Defensive: if client still sends telegram, ensure it matches server one
        if (req.body && req.body.telegram !== undefined) {
            const provided = Number(req.body.telegram);
            if (Number.isNaN(provided) || provided !== telegram) {
                return res.status(403).json({ error: 'telegram_mismatch' });
            }
            // ignore body.telegram from here on
        }

        // Validate incoming body (no telegram allowed here)
        const schema = Joi.object({
            betId: Joi.number().integer().allow(null),
            text: Joi.string().min(1).max(200).required(),
            commentId: Joi.string().required(),
            usersStake: Joi.any().optional(),
        }).options({ stripUnknown: true, convert: true });

        const { error: valErr, value } = schema.validate(req.body || {});
        if (valErr) return res.status(400).json({ error: valErr.message });

        const betId = value.betId ?? null;
        const text = String(value.text).trim();
        const commentId = String(value.commentId);
        let usersStake = value.usersStake ?? null;

        // Sanitize / coerce usersStake: if it's an object/array, stringify for stable DB storage
        if (usersStake != null && typeof usersStake === 'object') {
            try {
                usersStake = JSON.stringify(usersStake);
            } catch (e) {
                console.warn('Could not stringify usersStake; dropping to null', e);
                usersStake = null;
            }
        }

        // fetch user row to read last_commented_at and placed_bets (use server canonical telegram)
        const { data: usr, error: userErr } = await supabaseAdmin
            .from('users')
            .select('last_commented_at, placed_bets, telegram')
            .eq('telegram', telegram)
            .maybeSingle();

        if (userErr) return sendServerError(res, userErr, 'db_profile_fetch_failed');

        const placed = Array.isArray(usr?.placed_bets) ? usr.placed_bets : []
        const has = placed.some(b => Number(b.bet_id) === Number(betId))
        const isAlright = Boolean(has)

        if (isAlright === false) {
            return res.status(403).json({ error: 'NO_BET' });
        }

        const COOLDOWN_SECONDS = 30 * 60; // 30 minutes
        if (usr?.last_commented_at) {
            const lastTs = new Date(usr.last_commented_at).getTime();
            const elapsedSec = Math.floor((Date.now() - lastTs) / 1000);
            if (elapsedSec < COOLDOWN_SECONDS) {
                const remaining = COOLDOWN_SECONDS - elapsedSec;
                return res.status(403).json({ error: 'COOLDOWN', remaining });
            }
        }

        // Prefer session username (trustworthy); fallback to client-provided username if present
        const usernameToStore = sessionUsername;
        const photoUrlToStore = sessionPhotoUrl;

        // Build payload for DB insert
        const payload = {
            id: commentId,
            bet_id: betId,
            text,
            user_id: telegram,
            username: usernameToStore,
            photo_url: photoUrlToStore,
            created_at: new Date().toISOString(),
            users_stake: usersStake
        };

        // Insert comment
        const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('comments')
            .insert(payload)
            .single();

        if (insertErr) return sendServerError(res, insertErr, 'db_insert_failed');

        // Update last_commented_at (best-effort; log if it fails)
        const { error: updateErr } = await supabaseAdmin
            .from('users')
            .update({ last_commented_at: new Date().toISOString() })
            .eq('telegram', telegram);

        if (updateErr) console.warn('Could not update users.last_commented_at:', updateErr);

        return res.json({ comment: inserted });
    } catch (err) {
        return sendServerError(res, err, 'failed_post_comment');
    }
});

/**
 * DELETE /api/comments/:id
 * Only allows deletion by the comment owner and within 48h window
 */
router.delete('/comments/:id', requireTelegramSession, async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const commentId = req.params.id

        if (!commentId || !telegram) return res.status(400).json({ error: 'id and telegram are required' })

        const { data, error } = await supabaseAdmin
            .from('comments')
            .select('created_at, user_id')
            .eq('id', commentId)
            .maybeSingle()

        if (error) return sendServerError(res, error, 'db_query_failed')
        if (!data) return res.status(404).json({ error: 'not_found' })

        // ensure owner
        if (Number(data.user_id) !== Number(telegram)) {
            return res.status(403).json({ error: 'not_comment_owner' })
        }

        const createdMs = Date.parse(data.created_at)
        if (Number.isNaN(createdMs)) return res.status(400).json({ error: 'invalid_timestamp' })

        const WINDOW_MS = 48 * 60 * 60 * 1000
        if ((Date.now() - createdMs) > WINDOW_MS) {
            return res.status(403).json({ error: 'DELETION_EXPIRED' })
        }

        // delete
        const { error: delErr } = await supabaseAdmin
            .from('comments')
            .delete()
            .eq('id', commentId)

        if (delErr) return sendServerError(res, delErr, 'db_delete_failed')
        return res.json({ deleted: true })
    } catch (err) {
        return sendServerError(res, err, 'failed_delete_comment')
    }
})

// GET /api/bets/:betId/comments?page=0&pageSize=10
router.get('/bets/:betId/comments', async (req, res) => {
    try {
        const betId = parseIntOrNull(req.params.betId);
        if (betId == null) return res.status(400).json({ error: 'betId required' });

        const page = Math.max(0, parseIntOrNull(req.query.page) ?? 0);
        const pageSize = Math.max(1, Math.min(100, parseIntOrNull(req.query.pageSize) ?? 10));
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabaseAdmin
            .from('comments')
            .select('id, text, user_id, username, created_at, photo_url, users_stake')
            .eq('bet_id', betId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) return sendServerError(res, error, 'db_comments_fetch_failed');
        return res.json({ rows: data ?? [] });
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_comments');
    }
});


/**
 * GET /api/bet/:id/availability
 */
router.get('/bet/:id/availability', async (req, res) => {
    try {
        const id = parseIntOrNull(req.params.id)
        if (!id) return res.status(400).json({ error: 'invalid id' })

        const { data, error } = await supabaseAdmin
            .from('bets')
            .select('is_approved')
            .eq('id', id)
            .single()

        if (error) {
            console.error('bet availability error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ is_approved: data?.is_approved ?? false })
    } catch (err) {
        console.error('bet availability handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/bets/:id/holders
 */
router.get('/bets/get-holders/:id', async (req, res) => {
    try {
        const id = req.betId // validated by router.param
        console.log('[GET] /api/bets/get-holders/:id hit, betId=', id)

        const { data, error } = await supabaseAdmin
            .from('bets_holders')
            .select('id, created_at, user_id, bet_id, stake_with_gifts, giveaway_tickets, side, username, photo_url')
            .eq('bet_id', id)
            .order('stake_with_gifts', { ascending: false })

        if (error) return sendServerError(res, error, 'db_query_failed')

        console.log(`Fetched ${Array.isArray(data) ? data.length : 0} holders for bet_id=${id}`)
        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('failed_fetch_bets_holders handler error:', err)
        return sendServerError(res, err, 'failed_fetch_bets_holders')
    }
})

/**
 * GET /api/bets/information/:id
 * returns full bet row
 */
router.get('/bets/information/:id', async (req, res) => {
    try {
        const id = parseIntOrNull(req.params.id)
        if (!id) return res.status(400).json({ error: 'invalid id' })

        const { data, error } = await supabaseAdmin
            .from('bets')
            .select('id, name, name_en, description, description_en, image_path, inside_image, result, prizes_given, date, volume_with_gifts, close_time, current_odds, giveaway_total_tickets, giveaway_tickets_left, giveaway_prize_image, giveaway_prize_name, giveaway_chat_link, giveaway_gift_value')
            .eq('id', id)
            .single()

        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: 'not_found' })
            return sendServerError(res, error, 'db_bet_fetch_failed')
        }

        return res.json({ row: data ?? null })
    } catch (err) {
        return sendServerError(res, err, 'failed_fetch_bet_by_id')
    }
})

export default router
