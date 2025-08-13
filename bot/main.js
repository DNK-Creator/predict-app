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
// 2) Enable CORS *only* from your front-end domain
app.use(cors({
    origin: 'https://giftspredict.ru',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}))

// If your app runs behind a single trusted proxy (e.g. nginx), set:
app.set('trust proxy', 1);

// debug request logging - remove or tone down in production
app.use((req, res, next) => {
    // log basic request line
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

app.post("/api/invoice", async (req, res) => {
    console.log('Hit /api/invoice')
    try {
        const { amount } = req.body;
        const link = await createInvoiceLink(amount);
        res.json({ link });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "failed to create invoice" });
    }
});

export async function createInvoiceLink(amount) {
    return bot.telegram.createInvoiceLink(
        {
            title: "Deposit With Stars",
            description: "Some description",
            payload: "{}",
            provider_token: "",
            currency: "XTR",
            prices: [{ amount: amount, label: `${amount * 2} Coins!` }]
        }
    );
}

app.post("/api/botmessage", async (req, res) => {
    console.log("Hit /api/botmessage");
    try {
        const { messageText, userID } = req.body;
        if (!messageText || !userID) {
            return res.status(400).json({ error: "messageText and userID required" });
        }

        // Build body for Telegram API (POST with JSON to avoid URL-encoding hazards)
        const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = {
            chat_id: String(userID),
            text: messageText,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Открыть кошелек", url: "https://t.me/giftspredict_bot?startapp" }]
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
            console.error("Telegram API error:", tgData);
            return res.status(502).json({ error: "Telegram API error", details: tgData });
        }

        // success — return Telegram result to client (or a sanitized success message)
        return res.status(200).json({ ok: true, result: tgData?.result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "failed to send bot message", details: err.message });
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
        const { uuid } = req.body;
        if (!uuid) return res.status(400).json({ error: 'uuid required' });

        // Only update pending, unhandled deposits to "Отмененное пополнение"
        // We intentionally do not set handled = true — so if a user actually sends funds later,
        // the worker can still process the on-chain deposit.
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .update({
                status: 'Отмененное пополнение',
                processed_at: new Date().toISOString()
            })
            .eq('uuid', uuid)
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

// Subscribe to bot_messages inserts and send Telegram messages
// Place this after supabaseAdmin is created and after bot is initialized

// create a global channel name
const botMessagesChannel = supabaseAdmin
    .channel('bot-messages') // unique name for channel instance
    .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'bot_messages'
            // optional: add filter field if you only want certain inserts, e.g.
            // filter: 'sent=eq.false'  // supabase 'filter' currently supports column ops for table subscriptions
        },
        async (payload) => {
            try {
                // supabase payload shape may be payload.record or payload.new depending on version;
                // check both to be defensive:
                const rec = payload?.new ?? payload?.record ?? payload?.records?.[0] ?? null;
                console.log('[realtime] bot_messages payload:', payload);

                if (!rec) {
                    console.warn('[bot_messages] no record found in payload, skipping');
                    return;
                }

                const telegramId = rec.telegram_id ?? rec.user_id ?? null; // try a few likely field names
                const messageText = rec.message ?? rec.text ?? null;
                const rowId = rec.id ?? null;

                if (!telegramId || !messageText) {
                    console.warn('[bot_messages] missing telegramId or messageText', rec);
                    return;
                }

                // send message using Telegraf bot (no HTTP roundtrip)
                try {
                    // Use bot.telegram.sendMessage: parse_mode optional (HTML/Markdown)
                    await bot.telegram.sendMessage(String(telegramId), messageText, { parse_mode: 'HTML' });
                    console.log('[bot_messages] sent message to', telegramId, 'rowId=', rowId);

                    // mark message as sent in DB so we don't resend
                    if (rowId) {
                        const { error } = await supabaseAdmin
                            .from('bot_messages')
                            .update({ sent: true, processed_at: new Date().toISOString() })
                            .eq('id', rowId);

                        if (error) {
                            console.error('[bot_messages] failed to mark sent for id', rowId, error);
                        }
                    }
                } catch (sendErr) {
                    console.error('[bot_messages] failed to send telegram message', sendErr);
                    // don't mark sent — backend can retry later or admin can investigate
                }
            } catch (outerErr) {
                console.error('[bot_messages] handler crashed', outerErr);
            }
        }
    );

// subscribe
botMessagesChannel.subscribe(status => {
    console.log('[supabase] bot_messages channel status:', status);
});

try {
    await supabaseAdmin.from('bot_messages').insert([{ telegram_id: 123, message: 'test', sent: false }]);
    console.log('[supabase bot_messages] success')
} catch (err) {
    console.log('[supabase bot_messages] error when inserting message: ' + err)
}


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

        await ctx.sendChatAction('typing');

        // ensure session exists
        if (!ctx.session) ctx.session = {}

        // if they launched via deep-link, save it
        const incoming = extractPayload(ctx)
        if (incoming) {
            ctx.session.ref = incoming
            console.log("Saved ref for", ctx.from.id, "=", incoming)
        }

        return ctx.replyWithPhoto(
            { url: "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/Horizontal_Banner.png" },
            {
                caption: "Ты попал в <b>Gifts Predict! 🔮 </b> Предсказывай всевозможные события в Телеграме и зарабатывай призы!",
                parse_mode: "HTML",
                // <-- spread the inlineKeyboard into the options:
                ...Markup.inlineKeyboard([
                    [Markup.button.url(
                        "🕹️ Открыть приложение",
                        `https://t.me/giftspredict_bot?startapp=${ctx.session.ref || ""}`
                    )],
                    [Markup.button.url(
                        "📢 Комьюнити",
                        `https://t.me/giftspredict`
                    )]
                ]),
                message_effect_id: effectIdTwo,
            });
    }
    catch (err) {
        console.error("❌ start handler failed:", err)
        return ctx.reply("Произошла ошибка, попробуйте позже.")
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
        return ctx.reply("Произошла ошибка, попробуйте позже.")
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

// --- worker supervisor (add near the bottom of main.js, after app.listen and bot.launch) ---
import { spawn } from 'child_process';
import path from 'path';
import process from 'process';

function startWorkerWithSupervisor() {
    const workerFile = path.resolve('./worker.js'); // file in same root
    let restartDelay = 1000; // start with 1s
    const maxDelay = 60_000; // cap at 60s

    function spawnWorker() {
        console.log('[supervisor] spawning worker:', workerFile);
        const child = spawn(process.execPath, [workerFile], {
            env: { ...process.env },     // forward env
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'] // keep logs in docker output, enable IPC if needed later
        });

        child.on('message', (m) => {
            console.log('[worker msg]', m);
        });

        child.on('exit', (code, signal) => {
            console.warn(`[supervisor] worker exited (code=${code} signal=${signal})`);
            // simple backoff restart
            setTimeout(() => {
                restartDelay = Math.min(maxDelay, restartDelay * 2); // exponential backoff
                console.log(`[supervisor] restarting worker in ${restartDelay}ms`);
                spawnWorker();
            }, restartDelay);
        });

        child.on('error', (err) => {
            console.error('[supervisor] spawn error:', err);
            setTimeout(spawnWorker, restartDelay);
        });

        // reset restartDelay on successful start
        child.once('spawn', () => {
            restartDelay = 1000;
        });

        // optional: send a ping or config after spawn:
        // child.send({ type: 'init', debug: true });
    }

    spawnWorker();
}

// start supervisor AFTER the server and bot are listening (so ordering is clear)
startWorkerWithSupervisor();