// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, Raw } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import util from "util";

// ----------------- MANUAL DEBUG FLAGS -----------------
// Toggle these directly in this file while testing (no env needed)
const FORCE_DEBUG = true;         // Set true to see all debug logs
const FORCE_VERBOSE = false;      // slightly more verbose (safeStringify samples); leave false in production
// ------------------------------------------------------

const DEBUG = FORCE_DEBUG || !!process.env.WORKER_DEBUG;

// Watchdog / timeout config
const PERSIST_TIMEOUT_MS = 8000;
const GETMSG_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 60_000;
const PING_FAIL_RECONNECTS = 2;

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";

// Add near the top (module scope) to dedupe duplicate updates:
const _processedMessageIds = new Set();

// Basic env validation
if (!apiId || !apiHash || !stringSession) {
    console.error("[giftrelayer] TG_API_ID, TG_API_HASH and TG_STRING_SESSION must be set. Exiting.");
    process.exit(1);
}

// Telegram client
const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 10,
});

function log(...args) { if (DEBUG) console.log('[giftrelayer]', ...args); }
function info(...args) { console.log('[giftrelayer]', ...args); }
function warn(...args) { console.warn('[giftrelayer]', ...args); }
function error(...args) { console.error('[giftrelayer]', ...args); }

// safe stringify that avoids circular and huge binary dumps
function safeStringify(obj, maxLen = 4000) {
    const seen = new WeakSet();
    function replacer(key, value) {
        if (value && typeof value === 'object') {
            if (value instanceof Buffer || value?.type === 'Buffer' || (typeof value.byteLength === 'number' && (value instanceof Uint8Array || value.buffer))) {
                return `<Binary ${value?.length ?? value?.byteLength ?? 'n'} bytes>`;
            }
            if (seen.has(value)) return '<Circular>';
            seen.add(value);
        }
        if (Array.isArray(value) && value.length > 50) {
            return `[Array length ${value.length} — truncated]`;
        }
        return value;
    }

    try {
        const candidate = (obj && typeof obj.toJSON === 'function') ? obj.toJSON() : obj;
        const s = JSON.stringify(candidate, replacer);
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen) + '...';
    } catch (e) {
        try {
            return util.inspect(obj, { depth: 3, breakLength: 200, maxArrayLength: 10 });
        } catch (ign) {
            return String(obj);
        }
    }
}

// helper: run promise with soft timeout (returns null on timeout)
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(null), ms))
    ]);
}

// persist with bounded timeout
async function persistGiftRecord(record) {
    try {
        const resp = await withTimeout(
            fetch('https://api.giftspredict.ru/api/giftHandle', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(record),
            }),
            PERSIST_TIMEOUT_MS
        );
        if (!resp) {
            warn('[giftrelayer] persistGiftRecord request timed out (no response)');
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

// ----------------- Extractor & simplifier (kept robust) -----------------
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
    try { j = alreadySimplified ? msgJson : simplify(msgJson); } catch (e) { j = msgJson; }

    try {
        const sample = safeStringify(j, 2000);
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(sample)) {
            out.isGift = true;
            out.rawAction = j;
        }
    } catch (e) { }

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
            try { traverse(v); } catch (e) { }
        }
    }

    try { traverse(j); } catch (e) { }

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

// simplified TL -> plain converter
function simplify(obj, depth = 0, maxDepth = 6) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'boolean' || typeof obj === 'number') return obj;
    if (typeof obj === 'bigint') return Number(obj);

    if (typeof obj.toJSON === 'function') {
        try { return simplify(obj.toJSON(), depth + 1, maxDepth); } catch (e) { }
    }

    if (depth > maxDepth) return '[MaxDepth]';

    if (obj instanceof Buffer || (obj && typeof obj.byteLength === 'number' && (obj instanceof Uint8Array || obj.buffer))) {
        return `<Binary ${obj?.length ?? obj?.byteLength ?? 'n'} bytes>`;
    }

    if (Array.isArray(obj)) {
        const outA = [];
        for (let i = 0; i < obj.length && i < 100; i++) outA.push(simplify(obj[i], depth + 1, maxDepth));
        if (obj.length > 100) outA.push(`[... ${obj.length - 100} more items]`);
        return outA;
    }

    if (typeof obj === 'object') {
        const out = {};
        for (const k of Object.keys(obj)) {
            try { out[k] = simplify(obj[k], depth + 1, maxDepth); } catch (e) { out[k] = String(obj[k]); }
        }
        return out;
    }

    return obj;
}

// Attempt to resolve sender ID from the candidate and context.
// If not present in candidate, attempt to fetch the referenced message (replyTo.replyToMsgId)
async function resolveSenderId(candidate, giftInfo) {
    // 1) candidate.fromId (object { userId })
    if (candidate?.fromId && typeof candidate.fromId === 'object' && candidate.fromId.userId) {
        return candidate.fromId.userId;
    }
    // 2) candidate.fromId primitive (rare)
    if (candidate?.fromId) return candidate.fromId;

    // 3) candidate.action.fromId (messageActionStarGift.from_id)
    if (candidate?.action?.fromId) {
        const a = candidate.action.fromId;
        if (typeof a === 'object' && a.userId) return a.userId;
        return a;
    }

    // 4) gift.ownerId — may be recipient (the relayer) — keep as fallback
    try {
        const g = giftInfo?.rawAction?.gift ?? giftInfo?.rawAction;
        if (g && (g.ownerId || g.owner)) {
            const owner = g.ownerId ?? g.owner;
            if (owner && owner.userId) return owner.userId;
            if (owner) return owner;
        }
    } catch (e) { }

    // 5) If update has a replyTo.replyToMsgId (the service update references the original message),
    //    fetch that message from the peer and extract its fromId. This is the core recovery mechanism.
    try {
        const replyToMsgId = candidate?.replyTo?.replyToMsgId ?? candidate?.replyToMsgId ?? null;
        const peer = candidate?.peerId ?? candidate?.peer ?? candidate?.chatId ?? null;
        if (replyToMsgId && peer) {
            // peer might be simplified object like { userId: '123', className: 'PeerUser' } or an id
            let peerArg = peer;
            // if peer is object with userId string, convert to number
            if (peer && typeof peer === 'object') {
                if (peer.userId) peerArg = Number(peer.userId);
                else if (peer.chatId) peerArg = Number(peer.chatId);
            }

            log('[giftrelayer] attempting to fetch referenced message to resolve sender: replyToMsgId=', replyToMsgId, 'peer=', peerArg);

            const msgs = await withTimeout(client.getMessages(peerArg, [replyToMsgId]), GETMSG_TIMEOUT_MS);
            if (msgs && Array.isArray(msgs) && msgs.length > 0) {
                const m = msgs[0];
                try {
                    // Many gramJS Message objects have .fromId or .from
                    const simplified = simplify(m);
                    const fromIdObj = simplified?.fromId ?? simplified?.senderId ?? simplified?.from ?? null;
                    // fromIdObj might be object { userId: '...' } or numeric/string id
                    if (fromIdObj && typeof fromIdObj === 'object' && fromIdObj.userId) {
                        log('[giftrelayer] resolved sender from referenced message (object userId)=', fromIdObj.userId);
                        return fromIdObj.userId;
                    } else if (fromIdObj) {
                        log('[giftrelayer] resolved sender from referenced message (primitive)=', fromIdObj);
                        return fromIdObj;
                    }
                } catch (e) {
                    log('[giftrelayer] error while parsing referenced message', e);
                }
            } else {
                log('[giftrelayer] getMessages returned no results or timed out for msgId', replyToMsgId);
            }
        }
    } catch (err) {
        log('[giftrelayer] resolveSenderId getMessages error', err && err.message ? err.message : err);
    }

    // final fallback: null
    return null;
}

// Robust raw update handler
async function onRawUpdate(event) {
    try {
        const update = event?.update ?? event;
        if (!update) return;

        // shallow top-level keys check
        const topKeys = Object.keys(update || {}).join(' ');
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b|\bgift\b|unique_gift|messageAction|StarGift/i.test(topKeys)) {
            // skip — but in debug show a sample
            if (DEBUG && FORCE_VERBOSE) log('[giftrelayer] onRawUpdate skipped topKeys:', topKeys);
            return;
        }

        // candidate selection (shallow)
        const shallowCandidate = update.message ?? update.new_message ?? update.newMessage ?? update.msg ?? null;
        const candidateRaw = shallowCandidate ?? update;

        // simplify only the candidate (safe)
        let candidate;
        try { candidate = simplify(candidateRaw); } catch (e) { candidate = candidateRaw; }

        // dedupe by id when possible
        const candidateId = candidate?.id ?? candidate?.message?.id ?? null;
        log(`[giftrelayer] start checking candidateId: ${String(candidateId ?? 'undefined')}`);
        if (candidateId != null) {
            if (_processedMessageIds.has(String(candidateId))) {
                if (DEBUG) log('[giftrelayer] duplicate candidateId - ignoring', candidateId);
                return;
            }
            _processedMessageIds.add(String(candidateId));
            if (_processedMessageIds.size > 1000) {
                const it = _processedMessageIds.values();
                for (let i = 0; i < 100; i++) {
                    const v = it.next().value;
                    if (!v) break;
                    _processedMessageIds.delete(v);
                }
            }
        }
        log('[giftrelayer] ended checking candidateId');

        // cheap key-scan
        const keysSnapshot = Object.keys(candidate || {}).join(' ');
        log('[giftrelayer] checking if the event is gift related (keys snapshot)', keysSnapshot);
        // expanded check: also look into candidate.message?.action presence
        const maybeGift =
            /\bgift\b|unique_gift|unique_name|unique_number|messageAction|StarGift/i.test(keysSnapshot) ||
            !!(candidate?.action) ||
            !!(candidate?.message?.action);

        if (!maybeGift) {
            if (DEBUG && FORCE_VERBOSE) log('[giftrelayer] not gift-like after deeper checks; sample candidate:', safeStringify(candidate, 2000));
            return;
        }
        info('[giftrelayer] the event is in fact gift related (passed shallow checks)');

        // extract gift info (already simplified)
        const giftInfo = extractGiftInfoFromJson(candidate, true);
        if (!giftInfo?.isGift) {
            log('[giftrelayer] extractor did not find gift; keys=', keysSnapshot, 'sample=', FORCE_VERBOSE ? safeStringify(candidate, 3000) : undefined);
            return;
        }

        // Resolve sender id robustly, including trying to fetch referenced message if needed
        let senderId = await resolveSenderId(candidate, giftInfo);

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

        info('[giftrelayer] raw update detected gift -> persisting', {
            gift_id: record.gift_id,
            collection: record.collection_name,
            sender: record.telegram_sender_id
        });

        // if sender is still null — log explicit debug; backend will reject such records (as you configured)
        if (!record.telegram_sender_id) {
            warn('[giftrelayer] WARNING: telegram_sender_id is null for this gift. Attempted resolution failed. sample raw_json (truncated):', safeStringify(candidate, 2000));
        }

        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onRawUpdate error', err && err.stack ? err.stack : err);
    }
}

// NewMessage handler (keeps previous behavior)
async function onNewMessage(event) {
    try {
        const msg = event.message;
        if (!msg) return;
        info('[giftrelayer] found an incoming new message');
        const msgJson = (msg && typeof msg.toJSON === 'function') ? msg.toJSON() : msg;
        log('incoming message id=', msgJson?.id, 'peer=', (msgJson?.peerId ?? msgJson?.peer));
        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1' || FORCE_VERBOSE) {
            console.log('[giftrelayer] SAMPLE MSG JSON (first run or forced):', safeStringify(msgJson, 4000));
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

        // If it is a gift in NewMessage (rare) handle same as raw
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
        if (!record.telegram_sender_id) warn('[giftrelayer] NewMessage gift has null sender (will reach backend as null unless resolved).');
        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onNewMessage error', err && err.stack ? err.stack : err);
    }
}

// register handlers (idempotent)
let handlersRegistered = false;
function registerHandlers() {
    if (handlersRegistered) return;
    client.addEventHandler(onNewMessage, new NewMessage({}));
    client.addEventHandler(onRawUpdate, new Raw({
        func: (u) => {
            try {
                if (!u || typeof u !== 'object') return false;
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

// heartbeat and restart helpers (keeps client healthy)
let consecutivePingFailures = 0;
async function restartClient() {
    try {
        info('[giftrelayer] restarting client...');
        try { await client.disconnect(); } catch (e) { }
        await new Promise(r => setTimeout(r, 500));
        await client.start();
        registerHandlers();
        consecutivePingFailures = 0;
        info('[giftrelayer] client restarted successfully');
    } catch (err) {
        console.error('[giftrelayer] restartClient error', err && err.message ? err.message : err);
    }
}
function heartbeatLoop() {
    setInterval(async () => {
        try {
            await client.getMe();
            if (consecutivePingFailures > 0) {
                info('[giftrelayer] ping OK (reset fail count)');
                consecutivePingFailures = 0;
            } else {
                if (DEBUG) log('[giftrelayer] ping OK');
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

// startup
async function start() {
    try {
        info("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        info("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

        registerHandlers();
        heartbeatLoop();

        info("[giftrelayer] connected — entering wait loop (ctrl+C to stop)");
        await new Promise(() => { }); // keep alive
    } catch (err) {
        console.error("[giftrelayer] start error, exiting:", err && err.message ? err.message : err);
        process.exit(1);
    }
}

// global failure logging
process.on('unhandledRejection', (reason, p) => {
    console.error('[giftrelayer] unhandledRejection', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[giftrelayer] uncaughtException', err && err.stack ? err.stack : err);
});

// graceful shutdown
async function shutdownAndExit() {
    console.log('[giftrelayer] shutting down — disconnecting client...');
    try { await client.disconnect(); } catch (e) { }
    process.exit(0);
}
process.on('SIGINT', shutdownAndExit);
process.on('SIGTERM', shutdownAndExit);

start();
