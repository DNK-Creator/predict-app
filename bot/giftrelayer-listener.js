// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, Raw } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";
const DEBUG = !!process.env.WORKER_DEBUG;

// Dedupe processed messages (keeps memory bounded)
const _processedMessageIds = new Set();

if (!apiId || !apiHash || !stringSession) {
    console.error("[giftrelayer] TG_API_ID, TG_API_HASH and TG_STRING_SESSION must be set. Exiting.");
    process.exit(1);
}

// Telegram client
const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 10,
});

function log(...args) {
    if (DEBUG) console.log('[giftrelayer]', ...args);
}

async function persistGiftRecord(record) {
    try {
        const resp = await fetch('https://api.giftspredict.ru/api/giftHandle', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
        });
        if (!resp.ok) {
            console.warn('[giftrelayer] backend relay non-ok', resp.status);
        }
        log('Transfered gift record to backend:', record ?? '(unknown)');
        return;
    } catch (err) {
        console.error('[giftrelayer] persistGiftRecord error', err);
    }
}

// Simplify TL wrappers -> plain JS (kept from your original)
function simplify(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'boolean') return obj;
    if (typeof obj === 'bigint') return Number(obj);

    if (typeof obj?.toJSON === 'function') {
        try {
            const j = obj.toJSON();
            return simplify(j);
        } catch (e) { /* fall through */ }
    }

    if (typeof obj === 'object' && obj !== null) {
        const keys = Object.keys(obj);
        if (keys.length === 1 && (keys[0] === 'value' || keys[0] === 'v')) {
            const v = obj[keys[0]];
            if (typeof v === 'bigint') return Number(v);
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
            return simplify(v);
        }

        if (Array.isArray(obj)) return obj.map(x => simplify(x));

        const out = {};
        for (const k of Object.keys(obj)) {
            try {
                out[k] = simplify(obj[k]);
            } catch (e) {
                out[k] = String(obj[k]);
            }
        }
        return out;
    }

    return obj;
}

/**
 * Extract gift information from a message-like object.
 * This function has a fast path: it first checks the well-known place
 * message.action.gift (this is where collectible transfers appear).
 *
 * @param {object} msgJson - simplified (plain) message object or raw TL message
 * @param {boolean} alreadySimplified - set true if msgJson is already passed through simplify()
 */
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

    // Fast deterministic path: message.action.gift (most reliable location for collectible transfers)
    const action = j?.action ?? j?.message?.action ?? null;
    if (action && action.gift) {
        const g = simplify(action.gift);
        out.isGift = true;
        out.rawAction = action;

        // fields from sample you provided
        out.giftId = g.id ?? g.gift_id ?? g._id ?? null;
        out.collectionName = g.title ?? g.slug ?? g.collection ?? out.giftId;
        // `num` is typically the unique number for collectible gifts in your sample
        out.uniqueNumber = g.num ?? g.number ?? null;
        out.uniqueBaseName = g.title ?? g.collection ?? null;
        // owner related
        if (g.ownerId) {
            const owner = simplify(g.ownerId);
            out.origin = owner.userId ?? owner.id ?? out.origin ?? null;
        }
        out.ownedGiftId = action?.owned_gift_id ?? action?.ownedGiftId ?? null;
        out.starCount = g.star_count ?? g.starCount ?? null;

        // If num exists, treat as unique collectible
        out.isUnique = out.uniqueNumber != null || Boolean(g.num);
        return out;
    }

    // If not found in fast path, fallback to heuristic recursive search (keeps previous behavior)
    try {
        const s = JSON.stringify(j || {});
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(s)) {
            out.isGift = true;
            out.rawAction = j;
        }
    } catch (e) { /* ignore stringify issues */ }

    // recursive detection (best-effort)
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
        const u = simplify(uniqueCandidate);
        out.isGift = true;
        out.isUnique = true;
        out.rawAction = out.rawAction || u;
        out.uniqueBaseName = u.base_name ?? u.baseName ?? u.name ?? null;
        out.giftId = u.name ?? u.unique_name ?? u.gift_id ?? out.giftId;
        out.uniqueNumber = u.number ?? u.unique_number ?? null;
        out.origin = u.origin ?? u.source ?? out.origin ?? null;
        out.collectionName = out.uniqueBaseName ?? out.collectionName;
        out.ownedGiftId = u.owned_gift_id ?? u.ownedGiftId ?? out.ownedGiftId ?? null;
        out.starCount = u.star_count ?? u.starCount ?? out.starCount ?? null;
        return out;
    }

    if (giftCandidate) {
        const g = simplify(giftCandidate);
        out.isGift = true;
        out.rawAction = out.rawAction || g;
        out.giftId = g.id ?? g.gift_id ?? g._id ?? out.giftId;
        out.starCount = g.star_count ?? g.starCount ?? out.starCount ?? null;
        out.collectionName =
            g.sticker?.set_name ??
            g.sticker?.setName ??
            g.sticker_set_name ??
            g.collection ??
            g.set_name ??
            out.collectionName ??
            out.giftId;
        out.ownedGiftId = g.owned_gift_id ?? g.ownedGiftId ?? out.ownedGiftId ?? null;
        return out;
    }

    return out;
}


/**
 * Raw update handler: only does cheap top-level checks and then examines message.action.gift.
 * Avoids stringifying whole `event` or `client` (caused circular JSON errors).
 */
async function onRawUpdate(event) {
    try {
        // event may be a wrapper: use event.update if present
        const update = event?.update ?? event;
        if (!update) return;

        // Cheap predicate: skip most updates quickly (no heavy work)
        // We intentionally inspect only top-level keys here.
        const topKeys = Object.keys(update || {}).join(' ');
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b/i.test(topKeys)) {
            return;
        }

        // Try to pick message-like object without touching the whole event
        const tlMessage = update.message ?? update.new_message ?? update.newMessage ?? null;
        // If we have a TL message object, convert just that to plain JS safely
        let msgPlain;
        try {
            if (tlMessage && typeof tlMessage.toJSON === 'function') {
                msgPlain = tlMessage.toJSON();
            } else if (tlMessage) {
                msgPlain = simplify(tlMessage);
            } else {
                // fallback to simplifying the update itself (rare)
                msgPlain = simplify(update);
            }
        } catch (e) {
            // Defensive fallback
            msgPlain = tlMessage ?? update;
        }

        // optional debug capture of the message (safe: msgPlain won't contain client)
        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1' && msgPlain) {
            try {
                console.log('[giftrelayer] SAMPLE UPDATE JSON (first run):', JSON.stringify(msgPlain, null, 2).slice(0, 4000));
            } catch (e) {
                // ignore stringify problems for weird nested buffers etc
                console.log('[giftrelayer] SAMPLE UPDATE (non-stringifiable snippet)');
            } finally {
                process.env.GIFTLR_CAPTURE_SAMPLE = '0';
            }
        }

        // dedupe - some TL updates may be delivered multiple times
        const candidateId = msgPlain?.id ?? msgPlain?.message?.id ?? null;
        if (candidateId != null) {
            if (_processedMessageIds.has(String(candidateId))) return;
            _processedMessageIds.add(String(candidateId));
            if (_processedMessageIds.size > 2000) {
                // trim oldest ~200 entries
                const it = _processedMessageIds.values();
                for (let i = 0; i < 200; i++) {
                    const v = it.next().value;
                    if (!v) break;
                    _processedMessageIds.delete(v);
                }
            }
        }

        // Now check the well-known gift location: message.action.gift
        const action = msgPlain?.action ?? msgPlain?.message?.action ?? null;
        if (!action || !action.gift) {
            // Not a gift transfer — ignore
            return;
        }

        // Extract gift info using the extractor (we already simplified the message)
        const giftInfo = extractGiftInfoFromJson(msgPlain, true);
        if (!giftInfo?.isGift) {
            log('[giftrelayer] gift-shaped update detected but extractor returned false, msg keys=', Object.keys(msgPlain || {}).join(' '));
            return;
        }

        // Build record
        const sender =
            (msgPlain?.fromId && typeof msgPlain.fromId === 'object' && msgPlain.fromId.userId) ? msgPlain.fromId.userId :
                (msgPlain?.fromId ?? msgPlain?.senderId ?? null);
        const senderUsername = msgPlain?.from?.username ?? msgPlain?.sender?.username ?? null;
        const recipient = msgPlain?.peerId ?? msgPlain?.chatId ?? msgPlain?.toId ?? null;
        const now = new Date().toISOString();

        const record = {
            uuid: uuidv4(),
            telegram_message_id: msgPlain?.id ?? null,
            telegram_chat_peer: JSON.stringify(recipient),
            telegram_sender_id: sender ?? null,
            sender_username: senderUsername ?? null,
            gift_id: giftInfo.giftId ?? null,
            collection_name: giftInfo.collectionName ?? null,
            star_count: giftInfo.starCount ?? null,
            is_unique: !!giftInfo.isUnique,
            unique_number: giftInfo.uniqueNumber ?? null,
            unique_base_name: giftInfo.uniqueBaseName ?? null,
            origin: giftInfo.origin ?? null,
            owned_gift_id: giftInfo.ownedGiftId ?? null,
            raw_json: (() => {
                try { return JSON.stringify(msgPlain); } catch (e) { return String(msgPlain); }
            })(),
            created_at: now
        };

        console.log('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        log('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });

        await persistGiftRecord(record);
    } catch (err) {
        // Always avoid calling JSON.stringify(event) here — circular objects live in the envelope
        console.error('[giftrelayer] onRawUpdate error', err?.message ?? err);
    }
}


/**
 * NewMessage handler - still useful for regular incoming messages (text/media).
 * Note: collectible gift transfers are service messages and *won't* trigger this handler,
 * which is why we handle them in onRawUpdate above.
 */
async function onNewMessage(event) {
    try {
        const msg = event.message;
        if (!msg) return;

        console.log('[giftrelayer] found an incoming new message');
        let msgJson;
        try {
            msgJson = msg.toJSON ? msg.toJSON() : simplify(msg);
        } catch (e) {
            msgJson = simplify(msg);
        }

        console.log('incoming message id=', msgJson?.id, 'peer=', msgJson?.peerId ?? msgJson?.peer);
        log('incoming message id=', msgJson?.id, 'peer=', msgJson?.peerId ?? msgJson?.peer);

        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1') {
            try {
                console.log('[giftrelayer] SAMPLE MSG JSON (first run):', JSON.stringify(msgJson, null, 2).slice(0, 4000));
            } catch (e) {
                console.log('[giftrelayer] SAMPLE MSG JSON (first run - not fully stringifiable)');
            }
            process.env.GIFTLR_CAPTURE_SAMPLE = '0';
        }

        const giftInfo = extractGiftInfoFromJson(msgJson, true);
        log('[giftrelayer] giftInfo from NewMessage:', giftInfo);

        if (!giftInfo.isGift) {
            // reply friendly to regular messages
            try {
                if (msg && typeof msg.reply === 'function') {
                    // pass object shape to avoid GramJS reply quirks
                    await msg.reply({ message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                    log('[giftrelayer] replied to user (non-gift)');
                } else {
                    // fallback: try to get a sender id and send there
                    const candidate = simplify(msgJson?.peerId?.userId ?? msgJson?.fromId?.userId ?? msgJson?.senderId ?? null);
                    if (candidate != null) {
                        await client.sendMessage(candidate, { message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                        log('[giftrelayer] fallback replied using client.sendMessage');
                    }
                }
            } catch (err) {
                console.error('[giftrelayer] error while replying to non-gift message', err?.message ?? err);
            }
            console.log('[giftrelayer] user sent random text message');
            return;
        }

        // If it *is* a gift (rare via NewMessage), persist similarly to raw update flow
        console.log('[giftrelayer] THE MESSAGE SENT WAS A GIFT (NewMessage path)');
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
            raw_json: (() => {
                try { return JSON.stringify(msgJson); } catch (e) { return String(msgJson); }
            })(),
            created_at: now
        };

        console.log('[giftrelayer] detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        await persistGiftRecord(record);
    } catch (err) {
        console.error('[giftrelayer] onNewMessage error', err?.message ?? err);
    }
}


// startup: connect, register handlers
async function start() {
    try {
        console.log("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        console.log("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

        // register NewMessage for normal messages (keeps existing behavior)
        client.addEventHandler(onNewMessage, new NewMessage({}));

        // register Raw for service updates (use light predicate to reduce frequency)
        client.addEventHandler(onRawUpdate, new Raw({
            func: (u) => {
                try {
                    if (!u || typeof u !== 'object') return false;
                    // only allow raw updates that look message-like or action-like
                    if (u.message || u.new_message || u.action || u.message_action) return true;
                    // fallback: check a couple constructor-like fields
                    const ctor = u?.className ?? u?.CONSTRUCTOR_ID ?? u?._ ?? u?.constructor?.name;
                    if (typeof ctor === 'string' && /message|update|msg|action/i.test(String(ctor))) return true;
                    return false;
                } catch (e) {
                    return false;
                }
            }
        }));

        console.log("[giftrelayer] connected — entering wait loop (ctrl+C to stop)");
        await new Promise(() => { }); // keep alive
    } catch (err) {
        console.error("[giftrelayer] start error, exiting:", err?.message ?? err);
        process.exit(1);
    }
}


// graceful shutdown
async function shutdownAndExit() {
    console.log('[giftrelayer] shutting down — disconnecting client...');
    try { await client.disconnect(); } catch (e) { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', shutdownAndExit);
process.on('SIGTERM', shutdownAndExit);

start();
