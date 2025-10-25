// routes/api/users.js
import express from "express"
import Joi from "joi"
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase server keys are not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY')
    // but do not crash here — let endpoints return errors
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
})

function parseIntOrNull(v) {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

/**
 * GET /api/user/first-time?telegram=123
 * Response: { isFirstTime: boolean }
 */
router.get('/user/first-time', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram query required' })

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
        const schema = Joi.object({
            telegram: Joi.number().required(),
            language: Joi.string().allow(null, '').optional()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { telegram, language } = value
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

/**
 * POST /api/user/register-ref
 * body: { inviter_telegram, inviter_username, invitee_telegram, invitee_username }
 * calls register_ref rpc
 */
router.post('/user/register-ref', async (req, res) => {
    try {
        const schema = Joi.object({
            inviter_telegram: Joi.number().required(),
            inviter_username: Joi.string().allow('').optional(),
            invitee_telegram: Joi.number().required(),
            invitee_username: Joi.string().allow('').optional()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const params = {
            inviter_telegram: Number(value.inviter_telegram),
            inviter_username: value.inviter_username ?? 'Anonymous',
            invitee_telegram: Number(value.invitee_telegram),
            invitee_username: value.invitee_username ?? 'Anonymous'
        }

        const { data, error } = await supabaseAdmin.rpc('register_ref', params)
        if (error) {
            console.error('register_ref rpc error', error)
            return res.status(500).json({ error: 'rpc_error', details: error.message })
        }

        return res.json({ result: data })
    } catch (err) {
        console.error('register-ref error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/points?telegram=...
 * returns { row: { points } }
 */
router.get('/user/points', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * GET /api/user/bets-summary?telegram=...
 * returns { countBets, totalVolume }
 * expects users.placed_bets JSONB array with objects like { side, stake }
 */
router.get('/user/bets-summary', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * GET /api/user/won-bets-count?telegram=...
 */
router.get('/user/won-bets-count', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * GET /api/user/wallet-address?telegram=...
 */
router.get('/user/wallet-address', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * POST /api/users/by-telegrams
 * body: { telegrams: [123, 456] }
 */
router.post('/users/by-telegrams', async (req, res) => {
    try {
        const schema = Joi.object({ telegrams: Joi.array().items(Joi.number()).min(1).required() })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const ids = Array.from(new Set(value.telegrams.map(Number))).filter(n => Number.isFinite(n))
        if (ids.length === 0) return res.json({ rows: [] })

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('telegram, total_winnings')
            .in('telegram', ids)

        if (error) {
            console.error('by-telegrams error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('by-telegrams handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * POST /api/user/update-wallet
 * body: { telegram, wallet_address }
 */
router.post('/user/update-wallet', async (req, res) => {
    try {
        const schema = Joi.object({
            telegram: Joi.number().required(),
            wallet_address: Joi.string().allow('', null).required()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { telegram, wallet_address } = value
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
 * GET /api/gifts/prices
 */
router.get('/gifts/prices', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('gift_prices')
            .select('*')

        if (error) {
            console.error('gifts prices error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ prices: data ?? [] })
    } catch (err) {
        console.error('gifts prices handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/inventory?telegram=...
 */
router.get('/user/inventory', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * POST /api/user/update-username
 * body: { telegram, username }
 */
router.post('/user/update-username', async (req, res) => {
    try {
        const schema = Joi.object({
            telegram: Joi.number().required(),
            username: Joi.string().required()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { telegram, username } = value
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
 * GET /api/user/language?telegram=...
 */
router.get('/user/language', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })
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
 * body: { telegram, language }
 */
router.post('/user/change-language', async (req, res) => {
    try {
        const schema = Joi.object({
            telegram: Joi.number().required(),
            language: Joi.string().allow('', null).required()
        })
        const { error: validationError, value } = schema.validate(req.body)
        if (validationError) return res.status(400).json({ error: validationError.message })

        const { telegram, language } = value
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
 * GET /api/user/referrals?telegram=...
 */
router.get('/user/referrals', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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
 * GET /api/bets-holders?from=0&to=19
 */
router.get('/bets-holders', async (req, res) => {
    try {
        const from = parseIntOrNull(req.query.from) ?? 0
        const to = parseIntOrNull(req.query.to) ?? (from + 19)
        const { data, error } = await supabaseAdmin
            .from('bets_holders')
            .select('id, stake_with_gifts, multiplier, bet_status, gifts_bet, bet_id, bet_name, bet_name_en, username, side, created_at, photo_url')
            .eq('dont_show', false)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (error) {
            console.error('bets-holders error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('bets-holders handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/holidays
 */
router.get('/holidays', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('holidays')
            .select('id, name, name_en, description, description_en, image_path, date')

        if (error) {
            console.error('holidays error', error)
            return res.status(500).json({ error: 'db_error', details: error.message })
        }

        return res.json({ rows: data ?? [] })
    } catch (err) {
        console.error('holidays handler error', err)
        return res.status(500).json({ error: 'internal', details: String(err) })
    }
})

/**
 * GET /api/user/transactions?telegram=...
 */
router.get('/user/transactions', async (req, res) => {
    try {
        const telegram = parseIntOrNull(req.query.telegram)
        if (!telegram) return res.status(400).json({ error: 'telegram required' })

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

module.exports = router