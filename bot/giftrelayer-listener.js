// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";
const DEBUG = !!process.env.WORKER_DEBUG;

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

// conservative extractor — refine after inspecting raw_json
// replace the old extractGiftInfoFromJson with this:
function extractGiftInfoFromJson(msgJson) {
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

    // normalize TL wrappers -> plain objects/numbers/strings
    let j;
    try {
        j = simplify(msgJson);
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
    const ownedIdRegex = /owned_gift_id|ownedGiftId/i;

    function traverse(obj, parentKey = '') {
        if (!obj || typeof obj !== 'object') return;

        const keys = Object.keys(obj);
        const keyString = keys.join(' ');

        // Heuristics to detect a gift-like object
        if (!giftCandidate) {
            // object explicitly labeled with gift-like keys
            if (keys.some(k => giftKeyRegex.test(k) || starKeyRegex.test(k) || stickerKeyRegex.test(k))) {
                giftCandidate = obj;
            }
            // or object that contains both id and sticker/collection info
            else if ((obj.id || obj.gift_id || obj._id) && (obj.sticker || obj.collection || obj.set_name || obj.setName || obj.sticker_set_name)) {
                giftCandidate = obj;
            }
        }

        // detect unique gift candidate
        if (!uniqueCandidate) {
            if (keys.some(k => uniqueKeyRegex.test(k) || /unique_name|number|unique_number/i.test(k))) {
                uniqueCandidate = obj;
            }
        }

        // capture anything inside an "action" wrapper as a possible source
        if (!actionCandidate && /action/i.test(parentKey)) {
            actionCandidate = obj;
        }

        // traverse deeper
        for (const v of Object.values(obj)) {
            try { traverse(v, ''); } catch (e) { /* ignore individual traversal errors */ }
        }
    }

    try {
        traverse(j);
    } catch (e) { /* ignore */ }

    // Prefer uniqueCandidate when present (unique gifts are a special kind)
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

        // try to grab any star count if present
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

    // If still not found, try to parse from known places: top-level action or message.action
    if (!out.isGift) {
        const action = j?.action ?? j?.message?.action ?? null;
        if (action) {
            out.rawAction = out.rawAction || action;

            // try to extract from a nested action object similarly to above
            const acSimpl = simplify(action);
            // common shapes
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

    // final fallback: if we detected anything textual earlier mark rawAction
    if (out.isGift && !out.rawAction) out.rawAction = j;

    return out;
}

async function onNewMessage(event) {
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


// ------- startup: connect, register handler, fetch & print star gifts -------
async function start() {
    try {
        console.log("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        console.log("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

        // event handler
        client.addEventHandler(onNewMessage, new NewMessage({}));

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
