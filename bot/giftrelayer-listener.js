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

// Add near the top (module scope) to dedupe duplicate updates:
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

// ------------------ REPLACE THIS FUNCTION ------------------
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

    // If caller already simplified the object, don't run simplify() again.
    let j;
    try {
        j = alreadySimplified ? msgJson : simplify(msgJson);
    } catch (e) {
        j = msgJson;
    }

    // quick textual heuristic (keeps your original heuristic)
    try {
        const s = JSON.stringify(j || {});
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(s)) {
            out.isGift = true;
            out.rawAction = j;
        }
    } catch (e) { /* ignore */ }

    // recursive search for candidate objects
    let giftCandidate = null;
    let uniqueCandidate = null;
    let actionCandidate = null;

    const giftKeyRegex = /(^|_)gift($|_)/i;
    const uniqueKeyRegex = /unique|unique_gift|unique_name|unique_number|base_name/i;
    const stickerKeyRegex = /sticker|sticker_set|set_name|collection/i;
    const starKeyRegex = /star_count|starCount|StarGift/i;

    function traverse(obj, parentKey = '') {
        if (!obj || typeof obj !== 'object') return;

        const keys = Object.keys(obj);

        // Heuristics to detect a gift-like object
        if (!giftCandidate) {
            if (keys.some(k => giftKeyRegex.test(k) || starKeyRegex.test(k) || stickerKeyRegex.test(k))) {
                giftCandidate = obj;
            } else if ((obj.id || obj.gift_id || obj._id) && (obj.sticker || obj.collection || obj.set_name || obj.setName || obj.sticker_set_name)) {
                giftCandidate = obj;
            }
        }

        // detect unique gift candidate
        if (!uniqueCandidate) {
            if (keys.some(k => uniqueKeyRegex.test(k) || /unique_name|number|unique_number/i.test(k))) {
                uniqueCandidate = obj;
            }
        }

        if (!actionCandidate && /action/i.test(parentKey)) {
            actionCandidate = obj;
        }

        for (const v of Object.values(obj)) {
            try { traverse(v, ''); } catch (e) { /* ignore individual traversal errors */ }
        }
    }

    try { traverse(j); } catch (e) { /* ignore */ }

    // Prefer uniqueCandidate when present
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

    // If not unique, use giftCandidate
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

    // If still not found, try top-level action (but avoid extra simplify if already simplified)
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

// REPLACE your existing onRawUpdate with this improved version
// ------------------ REPLACE this onRawUpdate ------------------
async function onRawUpdate(event) {
    try {
        console.log('[giftrelayer] onRawUpdate started');
        const update = event?.update ?? event;
        if (!update) return;
        const updateJson = update.toJSON ? update.toJSON() : update;
        console.log('[giftrelayer] SAMPLE UPDATE JSON (first run):', JSON.stringify(updateJson, null, 2).slice(0, 4000));

        // CHEAP SHALLOW CHECK (no deep simplify). This avoids blocking work on every update.
        // Look for message-like keys or action keys at the top level.
        const top = update;
        const topKeys = Object.keys(top || {}).join(' ');
        // quick check: only continue if likely to contain message/action/gift related keys
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b|\bgift\b|unique_gift|messageAction|StarGift/i.test(topKeys)) {
            // not relevant — ignore immediately
            return;
        }

        // Now find the best candidate message object (shallow)
        const shallowCandidate =
            update.message ?? update.new_message ?? update.newMessage ?? update.msg ?? null;

        // If we have a shallow candidate -> simplify only that candidate.
        // If not, fall back to simplifying the top update (but only now, after cheap checks).
        let candidateRaw = shallowCandidate ?? update;
        let candidate;
        try {
            candidate = simplify(candidateRaw);
        } catch (e) {
            candidate = candidateRaw;
        }

        // Best-effort message id for dedupe
        const candidateId = candidate?.id ?? candidate?.message?.id ?? null;
        console.log(`[giftrelayer] start checking candidateId: ${String(candidateId ?? 'undefined')}`);
        if (candidateId != null) {
            if (_processedMessageIds.has(String(candidateId))) return;
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
        console.log('[giftrelayer] ended checking candidateId');

        // Lightweight keys scan on the simplified candidate
        const keysSnapshot = Object.keys(candidate || {}).join(' ');
        console.log('[giftrelayer] checking if the event is gift related');
        if (!/\bgift\b|unique_gift|unique_name|unique_number|messageAction|StarGift/i.test(keysSnapshot)) {
            // not gift-related — ignore
            return;
        }
        console.log('[giftrelayer] the event is in fact gift related');

        // Pass the pre-simplified candidate to the extractor and tell it it's already simplified
        const giftInfo = extractGiftInfoFromJson(candidate, true);
        if (!giftInfo?.isGift) {
            console.log('[giftrelayer] raw update looked gift-like but extractor returned false; sample keys=', keysSnapshot);
            log('[giftrelayer] raw update looked gift-like but extractor returned false, sample keys=', keysSnapshot);
            return;
        }

        // Build record (best-effort)
        const senderId =
            (candidate?.fromId && typeof candidate.fromId === 'object' && candidate.fromId.userId) ? candidate.fromId.userId :
                (candidate?.fromId ?? candidate?.senderId ?? candidate?.userId ?? null);
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
            raw_json: candidate ? JSON.stringify(candidate) : null,
            created_at: now
        };

        console.log('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        log('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });

        await persistGiftRecord(record);
    } catch (err) {
        console.error('[giftrelayer] onRawUpdate error', err);
    }
}
// ------------------ END REPLACEMENT ------------------


async function onNewMessage(event) {
    // DOESNT GET TRIGGERED WHEN GIFT SENT!!!
    try {
        const msg = event.message;
        if (!msg) return;
        console.log('[giftrelayer] found an incoming new message')
        const msgJson = msg.toJSON ? msg.toJSON() : msg;
        console.log('incoming message id=', msgJson?.id, 'peer=', msgJson?.peerId ?? msgJson?.peer)
        log('incoming message id=', msgJson?.id, 'peer=', msgJson?.peerId ?? msgJson?.peer);

        // capture one sample dump to refine extractor if configured
        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1') {
            console.log('[giftrelayer] SAMPLE MSG JSON (first run):', JSON.stringify(msgJson, null, 2).slice(0, 4000));
            process.env.GIFTLR_CAPTURE_SAMPLE = '0';
        }
        console.log('[giftrelayer] SAMPLE MSG JSON (first run):', JSON.stringify(msgJson, null, 2).slice(0, 4000));

        const giftInfo = extractGiftInfoFromJson(msgJson);
        console.log(giftInfo)

        // If not a gift — reply in-chat (GramJS Message.reply preferred, using correct options shape)
        if (!giftInfo.isGift) {
            try {
                // Preferred: use Message.reply with an options object (avoid passing a plain string)
                if (msg && typeof msg.reply === 'function') {
                    await msg.reply({ message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                    log('[giftrelayer] replied with "Привет! Пришли мне любой уникализированный подарок." via msg.reply');
                } else {
                    // Fallback: send by numeric id (try peerId.userId / fromId.userId / senderId)
                    const candidate =
                        simplify(msgJson?.peerId?.userId ?? msgJson?.fromId?.userId ?? msgJson?.senderId ?? null);
                    if (candidate != null) {
                        await client.sendMessage(candidate, { message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                        log('[giftrelayer] sent fallback reply with client.sendMessage to', candidate);
                    } else {
                        // last resort: try event.getSender() -> extract id and send
                        try {
                            const senderEntity = await event.getSender();
                            if (senderEntity) {
                                // senderEntity may be a full User; pass its id
                                const senderId = simplify(senderEntity?.id ?? senderEntity?.userId ?? null);
                                if (senderId != null) {
                                    await client.sendMessage(senderId, { message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                                    log('[giftrelayer] sent fallback reply (via event.getSender) to', senderId);
                                } else {
                                    console.warn('[giftrelayer] cannot reply - sender entity has no id');
                                }
                            } else {
                                console.warn('[giftrelayer] cannot reply - no sender entity available');
                            }
                        } catch (e) {
                            console.error('[giftrelayer] fallback event.getSender error', e);
                        }
                    }
                }
            } catch (err) {
                console.error('[giftrelayer] error while sending non-gift reply', err);
            }
            console.log('[giftrelayer] user sent random text message')
            return;
        }
        console.log('[giftrelayer] THE MESSAGE SENT WAS A GIFT')
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
            raw_json: msgJson ? JSON.stringify(msgJson) : null,
            created_at: now
        };
        console.log('[giftrelayer] detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id })
        log('[giftrelayer] detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });

        await persistGiftRecord(record);
    } catch (err) {
        console.error('[giftrelayer] onNewMessage error', err);
    }
}


// REPLACE your start() registration of Raw with this safer predicate (so Raw doesn't get called for every tiny update)
async function start() {
    try {
        console.log("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        console.log("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

        // keep existing NewMessage handler
        client.addEventHandler(onNewMessage, new NewMessage({}));

        // register Raw with a lightweight predicate so it only triggers for updates containing
        // message / new_message / message_action / action-like shapes
        client.addEventHandler(onRawUpdate, new Raw({
            func: (u) => {
                try {
                    if (!u || typeof u !== 'object') return false;
                    // common TL fields that indicate message-like update
                    if (u.message || u.new_message || u.message_action || u.messageAction || u.action) return true;
                    // sometimes 'update' wrappers expose 'message' nested; check some stringy constructor names if present
                    const ctor = u?.CONSTRUCTOR_ID || u?.className || u?._ || u?.constructor?.name;
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
        console.error("[giftrelayer] start error, exiting:", err);
        process.exit(1);
    }
}

// make sure to place this in an ESM file (import util from 'util' at top if needed)

function simplify(obj) {
    // handle null / primitive
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'boolean') return obj;
    // convert BigInt -> number
    if (typeof obj === 'bigint') return Number(obj);

    // If the object exposes toJSON, use it (many TL objects do)
    if (typeof obj.toJSON === 'function') {
        try {
            const j = obj.toJSON();
            // some toJSON still keep Integer wrappers — recurse
            return simplify(j);
        } catch (e) {
            // fall through
        }
    }

    // If it's an Integer-like TL object (GramJS prints [Integer]),
    // it may be an object with a `value` or `toNumber` method.
    if (typeof obj === 'object' && obj !== null) {
        // detect single-value wrapper (e.g. { value: 123 })
        const keys = Object.keys(obj);
        if (keys.length === 1 && (keys[0] === 'value' || keys[0] === 'v')) {
            const v = obj[keys[0]];
            if (typeof v === 'bigint') return Number(v);
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
            return simplify(v);
        }

        // general object / array handling
        if (Array.isArray(obj)) {
            return obj.map((x) => simplify(x));
        }

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

    // fallback (numbers etc)
    return obj;
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
