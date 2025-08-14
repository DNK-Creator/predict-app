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

    const action = msgJson?.action ?? msgJson?.message?.action ?? null;
    if (!action) {
        const s = JSON.stringify(msgJson || {});
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(s)) {
            out.isGift = true;
            out.rawAction = msgJson;
        }
        return out;
    }

    out.rawAction = action;

    const giftCandidate =
        action.gift ??
        (action.gift?.gift ?? null) ??
        (action.gift_info ?? null) ??
        null;

    const uniqueCandidate =
        action.unique_gift ??
        (action.gift?.unique_gift ?? null) ??
        null;

    if (giftCandidate) {
        out.isGift = true;
        out.giftId = giftCandidate.id ?? giftCandidate.gift_id ?? giftCandidate._id ?? null;
        out.starCount = giftCandidate.star_count ?? giftCandidate.starCount ?? null;
        out.collectionName =
            giftCandidate.sticker?.set_name ??
            giftCandidate.sticker?.setName ??
            giftCandidate.sticker_set_name ??
            giftCandidate.collection ??
            out.giftId;
        out.ownedGiftId = action?.owned_gift_id ?? action?.ownedGiftId ?? null;
    }

    if (uniqueCandidate) {
        out.isGift = true;
        out.isUnique = true;
        out.uniqueBaseName = uniqueCandidate.base_name ?? uniqueCandidate.baseName ?? uniqueCandidate.name ?? null;
        out.giftId = uniqueCandidate.name ?? uniqueCandidate.unique_name ?? out.giftId;
        out.uniqueNumber = uniqueCandidate.number ?? uniqueCandidate.unique_number ?? null;
        out.origin = action?.origin ?? uniqueCandidate.origin ?? null;
        out.collectionName = out.uniqueBaseName ?? out.collectionName;
        out.ownedGiftId = action?.owned_gift_id ?? null;
    }

    try {
        const keys = Object.keys(action || {}).join(' ');
        if (!out.isGift && /StarGift|Gift/i.test(keys + JSON.stringify(action))) {
            out.isGift = true;
            out.rawAction = action;
        }
    } catch (e) { }

    return out;
}

async function onNewMessage(event) {
    try {
        const msg = event.message;
        if (!msg) return;
        console.log('Hi!')
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
            return;
        }

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
