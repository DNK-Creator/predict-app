// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, Raw } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import util from "util";

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";
const DEBUG = !!process.env.WORKER_DEBUG;

// Watchdog / timeout config
const PERSIST_TIMEOUT_MS = Number(process.env.GIFTLR_PERSIST_TIMEOUT_MS || 7000);
const PING_INTERVAL_MS = Number(process.env.GIFTLR_PING_INTERVAL_MS || 60_000);
const PING_FAIL_RECONNECTS = Number(process.env.GIFTLR_PING_FAIL_RECONNECTS || 2);

// Add near the top (module scope) to dedupe duplicate updates:
const _processedMessageIds = new Set();

// minimal env validation
if (!apiId || !apiHash || !stringSession) {
    console.error("[giftrelayer] TG_API_ID, TG_API_HASH and TG_STRING_SESSION must be set. Exiting.");
    process.exit(1);
}

// Telegram client
const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 10,
});

// runtime state
let handlersRegistered = false;
let consecutivePingFailures = 0;

function log(...args) {
    if (DEBUG) console.log('[giftrelayer]', ...args);
}
function info(...args) { console.log('[giftrelayer]', ...args); }
function warn(...args) { console.warn('[giftrelayer]', ...args); }
function error(...args) { console.error('[giftrelayer]', ...args); }

// safe stringify that avoids circular and huge binary dumps
function safeStringify(obj, maxLen = 4000) {
    const seen = new WeakSet();
    function replacer(key, value) {
        // replace Buffers/typed arrays
        if (value && typeof value === 'object') {
            // To avoid WeakSet throwing for primitives
            if (value instanceof Buffer || value?.type === 'Buffer' || (typeof value.byteLength === 'number' && (value instanceof Uint8Array || value.buffer))) {
                return `<Binary ${value?.length ?? value?.byteLength ?? 'n'} bytes>`;
            }
            if (seen.has(value)) return '<Circular>';
            seen.add(value);
        }
        // hide huge arrays
        if (Array.isArray(value) && value.length > 50) {
            return `[Array length ${value.length} — truncated]`;
        }
        return value;
    }

    try {
        // If object exposes toJSON, prefer that for TL objects
        const candidate = (obj && typeof obj.toJSON === 'function') ? obj.toJSON() : obj;
        const s = JSON.stringify(candidate, replacer);
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen) + '...';
    } catch (e) {
        try {
            // fallback util.inspect (safer on circular)
            return util.inspect(obj, { depth: 3, breakLength: 200, maxArrayLength: 10 });
        } catch (ign) {
            return String(obj);
        }
    }
}

// Promise timeout helper
function withTimeout(promise, ms, failValue = null) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(failValue), ms))
    ]);
}

// persist with bounded timeout so we never await forever
async function persistGiftRecord(record) {
    try {
        const controller = new AbortController();
        // node-fetch abort after timeout
        const p = fetch('https://api.giftspredict.ru/api/giftHandle', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
            signal: controller.signal
        });

        const resp = await withTimeout(p, PERSIST_TIMEOUT_MS, null);
        if (!resp) {
            warn('[giftrelayer] persistGiftRecord timed out');
            return;
        }
        if (!resp.ok) {
            console.warn('[giftrelayer] backend relay non-ok', resp.status);
            return;
        }
        log('Transfered gift record to backend (ok):', { gift_id: record.gift_id, telegram_sender_id: record.telegram_sender_id });
        return;
    } catch (err) {
        console.error('[giftrelayer] persistGiftRecord error', err && err.message ? err.message : err);
    }
}

// conservative gift extractor (you already had a good one).
// Keep your existing extractor but avoid re-stringifying huge objects.
function extractGiftInfoFromJson(msgJson, alreadySimplified = false) {
    const out = {
        isGift: false,
        isUnique: false,
        giftId: null,
        collectionName: null,
        starCount: null,
        uniqueNumber: null,
        uniqueBaseName: null,
        origin: null,
        ownedGiftId: null,
        rawAction: null,
    };

    let j;
    try {
        j = alreadySimplified ? msgJson : simplify(msgJson);
    } catch (e) {
        j = msgJson;
    }

    // small textual heuristic
    try {
        const sample = safeStringify(j, 2000);
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(sample)) {
            out.isGift = true;
            out.rawAction = j;
        }
    } catch (e) { /* ignore */ }

    // recursive search for candidate objects
    let giftCandidate = null;
    let uniqueCandidate = null;

    const giftKeyRegex = /(^|_)gift($|_)/i;
    const uniqueKeyRegex = /unique|unique_gift|unique_name|unique_number|base_name/i;
    const stickerKeyRegex = /sticker|sticker_set|set_name|collection/i;
    const starKeyRegex = /star_count|starCount|StarGift/i;

    function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;
        const keys = Object.keys(obj);
        if (!giftCandidate) {
            if (keys.some(k => giftKeyRegex.test(k) || starKeyRegex.test(k) || stickerKeyRegex.test(k))) {
                giftCandidate = obj;
            } else if ((obj.id || obj.gift_id || obj._id) && (obj.sticker || obj.collection || obj.set_name || obj.setName || obj.sticker_set_name)) {
                giftCandidate = obj;
            }
        }
        if (!uniqueCandidate) {
            if (keys.some(k => uniqueKeyRegex.test(k) || /unique_name|number|unique_number/i.test(k))) {
                uniqueCandidate = obj;
            }
        }
        for (const v of Object.values(obj)) {
            try { traverse(v); } catch (e) { /* ignore */ }
        }
    }

    try { traverse(j); } catch (e) { /* ignore */ }

    if (uniqueCandidate) {
        out.isGift = true;
        out.isUnique = true;
        out.rawAction = out.rawAction || uniqueCandidate;
        out.uniqueBaseName = uniqueCandidate.base_name ?? uniqueCandidate.baseName ?? uniqueCandidate.name ?? null;
        out.giftId = uniqueCandidate.name ?? uniqueCandidate.unique_name ?? uniqueCandidate.gift_id ?? out.giftId;
        out.uniqueNumber = uniqueCandidate.number ?? uniqueCandidate.unique_number ?? null;
        out.origin = uniqueCandidate.origin ?? uniqueCandidate.source ?? out.origin ?? null;
        out.collectionName = out.uniqueBaseName ?? out.collectionName;
        out.ownedGiftId = uniqueCandidate.owned_gift_id ?? uniqueCandidate.ownedGiftId ?? out.ownedGiftId ?? null;
        out.starCount = uniqueCandidate.star_count ?? uniqueCandidate.starCount ?? out.starCount ?? null;
    }

    if (!out.isGift && giftCandidate) {
        out.isGift = true;
        out.rawAction = out.rawAction || giftCandidate;
        out.giftId = giftCandidate.id ?? giftCandidate.gift_id ?? giftCandidate._id ?? out.giftId;
        out.starCount = giftCandidate.star_count ?? giftCandidate.starCount ?? out.starCount ?? null;
        out.collectionName =
            giftCandidate.sticker?.set_name ??
            giftCandidate.sticker?.setName ??
            giftCandidate.sticker_set_name ??
            giftCandidate.collection ??
            giftCandidate.set_name ??
            out.collectionName ??
            out.giftId;
        out.ownedGiftId = giftCandidate.owned_gift_id ?? giftCandidate.ownedGiftId ?? out.ownedGiftId ?? null;
    }

    if (!out.isGift) {
        const action = j?.action ?? j?.message?.action ?? null;
        if (action) {
            out.rawAction = out.rawAction || action;
            const acSimpl = alreadySimplified ? action : (() => { try { return simplify(action); } catch (e) { return action; } })();
            const acGift = acSimpl.gift ?? acSimpl.gift_info ?? acSimpl;
            const acUnique = acSimpl.unique_gift ?? (acSimpl.gift && acSimpl.gift.unique_gift) ?? null;

            if (acUnique) {
                out.isGift = true;
                out.isUnique = true;
                out.uniqueBaseName = acUnique.base_name ?? acUnique.baseName ?? acUnique.name ?? null;
                out.giftId = acUnique.name ?? acUnique.unique_name ?? out.giftId;
                out.uniqueNumber = acUnique.number ?? acUnique.unique_number ?? null;
                out.origin = acSimpl.origin ?? acUnique.origin ?? out.origin;
                out.collectionName = out.uniqueBaseName ?? out.collectionName;
                out.ownedGiftId = acSimpl.owned_gift_id ?? acSimpl.ownedGiftId ?? null;
            } else if (acGift) {
                out.isGift = true;
                out.giftId = acGift.id ?? acGift.gift_id ?? acGift._id ?? out.giftId;
                out.starCount = acGift.star_count ?? acGift.starCount ?? out.starCount;
                out.collectionName =
                    acGift.sticker?.set_name ??
                    acGift.sticker?.setName ??
                    acGift.collection ??
                    out.collectionName ??
                    out.giftId;
                out.ownedGiftId = acSimpl.owned_gift_id ?? acSimpl.ownedGiftId ?? out.ownedGiftId ?? null;
            }
        }
    }

    if (out.isGift && !out.rawAction) out.rawAction = j;
    return out;
}

// simplified TL -> plain converter (safe: limit recursion depth and skip Big binary)
function simplify(obj, depth = 0, maxDepth = 6) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'boolean' || typeof obj === 'number') return obj;
    if (typeof obj === 'bigint') return Number(obj);

    // prefer toJSON
    if (typeof obj.toJSON === 'function') {
        try {
            return simplify(obj.toJSON(), depth + 1, maxDepth);
        } catch (e) {
            // fall through
        }
    }

    if (depth > maxDepth) {
        return '[MaxDepth]';
    }

    // Buffer / typed arrays
    if (obj instanceof Buffer || (obj && typeof obj.byteLength === 'number' && (obj instanceof Uint8Array || obj.buffer))) {
        return `<Binary ${obj?.length ?? obj?.byteLength ?? 'n'} bytes>`;
    }

    if (Array.isArray(obj)) {
        const outA = [];
        for (let i = 0; i < obj.length && i < 100; i++) {
            outA.push(simplify(obj[i], depth + 1, maxDepth));
        }
        if (obj.length > 100) outA.push(`[... ${obj.length - 100} more items]`);
        return outA;
    }

    if (typeof obj === 'object') {
        const out = {};
        for (const k of Object.keys(obj)) {
            try {
                out[k] = simplify(obj[k], depth + 1, maxDepth);
            } catch (e) {
                out[k] = String(obj[k]);
            }
        }
        return out;
    }

    return obj;
}

// Robust raw update handler (cheap checks + limited stringify)
async function onRawUpdate(event) {
    try {
        // lightweight checks only
        const update = event?.update ?? event;
        if (!update) return;

        // shallow top-level keys check
        const top = update;
        const topKeys = Object.keys(top || {}).join(' ');
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b|\bgift\b|unique_gift|messageAction|StarGift/i.test(topKeys)) {
            return;
        }

        // candidate selection (shallow)
        const shallowCandidate =
            update.message ?? update.new_message ?? update.newMessage ?? update.msg ?? null;
        const candidateRaw = shallowCandidate ?? update;

        // simplify only the candidate (safe)
        let candidate;
        try { candidate = simplify(candidateRaw); } catch (e) { candidate = candidateRaw; }

        // dedupe by id when possible
        const candidateId = candidate?.id ?? candidate?.message?.id ?? null;
        log(`[giftrelayer] start checking candidateId: ${String(candidateId ?? 'undefined')}`);
        if (candidateId != null) {
            if (_processedMessageIds.has(String(candidateId))) return;
            _processedMessageIds.add(String(candidateId));
            if (_processedMessageIds.size > 1000) {
                // prune some
                const it = _processedMessageIds.values();
                for (let i = 0; i < 100; i++) {
                    const v = it.next().value;
                    if (!v) break;
                    _processedMessageIds.delete(v);
                }
            }
        }
        log('[giftrelayer] ended checking candidateId');

        // further cheap key-scan
        const keysSnapshot = Object.keys(candidate || {}).join(' ');
        log('[giftrelayer] checking if the event is gift related');
        if (!/\bgift\b|unique_gift|unique_name|unique_number|messageAction|StarGift/i.test(keysSnapshot)) {
            return;
        }
        info('[giftrelayer] the event is in fact gift related');

        // extract gift info (already simplified)
        const giftInfo = extractGiftInfoFromJson(candidate, true);
        if (!giftInfo?.isGift) {
            log('[giftrelayer] extractor did not find gift; keys=', keysSnapshot);
            return;
        }

        // Resolve sender id robustly
        let senderId =
            (candidate?.fromId && typeof candidate.fromId === 'object' && candidate.fromId.userId) ? candidate.fromId.userId :
                (candidate?.fromId ?? candidate?.senderId ?? candidate?.userId ?? null);

        // Check action.fromId (messageActionStarGift.from_id)
        if (!senderId && candidate?.action?.fromId) {
            const a = candidate.action.fromId;
            senderId = (a && typeof a === 'object' && a.userId) ? a.userId : a ?? null;
        }

        // If still missing, check nested gift.ownerId (but ownerId can be recipient/relayer — you'll filter later)
        if (!senderId && giftInfo?.rawAction) {
            // giftInfo.rawAction is simplified; many shapes place ownerId inside gift.ownerId
            const g = giftInfo.rawAction.gift ?? giftInfo.rawAction;
            if (g && (g.ownerId || g.owner)) {
                const owner = g.ownerId ?? g.owner;
                senderId = owner && owner.userId ? owner.userId : senderId;
            }
        }

        // Build record
        const senderUsername = candidate?.from?.username ?? candidate?.sender?.username ?? null;
        const recipient = candidate?.peerId ?? candidate?.chatId ?? candidate?.toId ?? null;
        const now = new Date().toISOString();

        const record = {
            uuid: uuidv4(),
            telegram_message_id: candidate?.id ?? null,
            telegram_chat_peer: JSON.stringify(recipient),
            telegram_sender_id: senderId ?? null,
            sender_username: senderUsername ?? null,
            gift_id: giftInfo.giftId ?? null,
            collection_name: giftInfo.collectionName ?? null,
            star_count: giftInfo.starCount ?? null,
            is_unique: !!giftInfo.isUnique,
            unique_number: giftInfo.uniqueNumber ?? null,
            unique_base_name: giftInfo.uniqueBaseName ?? null,
            origin: giftInfo.origin ?? null,
            owned_gift_id: giftInfo.ownedGiftId ?? null,
            raw_json: safeStringify(candidate, 6000),
            created_at: now
        };

        info('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onRawUpdate error', err && err.stack ? err.stack : err);
    }
}

// plain NewMessage handler (for regular messages)
async function onNewMessage(event) {
    try {
        const msg = event.message;
        if (!msg) return;
        info('[giftrelayer] found an incoming new message');
        const msgJson = (msg && typeof msg.toJSON === 'function') ? msg.toJSON() : msg;
        // log small sample only
        log('incoming message id=', msgJson?.id, 'peer=', (msgJson?.peerId ?? msgJson?.peer));
        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1') {
            console.log('[giftrelayer] SAMPLE MSG JSON (first run):', safeStringify(msgJson, 4000));
            process.env.GIFTLR_CAPTURE_SAMPLE = '0';
        }

        const giftInfo = extractGiftInfoFromJson(msgJson);
        log('extract result:', giftInfo);

        if (!giftInfo.isGift) {
            try {
                if (msg && typeof msg.reply === 'function') {
                    await msg.reply({ message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                    log('[giftrelayer] replied with greeting via msg.reply');
                } else {
                    const candidateId = simplify(msgJson?.peerId?.userId ?? msgJson?.fromId?.userId ?? msgJson?.senderId ?? null);
                    if (candidateId != null) {
                        await client.sendMessage(candidateId, { message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                        log('[giftrelayer] replied (fallback) to', candidateId);
                    }
                }
            } catch (err) {
                console.error('[giftrelayer] error while replying', err);
            }
            info('[giftrelayer] user sent random text message');
            return;
        }

        // treat as gift (rare with NewMessage but keep parity)
        const senderId =
            (msgJson?.fromId && typeof msgJson.fromId === 'object' && msgJson.fromId.userId) ? msgJson.fromId.userId :
                (msgJson?.fromId ?? msgJson?.senderId ?? null);
        const senderUsername = msgJson?.from?.username ?? msgJson?.sender?.username ?? null;
        const recipient = msgJson?.peerId ?? msgJson?.chatId ?? null;
        const now = new Date().toISOString();

        const record = {
            uuid: uuidv4(),
            telegram_message_id: msgJson?.id ?? null,
            telegram_chat_peer: JSON.stringify(recipient),
            telegram_sender_id: senderId ?? null,
            sender_username: senderUsername ?? null,
            gift_id: giftInfo.giftId ?? null,
            collection_name: giftInfo.collectionName ?? null,
            star_count: giftInfo.starCount ?? null,
            is_unique: !!giftInfo.isUnique,
            unique_number: giftInfo.uniqueNumber ?? null,
            unique_base_name: giftInfo.uniqueBaseName ?? null,
            origin: giftInfo.origin ?? null,
            owned_gift_id: giftInfo.ownedGiftId ?? null,
            raw_json: safeStringify(msgJson, 6000),
            created_at: now
        };
        info('[giftrelayer] detected gift (NewMessage) -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onNewMessage error', err && err.stack ? err.stack : err);
    }
}

// register event handlers (idempotent)
function registerHandlers() {
    if (handlersRegistered) return;
    client.addEventHandler(onNewMessage, new NewMessage({}));
    client.addEventHandler(onRawUpdate, new Raw({
        func: (u) => {
            try {
                if (!u || typeof u !== 'object') return false;
                // only message-like/actions (quick)
                if (u.message || u.new_message || u.action || u.message_action) return true;
                const ctor = u?.className ?? u?.CONSTRUCTOR_ID ?? u?._ ?? u?.constructor?.name;
                if (typeof ctor === 'string' && /message|update|msg|action/i.test(String(ctor))) return true;
                return false;
            } catch (e) {
                return false;
            }
        }
    }));
    handlersRegistered = true;
    info('[giftrelayer] event handlers registered');
}

// --- client startup & heartbeat/reconnect helpers ---
async function restartClient() {
    try {
        info('[giftrelayer] restarting client...');
        try { await client.disconnect(); } catch (e) { /* ignore */ }
        // small delay to allow proper socket cleanup
        await new Promise(r => setTimeout(r, 500));
        await client.start();
        registerHandlers();
        consecutivePingFailures = 0;
        info('[giftrelayer] client restarted successfully');
    } catch (err) {
        console.error('[giftrelayer] restartClient error', err && err.message ? err.message : err);
    }
}

async function heartbeatLoop() {
    setInterval(async () => {
        try {
            // simple call to keep connection healthy
            await client.getMe();
            if (consecutivePingFailures > 0) {
                info('[giftrelayer] ping OK (reset fail count)');
                consecutivePingFailures = 0;
            } else {
                log('[giftrelayer] ping OK');
            }
        } catch (err) {
            consecutivePingFailures++;
            warn('[giftrelayer] ping failed (#' + consecutivePingFailures + ')', err && err.message ? err.message : err);
            if (consecutivePingFailures >= PING_FAIL_RECONNECTS) {
                warn('[giftrelayer] ping failed repeatedly — attempting restart');
                consecutivePingFailures = 0;
                await restartClient();
            }
        }
    }, PING_INTERVAL_MS).unref();
}

// startup: connect, register handlers
async function start() {
    try {
        info("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        info("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

        registerHandlers();
        heartbeatLoop();

        info("[giftrelayer] connected — entering wait loop (ctrl+C to stop)");
        // keep alive
        await new Promise(() => { });
    } catch (err) {
        console.error("[giftrelayer] start error, exiting:", err && err.message ? err.message : err);
        // try to let the supervisor restart us instead of process.exit here
        process.exit(1);
    }
}

// global failure logging so handler doesn't silently die
process.on('unhandledRejection', (reason, p) => {
    console.error('[giftrelayer] unhandledRejection', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[giftrelayer] uncaughtException', err && err.stack ? err.stack : err);
});

// graceful shutdown
async function shutdownAndExit() {
    console.log('[giftrelayer] shutting down — disconnecting client...');
    try { await client.disconnect(); } catch (e) { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', shutdownAndExit);
process.on('SIGTERM', shutdownAndExit);

start();
