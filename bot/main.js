import fetch from 'node-fetch'
import axios from 'axios'
import { Telegraf, Markup, session } from "telegraf"
import 'dotenv/config'
import express from "express"
import cors from "cors"
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL; // e.g. https://xyz.supabase.co
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY; // service_role key (server-only)
const TONCENTER_API_KEY = process.env.VITE_TONCENTER_API_KEY;
const TONCENTER_API_BASE = process.env.VITE_TONCENTER_URL || 'https://api.toncenter.com/api/v2'
const HOT_WALLET = process.env.VITE_HOT_WALLET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase server envs (SUPABASE_URL / SUPABASE_SERVICE_KEY). Exiting.')
    process.exit(1)
}
if (!TONCENTER_API_KEY) {
    console.warn('Warning: TONCENTER_API_KEY not set — /api/balance endpoint will fail until provided.')
}
if (!HOT_WALLET) {
    console.warn('Warning: HOT_WALLET not set — deposit-intent will still work if you return per-user addresses, but default deposit address missing.')
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

function verifySignature(req, res, next) {
    // prefer rawBody (string) for HMAC; if missing fall back to JSON serialization
    const raw = (typeof req.rawBody === 'string' && req.rawBody.length > 0) ? req.rawBody : JSON.stringify(req.body || {});
    const sig = req.headers['x-internal-signature'];
    if (!sig) return res.status(403).json({ error: 'missing signature' });

    const expected = crypto.createHmac('sha256', process.env.INTERNAL_SECRET).update(raw).digest('hex');
    try {
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
            return res.status(403).json({ error: 'invalid signature' });
        }
    } catch (e) {
        return res.status(403).json({ error: 'invalid signature' });
    }

    next();
}

const token = process.env.BOT_TOKEN
const bot = new Telegraf(token)
// install session middleware
bot.use(session())

// after creating bot
bot.catch((err, ctx) => {
    try {
        console.error('[TELEGRAF error] update:', ctx?.update, 'error:', err);
    } catch (e) {
        console.error('[TELEGRAF error] (also failed to log ctx)', e, 'origErr:', err);
    }
    // don't rethrow
});

async function fetchWithRetry(url, opts = {}, retries = 3, backoff = 500) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = opts.timeout ?? 10_000;
            const id = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(url, { ...opts, signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (e) {
            lastErr = e;
            if (i === retries) break;
            await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
        }
    }
    throw lastErr;
}

const effectIdTwo = "5046509860389126442"

// --- add near the top of main.js ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
    // optionally: flush logs / notify Sentry here
    // Exit so docker (with restart policy) can restart into a clean state
    setTimeout(() => process.exit(1), 100);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    // optionally: flush logs / notify Sentry here
    setTimeout(() => process.exit(1), 100);
});

const app = express()

function rawBodySaver(req, res, buf, encoding) {
    if (!buf || !buf.length) return;
    // limit raw body we keep in memory to avoid OOM when large uploads occur
    const MAX_KEEP = 32 * 1024; // 32 KB
    const str = buf.toString(encoding || 'utf8');
    req.rawBody = (str.length > MAX_KEEP) ? (str.slice(0, MAX_KEEP) + '... (truncated)') : str;
}

// Parse JSON / URL-encoded while capturing raw body into req.rawBody
app.use(express.json({ limit: '1mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '1mb', verify: rawBodySaver }));

// Restricted CORS: only your frontend allowed, credentials enabled
const corsRestricted = cors({
    origin: 'https://giftspredict.ru',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
});

// Public CORS for /api/get-chance: allow any origin (no credentials)
const corsPublic = cors({
    origin: true,    // reflect request origin -> allows any origin safely (not '*')
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false
});

// Ensure OPTIONS preflight for the public route is handled
app.options('/api/get-chance', corsPublic);

// Apply per-request CORS: if path === /api/get-chance use public, else restricted
app.use((req, res, next) => {
    if (req.path === '/api/get-chance') {
        return corsPublic(req, res, next);
    }
    return corsRestricted(req, res, next);
});

// If your app runs behind a single trusted proxy (e.g. nginx), set:
app.set('trust proxy', 1);

app.use((req, res, next) => {
    try {
        console.log(`[req] ${req.ip} ${req.method} ${req.path} origin=${req.headers.origin || '-'}`);

        if (req.method !== 'GET') {
            // Prefer parsed req.body (safe), fallback to req.rawBody (string)
            if (req.body && typeof req.body === 'object') {
                const keys = Object.keys(req.body);
                if (keys.length <= 50) {
                    try {
                        console.log('[req.body]', JSON.stringify(req.body));
                    } catch (e) {
                        console.log('[req.body] (not serializable)');
                    }
                } else {
                    console.log('[req.body] (omitted — too many keys)');
                }
            } else if (typeof req.rawBody === 'string' && req.rawBody.length > 0) {
                // rawBody is the raw string captured by verify
                console.log('[req.rawBody]', req.rawBody.length > 2000 ? req.rawBody.slice(0, 2000) + '... (truncated)' : req.rawBody);
            } else {
                console.log('[req.body] (empty)');
            }
        }
    } catch (e) {
        // Logging must never break request processing
        console.warn('[req logger] error', e?.message ?? e);
    } finally {
        next();
    }
});


// Light rate limiting for deposit-intent to reduce abuse
const depositLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 5, // max 10 deposit-intent requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false
})

/*
  Handles the pre_checkout_query event.
  Telegram sends this event to the bot when a user clicks the payment button.
  The bot must respond with answerPreCheckoutQuery within 10 seconds to confirm or cancel the transaction.
*/
bot.on("pre_checkout_query", async (ctx) => {
    return ctx.answerPreCheckoutQuery(true).catch(() => {
        console.log("answerPreCheckoutQuery failed");
    });
});

// POST /api/bet-placed
app.post('/api/bet-placed', async (req, res) => {
    try {
        const { telegram, bet_id, side, stake, chat_id } = req.body || {};
        if (!telegram || !bet_id || !side || (stake === undefined || stake === null)) {
            return res.status(400).json({ error: 'telegram, bet_id, side, stake required' });
        }

        // fetch user row (get username)
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('id, username, telegram')
            .eq('telegram', Number(telegram))
            .limit(1)
            .maybeSingle();

        if (userErr) {
            console.error('bet-placed: supabase users select error', userErr);
            return res.status(500).json({ error: 'db_error' });
        }
        if (!userRow) {
            return res.status(404).json({ error: 'user_not_found' });
        }

        // fetch event row (get event name + volume)
        const { data: eventRow, error: eventErr } = await supabaseAdmin
            .from('bets')
            .select('id, name_en, volume')
            .eq('id', Number(bet_id))
            .limit(1)
            .maybeSingle();

        if (eventErr) {
            console.error('bet-placed: supabase bets row select error', eventErr);
            return res.status(500).json({ error: 'db_error' });
        }
        if (!eventRow) {
            return res.status(404).json({ error: 'bet_not_found' });
        }

        const betNameEn = eventRow.name_en || 'Unknown event';

        // compute totalPool from volume JSONB (handle object or JSON-string)
        const rawVolume = eventRow.volume;
        let volumeObj = {};
        try {
            if (!rawVolume) {
                volumeObj = {};
            } else if (typeof rawVolume === 'string') {
                // sometimes Supabase returns jsonb as parsed object, but just in case it's a string
                volumeObj = JSON.parse(rawVolume);
            } else if (typeof rawVolume === 'object') {
                volumeObj = rawVolume;
            } else {
                volumeObj = {};
            }
        } catch (e) {
            console.warn('bet-placed: failed to parse volume json, treating as empty', e);
            volumeObj = {};
        }

        // Sum numeric values in the object (case-insensitive keys not required for summation)
        const totalPool = Object.values(volumeObj).reduce((acc, v) => {
            const n = Number(v ?? 0);
            return acc + (Number.isFinite(n) ? n : 0);
        }, 0);

        // prepare message (escape username & values for HTML mode)
        const escapeHtml = (s = '') =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

        // Build clickable username link: prefer https://t.me/<username> if available
        const rawUsername = userRow.username ? String(userRow.username).replace(/^@/, '') : null;
        let userLinkHref, userLinkText;
        if (rawUsername) {
            userLinkHref = `https://t.me/${encodeURIComponent(rawUsername)}`;
            userLinkText = `@${rawUsername}`;
        } else {
            // fallback to tg://user?id=<telegram>
            userLinkHref = `tg://user?id=${encodeURIComponent(String(userRow.telegram))}`;
            userLinkText = `telegram:${userRow.telegram}`;
        }

        const stakeNumber = Number(stake);
        const stakeFormatted = Number.isFinite(stakeNumber) ? stakeNumber : stake;

        // Template required by you:
        // <username> (clickable to https://t.me/<username>) just placed <stake> TON on <side> in the event <betNameEn> ⭐
        // Prepend Whale Alert 🐳 line if stake > 15
        const lines = [];
        if (Number(stake) > 15) {
            lines.push('<b>Whale Alert 🐳</b>');
        }

        // The clickable display: use HTML <a href="...">display</a> and escape display text
        const clickable = `<a href="${userLinkHref}">${escapeHtml(userLinkText)}</a>`;
        const sideEscaped = escapeHtml(String(side));
        const betNameEscaped = escapeHtml(String(betNameEn));
        // include TON suffix per your template
        // Modified message format
        lines.push(`${clickable} just placed ${escapeHtml(String(stakeFormatted))} TON on "${sideEscaped}"`);

        lines.push(`Event: ${betNameEscaped} ⭐`);

        // Optionally log totalPool for debugging/metrics
        console.log(`bet-placed: totalPool for bet ${bet_id} = ${totalPool}`);

        // fetch user's giveaway tickets for this bet
        let ticketsCount = 0;
        try {
            const { data: bhRow, error: bhErr } = await supabaseAdmin
                .from('bets_holders')
                .select('giveaway_tickets')
                .eq('user_id', Number(telegram))
                .eq('bet_id', Number(bet_id))
                .limit(1)
                .maybeSingle();

            if (bhErr) {
                console.warn('bet-placed: bets_holders select error (non-fatal)', bhErr);
            } else if (bhRow) {
                ticketsCount = Number(bhRow.giveaway_tickets ?? 0);
            }
        } catch (e) {
            console.warn('bet-placed: unexpected error querying bets_holders (non-fatal):', e);
        }

        // if user has tickets, add a blank line and then the tickets line
        if (ticketsCount > 0) {
            lines.push(''); // blank line separator
            lines.push(`User now has ${ticketsCount} tickets for the giveaway 🎁`);
        }

        const messageText = lines.join('\n');

        // send message using your Telegraf bot instance
        try {
            const chatId = chat_id || process.env.ANNOUNCE_CHAT_ID;
            if (!chatId) {
                console.error('bet-placed: no chat id configured (pass chat_id in body or set ANNOUNCE_CHAT_ID env)');
                return res.status(500).json({ error: 'server_not_configured' });
            }

            const sent = await bot.telegram.sendMessage(chatId, messageText, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            return res.json({ ok: true, result: sent, totalPool });
        } catch (tgErr) {
            console.error('bet-placed: telegram send error', tgErr);
            return res.status(502).json({ error: 'telegram_error', details: String(tgErr), totalPool });
        }
    } catch (err) {
        console.error('bet-placed unexpected error', err);
        return res.status(500).json({ error: 'internal_error', details: String(err) });
    }
});


// POST /api/create-event
app.post('/api/create-event', async (req, res) => {
    try {
        const chat_id = '-1002951097413'
        const { telegram, name, description, side, stake } = req.body || {};
        if (!telegram || !name || !description || !side || (stake === undefined || stake === null)) {
            return res.status(400).json({
                ok: false,
                error: 'validation_error',
                message: 'telegram, name, description, side, stake required'
            });
        }

        // fetch user row (get username and placed_bets)
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('id, username, telegram, points, placed_bets')
            .eq('telegram', Number(telegram))
            .limit(1)
            .maybeSingle();

        if (userErr) {
            console.error('create-event: supabase users select error', userErr);
            return res.status(500).json({ ok: false, error: 'db_error', message: 'database error' });
        }

        if (!userRow) {
            return res.status(404).json({ ok: false, error: 'user_not_found', message: 'user not found' });
        }

        const stakeNum = Number(stake)
        if (!Number.isFinite(stakeNum) || stakeNum < 0) {
            return res.status(400).json({ ok: false, error: 'validation_error', message: 'invalid stake' });
        }

        const totalEventPrice = stakeNum + 0.1 // stake user is initially betting and also 0.1 price for creation

        if (totalEventPrice > Number(userRow.points)) {
            return res.status(400).json({ ok: false, error: 'insufficient_funds', message: 'not enough points to create the event' });
        }

        let sideFormatted = 'empty';
        if (String(side).toLowerCase() === 'yes') sideFormatted = 'yes';
        else if (String(side).toLowerCase() === 'no') sideFormatted = 'no';

        // insert potential created event row
        const { data: newEventRow, error: insertErr } = await supabaseAdmin
            .from('bets')
            .insert([
                {
                    name: String(name).trim(), description: String(description).trim(), creator_first_stake: stakeNum, creator_side: sideFormatted,
                    isApproved: false, result: 'undefined', prizes_given: false, creator_telegram: telegram, status: 'Waiting'
                }
            ])
            .select()

        if (insertErr) {
            console.error('create-event: supabase insert error', insertErr);
            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not create event' });
        }

        const newEventId = Array.isArray(newEventRow) ? newEventRow[0]?.id : newEventRow?.id
        if (!newEventId) {
            console.error('create-event: could not find new event id', newEventRow)
            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not determine new event id' });
        }

        const newPoints = Number(userRow.points) - totalEventPrice
        const updatePayload = { points: newPoints }

        // Only add to placed_bets if stake > 0
        if (stakeNum > 0) {
            const existingPlaced = Array.isArray(userRow.placed_bets) ? userRow.placed_bets.slice() : []

            const newPlacedBet = {
                side: sideFormatted,
                stake: stakeNum,
                bet_id: newEventId,
                placed_at: new Date().toISOString() // using current server time
            }

            existingPlaced.push(newPlacedBet)
            updatePayload.placed_bets = existingPlaced
        }

        // update users row (deduct points, upsert to placed_bets)
        const { data: newUserRow, error: updateUserErr } = await supabaseAdmin
            .from('users')
            .update(updatePayload)
            .eq('telegram', Number(telegram))
            .limit(1)
            .maybeSingle();

        if (updateUserErr) {
            console.error('create-event: supabase update users record error', updateUserErr);
            // NOTE: newEvent was created but user update failed — consider a compensating action or audit
            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not update user' });
        }

        // prepare message (escape username & values for HTML mode)
        const escapeHtml = (s = '') =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

        // Build clickable username link: prefer https://t.me/<username> if available
        const rawUsername = userRow.username ? String(userRow.username).replace(/^@/, '') : null;
        let userLinkHref, userLinkText;
        if (rawUsername) {
            userLinkHref = `https://t.me/${encodeURIComponent(rawUsername)}`;
            userLinkText = `@${rawUsername}`;
        } else {
            // fallback to tg://user?id=<telegram>
            userLinkHref = `tg://user?id=${encodeURIComponent(String(userRow.telegram))}`;
            userLinkText = `telegram:${userRow.telegram}`;
        }

        const stakeFormatted = Number.isFinite(stakeNum) ? stakeNum : stake;

        const lines = [];

        lines.push('<b>New Event Creation Request 🖨️</b>');

        const clickable = `<a href="${userLinkHref}">${escapeHtml(userLinkText)}</a>`;

        const sideEscaped = escapeHtml(String(sideFormatted));

        lines.push(`${clickable} just requested to create an event named: ${escapeHtml(String(name))}. The description is: "${description}"`);

        lines.push(`Initial choice: ${stakeFormatted} TON on ${sideEscaped} ⭐`);

        const messageText = lines.join('\n');

        // send message using Telegraf bot instance
        try {
            const chatId = chat_id;

            if (!chatId) {
                console.error('create-event: no chat id configured');
            } else {
                await bot.telegram.sendMessage(chat_id, messageText, { parse_mode: 'HTML', disable_web_page_preview: true });
            }
        } catch (tgErr) {
            console.error('create-event: telegram send error', tgErr);
            return res.status(502).json({ ok: false, error: 'telegram_error', message: 'notification_failed' });
        }
    } catch (err) {
        console.error('create-event unexpected error', err);
        return res.status(500).json({ ok: false, error: 'internal_error', message: 'internal server error' });
    }
});

app.get("/api/get-chance", async (req, res) => {
    console.log('Hit /api/get-chance')
    try {
        let betID = 28
        const { data: currentChance, error: userErr } = await supabaseAdmin
            .from("bets")
            .select("current_odds")
            .eq("id", betID)
            .limit(1)
            .maybeSingle();

        let oddsNumber = currentChance.current_odds

        res.json({ oddsNumber });
    } catch (err) {
        console.log('Fail get currentChance: ' + err)
        res.status(500).json({ error: "failed to fetch chance" });
    }
});

app.post("/api/invoice", async (req, res) => {
    console.log('Hit /api/invoice')
    try {
        const { amount } = req.body;
        const link = await createInvoiceLink(amount);
        console.log('Link created: ' + link)
        res.json({ link });
    } catch (err) {
        console.log('FAIL STARS LINK: ' + err)
        res.status(500).json({ error: "failed to create invoice" });
    }
});

export async function createInvoiceLink(amount) {
    return bot.telegram.createInvoiceLink(
        {
            title: `Deposit ${Number(amount / 300).toFixed(2)} TON`,
            description: "Top-Up Gifts Predict balance using Telegram Stars",
            payload: "{}",
            provider_token: "",
            currency: "XTR",
            prices: [{ amount: amount, label: `${Number(amount / 300).toFixed(2)} TON!` }]
        }
    );
}

app.post("/api/giftHandle", async (req, res) => {
    console.log("[BACKEND HIT] /api/giftHandle");
    try {
        const rec = req.body ?? {};
        // Basic validation
        // Expect the worker to POST the record with fields like:
        // { telegram_sender_id, sender_username, gift_id, collection_name, unique_base_name, is_unique, star_count, raw_json, ... }
        if (!rec || Object.keys(rec).length === 0) {
            return res.status(400).json({ error: "empty payload" });
        }

        // 2) Determine the collection key to lookup
        const collectionKey = String(rec.collection_name || "").trim();
        if (!collectionKey) {
            console.warn("giftHandle: no collection key provided", rec);
            return res.status(400).json({ error: "no_collection_key" });
        }

        // 3) Fetch current up-to-date prices for this collection from Supabase.
        //    A dedicated table `gift_prices` (columns: collection_name text, price_ton numeric)
        let priceTon = null;
        try {
            // Attempt 1: gift_prices table (case-insensitive match)
            const { data: gpData, error: gpErr } = await supabaseAdmin
                .from("gift_prices")
                .select("*")
                .ilike("collection_name", collectionKey)
                .limit(1);

            if (gpErr) {
                // table might not exist
                console.error("giftHandle: gift_prices query error (maybe table missing) -", gpErr.message || gpErr);
                return res.status(400).json({ error: "table_not_found" });

            } else if (gpData && gpData.length > 0) {
                const row = gpData[0];
                priceTon = row.price_ton !== undefined ? Number(row.price_ton) : null;
                console.log("giftHandle: found price in gift_prices table", { collection: collectionKey, priceTon });
            }
        } catch (err) {
            console.error("giftHandle: error while fetching prices", err);
        }

        // If price not found, return reasonable error so you can add mapping in DB.
        if (priceTon == null || Number.isNaN(priceTon)) {
            console.warn("giftHandle: price not found for collection", collectionKey);
            // GIFT NOT UNIQUE OR NOT FOUND BUT KEEP TRACK OF IT IN CASE WE FUCKED UP
            return res.status(404).json({ error: "gift_not_unique", collection: collectionKey });
        }

        // 4) Find (or create) the user and update points
        // rec.telegram_sender_id is expected to be Telegram id (integer or string)
        const telegramSenderRaw = rec.telegram_sender_id ?? null;
        if (!telegramSenderRaw) {
            console.warn("giftHandle: no sender telegram id in payload", rec);
            return res.status(400).json({ error: "no_sender_telegram_id" });
        }
        const telegramSender = Number(telegramSenderRaw);

        let user = null;
        try {
            // find user by telegram
            const { data: existingUser, error: userErr } = await supabaseAdmin
                .from("users")
                .select("id, points")
                .eq("telegram", telegramSender)
                .limit(1)
                .maybeSingle();

            if (userErr) {
                console.error("giftHandle: users select error", userErr);
                return res.status(500).json({ error: "db_error_read_user", details: userErr.message || userErr });
            }

            if (existingUser) {
                // update points
                const oldPoints = Number(existingUser.points ?? 0);
                const newPoints = oldPoints + Number(priceTon);
                const { data: updUser, error: updErr } = await supabaseAdmin
                    .from("users")
                    .update({ points: newPoints })
                    .eq("id", existingUser.id)
                    .select()
                    .single();

                if (updErr) {
                    console.error("giftHandle: users update error", updErr);
                    return res.status(500).json({ error: "db_error_update_user", details: updErr.message || updErr });
                }
                user = updUser;
            } else {
                // create a minimal user record (telegram required by constraint)
                const { data: insUser, error: insErr } = await supabaseAdmin
                    .from("users")
                    .insert({ telegram: telegramSender, points: Number(priceTon) })
                    .select()
                    .single();

                if (insErr) {
                    console.error("giftHandle: users insert error", insErr);
                    return res.status(500).json({ error: "db_error_create_user", details: insErr.message || insErr });
                }
                user = insUser;
            }
        } catch (err) {
            console.error("giftHandle: user upsert error", err);
            return res.status(500).json({ error: "internal_error", details: err.message });
        }

        // 5) Insert transaction row
        try {
            const now = new Date().toISOString();
            const txUuid = uuidv4();
            const txRow = {
                uuid: txUuid,
                user_id: user?.telegram ?? null,
                amount: Number(priceTon),
                status: "Пополнение подарком",
                created_at: now,
                withdrawal_pending: false,
                withdrawal_address: null,
                deposit_address: null,
                type: "Gift",
                handled: true,
                processed_at: now,
                onchain_hash: null,
                onchain_amount: null,
                sender_wallet: null
            };

            const { data: txData, error: txErr } = await supabaseAdmin
                .from("transactions")
                .insert(txRow)
                .select()
                .single();

            if (txErr) {
                console.error("giftHandle: transactions insert error", txErr);
                // There was an error writing the transaction — attempt to roll back the points update?
                // For now, return an error so you can investigate.
                return res.status(500).json({ error: "db_error_insert_transaction", details: txErr.message || txErr });
            }

            console.log("giftHandle: processed gift COMPLETE - DONE!");

            return res.json({ ok: true, processed: true, user_id: user.telegram, amount: priceTon, transaction_uuid: txUuid });

        } catch (err) {
            console.error("giftHandle: transaction insertion internal error", err);
            return res.status(500).json({ error: "internal_error", details: err.message });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "unexpected_error", details: err.message });
    }
});

// rate limit to protect the Telegram bot from spam
const notifyLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,              // limit to 10 calls/min (tune as needed)
    message: { error: 'too_many_requests' }
});

function buildMessage(payload) {
    // build safe HTML message, escaping user-controlled values
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<b>Manual withdrawal required</b>\n\n` +
        `UUID: <code>${esc(payload.uuid)}</code>\n` +
        `Amount: ${esc(payload.amount)} TON (${esc(payload.amountNano)} nanotons)\n` +
        `Balance: ${esc(payload.balanceNano)} nanotons\n` +
        `To: <code>${esc(payload.withdrawal_address)}</code>\n` +
        `Time: ${esc(payload.timestamp)}\n`;
}

app.post("/api/notify-handpicking", notifyLimiter, verifySignature, async (req, res) => {
    console.log('Hit /api/notify-handpicking', req.headers['x-worker-id'] || '');
    try {
        if (!token) {
            console.error('Telegram token not configured');
            return res.status(500).json({ error: 'Telegram bot token not configured' });
        }

        const messageText = buildMessage(req.body); // function from earlier, escapes values

        const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
        const tgResp = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: '-1002951097413',
                text: messageText,
                parse_mode: 'HTML'
            })
        });

        const tgData = await tgResp.json().catch(() => null);
        if (!tgResp.ok) {
            console.error('Telegram API error:', tgResp.status, tgData);
            return res.status(502).json({ error: 'Telegram API error', status: tgResp.status });
        }
        return res.status(200).json({ ok: true, result: tgData?.result });
    } catch (err) {
        console.error('Unexpected error in /api/notify-handpicking:', err);
        return res.status(500).json({ error: 'failed to send bot message' });
    }
});

app.post("/api/botmessage", async (req, res) => {
    console.log("Hit /api/botmessage");
    try {
        const { messageText, userID } = req.body;
        if (!messageText || !userID) {
            return res.status(400).json({ error: "messageText and userID required" });
        }

        if (!token) {
            console.error('Telegram token not configured (token is missing)');
            return res.status(500).json({ error: 'Telegram bot token not configured' });
        }

        const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;

        const payload = {
            chat_id: String(userID),
            text: messageText,
            parse_mode: 'HTML', // optionally; or 'MarkdownV2' / omit
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Open profile", url: "https://t.me/giftspredict_bot?startapp" }]
                ]
            }
        };

        const tgResp = await fetch(tgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const tgData = await tgResp.json().catch(() => null);
        if (!tgResp.ok) {
            console.error("Telegram API error:", tgResp.status, tgData);
            return res.status(502).json({ error: "Telegram API error", status: tgResp.status, details: tgData });
        }

        return res.status(200).json({ ok: true, result: tgData?.result });
    } catch (err) {
        console.error('Unexpected error in /api/botmessage:', err);
        return res.status(500).json({ error: "failed to send bot message", details: String(err) });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegram, amount, address, idempotencyKey, wallet_id } = req.body;
        if (!telegram || !amount || !address) return res.status(400).json({ error: 'missing parameters' });

        const rpc = await supabaseAdmin.rpc('submit_withdrawal', {
            p_telegram: telegram,
            p_amount: amount,
            p_withdrawal_address: address,
            p_idempotency_key: idempotencyKey ?? null,
            p_wallet_id: "cf9e2291-74ab-4a30-991b-5b6a2a3f7843"
        });

        // rpc returns an array-like row
        const row = Array.isArray(rpc) ? rpc[0] : rpc;
        return res.json({ success: true, tx_uuid: row?.out_uuid, remaining_points: row?.out_remaining_points });
    } catch (err) {
        const msg = (err?.message || JSON.stringify(err)) + '';
        if (msg.includes('insufficient_funds')) {
            return res.status(400).json({ error: 'insufficient_funds' });
        }
        console.error('submit_withdrawal error', err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

app.post('/api/deposit-intent', depositLimiter, async (req, res) => {
    try {
        // log incoming raw payload (helpful in debugging)
        console.log('[deposit-intent] incoming payload:', req.body);

        // coerce amount to a Number so client may send "1.2" or 1.2
        const rawAmount = req.body?.amount;
        const amount = (typeof rawAmount === 'string' || typeof rawAmount === 'number')
            ? Number(rawAmount)
            : NaN;

        if (!Number.isFinite(amount) || amount <= 0) {
            console.warn('[deposit-intent] invalid amount received:', rawAmount);
            return res.status(400).json({ error: 'Invalid amount', received: rawAmount });
        }

        const { user_id, usersWallet } = req.body ?? {};
        const MAX_AMOUNT = Number(process.env.MAX_DEPOSIT_AMOUNT || 99999);
        if (amount > MAX_AMOUNT) {
            console.warn('[deposit-intent] amount too large:', amount);
            return res.status(400).json({ error: `Amount too large (max ${MAX_AMOUNT})` });
        }

        const uuid = uuidv4();
        const depositAddress = HOT_WALLET;
        if (!depositAddress) {
            console.error('[deposit-intent] no deposit address configured');
            return res.status(500).json({ error: 'Server misconfiguration' });
        }

        const insertRow = {
            uuid,
            user_id: user_id ?? null,
            amount,
            status: 'Незавершенное пополнение',
            type: 'Deposit',
            deposit_address: depositAddress,
            sender_wallet: usersWallet ?? null,
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabaseAdmin
            .from('transactions')
            .insert(insertRow)
            .select()
            .single();

        if (error) {
            console.error('[deposit-intent] supabase insert error', error);
            return res.status(500).json({ error: 'Database error' });
        }

        console.log('[deposit-intent] created', { uuid: data.uuid, user_id: data.user_id, amount: data.amount });
        return res.status(201).json({ uuid: data.uuid, deposit_address: data.deposit_address, created_at: data.created_at });
    } catch (err) {
        console.error('[deposit-intent] unexpected error', err?.message ?? err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


// ---------- POST /api/deposit-cancel ----------
app.post('/api/deposit-cancel', async (req, res) => {
    try {
        const { txId } = req.body;
        if (!txId) return res.status(400).json({ error: 'txId required' });

        // Only update pending, unhandled deposits to "Отмененное пополнение"
        // We intentionally do not set handled = true — so if a user actually sends funds later,
        // the worker can still process the on-chain deposit.
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .update({
                status: 'Отмененное пополнение',
                processed_at: new Date().toISOString()
            })
            .eq('uuid', txId)
            .is('handled', false)
            .limit(1)
            .select()
            .single();

        if (error) {
            // If not found, the transaction might already be handled/processed
            console.warn('deposit-cancel: update returned error', error);
            return res.status(404).json({ error: 'Not found or already processed' });
        }

        return res.json({ ok: true, uuid: data.uuid, status: data.status });
    } catch (err) {
        console.error('deposit-cancel error', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Add near your other routes (requires these to be defined above):
// import { v4 as uuidv4 } from 'uuid'  // you already have this
// ensure supabaseAdmin is available (server-side client)

app.post('/api/stars-payment', async (req, res) => {
    try {
        // Expect body: { amountStars: number|string } - amount in "stars"
        const raw = req.body?.amountStars ?? req.body?.amount ?? null;
        const telegramId = req.body?.user_id ?? req.body?.telegram ?? null;
        if (raw === null || raw === undefined) {
            return res.status(400).json({ ok: false, error: 'missing_amount' });
        }

        const amountStarsNum = Number(raw);
        if (!Number.isFinite(amountStarsNum) || amountStarsNum <= 0) {
            return res.status(400).json({ ok: false, error: 'invalid_amount' });
        }

        // round to 2 decimals like you requested
        const amountStarsRounded = Number(amountStarsNum.toFixed(2))

        // convert to TON (and points) by dividing by 300
        const amountTON = Number((amountStarsRounded / 300).toFixed(2)) // keep reasonable precision for TON

        // fetch user row by telegram
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('telegram', Number(telegramId))
            .limit(1)
            .maybeSingle()

        if (userErr) {
            console.error('stars-payment: supabase users select error', userErr)
            return res.status(500).json({ ok: false, error: 'db_error' })
        }
        if (!userRow) {
            return res.status(404).json({ ok: false, error: 'user_not_found' })
        }

        // compute new points value (points column appears numeric)
        const oldPoints = Number(userRow.points ?? 0)
        const pointsToAdd = amountTON // as you requested: add TON-equivalent to points
        const newPoints = Number((oldPoints + pointsToAdd).toFixed(2))

        // update user points
        const { data: updUser, error: updErr } = await supabaseAdmin
            .from('users')
            .update({ points: newPoints })
            .eq('id', userRow.id)
            .select()
            .single()

        if (updErr) {
            console.error('stars-payment: supabase users update error', updErr)
            return res.status(500).json({ ok: false, error: 'db_error_update_user' })
        }

        // insert transaction row
        const txUuid = uuidv4()
        const insertRow = {
            uuid: txUuid,
            user_id: telegramId ?? 99,
            amount: amountTON, // amount IN TON as requested
            status: 'Успешное пополнение',
            type: 'Deposit',
            deposit_address: null,
            sender_wallet: null,
            created_at: new Date().toISOString()
        }

        const { data: txData, error: txErr } = await supabaseAdmin
            .from('transactions')
            .insert(insertRow)
            .select()
            .single()

        if (txErr) {
            console.error('stars-payment: transactions insert error', txErr)
            // attempt to rollback user points update? For now return error and log
            return res.status(500).json({ ok: false, error: 'db_error_insert_transaction' })
        }

        console.log('stars-payment: processed', {
            telegram: telegramId,
            user_id: userRow.id,
            amountStars: amountStarsRounded,
            amountTON,
            newPoints,
            txUuid
        })

        return res.json({
            ok: true,
            amountStars: amountStarsRounded,
            amountTON,
            pointsAdded: pointsToAdd,
            newPoints,
            transaction_uuid: txUuid
        })
    } catch (err) {
        console.error('stars-payment unexpected error', err)
        return res.status(500).json({ ok: false, error: 'internal_error', details: String(err) })
    }
})

// ---------- GET /api/balance?address=... ----------
app.get('/api/balance', async (req, res) => {
    try {
        const address = String(req.query.address || '').trim();
        if (!address) return res.status(400).json({ error: 'address query param required' });

        if (!TONCENTER_API_KEY) {
            return res.status(500).json({ error: 'Server not configured to fetch balances' });
        }

        // call TONCenter (server-side) to fetch address balance (nanotons)
        const url = `${TONCENTER_API_BASE}/getAddressBalance`;
        const resp = await axios.get(url, {
            params: {
                address,
                api_key: TONCENTER_API_KEY
            },
            timeout: 10_000
        });

        if (resp.status !== 200 || !resp.data) {
            console.warn('toncenter/balance non-200', resp.status, resp.data);
            return res.status(502).json({ error: 'Upstream error' });
        }

        // TonCenter returns result as string of nanotons usually in resp.data.result
        const raw = resp.data?.result;
        const nano = Number(raw);
        if (Number.isNaN(nano)) {
            console.warn('balance parse failed', raw);
            return res.status(502).json({ error: 'Invalid balance format from provider' });
        }

        const balanceTON = nano / 1e9;
        return res.json({ balance: balanceTON });
    } catch (err) {
        console.error('balance endpoint error', err?.response?.data ?? err?.message ?? err);
        // bubble upstream error message cautiously
        return res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// ---------- GET /api/channelMembership?userId=... ----------
app.get('/api/channelMembership', async (req, res) => {
    try {
        const userId = String(req.query.userId || '').trim()
        if (!userId) return res.status(400).json({ error: 'userId query param required' })

        if (!token) {
            return res.status(500).json({ error: 'Bot not configured to check member' })
        }
        let formattedChatId = '@giftspredict'


        const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getChatMember` +
            `?chat_id=${encodeURIComponent(formattedChatId)}` +
            `&user_id=${encodeURIComponent(userId)}`;


        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error('Telegram API error:', response.status, errorText);
            return res.status(502).json({
                error: 'Telegram API error',
                status: response.status,
                details: errorText,
            });
        }

        const data = await response.json().catch(() => null);
        if (!data) {
            console.error('Telegram returned invalid JSON');
            return res.status(502).json({ error: 'Invalid response from Telegram API' });
        }

        if (!data.ok) {
            console.error('Telegram API responded with ok=false', data);
            return res.status(502).json({ error: 'Telegram API returned ok=false', payload: data });
        }

        const status = data.result?.status ?? null;
        const isMember = ['creator', 'administrator', 'member'].includes(status);

        // Return JSON to the caller
        return res.json({ isMember });

    } catch (err) {
        console.error('Error checking channel membership:', err);
        return res.status(500).json({ error: 'Failed to check channel membership', details: String(err) });
    }
})


// helper to pull deep-link payload from "/start ABC123"
function extractPayload(ctx) {
    if (!ctx.message || !ctx.message.text) return null
    const parts = ctx.message.text.split(" ")
    // allow "/start=ABC123", "/start ABC123", or even "/startABC123"
    if (parts[0].startsWith("/start")) {
        // after "/start", grab anything after '=' or space
        const raw = parts[0].includes("=")
            ? parts[0].split("=")[1]
            : (parts[1] || null)
        return raw
    }
    return null
}

// Ensure fetchWithRetry is defined somewhere above (implementation shown after)
async function handleStart(ctx) {
    try {
        // safe reaction: not critical, so isolate errors
        try {
            if (ctx?.chat?.id && ctx?.message?.message_id) {
                await ctx.telegram.setMessageReaction(
                    ctx.chat.id,
                    ctx.message.message_id,
                    [{ type: "emoji", emoji: "🔥" }],
                    false
                );
            }
        } catch (err) {
            console.warn('[bot] setMessageReaction failed (non-fatal):', err?.message ?? err);
        }

        try {
            await ctx.sendChatAction('typing');
        } catch (err) {
            console.log('[bot telegraf] action blocked:', err?.message ?? err);
        }

        // ensure session exists
        if (!ctx.session) ctx.session = {};

        // save deep-link payload (if any)
        const incoming = extractPayload(ctx);
        if (incoming) {
            ctx.session.ref = incoming;
            console.log('Saved ref for', ctx.from?.id, '=', incoming);
        }

        const privacyUrl = "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/services-information/GiftsPredictPrivacyPolicy.pdf";
        const bannerUrl = "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/Horizontal_Banner.png";

        // build startAppQuery and ensure safe encoding
        const rawRef = ctx.session.ref ?? '';
        const startAppQuery = `?startapp=${encodeURIComponent(rawRef)}`;

        // prepare reply options (keyboard + common options)
        const replyOptions = {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [Markup.button.url("🕹️ Open App", `https://t.me/giftspredict_bot${startAppQuery}`)],
                [Markup.button.url("📢 Community", `https://t.me/giftspredict`)]
            ]),
            message_effect_id: effectIdTwo
        };

        // after fetchWithRetry succeeded, download buffer and send as "source"
        try {
            const res = await fetchWithRetry(bannerUrl, { timeout: 8000 }, 2);
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!ct.startsWith('image/')) {
                throw new Error('Not an image, content-type=' + ct);
            }
            const arrayBuffer = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);

            console.log('[banner] downloaded', buf.length, 'bytes, ct=', ct);

            // Send image as buffer so Telegram receives it from your app, not from remote url
            return ctx.replyWithPhoto({ source: buf }, {
                caption: `Welcome to Gifts Predict! 🔮 Use your knowledge, play and predict the future events.`,
                ...replyOptions
            });
        } catch (e) {
            console.warn('banner send failed (will fallback to text):', e?.message ?? e);
            return ctx.reply(
                `Welcome to Gifts Predict! 🔮 Use your knowledge, play and predict the future events.`,
                { disable_web_page_preview: true, ...replyOptions }
            );
        }

    } catch (err) {
        console.error('❌ start handler failed:', err);
        // don't expose internals to users; a short user-friendly message is fine
        try {
            return ctx.reply("An error occurred, please try again later.");
        } catch (_) {
            // if reply also fails, swallow to avoid throwing out of the handler
            return null;
        }
    }
}


async function handleNewUser(ctx) {
    try {
        // ensure session exists
        if (!ctx.session) ctx.session = {}

        // if they launched via deep-link, save it
        const incoming = extractPayload(ctx)
        if (incoming) {
            ctx.session.ref = incoming
            console.log("Saved ref for", ctx.from.id, "=", incoming)
        }
    }
    catch (err) {
        console.error("❌ start handler failed:", err)
        return ctx.reply("An error occured, please try again later.")
    }
}

bot.command("start", handleStart)
bot.on("text", handleNewUser)

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

bot.launch()

export default bot

// --- multi-worker supervisor (replace your old supervisor block with this) ---
// place after app.listen(...) and bot.launch()
import { spawn } from 'child_process';
import path from 'path';
import process from 'process';

function startWorkerWithSupervisor() {
    // list of worker files (relative to project root)
    const workers = [
        './worker.js',                  // existing deposit crypto worker
        './giftrelayer-listener.js',    // new Gift Relayer listener
        './withdrawal-worker.js'        // new Withdrawal Worker
    ];

    // per-worker state for backoff + child reference
    const state = {};
    for (const wf of workers) {
        state[wf] = { restartDelay: 1000, maxDelay: 60_000, child: null, spawning: false };
    }

    function spawnWorker(wf) {
        const abs = path.resolve(wf);
        const st = state[wf];

        // avoid concurrent spawns for same worker
        if (st.spawning) {
            console.log(`[supervisor] spawn already in progress for ${wf}`);
            return;
        }
        st.spawning = true;

        console.log(`[supervisor] spawning worker: ${abs}`);
        // inside spawnWorker(wf) where you call spawn(...)
        const child = spawn(process.execPath, [abs], {
            env: { ...process.env, SUPERVISOR_CHILD: '1', WORKER_NAME: wf },
            stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });

        st.child = child;

        child.once('spawn', () => {
            st.spawning = false;
            st.restartDelay = 1000; // reset backoff on successful spawn
            console.log(`[supervisor] worker spawned: ${wf} (pid=${child.pid})`);
        });

        child.on('message', (m) => {
            // optional: children can send messages via process.send()
            console.log(`[worker msg ${wf}]`, m);
        });

        child.on('exit', (code, signal) => {
            st.child = null;
            st.spawning = false;
            console.warn(`[supervisor] worker exited (${wf}) code=${code} signal=${signal}`);
            // schedule restart with exponential backoff
            const delay = st.restartDelay;
            setTimeout(() => {
                st.restartDelay = Math.min(st.maxDelay, Math.max(1000, st.restartDelay * 2));
                console.log(`[supervisor] restarting worker ${wf} in ${delay}ms`);
                spawnWorker(wf);
            }, delay);
        });

        child.on('error', (err) => {
            st.child = null;
            st.spawning = false;
            console.error(`[supervisor] spawn error (${wf}):`, err);
            // try again after restartDelay
            setTimeout(() => spawnWorker(wf), st.restartDelay);
        });
    }

    // inside startWorkerWithSupervisor(), replace the "start all workers" loop with:
    for (const wf of workers) {
        // skip if already have a child (safety belt)
        if (state[wf].child) {
            console.log(`[supervisor] child already present for ${wf} pid=${state[wf].child.pid}`);
            continue;
        }
        spawnWorker(wf);
    }

    // graceful shutdown: kill children, then exit
    const shutdown = () => {
        console.log('[supervisor] shutting down workers...');
        for (const wf of workers) {
            const st = state[wf];
            if (st?.child) {
                try {
                    console.log(`[supervisor] sending SIGTERM to ${wf} (pid=${st.child.pid})`);
                    st.child.kill('SIGTERM');
                } catch (e) {
                    console.warn(`[supervisor] failed to kill ${wf}`, e);
                }
            }
        }
        // give children a short time to exit
        setTimeout(() => process.exit(0), 2_000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // optional: expose a simple health check to know child PIDs (useful in logs)
    return {
        getChildren: () => workers.map(wf => ({ worker: wf, pid: state[wf].child?.pid ?? null, restartingIn: state[wf].restartDelay }))
    };
}

// start supervisor AFTER server and bot are listening
// startWorkerWithSupervisor();

const sup = startWorkerWithSupervisor();
console.log('[supervisor] children', sup.getChildren());