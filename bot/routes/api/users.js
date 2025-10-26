// routes/api/users.js
import express from "express"
import Joi from "joi"
import { createClient } from '@supabase/supabase-js'
import { requireTelegramSession } from "../../server/middleware/telegramAuth"

const router = express.Router()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase server keys are not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY')
    // but do not crash here — let endpoints return errors
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
})

router.use(requireTelegramSession)

// GET /api/user/placed-bets
router.get('/user/placed-bets', async (req, res) => {
    const telegram = Number(req.user?.id);
    if (!telegram || Number.isNaN(telegram)) {
        return res.status(401).json({ error: 'unauthenticated' });
    }

    const { data, error } = await supabaseAdmin
        .from('users')
        .select('placed_bets')
        .eq('telegram', telegram)
        .maybeSingle()
    if (error) return sendServerError(res, error, 'db_error')
    return res.json({ placed_bets: data?.placed_bets ?? [] })
})

/**
 * GET /api/user/first-time
 * Response: { isFirstTime: boolean }
 */
router.get('/user/first-time', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // check existence
        const { data, error, count } = await supabaseAdmin
            .from('users')
            .select('id', { count: 'exact' })
            .eq('telegram', telegram)

        if (error) {
            console.error('first-time supabase error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        const found = Array.isArray(data) ? data.length > 0 : Boolean(data)
        const isFirstTime = !found
        return res.json({ isFirstTime })
    } catch (err) {
        console.error('first-time handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * POST /api/user/get-or-create
 * body: { telegram: number, language: string | null }
 * calls rpc get_or_create_user
 */
router.post('/user/get-or-create', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }
        const schema = Joi.object({
            language: Joi.string().allow(null, '').optional()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { language } = value
        const rpcParams = { p_telegram: Number(telegram), p_language: language ?? null }
        const { data, error } = await supabaseAdmin.rpc('get_or_create_user', rpcParams)

        if (error) {
            console.error('get_or_create_user rpc error', error)
            return res.status(500).json({ error: 'rpc_error', details: error.message })
        }

        // The rpc returns an array for set-returning functions
        const userRow = Array.isArray(data) ? data[0] ?? null : data ?? null
        return res.json({ user: userRow })
    } catch (err) {
        console.error('get-or-create handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

// POST /api/user/register-ref
// body: { inviter_telegram }  -- only inviter id expected from client
router.post('/user/register-ref', async (req, res) => {
    try {
        // canonical invitee comes from session
        const inviteeTelegram = Number(req.user?.id);
        const inviteeUsername = req.user?.username ?? null;

        if (!inviteeTelegram || Number.isNaN(inviteeTelegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // Validate inviter param (client may pass inviter_telegram)
        const schema = Joi.object({
            inviter_telegram: Joi.number().required().invalid(inviteeTelegram) // disallow self-referral at validation level
        }).options({ stripUnknown: true, convert: true });

        const { error: validationError, value } = schema.validate(req.body || {});
        if (validationError) {
            // If user attempted to refer self, Joi.invalid triggers, map message
            const msg = validationError.message || 'invalid_input';
            if (msg.includes('invalid value')) {
                return res.status(400).json({ error: 'invalid_inviter' });
            }
            return res.status(400).json({ error: msg });
        }

        const inviterTelegram = Number(value.inviter_telegram);

        // Basic check: inviter != invitee (already handled above, but double-check defensively)
        if (inviterTelegram === inviteeTelegram) {
            return res.status(400).json({ error: 'self_referral_not_allowed' });
        }

        // Check invitee has not already been referred
        const { data: inviteeRow, error: invRowErr } = await supabaseAdmin
            .from('users')
            .select('telegram, referred_by')
            .eq('telegram', inviteeTelegram)
            .maybeSingle();

        if (invRowErr) {
            console.error('register-ref: db fetch invitee error', invRowErr);
            return res.status(500).json({ error: 'db_error', details: invRowErr.message });
        }
        if (inviteeRow && inviteeRow.referred_by) {
            // Already has a referrer — don't allow re-registering
            return res.status(409).json({ error: 'already_referred' });
        }

        const inviteeUsernameCanonical = inviteeUsername ?? (req.body.invitee_username ?? 'Anonymous');

        // Build params for RPC using canonical server-side values
        const params = {
            inviter_telegram: Number(inviterTelegram),
            invitee_telegram: Number(inviteeTelegram),
            invitee_username: String(inviteeUsernameCanonical)
        };

        // Call the register_ref RPC (your DB function)
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('register_ref', params);

        if (rpcErr) {
            // Map some expected business errors if your RPC returns specific messages
            console.error('register_ref rpc error', rpcErr);
            // if rpcErr.message includes known token, map to 400/409 etc.
            return res.status(500).json({ error: 'rpc_error', details: rpcErr.message });
        }

        return res.json({ result: rpcData });
    } catch (err) {
        console.error('register-ref handler error', err);
        return res.status(500).json({ error: 'internal', details: String(err) });
    }
});

/**
 * GET /api/user/points
 * returns { row: { points } }
 */
router.get('/user/points', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('points')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('user points error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ row: data })
    } catch (err) {
        console.error('user points handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/bets-summary
 * returns { countBets, totalVolume }
 * expects users.placed_bets JSONB array with objects like { side, stake }
 */
router.get('/user/bets-summary', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('placed_bets')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('bets-summary error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        const bets = Array.isArray(data?.placed_bets) ? data.placed_bets : []
        const countBets = bets.length
        const totalVolume = bets.reduce((s, b) => s + (Number(b?.stake) || 0), 0)
        return res.json({ countBets, totalVolume })
    } catch (err) {
        console.error('bets-summary handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/won-bets-count
 */
router.get('/user/won-bets-count', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('bets_won')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('won-bets-count error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ bets_won: data?.bets_won ?? 0 })
    } catch (err) {
        console.error('won-bets-count handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/wallet-address
 */
router.get('/user/wallet-address', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('wallet_address')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('wallet-address error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ wallet_address: data?.wallet_address ?? null })
    } catch (err) {
        console.error('wallet-address handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * POST /api/user/update-wallet
 * body: { wallet_address }
 */
router.post('/user/update-wallet', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const schema = Joi.object({
            wallet_address: Joi.string().allow('', null).required()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { wallet_address } = value
        const { data, error } = await supabaseAdmin
            .from('users')
            .update({ wallet_address })
            .eq('telegram', telegram)

        if (error) {
            console.error('update-wallet error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ updated: true })
    } catch (err) {
        console.error('update-wallet handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/inventory
 */
router.get('/user/inventory', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('inventory')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('user inventory error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ inventory: data?.inventory ?? [] })
    } catch (err) {
        console.error('user inventory handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * POST /api/user/update-username
 * body: { username }
 */
router.post('/user/update-username', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const schema = Joi.object({
            username: Joi.string().required()
        })

        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { username } = value
        const { error } = await supabaseAdmin
            .from('users')
            .update({ username })
            .eq('telegram', telegram)

        if (error) {
            console.error('update username error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ ok: true })
    } catch (err) {
        console.error('update-username handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/language
 */
router.get('/user/language', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('language')
            .eq('telegram', telegram)
            .single()

        if (error) {
            console.error('user language error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }
        return res.json({ language: data?.language ?? null })
    } catch (err) {
        console.error('user language handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * POST /api/user/change-language
 * body: { language }
 */
router.post('/user/change-language', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const schema = Joi.object({
            language: Joi.string().allow('', null).required()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { language } = value

        const { error } = await supabaseAdmin
            .from('users')
            .update({ language })
            .eq('telegram', telegram)

        if (error) {
            console.error('change language error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ ok: true })
    } catch (err) {
        console.error('change-language handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/referrals
 */
router.get('/user/referrals', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('telegram, total_winnings')
            .eq('referred_by', telegram)

        if (error) {
            console.error('referrals error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('referrals handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/transactions
 */
router.get('/user/transactions', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { data, error } = await supabaseAdmin
            .from('transactions')
            .select('uuid, amount, status, gift_url, created_at, type')
            .eq('user_id', telegram)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('transactions error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('transactions handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

export default router