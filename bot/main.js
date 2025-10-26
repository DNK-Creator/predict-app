import fetch from 'node-fetch'
import axios from 'axios'
import { Telegraf, Markup, session } from "telegraf"
import 'dotenv/config'
import express from "express"
import { load } from 'cheerio'
import cors from "cors"
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { createSessionToken, requireTelegramSession } from './server/middleware/telegramAuth.js'
import { verifyGiftWorkerSignature } from './server/middleware/verifyGiftWorker.js';
import usersApiRouter from './routes/api/users.js'
import betsApiRouter from './routes/api/bets.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL; // e.g. https://xyz.supabase.co
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY; // service_role key (server-only)
const TONCENTER_API_KEY = process.env.VITE_TONCENTER_API_KEY;
const TONCENTER_API_BASE = process.env.VITE_TONCENTER_URL || 'https://api.toncenter.com/api/v2'
const HOT_WALLET = process.env.VITE_HOT_WALLET;

const GIFT_RELAYER_TELEGRAM_ID = 8126734333

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
    origin: 'https://myoracleapp.com',
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

// Endpoint: validate initData
// Accepts { initData: '...' } (POST)
app.post('/api/telegram/validate', async (req, res) => {
    try {
        let initDataRaw = null;

        if (req.body && req.body.initData) {
            initDataRaw = req.body.initData;
        }

        if (!initDataRaw) {
            return res.status(400).json({ error: 'missing_init_data' });
        }

        const initData = new URLSearchParams(initDataRaw);
        initData.sort();

        const receivedHash = initData.get("hash");

        if (!receivedHash) {
            return res.status(400).json({ error: 'missing_hash' });
        }

        initData.delete("hash");

        const dataToCheck = [...initData.entries()].map(([key, value]) => key + "=" + value).join("\n");

        const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();

        const expectedHash = crypto.createHmac("sha256", secretKey).update(dataToCheck).digest("hex");

        console.log('telegram/validate: data_check_string=', dataToCheck);
        console.log('telegram/validate: expected hash (hex)=', expectedHash);
        console.log('telegram/validate: received hash (hex)=', receivedHash);

        // compare
        if (!safeEq(receivedHash, expectedHash)) {
            console.warn('telegram/validate: hash mismatch', { expectedHash, receivedHash });
            return res.status(401).json({ error: 'init_data_invalid' });
        }

        // optional: check auth_date freshness (prevent replay)
        const authDate = Number(dataToCheck.auth_date || 0);
        const nowSec = Math.floor(Date.now() / 1000);
        if (!authDate || Math.abs(nowSec - authDate) > (60 * 60 * 12)) {
            // reject if older than 12h
            console.warn('telegram/validate: auth_date too old or missing', { authDate, nowSec });
            return res.status(401).json({ error: 'init_data_expired' });
        }

        // parse user JSON if present
        let userObj = null;
        if (dataToCheck.user) {
            try { userObj = JSON.parse(dataToCheck.user); } catch (e) { /* ignore */ }
        }

        if (!userObj || !userObj.id) {
            return res.status(400).json({ error: 'missing_user' });
        }

        // create session token (signed by INTERNAL_SECRET)
        const sessionPayload = {
            id: Number(userObj.id),
            username: userObj.username || null,
            first_name: userObj.first_name || null,
            language_code: userObj.language_code || null,
            photo_url: userObj.photo_url ?? 'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/TiredPepeResized.png'
        };

        const sessionToken = createSessionToken(sessionPayload, 1000 * 60 * 30); // 30 minutes

        // return token and parsed user (we don't return the raw initData back)
        res.json({ ok: true, token: sessionToken, user: sessionPayload });
    } catch (err) {
        console.error('telegram/validate error', err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

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

const apiLimiter = rateLimit({
    windowMs: 15 * 1000, // 15 seconds window
    max: 30, // limit each IP to 30 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false
})

// START THE SECTION VALIDATION FOR RAW DATA SESSION

// --- Apply requireTelegramSession to most /api routes but allow public endpoints ---
const PUBLIC_API_PATHS = [
    '/tonprice',
    '/telegram/validate',
    '/telegram/nft',
    '/get-chance',
    '/gifts/prices',
    '/bets-holders',
    '/holidays',
    '/invoice',
    '/pay-withdraw',
    '/notify-handpicking',
    '/balance',
    '/giftHandle',
    '/giftFailed'
]

// robust parsing: decodeURIComponent on keys/values and keep the decoded strings
function parseInitData(raw) {
    if (typeof raw !== 'string') return {};
    const out = {};
    const pairs = raw.split('&');
    for (const pair of pairs) {
        if (!pair) continue;
        const i = pair.indexOf('=');
        if (i === -1) {
            try { out[decodeURIComponent(pair)] = ''; } catch (e) { out[pair] = ''; }
            continue;
        }
        const kRaw = pair.slice(0, i);
        const vRaw = pair.slice(i + 1);
        try {
            const k = decodeURIComponent(kRaw);
            const v = decodeURIComponent(vRaw);
            out[k] = v;
        } catch (e) {
            // fallback if decodeURIComponent fails for any reason
            out[kRaw] = vRaw;
        }
    }
    return out;
}

function buildDataCheckString(params) {
    // use the decoded strings as-is (do NOT JSON.stringify params.user)
    const keys = Object.keys(params).filter(k => k !== 'hash' && k !== 'signature').sort();
    return keys.map(k => `${k}=${params[k]}`).join('\n');
}

// secure equal, safe against timing attacks
function safeEq(a, b) {
    try {
        const A = Buffer.from(String(a));
        const B = Buffer.from(String(b));
        if (A.length !== B.length) return false;
        return crypto.timingSafeEqual(A, B);
    } catch (e) {
        return false;
    }
}

app.use('/api', (req, res, next) => {
    try {
        const p = String(req.path || '').toLowerCase();

        const allowed = PUBLIC_API_PATHS.some(pub => {
            // normalize pub just in case
            const pubPath = String(pub || '').toLowerCase();
            // exact match (e.g. '/tonprice')
            if (p === pubPath) return true;
            // prefix match (allows '/telegram/nft/<slug>' but not '/telegram/nftish')
            if (p.startsWith(pubPath + '/')) return true;
            return false;
        });

        console.log(`IS THAT (${p}) REQUEST PUBLIC OR NEEDS CHECKING: ` + allowed)

        if (allowed) return next();
        return requireTelegramSession(req, res, next);
    } catch (e) {
        // fail safe: require auth on unexpected errors
        return requireTelegramSession(req, res, next);
    }
});

app.use('/api/', apiLimiter)
app.use('/api', usersApiRouter)
app.use('/api', betsApiRouter)

// END THE VALIDATION RAW DATA SESSION

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

function parseTelegramNFT(html) {
    const $ = load(html || '')

    // name/title
    const name = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').trim()

    // image
    const image = ($('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') || '').trim()

    // try OG description first (often contains the three lines)
    const ogDesc = ($('meta[property="og:description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') || '').trim()

    const result = {
        name,
        image,
        description: ogDesc,
        model: '',
        modelRarity: null,
        backdrop: '',
        backdropRarity: null,
        symbol: '',
        symbolRarity: null,
        quantityIssued: null,
        quantityTotal: null
    }

    // helper to parse percent string like "1.5%" or "2 %" -> number (1.5 or 2) or null
    function parsePercentStr(s) {
        if (!s && s !== 0) return null
        const m = String(s).match(/(-?\d+(?:[.,]\d+)?)\s*%/)
        if (!m) return null
        // normalize comma decimal
        const num = Number(m[1].replace(',', '.'))
        return Number.isFinite(num) ? num : null
    }

    // helper to parse issued/total string like "337 243/374 077 issued" -> { issued: 337243, total: 374077 }
    function parseQuantityStr(s) {
        if (!s) return { issued: null, total: null }
        // remove non-digit except slash and spaces
        const cleaned = String(s).replace(/\u00A0/g, ' '); // NBSP -> space
        // find '123/456' pattern
        const m = cleaned.match(/([\d\s, ._]+)\s*\/\s*([\d\s, ._]+)/)
        if (!m) return { issued: null, total: null }
        const a = m[1].replace(/[^\d]/g, '')
        const b = m[2].replace(/[^\d]/g, '')
        const issued = a ? Number(a) : null
        const total = b ? Number(b) : null
        return { issued: Number.isFinite(issued) ? issued : null, total: Number.isFinite(total) ? total : null }
    }

    // First attempt: parse OG description lines "Model: ...\nBackdrop: ...\nSymbol: ..."
    if (ogDesc) {
        const lines = ogDesc.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        for (const line of lines) {
            const m = line.match(/^\s*Model\s*:\s*(.+)$/i)
            const b = line.match(/^\s*Backdrop\s*:\s*(.+)$/i)
            const s = line.match(/^\s*Symbol\s*:\s*(.+)$/i)
            if (m) result.model = (result.model || m[1]).trim()
            if (b) result.backdrop = (result.backdrop || b[1]).trim()
            if (s) result.symbol = (result.symbol || s[1]).trim()
        }
    }

    // Fallback / canonical parse from the gift table rows (this is where rarities are present in <mark>)
    $('table.tgme_gift_table tr').each((i, tr) => {
        const th = $(tr).find('th').text().trim()
        const td = $(tr).find('td')
        const tdText = td.text().trim()
        // extract <mark> value if present
        const markText = td.find('mark').first().text().trim()

        if (/^Model$/i.test(th)) {
            // remove trailing percentage in text for plain name
            const nameOnly = tdText.replace(/\s*[\d.,]+\s*%/g, '').trim()
            result.model = result.model || nameOnly
            result.modelRarity = result.modelRarity ?? parsePercentStr(markText || tdText)
        } else if (/^Backdrop$/i.test(th)) {
            const nameOnly = tdText.replace(/\s*[\d.,]+\s*%/g, '').trim()
            result.backdrop = result.backdrop || nameOnly
            result.backdropRarity = result.backdropRarity ?? parsePercentStr(markText || tdText)
        } else if (/^Symbol$/i.test(th)) {
            const nameOnly = tdText.replace(/\s*[\d.,]+\s*%/g, '').trim()
            result.symbol = result.symbol || nameOnly
            result.symbolRarity = result.symbolRarity ?? parsePercentStr(markText || tdText)
        } else if (/^Quantity$/i.test(th)) {
            // try parse issued/total
            const q = parseQuantityStr(tdText)
            result.quantityIssued = q.issued
            result.quantityTotal = q.total
        }
    })

    // Final sanitize / ensure strings
    result.model = result.model || ''
    result.backdrop = result.backdrop || ''
    result.symbol = result.symbol || ''

    // If rarities are still null, attempt to find inline percent pattern in the page near the attribute labels (defensive)
    function findNearbyPercent(label) {
        // search for "Label" then nearby mark or percent text
        const th = $(`table.tgme_gift_table tr th`).filter((i, el) => $(el).text().trim().toLowerCase() === label.toLowerCase()).first()
        if (!th || th.length === 0) return null
        const td = $(th).next('td')
        const m = td.find('mark').first().text() || td.text()
        return parsePercentStr(m)
    }
    if (result.modelRarity == null) result.modelRarity = findNearbyPercent('Model')
    if (result.backdropRarity == null) result.backdropRarity = findNearbyPercent('Backdrop')
    if (result.symbolRarity == null) result.symbolRarity = findNearbyPercent('Symbol')

    return result
}

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/the-open-network'
const CACHE_TTL_MS = 60 * 1000
const FETCH_TIMEOUT_MS = 5 * 1000
const TARGET_USDT = 0.012

// simple in-memory cache
let cached = {
    value: null,
    fetchedAt: 0,
    raw: null
}

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { signal: controller.signal });
        return resp;
    } finally {
        clearTimeout(id);
    }
}

async function getTonPriceUsd() {
    const now = Date.now();
    if (cached.value && (now - cached.fetchedAt) < CACHE_TTL_MS) {
        console.log('returning cached value for ton price')
        return cached.value;
    }

    console.log('from getTonprice usd fetch coingecko url')

    const resp = await fetchWithTimeout(COINGECKO_URL, FETCH_TIMEOUT_MS);

    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.log('responce from coingecko is not okay')
        throw new Error(`CoinGecko responded ${resp.status}: ${txt}`);
    }

    const data = await resp.json();

    console.log('got correct responce from coingecko')

    // validate shape
    const priceUsd = data?.market_data?.current_price?.usd;
    if (priceUsd == null || Number.isNaN(Number(priceUsd))) {
        console.log('something wrong with the priceUsd getting from data')
        throw new Error('CoinGecko response missing market_data.current_price.usd');
    }

    const numericPrice = Number(priceUsd);

    // update cache
    cached.value = numericPrice;
    cached.fetchedAt = Date.now();
    cached.raw = data;

    console.log('successfully returning value from get ton price: ' + numericPrice)

    return numericPrice;
}

app.get('/api/tonprice', async (req, res) => {
    try {
        console.log('HIT API TONPRICE, start fetching getTonPriceUsd')
        // If you need USDT specifically, rename functions and ensure API returns 'usdt' or use an exchange.
        const tonPriceUsd = await getTonPriceUsd();

        // compute how many TON you need to reach target USDT/USD
        const tonNeeded = TARGET_USDT / tonPriceUsd;

        // adjust rounding to your preferred precision
        const tonNeededRounded = Number(tonNeeded.toFixed(8)); // 8 decimals

        console.log('1 successfully returning the initial response from client with values: price usd per ton: ' + tonPriceUsd)
        console.log('2 successfully returning the initial response from client with values: ton_needed: ' + tonNeededRounded)

        return res.json({
            price_usd_per_ton: tonPriceUsd,
            ton_needed: tonNeededRounded
        });
    } catch (err) {
        console.error('error fetching ton price', err);
        return res.status(502).json({ error: 'failed to fetch TON price', message: err.message });
    }
});

app.get('/api/telegram/nft/:slug', async (req, res) => {
    try {
        const slug = req.params.slug
        // build Telegram web page URL (the t.me path typically redirects; use full web URL)
        const url = `https://t.me/nft/${encodeURIComponent(slug)}`

        const upstream = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'node-fetch' } })
        if (!upstream.ok) {
            return res.status(502).json({ error: 'upstream fetch failed', status: upstream.status })
        }
        const html = await upstream.text()

        const parsed = parseTelegramNFT(html)

        // optional: add CORS header for your client (restrict to your origin in production)
        res.set('Access-Control-Allow-Origin', 'https://myoracleapp.com')
        return res.json(parsed)
    } catch (err) {
        console.error('error fetching/parsing', err)
        return res.status(500).json({ error: err.message })
    }
})

// POST /api/bet-placed
app.post('/api/bet-placed', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            // requireTelegramSession should normally prevent this; 401 is appropriate
            return res.status(401).json({ error: 'unauthenticated' });
        }
        const chat_id = 'myoracle_chat'

        const { bet_id, side, stake, placed_gifts } = req.body || {};
        if (!bet_id || !side || (stake === undefined || stake === null)) {
            return res.status(400).json({ error: 'telegram, bet_id, side, stake required' });
        }

        // fetch user row (get username)
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('id, username, telegram')
            .eq('telegram', Number(telegram))
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

        // Safely parse placed_gifts (may be array or JSON string).
        let giftsArray = [];
        try {
            if (Array.isArray(placed_gifts)) {
                giftsArray = placed_gifts;
            } else if (placed_gifts) {
                // if it's a stringified JSON, try parse; otherwise treat as empty
                giftsArray = typeof placed_gifts === 'string' ? JSON.parse(placed_gifts) : [];
            }
        } catch (e) {
            console.warn('bet-placed: failed to parse placed_gifts, ignoring gifts', e);
            giftsArray = [];
        }
        if (!Array.isArray(giftsArray)) giftsArray = [];

        const lines = [];
        if (Number(stake) > 15) {
            lines.push('<b>Whale Alert 🐳</b>');
        }

        // The clickable display: use HTML <a href="...">display</a> and escape display text
        const clickable = `<a href="${userLinkHref}">${escapeHtml(userLinkText)}</a>`;
        const sideEscaped = escapeHtml(String(side));
        const betNameEscaped = escapeHtml(String(betNameEn));

        const giftsList = giftsArray
            .map(g => {
                const gName = escapeHtml(String(g?.name ?? 'Gift'));
                const gNumber = escapeHtml(String(g?.number ?? ''));
                return `${gName}-${gNumber}`;
            })
            .filter(Boolean)
            .join(', '); // join with comma and space

        // Construct the single-line primary sentence
        let primaryLine = '';
        if (giftsList.length > 0) {
            // gifts present
            if (stakeNumber > 0) {
                // include stake, then comma, then gifts, then on "side"
                primaryLine = `${clickable} just placed ${escapeHtml(String(stakeFormatted))} TON, ${giftsList} on "${sideEscaped}"`;
            } else {
                // no stake: omit stake, show gifts only
                primaryLine = `${clickable} just placed ${giftsList} on "${sideEscaped}"`;
            }
        } else {
            // no gifts: keep previous single-line format with stake (even if 0 it will show 0)
            primaryLine = `${clickable} just placed ${escapeHtml(String(stakeFormatted))} TON on "${sideEscaped}"`;
        }

        lines.push(primaryLine);

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
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const chat_id = '-1002951097413'
        const { name, descriptionCondition, descriptionPeriod, descriptionContext, side, stake, gifts_bet } = req.body || {};

        // Normalize gifts array early and sanitize items early
        const gifts = Array.isArray(gifts_bet) ? gifts_bet : [];

        if (!name || !descriptionCondition || !descriptionPeriod || !side ||
            (
                // stake is "missing" if undefined, null or empty string
                (stake === undefined || stake === null || String(stake).trim() === '') &&
                gifts.length === 0
            )) {
            return res.status(400).json({
                ok: false,
                error: 'validation_error',
                message: 'name, descriptionCondition, stake or gifts_bet, descriptionPeriod, side are required'
            });
        }

        const capitalizeFirstLetter = (s = '') => {
            return String(s).replace(/(^\s*["'«“‘]?)(\p{L})/u, (m, p1, p2) => p1 + p2.toUpperCase());
        };

        const formatCoreSentence = (raw = '') => {
            let s = String(raw || '').trim();
            if (!s) return null;
            s = capitalizeFirstLetter(s);
            if (!s.endsWith('.')) s += '.';
            return s;
        };

        // New helper: sanitize the descriptionCondition by removing ALL dots ('.'),
        // collapse whitespace, and return a clean string. We'll then run formatCoreSentence
        // so it ends with exactly one dot and is capitalized.
        const sanitizeDescriptionCondition = (raw = '') => {
            let s = String(raw || '').trim();
            if (!s) return null;
            // remove all literal dot characters
            s = s.replace(/\./g, '');
            // collapse multiple spaces to one, trim edges
            s = s.replace(/\s+/g, ' ').trim();
            return s;
        };

        const condSanitized = sanitizeDescriptionCondition(descriptionCondition);
        const condSentence = formatCoreSentence(condSanitized);
        const periodSentence = formatCoreSentence(descriptionPeriod);

        // context is optional — only include if present and length > 0 after trim
        let contextSentence = null;
        if (descriptionContext && String(descriptionContext).trim().length > 0) {
            const core = formatCoreSentence(descriptionContext);
            if (core) {
                contextSentence = `Context: ${core.replace(/^\s+/, '')}`;
            }
        }

        // collect non-null sentences in order
        const parts = [];
        if (condSentence) parts.push(condSentence);
        if (periodSentence) parts.push(periodSentence);
        if (contextSentence) parts.push(contextSentence);

        // join with a space (each part already ends with a dot)
        const assembledDescription = parts.join(' ');

        // fetch user row (get username and placed_bets and inventory)
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('id, username, telegram, points, placed_bets, inventory')
            .eq('telegram', telegram)
            .maybeSingle();

        if (userErr) {
            console.error('create-event: supabase users select error', userErr);
            return res.status(500).json({ ok: false, error: 'db_error', message: 'database error' });
        }

        if (!userRow) {
            return res.status(404).json({ ok: false, error: 'user_not_found', message: 'user not found' });
        }

        let stakeNum;
        if (stake === undefined || stake === null || String(stake).trim() === '') {
            stakeNum = (gifts.length > 0) ? 0 : NaN; // NaN will be caught below (shouldn't happen due to earlier check)
        } else {
            // parse numeric stake (round to 2 decimals)
            stakeNum = Math.round(Number(stake) * 100) / 100;
        }

        if (!Number.isFinite(stakeNum) || stakeNum < 0) {
            return res.status(400).json({ ok: false, error: 'validation_error', message: 'invalid stake' });
        }

        const placedGifts = (Array.isArray(gifts) ? gifts : []).map(g => ({
            name: g?.name ?? null,
            uuid: g?.uuid ?? null,
            model: g?.model ?? null,
            value: (g && g.value !== undefined ? g.value : null),
            number: g?.number ?? null
        }));

        // Validate gifts_bet (if present) against user's inventory
        if (placedGifts.length > 0) {
            const inventory = Array.isArray(userRow.inventory) ? userRow.inventory : [];

            // Collect missing uuids
            const missing = placedGifts
                .filter(g => !g || g.uuid === undefined || !inventory.some(i => String(i.uuid) === String(g.uuid)))
                .map(g => (g && g.uuid) ? String(g.uuid) : '(missing-uuid)');

            if (missing.length > 0) {
                return res.status(400).json({
                    ok: false,
                    error: 'invalid_gifts',
                    message: 'Some gifts are not found in user inventory',
                    missing_uuids: missing
                });
            }
        }

        const totalEventPrice = stakeNum; // stake user is initially betting

        if (totalEventPrice > Number(userRow.points)) {
            return res.status(400).json({ ok: false, error: 'insufficient_funds', message: 'not enough points to create the event' });
        }

        let sideFormatted = 'empty';
        if (String(side).toLowerCase() === 'yes') sideFormatted = 'yes';
        else if (String(side).toLowerCase() === 'no') sideFormatted = 'no';

        // insert new event row, include creator_gifts_bet (sanitized)
        const { data: newEventRow, error: insertErr } = await supabaseAdmin
            .from('bets')
            .insert([
                {
                    name: String(name).trim(),
                    description: String(assembledDescription).trim(),
                    creator_first_stake: stakeNum,
                    creator_side: sideFormatted,
                    is_approved: false,
                    result: 'undefined',
                    prizes_given: false,
                    creator_telegram: telegram,
                    status: 'Waiting',
                    creator_gifts_bet: placedGifts
                }
            ])
            .select();

        if (insertErr) {
            console.error('create-event: supabase insert error', insertErr);
            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not create event' });
        }

        const newEventId = Array.isArray(newEventRow) ? newEventRow[0]?.id : newEventRow?.id;
        if (!newEventId) {
            console.error('create-event: could not find new event id', newEventRow);
            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not determine new event id' });
        }

        // quick fix: round to 2 decimals before updating DB
        const rawNewPoints = Number(userRow.points) - totalEventPrice;
        const newPoints = Math.round(rawNewPoints * 100) / 100; // number with 2 decimal precision

        // Build new inventory by removing placed gift uuids
        const currentInventory = Array.isArray(userRow.inventory) ? userRow.inventory.slice() : [];
        const giftUuidsSet = new Set(placedGifts.map(g => String(g.uuid)));
        const newInventory = currentInventory.filter(item => {
            // keep if item.uuid is undefined or not in gift set
            try {
                return !giftUuidsSet.has(String(item.uuid));
            } catch (e) {
                return true; // keep if any weirdness
            }
        });

        // prepare placed_bets update (only add if stake>0 or gifts present)
        const updatePayload = { points: newPoints };
        if (stakeNum > 0 || (placedGifts && placedGifts.length > 0)) {
            const existingPlaced = Array.isArray(userRow.placed_bets) ? userRow.placed_bets.slice() : [];

            const newPlacedBet = {
                side: sideFormatted,
                stake: stakeNum,
                bet_id: newEventId,
                placed_at: new Date().toISOString(),
                placed_gifts: placedGifts
            };

            existingPlaced.push(newPlacedBet);
            updatePayload.placed_bets = existingPlaced;
        }

        // update users row: points, placed_bets, inventory
        updatePayload.inventory = newInventory;

        const { data: newUserRow, error: updateUserErr } = await supabaseAdmin
            .from('users')
            .update(updatePayload)
            .eq('telegram', telegram)
            .select()
            .maybeSingle();

        if (updateUserErr) {
            console.error('create-event: supabase update users record error', updateUserErr);

            // Attempt to roll back the created bet to avoid orphaned event
            try {
                await supabaseAdmin.from('bets').delete().eq('id', newEventId);
            } catch (delErr) {
                console.error('create-event: failed to delete orphaned bet after user update failure', delErr);
            }

            return res.status(500).json({ ok: false, error: 'db_error', message: 'could not update user' });
        }

        // ALL SUCCESS AND RESPONSE UNTIL TELEGRAM BOT MESSAGES
        res.status(200).json({
            ok: true,
            data: {
                user: newUserRow
            }
        });

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

        // Use assembledDescription for the message shown to moderators/admins
        lines.push(`${clickable} just requested to create an event named: ${escapeHtml(String(name))}. The description is: "${escapeHtml(assembledDescription)}"`);

        lines.push(`Initial choice: ${stakeFormatted} TON on ${sideEscaped} ⭐`);

        // If gifts were placed, include them in the Telegram message using name and number fields
        if (Array.isArray(placedGifts) && placedGifts.length > 0) {
            const giftsText = placedGifts.map(g => {
                const gName = g.name ? escapeHtml(String(g.name)) : '(unknown)';
                const gNumber = (g.number !== undefined && g.number !== null) ? escapeHtml(String(g.number)) : '(no-number)';
                return `${gName} x${gNumber}`;
            }).join(', ');
            lines.push(`Placed gifts: ${giftsText}`);
        }

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
            // Telegram failure doesn't change the main success response; log and continue
        }
    } catch (err) {
        console.error('create-event unexpected error', err);
        return res.status(500).json({ ok: false, error: 'internal_error', message: 'internal server error' });
    }
});

/**
 * GET /api/gifts/prices
 */
app.get('/api/gifts/prices', async (req, res) => {
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
 * GET /api/bets-holders?from=0&to=19
 */
app.get('/api/bets-holders', async (req, res) => {
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
app.get('/api/holidays', async (req, res) => {
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

app.get("/api/get-chance", async (req, res) => {
    console.log('Hit /api/get-chance')
    try {
        let betID = 28
        const { data: currentChance, error: userErr } = await supabaseAdmin
            .from("bets")
            .select("current_odds")
            .eq("id", betID)
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
            title: `Deposit to Oracle with Stars`,
            description: "Top-Up Oracle Balance",
            payload: "{}",
            provider_token: "",
            currency: "XTR",
            prices: [{ amount: amount, label: `Convert to In-App TON!` }]
        }
    );
}

// POST /api/giftFailed
// body: { owner_telegram: number|string, gift: { uuid, telegram_message_id, gift_id_long, saved_id, slug, name, model, number, value }, reason?: string, attempted_at?: string }
app.post("/api/giftFailed", verifyGiftWorkerSignature, async (req, res) => {
    console.log("[BACKEND HIT] /api/giftFailed");
    try {
        const body = req.body ?? {};
        const ownerTelegramRaw = body.owner_telegram ?? body.requester_telegram ?? body.owner ?? null;
        const ownerTelegram = ownerTelegramRaw ? Number(ownerTelegramRaw) : null;
        const gift = body.gift ?? null;
        const reason = body.reason ?? null;
        const attemptedAt = body.attempted_at ?? body.attemptedAt ?? new Date().toISOString();

        if (!ownerTelegram || Number.isNaN(ownerTelegram)) {
            return res.status(400).json({ ok: false, error: "missing_owner_telegram" });
        }
        if (!gift || typeof gift !== "object") {
            return res.status(400).json({ ok: false, error: "missing_gift_object" });
        }

        // canonical id key for lookup (prefer uuid, then telegram_message_id, then gift_id_long)
        const giftKey = gift.uuid ?? gift.telegram_message_id ?? gift.gift_id_long ?? null;
        if (!giftKey) {
            return res.status(400).json({ ok: false, error: "gift_missing_identifier" });
        }

        // Fetch current user row (we will use updated_at for CAS)
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from("users")
            .select("id, telegram, inventory, updated_at, language")
            .eq("telegram", ownerTelegram)
            .maybeSingle();

        if (userErr) {
            console.error("giftFailed: db error selecting user:", userErr);
            return res.status(500).json({ ok: false, error: "db_error_read_user", details: userErr.message || userErr });
        }
        if (!userRow) {
            return res.status(404).json({ ok: false, error: "user_not_found" });
        }

        // Prepare the gift object to insert (normalize fields)
        const giftToInsert = {
            uuid: gift.uuid ?? null,
            telegram_message_id: gift.telegram_message_id ?? null,
            gift_id_long: gift.gift_id_long ?? null,
            saved_id: (gift.saved_id && String(gift.saved_id) !== "null") ? gift.saved_id : null,
            slug: gift.slug ?? null,
            name: gift.name ?? gift.collection_name ?? null,
            model: gift.model ?? null,
            number: gift.number ?? gift.num ?? null,
            value: gift.value ?? null,
            // extra metadata for troubleshooting
            failed_reason: reason ?? null,
            failed_at: attemptedAt,
            returned_at: new Date().toISOString()
        };

        // CAS retry loop
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            // refresh user row each attempt (first iteration we already have userRow)
            let freshUser = userRow;
            if (attempt > 0) {
                const { data: refetch, error: refetchErr } = await supabaseAdmin
                    .from("users")
                    .select("id, telegram, inventory, updated_at")
                    .eq("id", userRow.id)
                    .maybeSingle();
                if (refetchErr) {
                    console.error("giftFailed: error re-fetching user on retry:", refetchErr);
                    return res.status(500).json({ ok: false, error: "db_error_recheck", details: refetchErr.message || refetchErr });
                }
                if (!refetch) {
                    return res.status(404).json({ ok: false, error: "user_not_found_during_retry" });
                }
                freshUser = refetch;
            }

            const currentInv = Array.isArray(freshUser.inventory) ? freshUser.inventory : [];

            // Idempotency: if gift already present (match by uuid/msgid/gift_id_long) => report already present
            const exists = currentInv.some(i => {
                const a = String(i.uuid ?? i.telegram_message_id ?? i.gift_id_long ?? "");
                const b = String(giftToInsert.uuid ?? giftToInsert.telegram_message_id ?? giftToInsert.gift_id_long ?? "");
                return a && b && a === b;
            });
            if (exists) {
                return res.json({ ok: true, readded: false, reason: "already_present" });
            }

            // Prepend giftToInsert to inventory (keeps newest first)
            const newInv = [giftToInsert, ...currentInv];

            // Attempt conditional update using updated_at
            const { data: upd, error: updErr } = await supabaseAdmin
                .from("users")
                .update({ inventory: newInv })
                .eq("id", freshUser.id)
                .eq("updated_at", freshUser.updated_at)
                .select("id, telegram, inventory, language, updated_at")
                .single();

            if (updErr) {
                // If CAS failure due to concurrent update, loop and retry
                console.warn(`giftFailed: CAS attempt ${attempt + 1} failed:`, updErr.message || updErr);
                // try next iteration (re-fetch happens at loop top)
                if (attempt === MAX_RETRIES - 1) {
                    console.error("giftFailed: exceeded CAS retries, failed to re-add gift", giftToInsert);
                    return res.status(500).json({ ok: false, error: "failed_to_readd_gift", details: updErr.message || updErr });
                }
                continue;
            }

            // success
            console.log("[giftFailed] re-added gift to inventory for", ownerTelegram, "giftKey:", giftKey);

            // send message using your Telegraf bot instance (don't block endpoint on failure)
            try {
                const chatId = ownerTelegram;
                // prefer language from freshUser if available, otherwise fallback to initial userRow.language
                const lang = (typeof freshUser?.language !== 'undefined') ? freshUser.language : (userRow.language ?? 'en');
                // safe slug/name
                const slugSafe = String(gift.slug ?? giftToInsert.slug ?? giftToInsert.name ?? 'gift').replace(/[\r\n]+/g, ' ').trim();

                // message text (plain text to avoid HTML injection)
                const messageBotText = (lang === 'ru')
                    ? `Не удалось вывести подарок: ${slugSafe}. ❌ Подарок возвращён в инвентарь. 📥`
                    : `Could not withdraw the gift: ${slugSafe}. ❌ The gift has been returned to your inventory. 📥`;

                if (!chatId) {
                    console.warn('giftFailed: no chat id to notify (ownerTelegram missing)');
                } else if (typeof bot === 'undefined' || !bot?.telegram?.sendMessage) {
                    console.warn('giftFailed: bot instance unavailable, skipping Telegram notification');
                } else {
                    // fire-and-forget but await so we can log failures — doesn't affect response to caller
                    try {
                        await bot.telegram.sendMessage(chatId, messageBotText, {
                            disable_web_page_preview: true
                        });
                        console.log(`giftFailed: telegram notification sent to ${chatId}`);
                    } catch (tgErr) {
                        console.warn('giftFailed: telegram send error', tgErr?.message ?? tgErr);
                        // intentionally ignore — we don't want to fail the endpoint because of notification errors
                    }
                }
            } catch (notifyErr) {
                console.warn('giftFailed: unexpected error while notifying user', notifyErr?.message ?? notifyErr);
                // ignore and continue
            }

            return res.json({ ok: true, readded: true, item: giftToInsert });
        }

        // fallback (shouldn't reach here)
        return res.status(500).json({ ok: false, error: "failed_to_readd_gift_unknown" });
    } catch (err) {
        console.error("giftFailed: unexpected error", err);
        return res.status(500).json({ ok: false, error: "unexpected_error", details: err.message ?? String(err) });
    }
});

app.post("/api/pay-withdraw", async (req, res) => {
    console.log('Hit /api/pay-withdraw')
    const { gifts, amountStars } = req.body;
    if (!Array.isArray(gifts) || gifts.length === 0) return res.status(400).json({ error: 'no_gifts' });

    const giftsCount = gifts.length;
    const expectedAmount = Number((giftsCount * 25).toFixed(2));

    if (typeof amountStars === 'number' && amountStars !== expectedAmount) {
        return res.status(400).json({ error: 'amount_mismatch', expectedAmount });
    }
    try {
        const link = await payForWithdrawals(gifts);
        res.json({ link });
    } catch (err) {
        console.log('FAIL STARS LINK FOR WITHDRAWALS: ' + err)
        res.status(500).json({ error: "failed to create invoice" });
    }
});

export async function payForWithdrawals(gifts) {
    const giftsCount = Array.isArray(gifts)
    return bot.telegram.createInvoiceLink(
        {
            title: `Withdraw unique gifts from inventory.`,
            description: "Pay for the auto-withdrawal of gifts from inventory.",
            payload: "{}",
            provider_token: "",
            currency: "XTR",
            prices: [{ amount: giftsCount * 25, label: `Withdraw ${giftsCount} gifts!` }]
        }
    );
}

// POST /api/withdraw-gifts
app.post("/api/withdraw-gifts", async (req, res) => {
    console.log("[BACKEND HIT] /api/withdraw-gifts");
    try {
        const recipient = Number(req.user?.id);
        if (!recipient || Number.isNaN(recipient)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const body = req.body ?? {};

        // Basic validation
        if (!body || typeof body !== "object") {
            return res.status(400).json({ ok: false, error: "empty_payload" });
        }
        const requestedGifts = Array.isArray(body.gifts) ? body.gifts : [];

        if (requestedGifts.length === 0) {
            return res.status(400).json({ ok: false, error: "no_gifts_provided" });
        }

        // Fetch the user's inventory from Supabase
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from("users")
            .select("id, telegram, language, inventory, updated_at")
            .eq("telegram", recipient)
            .maybeSingle();

        if (userErr) {
            console.error("withdraw-gifts: db error selecting user:", userErr);
            return res.status(500).json({ ok: false, error: "db_error_read_user", details: userErr.message || userErr });
        }
        if (!userRow) {
            return res.status(404).json({ ok: false, error: "user_not_found" });
        }

        const inventory = Array.isArray(userRow.inventory) ? userRow.inventory : [];

        // Helper: find a matching inventory item by uuid->message_id->gift_id_long
        function findInventoryMatch(reqGift) {
            if (!reqGift) return null;
            const maybeUuid = reqGift.uuid ?? reqGift.u ?? null;
            const maybeMsgId = reqGift.telegram_message_id ?? reqGift.telegramMessageId ?? reqGift.msgId ?? null;
            const maybeGiftIdLong = reqGift.gift_id_long ?? reqGift.giftId ?? reqGift.gift_id ?? null;

            if (maybeUuid) {
                const found = inventory.find(i => String(i.uuid) === String(maybeUuid));
                if (found) return found;
            }
            if (maybeMsgId) {
                const found = inventory.find(i => String(i.telegram_message_id) === String(maybeMsgId));
                if (found) return found;
            }
            if (maybeGiftIdLong) {
                const found = inventory.find(i => String(i.gift_id_long) === String(maybeGiftIdLong));
                if (found) return found;
            }
            return null;
        }

        // Verify all requested gifts exist in inventory
        const missing = [];
        const matchedInventoryItems = []; // items we will pass to worker (full DB objects)
        for (const rg of requestedGifts) {
            const match = findInventoryMatch(rg);
            if (!match) {
                // collect an identifier for reporting
                missing.push(rg.uuid ?? rg.telegram_message_id ?? rg.gift_id_long ?? JSON.stringify(rg).slice(0, 50));
            } else {
                matchedInventoryItems.push(match);
            }
        }

        if (missing.length > 0) {
            return res.status(400).json({ ok: false, error: "gifts_not_in_inventory", missing });
        }

        // === Reserve: remove gifts from inventory immediately (CAS by updated_at) ===
        // Build new inventory by removing the reserved gifts
        const removeUuids = new Set(matchedInventoryItems.map(i => String(i.uuid ?? i.telegram_message_id ?? i.gift_id_long)));
        const newInventory = inventory.filter(item => !removeUuids.has(String(item.uuid ?? item.telegram_message_id ?? item.gift_id_long)));

        // Attempt CAS update using updated_at to avoid race conditions. Retry if concurrent modification.
        const MAX_RETRIES = 3;
        let attempt = 0;
        let updatedUser = null;
        while (attempt < MAX_RETRIES) {
            attempt++;
            const currentUpdatedAt = userRow.updated_at;

            // perform update only if updated_at matches
            const { data: updData, error: updErr } = await supabaseAdmin
                .from("users")
                .update({ inventory: newInventory })
                .eq("id", userRow.id)
                .eq("updated_at", currentUpdatedAt)
                .select("id, telegram, inventory, updated_at")
                .single();

            if (updErr) {
                // If update failed because updated_at changed, re-fetch and retry
                console.warn(`withdraw-gifts: CAS attempt ${attempt} failed:`, updErr.message || updErr);
                // re-fetch user
                const { data: freshUser, error: freshErr } = await supabaseAdmin
                    .from("users")
                    .select("id, telegram, inventory, updated_at")
                    .eq("telegram", recipient)
                    .maybeSingle();

                if (freshErr) {
                    console.error("withdraw-gifts: error re-fetching user after CAS failure:", freshErr);
                    return res.status(500).json({ ok: false, error: "db_error_recheck", details: freshErr.message || freshErr });
                }
                if (!freshUser) {
                    return res.status(404).json({ ok: false, error: "user_not_found_during_retry" });
                }

                // recompute inventory & ensure gifts still present
                const freshInventory = Array.isArray(freshUser.inventory) ? freshUser.inventory : [];
                const stillPresent = matchedInventoryItems.every(mi => {
                    return freshInventory.some(fi => String(fi.uuid ?? fi.telegram_message_id ?? fi.gift_id_long) === String(mi.uuid ?? mi.telegram_message_id ?? mi.gift_id_long));
                });

                if (!stillPresent) {
                    // someone else removed or modified inventory in the meantime — abort to avoid double-use
                    return res.status(409).json({ ok: false, error: "inventory_changed_concurrent", message: "Failed to reserve gifts: inventory changed" });
                }

                // recompute newInventory and try again
                const freshRemoveUuids = new Set(matchedInventoryItems.map(i => String(i.uuid ?? i.telegram_message_id ?? i.gift_id_long)));
                const freshNewInventory = freshInventory.filter(item => !freshRemoveUuids.has(String(item.uuid ?? item.telegram_message_id ?? item.gift_id_long)));
                // assign for next iteration
                userRow.inventory = freshInventory;
                userRow.updated_at = freshUser.updated_at;
                // set newInventory for attempt
                newInventory.splice(0, newInventory.length, ...freshNewInventory);
                continue;
            } else {
                // success
                updatedUser = updData;
                break;
            }
        }

        if (!updatedUser) {
            return res.status(500).json({ ok: false, error: "failed_to_reserve_gifts", message: "Could not atomically reserve/remove gifts from inventory" });
        }

        // At this point, gifts have been removed from the user's inventory and reserved for transfer.
        // Build payload to send to worker: pass recipient and the rich gift objects taken from DB
        const payload = {
            recipient,
            gifts: matchedInventoryItems.map(item => ({
                uuid: item.uuid ?? null,
                telegram_message_id: item.telegram_message_id ?? null,
                gift_id_long: item.gift_id_long ?? null,
                saved_id: item.saved_id ?? null,
                slug: item.slug ?? null,
                name: item.name ?? item.collection_name ?? null,
                model: item.model ?? null,
                number: item.number ?? item.num ?? null,
            })),
            requester_telegram: Number(recipient),
            request_time: new Date().toISOString()
        };

        // Call worker. Use generous timeout.
        let workerResult;
        try {
            workerResult = await global.__SUPERVISOR.sendToWorker("./giftrelayer-listener.js", "withdrawGifts", payload, 120_000);
        } catch (err) {
            console.error("withdraw-gifts: error sending to worker:", err);
            // Worker didn't start / IPC failed — rollback removed gifts (best-effort) so user doesn't lose inventory.
            try {
                const rollbackRes = await supabaseAdmin
                    .from("users")
                    .update({ inventory: inventory }) // old inventory snapshot
                    .eq("id", userRow.id)
                    .select()
                    .single();
                console.warn("withdraw-gifts: worker IPC failed — rolled back inventory (best-effort).", rollbackRes);
            } catch (rbErr) {
                console.error("withdraw-gifts: rollback failed after worker IPC error:", rbErr);
            }
            return res.status(500).json({ ok: false, error: "worker_ipc_error", details: err.message ?? String(err) });
        }

        // send message using your Telegraf bot instance (don't block endpoint on failure)
        try {
            const chatId = recipient;
            // language from initial fetch (userRow) — safe fallback if CAS/updatedUser lacks it
            const lang = (typeof userRow?.language !== 'undefined') ? userRow.language : 'en';

            // workerResult expected shape: { ok: true, results: [ { gift: <id>, ok: true/false, error? } ] }
            // Normalize results array
            const resultsArr = (workerResult && Array.isArray(workerResult.results)) ? workerResult.results : (workerResult && workerResult.results ? workerResult.results : []);

            // Build set of successful gift identifiers (the worker uses g.uuid or g.telegram_message_id as `gift`)
            const successIds = new Set();
            if (Array.isArray(resultsArr)) {
                for (const r of resultsArr) {
                    if (r && (r.ok === true || r.ok === 'true')) {
                        // r.gift might be number or string; normalize to String
                        successIds.add(String(r.gift));
                    }
                }
            }

            // Map matchedInventoryItems to their identifier (uuid/telegram_message_id/gift_id_long)
            function itemIdentifier(it) {
                return String(it.uuid ?? it.telegram_message_id ?? it.gift_id_long ?? '');
            }

            // Collect slugs/names for the successful items (matching by identifier)
            const successSlugs = matchedInventoryItems
                .filter(mi => successIds.size === 0 ? true : successIds.has(itemIdentifier(mi))) // if worker didn't return results, assume success for all reserved
                .map(mi => {
                    const raw = mi.slug ?? mi.name ?? mi.collection_name ?? mi.uuid ?? '';
                    return String(raw || '').replace(/[\r\n]+/g, ' ').trim();
                })
                .filter(Boolean);

            // If worker returned explicit failures, exclude those from the success list
            // (the filter above handles that). If worker didn't return any per-gift array, default to reporting reserved gifts.
            let messageBotText;
            if (successSlugs.length > 0) {
                const listText = successSlugs.join(', ');
                messageBotText = (lang === 'ru')
                    ? `Успешный вывод подарков: ${listText}. 🎁`
                    : `Successful withdrawal of gifts: ${listText}. 🎁`;
            } else {
                // No successful gifts — report failure
                messageBotText = (lang === 'ru')
                    ? `Не удалось вывести подарки. Пожалуйста, проверьте инвентарь — подарки возвращены.`
                    : `Could not withdraw gifts. Please check your inventory — gifts have been returned.`;
            }

            if (!chatId) {
                console.warn('withdraw-gifts: no chat id to notify (recipient missing)');
            } else if (typeof bot === 'undefined' || !bot?.telegram?.sendMessage) {
                console.warn('withdraw-gifts: bot instance unavailable, skipping Telegram notification');
            } else {
                try {
                    // send plain text to avoid HTML escaping issues
                    await bot.telegram.sendMessage(chatId, messageBotText, {
                        disable_web_page_preview: true
                    });
                    console.log(`withdraw-gifts: telegram notification sent to ${chatId}`);
                } catch (tgErr) {
                    console.warn('withdraw-gifts: telegram send error', tgErr?.message ?? tgErr);
                    // intentionally ignore — do not fail the endpoint because of notification errors
                }
            }
        } catch (notifyErr) {
            console.warn('withdraw-gifts: unexpected error while notifying user', notifyErr?.message ?? notifyErr);
            // ignore and continue
        }

        // Insert transaction row(s) (record all the gifts withdrawn)
        try {
            const now = new Date().toISOString();

            // Normalize results array
            const resultsArrTwo = (workerResult && Array.isArray(workerResult.results)) ? workerResult.results : (workerResult && workerResult.results ? workerResult.results : []);

            // Build set of successful gift identifiers (the worker uses g.uuid or g.telegram_message_id as `gift`)
            const successIdsTwo = new Set();
            if (Array.isArray(resultsArrTwo)) {
                for (const r of resultsArrTwo) {
                    if (r && (r.ok === true || r.ok === 'true')) {
                        // r.gift might be number or string; normalize to String
                        successIdsTwo.add(String(r.gift));
                    }
                }
            }

            // Reuse successIds computed earlier; if worker didn't return per-gift results, assume all reserved succeeded
            // (we already built successIds above in the notification block)
            const successItems = matchedInventoryItems.filter(mi => {
                const id = String(mi.uuid ?? mi.telegram_message_id ?? mi.gift_id_long ?? '');
                // if worker returned explicit results, only include those marked ok
                if (successIdsTwo.size > 0) return successIdsTwo.has(id);
                // otherwise assume reservation = success
                return true;
            });

            if (successItems.length === 0) {
                console.log('withdraw-gifts: no successful gifts to record in transactions (none succeeded)');
            } else {
                // Helper: safe slug -> url component
                const makeUrlSafe = (s) => {
                    if (!s) return '';
                    // remove newlines and trim, keep ascii-ish characters (basic)
                    return encodeURIComponent(String(s).replace(/[\r\n]+/g, ' ').trim());
                };

                // Build transaction rows
                const txRows = successItems.map((it) => {
                    const txUuid = uuidv4();
                    const slug = it.slug ?? it.name ?? '';
                    // sanitize slug for url; fallback to name without spaces if slug missing
                    const slugSafe = makeUrlSafe(slug);
                    const giftUrl = `https://nft.fragment.com/gift/${slugSafe}.small.jpg`;
                    const amountTon = Number(isFinite(Number(it.value)) ? Number(it.value) : (it.amount ?? 0));

                    return {
                        uuid: txUuid,
                        user_id: Number(userRow?.telegram ?? recipient), // owner who withdrew
                        amount: amountTon,
                        status: "Вывод подарка",
                        created_at: now,
                        withdrawal_pending: false,
                        withdrawal_address: null,
                        deposit_address: null,
                        type: "Gift",
                        gift_url: giftUrl,
                        handled: true,
                        processed_at: now,
                        onchain_hash: null,
                        onchain_amount: null,
                        sender_wallet: null,
                    };
                });

                // Bulk insert all transaction rows
                const { data: txDataAll, error: txErrAll } = await supabaseAdmin
                    .from("transactions")
                    .insert(txRows)
                    .select();

                if (txErrAll) {
                    // Log and continue — we don't want to fail the whole withdraw because of a logging/transaction insert error.
                    console.error("withdraw-gifts: transactions bulk insert error", txErrAll);
                    // include the error information in response if you want, but still return ok
                    console.warn("withdraw-gifts: continuing despite transaction insert failure; gifts were transferred but DB row insert failed.");
                    // Optionally: you could attempt retries here; for now we log and move on.
                } else {
                    console.log(`withdraw-gifts: inserted ${Array.isArray(txDataAll) ? txDataAll.length : txRows.length} transaction rows for withdrawn gifts.`);
                }
            }
        } catch (err) {
            // Log error but don't block the user flow
            console.error("withdraw-gifts: transaction insertion internal error", err);
            // we intentionally won't return 500 here — gift transfer already performed by worker; transaction logging failure can be investigated
        }

        // Worker processed the request (it is responsible for calling /api/giftFailed for any gift-level failures).
        // Return the worker's result to the client. Do NOT re-add failed gifts here — worker will call /api/giftFailed as needed.
        return res.json({ ok: true, result: workerResult });

    } catch (err) {
        console.error("[withdraw-gifts] unexpected error:", err);
        return res.status(500).json({ ok: false, error: "unexpected_error", details: err.message ?? String(err) });
    }
});

// POST /api/giftHandle
app.post("/api/giftHandle", verifyGiftWorkerSignature, async (req, res) => {
    console.log("[BACKEND HIT] /api/giftHandle");
    try {
        const rec = req.body ?? {};
        // Basic validation
        if (!rec || Object.keys(rec).length === 0) {
            return res.status(400).json({ error: "empty payload" });
        }

        // 1) Determine the collection key to lookup
        const collectionKey = String(rec.collection_name || rec.collection || "").trim();
        if (!collectionKey) {
            console.warn("giftHandle: no collection key provided", rec);
            return res.status(400).json({ error: "no_collection_key" });
        }

        // 2) Validate telegram sender id from payload (the depositor)
        const telegramSenderRaw = rec.telegram_sender_id ?? rec.sender ?? null;
        if (!telegramSenderRaw) {
            console.warn("giftHandle: no sender telegram id in payload", rec);
            return res.status(400).json({ error: "no_sender_telegram_id" });
        }
        const telegramSender = Number(telegramSenderRaw);
        if (Number.isNaN(telegramSender)) {
            console.warn("giftHandle: invalid sender telegram id", telegramSenderRaw);
            return res.status(400).json({ error: "invalid_sender_telegram_id" });
        }

        // 3) If the relayer itself deposited (i.e. relayer -> user transfer), you may treat differently.
        //    Keep your existing guard if you have a constant GIFT_RELAYER_TELEGRAM_ID in scope.
        if (typeof GIFT_RELAYER_TELEGRAM_ID !== 'undefined' && telegramSender === GIFT_RELAYER_TELEGRAM_ID) {
            // This indicates the relayer sent the gift (not a deposit); nothing to credit here.
            return res.json({ ok: true, processed: true });
        }

        // 4) Fetch current up-to-date price for this collection from Supabase.
        let priceTon = null;
        try {
            // Using maybeSingle() usually returns one object or null; handle that.
            const { data: gpData, error: gpErr } = await supabaseAdmin
                .from("gift_prices")
                .select("*")
                .ilike("collection_name", collectionKey)
                .maybeSingle();

            if (gpErr) {
                console.error("giftHandle: gift_prices query error (maybe table missing) -", gpErr.message || gpErr);
                // Treat as missing mapping (allow fallback below or return)
            } else if (gpData) {
                // Found a row; extract price
                const row = gpData;
                priceTon = (row && row.price_ton !== undefined && row.price_ton !== null) ? Number(row.price_ton) : null;
                console.log("giftHandle: found price in gift_prices table", { collection: collectionKey, priceTon });
            }
        } catch (err) {
            console.error("giftHandle: error while fetching prices", err);
        }

        // If price not found, return reasonable error so you can add mapping in DB.
        if (priceTon == null || Number.isNaN(priceTon)) {
            console.warn("giftHandle: price not found for collection", collectionKey);
            return res.status(404).json({ error: "gift_not_unique", collection: collectionKey });
        }

        // 5) Build the gift object we will append to inventory using fields from rec.
        //    We'll follow your original inventory shape (lowercase keys) and add Telegram-specific metadata.
        const giftUuid = uuidv4();

        // Normalize/derive fields from worker's record (rec)
        const numberField = (rec.num ?? rec.number ?? rec.Number ?? null);
        const modelField = (rec.model ?? rec.modelName ?? rec.Model ?? null);
        const telegramMessageId = rec.telegram_message_id ?? rec.telegramMessageId ?? rec.telegram_message ?? null;
        const giftIdLong = rec.gift_id_long ?? rec.gift_id ?? rec.giftId ?? null;
        const savedId = rec.saved_id ?? rec.savedId ?? null;
        const slug = rec.gift_slug ?? rec.slug ?? null;
        const depositedAt = rec.created_at ?? new Date().toISOString();

        const newGift = {
            // basic fields (compatible with your inventory sample)
            name: collectionKey,
            uuid: giftUuid,
            model: modelField ? String(modelField) : null,
            value: Number.isFinite(priceTon) ? Number(priceTon) : 0,
            number: (numberField !== undefined && numberField !== null) ? Number(numberField) : null,

            // telegram-specific metadata (helpful for future transfers)
            telegram_message_id: telegramMessageId !== undefined ? (telegramMessageId === null ? null : Number(telegramMessageId)) : null,
            gift_id_long: giftIdLong !== undefined ? String(giftIdLong) : null,
            saved_id: savedId !== undefined ? String(savedId) : null,
            slug: slug ?? null,
            deposited_at: depositedAt
        };

        // 6) Find user by telegram and append the gift to inventory (or create new user)
        let user = null;
        try {
            const { data: existingUser, error: userErr } = await supabaseAdmin
                .from("users")
                .select("id, inventory, telegram")
                .eq("telegram", telegramSender)
                .maybeSingle();

            if (userErr) {
                console.error("giftHandle: users select error", userErr);
                return res.status(500).json({ error: "db_error_read_user", details: userErr.message || userErr });
            }

            if (existingUser) {
                const oldInventory = Array.isArray(existingUser.inventory) ? existingUser.inventory : [];
                // Prepend to list (you used this previously) — or push depending on ordering preference
                const newInventory = [newGift, ...oldInventory];

                const { data: updUser, error: updErr } = await supabaseAdmin
                    .from("users")
                    .update({ inventory: newInventory })
                    .eq("id", existingUser.id)
                    .select()
                    .single();

                if (updErr) {
                    console.error("giftHandle: users update error", updErr);
                    return res.status(500).json({ error: "db_error_update_user", details: updErr.message || updErr });
                }
                user = updUser;
            } else {
                // Insert a minimal user row. Ensure your users table allows null other fields.
                const { data: insUser, error: insErr } = await supabaseAdmin
                    .from("users")
                    .insert({ telegram: telegramSender, inventory: [newGift] })
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

        // telegram notif
        try {
            const chatId = telegramSender;
            const messageText = `Gift: ${slug} was added to your inventory!`
            if (!chatId) {
                console.error('gift handle: no chat id configured');
            }

            const sent = await bot.telegram.sendMessage(chatId, messageText, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (tgErr) {
            console.error('gift handle: telegram send error', tgErr);
        }

        const giftThumbUrl = `https://nft.fragment.com/gift/${slug}.small.jpg`

        // 7) Insert transaction row (record the deposit)
        try {
            const now = new Date().toISOString();
            const txUuid = uuidv4();
            const txRow = {
                uuid: txUuid,
                user_id: user?.telegram ?? telegramSender,
                amount: Number(priceTon),
                status: "Пополнение подарком",
                created_at: now,
                withdrawal_pending: false,
                withdrawal_address: null,
                deposit_address: null,
                type: "Gift",
                gift_url: giftThumbUrl,
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
                return res.status(500).json({ error: "db_error_insert_transaction", details: txErr.message || txErr });
            }

            console.log("giftHandle: processed gift COMPLETE - DONE!");

            return res.json({ ok: true, processed: true, user_id: user.telegram, amount: priceTon, transaction_uuid: txUuid });
        } catch (err) {
            console.error("giftHandle: transaction insertion internal error", err);
            return res.status(500).json({ error: "internal_error", details: err.message });
        }

    } catch (err) {
        console.error("giftHandle: unexpected error", err);
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
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        const { messageText } = req.body;
        if (!messageText) {
            return res.status(400).json({ error: "messageText required" });
        }

        if (!token) {
            console.error('Telegram token not configured (token is missing)');
            return res.status(500).json({ error: 'Telegram bot token not configured' });
        }

        const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;

        const payload = {
            chat_id: String(telegram),
            text: messageText,
            parse_mode: 'HTML', // optionally; or 'MarkdownV2' / omit
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Open profile", url: "https://t.me/myoraclerobot?startapp" }]
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
            return res.status(502).json({ error: "Telegram API error" });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Unexpected error in /api/botmessage');
        return res.status(500).json({ error: "failed to send bot message" });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        // canonical telegram id comes from validated session, NOT request body
        const telegram = Number(req.user?.id);
        const { amount, amount_cut, address, idempotencyKey } = req.body;

        if (!telegram || !amount || !address) return res.status(400).json({ error: 'missing parameters' });

        const rpc = await supabaseAdmin.rpc('submit_withdrawal', {
            p_telegram: telegram,
            p_amount: amount,
            p_amount_cut: amount_cut,
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
        } else if (msg.includes('stars_deposit')) {
            return res.status(400).json({ error: 'stars_deposit' });
        }
        console.error('submit_withdrawal error', err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

app.post('/api/deposit-intent', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }
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

        const MAX_AMOUNT = Number(process.env.MAX_DEPOSIT_AMOUNT || 99999);
        if (amount > MAX_AMOUNT) {
            console.warn('[deposit-intent] amount too large:', amount);
            return res.status(400).json({ error: `Amount too large (max ${MAX_AMOUNT})` });
        }

        const { usersWallet } = req.body ?? {};

        const uuid = uuidv4();
        const depositAddress = HOT_WALLET;
        if (!depositAddress) {
            console.error('[deposit-intent] no deposit address configured');
            return res.status(500).json({ error: 'Server misconfiguration' });
        }

        const insertRow = {
            uuid,
            user_id: telegram,
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

// POST /api/deposit-cancel
// body: { txId }
app.post('/api/deposit-cancel', requireTelegramSession, async (req, res) => {
    try {
        const { txId } = req.body ?? {};
        if (!txId) return res.status(400).json({ error: 'txId required' });

        // canonical authenticated telegram id from the session middleware
        const authTelegram = Number(req.user?.id);
        if (!authTelegram || Number.isNaN(authTelegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // 1) fetch the transaction row (read)
        const { data: txRow, error: txErr } = await supabaseAdmin
            .from('transactions')
            .select('uuid, user_id, status, handled')
            .eq('uuid', txId)
            .maybeSingle();

        if (txErr) {
            console.error('deposit-cancel: error fetching transaction', txErr);
            return res.status(500).json({ error: 'db_error' });
        }
        if (!txRow) {
            // not found
            return res.status(404).json({ error: 'not_found' });
        }

        // 2) Verify owner matches authenticated telegram id
        // Note: your transactions.user_id stores the telegram id in previous code paths,
        // so compare directly. Convert both to Number for safety.
        const txUserId = txRow.user_id == null ? null : Number(txRow.user_id);
        if (txUserId !== authTelegram) {
            return res.status(403).json({ error: 'forbidden' });
        }

        // 3) Check if already handled or not pending
        if (txRow.handled === true) {
            // Already handled - cannot cancel
            return res.status(409).json({ error: 'already_handled' });
        }

        // 4) Attempt conditional update (only update rows that are still unhandled)
        const { data: updated, error: updErr } = await supabaseAdmin
            .from('transactions')
            .update({
                status: 'Отмененное пополнение',
                processed_at: new Date().toISOString()
            })
            .eq('uuid', txId)
            .is('handled', false)
            .select('uuid, status')
            .single();

        if (updErr) {
            // This can happen if the row was concurrently processed/handled between the read and update
            console.warn('deposit-cancel: update returned error', updErr);
            // Return a helpful response: either already processed or generic DB error
            // If concurrency caused the row to be processed, return 409 conflict
            return res.status(409).json({ error: 'Not found or already processed', details: updErr.message ?? updErr });
        }

        // success
        return res.json({ ok: true, uuid: updated.uuid, status: updated.status });
    } catch (err) {
        console.error('deposit-cancel error', err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

app.post('/api/stars-payment', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        // Expect body: { amountStars: number|string } - amount in "stars"
        const raw = req.body?.amountStars ?? req.body?.amount ?? null;
        if (raw === null || raw === undefined) {
            return res.status(400).json({ ok: false, error: 'missing_amount' });
        }

        const amountStarsNum = Number(raw);
        if (!Number.isFinite(amountStarsNum) || amountStarsNum <= 0) {
            return res.status(400).json({ ok: false, error: 'invalid_amount' });
        }

        // round to 2 decimals like you requested
        const amountStarsRounded = Number(amountStarsNum.toFixed(2));

        // --- NEW LOGIC: compute TON per star from current TON price (uses your existing getTonPriceUsd + TARGET_USDT)
        // tonPerStar = TARGET_USDT / tonPriceUsd
        let tonPerStar = null;
        let usedFallbackRate = false;

        try {
            const tonPriceUsd = await getTonPriceUsd(); // reuses your function above
            if (!Number.isFinite(tonPriceUsd) || tonPriceUsd <= 0) {
                throw new Error('invalid tonPriceUsd');
            }
            tonPerStar = TARGET_USDT / tonPriceUsd;
        } catch (priceErr) {
            // fallback behavior: keep old fixed conversion 250 stars == 1 TON
            console.error('stars-payment: failed to fetch TON price, falling back to fixed rate (250 stars = 1 TON)', priceErr);
            tonPerStar = 1 / 250; // previous behaviour
            usedFallbackRate = true;
        }

        // compute amountTON from stars
        // use high precision for TON internally (2 decimal places) to avoid rounding tiny amounts to zero
        const amountTON = Number((amountStarsRounded * tonPerStar).toFixed(2));

        // fetch user row by telegram
        const { data: userRow, error: userErr } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('telegram', telegram)
            .maybeSingle();

        if (userErr) {
            console.error('stars-payment: supabase users select error', userErr);
            return res.status(500).json({ ok: false, error: 'db_error' });
        }
        if (!userRow) {
            return res.status(404).json({ ok: false, error: 'user_not_found' });
        }

        // compute new points value (points column appears numeric)
        // we store points with reasonable precision (2 decimals) because TON amounts can be small
        const oldPoints = Number(userRow.points ?? 0);
        const pointsToAdd = amountTON; // add TON-equivalent to points
        const newPoints = Number((oldPoints + pointsToAdd).toFixed(2));

        // update user points
        const { data: updUser, error: updErr } = await supabaseAdmin
            .from('users')
            .update({ points: newPoints })
            .eq('id', userRow.id)
            .select()
            .single();

        if (updErr) {
            console.error('stars-payment: supabase users update error', updErr);
            return res.status(500).json({ ok: false, error: 'db_error_update_user' });
        }

        // insert transaction row
        const txUuid = uuidv4();
        const insertRow = {
            uuid: txUuid,
            user_id: telegram,
            amount: amountTON, // amount IN TON as requested (8 decimals)
            status: 'Успешное пополнение',
            type: 'Deposit',
            deposit_address: null,
            sender_wallet: null,
            created_at: new Date().toISOString()
        };

        const { data: txData, error: txErr } = await supabaseAdmin
            .from('transactions')
            .insert(insertRow)
            .select()
            .single();

        if (txErr) {
            console.error('stars-payment: transactions insert error', txErr);
            // note: we don't rollback the user points here; you can add compensation logic if needed
            return res.status(500).json({ ok: false, error: 'db_error_insert_transaction' });
        }

        console.log('stars-payment: processed', {
            telegram,
            user_id: userRow.id,
            amountStars: amountStarsRounded,
            tonPerStar,
            amountTON,
            newPoints,
            txUuid,
            usedFallbackRate
        });

        return res.json({
            ok: true,
            amountStars: amountStarsRounded,
            tonPerStar,
            amountTON,
            pointsAdded: pointsToAdd,
            newPoints,
            transaction_uuid: txUuid,
            usedFallbackRate // useful for diagnostics on client side / logs
        });
    } catch (err) {
        console.error('stars-payment unexpected error', err);
        return res.status(500).json({ ok: false, error: 'internal_error', details: String(err) });
    }
});

const balanceCache = new Map()
const BALANCE_TTL_MS = 30 * 1000 // 15 seconds

// ---------- GET /api/balance?address=... ----------
app.get('/api/balance', async (req, res) => {
    try {
        const address = String(req.query.address || '').trim()
        if (!address) return res.status(400).json({ error: 'address query param required' })

        if (!TONCENTER_API_KEY) {
            return res.status(500).json({ error: 'Server not configured to fetch balances' })
        }

        // cache hit?
        const cached = balanceCache.get(address)
        if (cached && (Date.now() - cached.fetchedAt) < BALANCE_TTL_MS) {
            return res.json(cached.value)
        }

        const url = `${TONCENTER_API_BASE}/getAddressBalance`
        let resp
        try {
            resp = await axios.get(url, {
                params: { address, api_key: TONCENTER_API_KEY },
                timeout: 10_000
            })
        } catch (err) {
            console.warn('toncenter request failed', err?.message ?? err)
            return res.status(502).json({ error: 'Upstream error' })
        }

        if (resp.status !== 200 || !resp.data) {
            console.warn('toncenter/balance non-200', resp.status, resp.data)
            return res.status(502).json({ error: 'Upstream error' })
        }

        // resp.data.result is expected to be a string integer representing nanotons
        const raw = resp.data?.result
        if (raw == null) {
            console.warn('toncenter returned empty result', resp.data)
            return res.status(502).json({ error: 'Invalid upstream response' })
        }

        const nanoStr = String(raw).trim()
        if (!/^\d+$/.test(nanoStr)) {
            // If provider returns something unexpected try numeric fallback
            const maybe = Number(nanoStr)
            if (!Number.isFinite(maybe)) {
                console.warn('balance parse failed', raw)
                return res.status(502).json({ error: 'Invalid balance format from provider' })
            }
            // fallback: provider actually returned number (unlikely)
            const balanceTON = maybe / 1e9
            const result = { nanotons: String(Math.trunc(maybe)), balance: balanceTON, balance_ton: String(balanceTON) }
            balanceCache.set(address, { fetchedAt: Date.now(), value: result })
            return res.json(result)
        }

        // Use BigInt for exact math
        const nanoBig = BigInt(nanoStr)
        const whole = nanoBig / 1_000_000_000n
        const frac = nanoBig % 1_000_000_000n
        const balanceTonStr = `${whole.toString()}.${String(frac).padStart(9, '0')}`

        // convert to Number only when safe (<= 1e12 TON or so)
        let balanceNumber = null
        try {
            const maybeNum = Number(whole) + Number(frac) / 1e9
            if (Number.isFinite(maybeNum)) balanceNumber = maybeNum
        } catch (e) {
            balanceNumber = null
        }

        const result = {
            nanotons: nanoStr,          // exact upstream integer as string
            balance_ton: balanceTonStr, // exact decimal representation as string
            balance: balanceNumber      // numeric TON when safe (may be null)
        }

        balanceCache.set(address, { fetchedAt: Date.now(), value: result })
        return res.json(result)
    } catch (err) {
        console.error('balance endpoint error', err?.response?.data ?? err?.message ?? err)
        return res.status(500).json({ error: 'Failed to fetch balance' })
    }
})

// ---------- GET /api/channelMembership ----------
app.get('/api/channelMembership', async (req, res) => {
    try {
        const telegram = Number(req.user?.id);
        if (!telegram || Number.isNaN(telegram)) {
            return res.status(401).json({ error: 'unauthenticated' });
        }

        if (!token) {
            return res.status(500).json({ error: 'Bot not configured to check member' })
        }
        let formattedChatId = '@myoracle_news'


        const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getChatMember` +
            `?chat_id=${encodeURIComponent(formattedChatId)}` +
            `&user_id=${encodeURIComponent(telegram)}`;


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

        const bannerUrl = "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/services-information/Oracle_Banner_2.png";

        // build startAppQuery and ensure safe encoding
        const rawRef = ctx.session.ref ?? '';
        const startAppQuery = `?startapp=${encodeURIComponent(rawRef)}`;

        // prepare reply options (keyboard + common options)
        const replyOptions = {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [Markup.button.url("🕹️ Open App", `https://t.me/myoraclerobot${startAppQuery}`)],
                [Markup.button.url("📢 Community", `https://t.me/myoracle_news`)]
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
                caption: `Good to see you in Oracle! 🔮 Use your knowledge, play and predict the future events.`,
                ...replyOptions
            });
        } catch (e) {
            console.warn('banner send failed (will fallback to text):', e?.message ?? e);
            return ctx.reply(
                `Good to see you in Oracle! 🔮 Use your knowledge, play and predict the future events.`,
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
        './worker.js',
        './giftrelayer-listener.js',
        './withdrawal-worker.js'
    ];

    // per-worker state for backoff + child reference
    const state = {};
    // pending IPC replies: map msgId -> { resolve, reject, timer }
    const pending = new Map();

    for (const wf of workers) {
        state[wf] = { restartDelay: 1000, maxDelay: 60_000, child: null, spawning: false };
    }

    function spawnWorker(wf) {
        const abs = path.resolve(wf);
        const st = state[wf];
        if (st.spawning) {
            console.log(`[supervisor] spawn already in progress for ${wf}`);
            return;
        }
        st.spawning = true;

        console.log(`[supervisor] spawning worker: ${abs}`);
        const child = spawn(process.execPath, [abs], {
            env: { ...process.env, SUPERVISOR_CHILD: '1', WORKER_NAME: wf },
            stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });

        st.child = child;

        child.once('spawn', () => {
            st.spawning = false;
            st.restartDelay = 1000;
            console.log(`[supervisor] worker spawned: ${wf} (pid=${child.pid})`);
        });

        // Handle messages from the child and resolve pending promises
        child.on('message', (m) => {
            try {
                // normalize shape:
                // child replies with { replyTo: id, ok: true/false, result?, error? }
                if (m && typeof m === 'object' && m.replyTo) {
                    const entry = pending.get(m.replyTo);
                    if (!entry) {
                        console.warn(`[supervisor] no pending IPC entry for replyTo=${m.replyTo}`);
                        return;
                    }
                    // clear timeout
                    clearTimeout(entry.timer);
                    pending.delete(m.replyTo);
                    if (m.ok) entry.resolve(m.result);
                    else entry.reject(new Error(m.error || 'worker_error'));
                    return;
                }

                // Optional: other child-initiated messages
                console.log(`[worker msg ${wf}]`, m);
            } catch (err) {
                console.error('[supervisor] error handling child message', err);
            }
        });

        child.on('exit', (code, signal) => {
            st.child = null;
            st.spawning = false;
            console.warn(`[supervisor] worker exited (${wf}) code=${code} signal=${signal}`);
            // reject all pending requests for this worker (best-effort)
            for (const [id, entry] of pending.entries()) {
                // We don't know which worker the pending id targeted, so reject all (safer).
                clearTimeout(entry.timer);
                entry.reject(new Error(`worker_exited_before_reply (worker=${wf})`));
                pending.delete(id);
            }
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
            setTimeout(() => spawnWorker(wf), st.restartDelay);
        });
    }

    // Start all workers initially
    for (const wf of workers) {
        if (state[wf].child) {
            console.log(`[supervisor] child already present for ${wf} pid=${state[wf].child.pid}`);
            continue;
        }
        spawnWorker(wf);
    }

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
        setTimeout(() => process.exit(0), 2000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Helper: find child by the exact worker path string used earlier
    function _getChildForWorker(wf) {
        const st = state[wf];
        if (!st) return null;
        return st.child ?? null;
    }

    // Public: sendToWorker(workerPath, cmd, payload, timeoutMs = 60_000)
    async function sendToWorker(workerPath, cmd, payload = {}, timeoutMs = 60_000) {
        const child = _getChildForWorker(workerPath);
        if (!child) {
            throw new Error(`worker_not_running: ${workerPath}`);
        }
        if (!child.send) {
            throw new Error(`worker_ipc_not_available: ${workerPath}`);
        }

        const id = uuidv4();
        const msg = { id, cmd, payload };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error('worker_ipc_timeout'));
            }, timeoutMs);

            pending.set(id, { resolve, reject, timer });

            try {
                child.send(msg, (err) => {
                    if (err) {
                        clearTimeout(timer);
                        pending.delete(id);
                        reject(err);
                    }
                });
            } catch (err) {
                clearTimeout(timer);
                pending.delete(id);
                reject(err);
            }
        });
    }

    // Return supervisory interface
    return {
        getChildren: () => workers.map(wf => ({ worker: wf, pid: state[wf].child?.pid ?? null, restartingIn: state[wf].restartDelay })),
        sendToWorker,
        // expose state for debug if you want
        _state: state
    };
}

// start supervisor AFTER server and bot are listening
// startWorkerWithSupervisor();

const sup = startWorkerWithSupervisor();
global.__SUPERVISOR = sup;
console.log('[supervisor] children', sup.getChildren());