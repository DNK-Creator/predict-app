import fetch from 'node-fetch'
import axios from 'axios'
import { Telegraf, Markup, session } from "telegraf"
import 'dotenv/config'
import express from "express"
import cors from "cors"
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL; // e.g. https://xyz.supabase.co
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_API_KEY; // service_role key (server-only)
const TONCENTER_API_KEY = process.env.VITE_TONCENTER_API_KEY;
const TONCENTER_API_BASE = process.env.VITE_TONCENTER_URL || 'https://api.toncenter.com/api/v2'
const HOT_WALLET = process.env.VITE_HOT_WALLET;

// basic validation
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

// create server-side Supabase client (must use service key)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

const token = process.env.BOT_TOKEN
const bot = new Telegraf(token)
// install session middleware
bot.use(session())

const effectIdTwo = "5046509860389126442"

const app = express()
app.use(express.json())

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
    console.log(`[req] ${req.ip} ${req.method} ${req.path} origin=${req.headers.origin || '-'}`);
    // for non-GETs, show the body (small bodies only) 
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length <= 50) {
        console.log('[req.body]', JSON.stringify(req.body));
    } else if (req.method !== 'GET') {
        console.log('[req.body] (omitted — too large or empty)');
    }
    next();
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


app.post("/api/botmessage", async (req, res) => {
    console.log("Hit /api/botmessage");
    try {
        const { messageText, userID } = req.body;
        if (!messageText || !userID) {
            return res.status(400).json({ error: "messageText and userID required" });
        }

        if (!token) {
            console.error('Telegram token not configured (process.env.TELEGRAM_BOT_TOKEN missing)');
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

// pull all the logic into one function
async function handleStart(ctx) {
    try {

        await ctx.telegram.setMessageReaction(
            ctx.chat.id,
            ctx.message.message_id,
            [
                {
                    type: "emoji",
                    emoji: "🔥"
                }
            ],
            false
        );

        try {
            await ctx.sendChatAction('typing');
        } catch (err) {
            console.log('[bot telegraf] action blocked: ' + err)
        }

        // ensure session exists
        if (!ctx.session) ctx.session = {}

        // if they launched via deep-link, save it
        const incoming = extractPayload(ctx)
        if (incoming) {
            ctx.session.ref = incoming
            console.log("Saved ref for", ctx.from.id, "=", incoming)
        }

        const privacyUrl = "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/services-information/GiftsPredictPrivacyPolicy.pdf";
        const bannerUrl = "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/Horizontal_Banner.png";
        const startAppQuery = ctx.session.ref ? `?startapp=${encodeURIComponent(ctx.session.ref)}` : "";

        return ctx.replyWithPhoto(
            { url: bannerUrl },
            {
                caption: `Welcome to Gifts Predict! 🔮 Use your knowledge, play and predict the future events.\n\nBy playing, you agree to our <a href="${privacyUrl}">Privacy Policy</a> and the User Agreement in the app profile settings.`,
                parse_mode: "HTML",
                // <-- spread the inlineKeyboard into the options:
                ...Markup.inlineKeyboard([
                    [Markup.button.url(
                        "🕹️ Open App",
                        `https://t.me/giftspredict_bot${startAppQuery}`
                    )],
                    [Markup.button.url(
                        "📢 Community",
                        `https://t.me/giftspredict`
                    )]
                ]),
                message_effect_id: effectIdTwo,
            });

    }
    catch (err) {
        console.error("❌ start handler failed:", err)
        return ctx.reply("An error occured, please try again later.")
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
        './worker.js',                  // existing crypto worker (your existing one)
        './giftrelayer-listener.js'     // new Gift Relayer listener (GramJS)
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