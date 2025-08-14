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
const DEBUG = true;

// dedupe processed message ids
const _processedMessageIds = new Set();

if (!apiId || !apiHash || !stringSession) {
    console.error("[giftrelayer] TG_API_ID, TG_API_HASH and TG_STRING_SESSION must be set. Exiting.");
    process.exit(1);
}

// Telegram client
const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 10,
});

// the authenticated user's numeric id (filled in start())
let ME_ID = null;

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

// ---------------- Utility helpers ----------------
function simplify(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'boolean') return obj;
    if (typeof obj === 'bigint') return Number(obj);

    if (typeof obj === 'object' && obj !== null) {
        // prefer toJSON when available
        if (typeof obj.toJSON === 'function') {
            try {
                const j = obj.toJSON();
                return simplify(j);
            } catch (e) { /* fall through */ }
        }

        // single-value wrapper
        const keys = Object.keys(obj);
        if (keys.length === 1 && (keys[0] === 'value' || keys[0] === 'v')) {
            const v = obj[keys[0]];
            if (typeof v === 'bigint') return Number(v);
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
            return simplify(v);
        }

        if (Array.isArray(obj)) {
            return obj.map(x => simplify(x));
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
    return obj;
}

function normId(x) {
    if (!x) return null;
    try {
        if (typeof x === 'object') {
            if (x.userId !== undefined) return simplify(x.userId);
            if (x.id !== undefined) return simplify(x.id);
            // sometimes GramJS users provide Integer wrappers
            if (x.value !== undefined) return simplify(x.value);
        }
        return simplify(x);
    } catch (e) { return null; }
}

// Small in-memory retry cache for ambiguous events (giftId -> { attempts, timer, payload })
const unresolvedCache = new Map();
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 5000; // try again after 5s

async function findPreviousOwner(recipient, currentMsgId, giftId) {
    try {
        if (!recipient || !giftId) return null;
        // recipient may be a simplified peer object or a simple id; try to normalize
        let entity = recipient;
        // If peerId is an object with userId, resolve to numeric
        if (recipient && typeof recipient === 'object' && recipient.userId) {
            // client.getEntity accepts numeric id
            entity = Number(recipient.userId);
        }

        // fetch a short recent history before the current message
        const msgs = await client.getMessages(entity, { limit: 40, offsetId: currentMsgId });
        for (const m of msgs) {
            const mJ = (m && typeof m.toJSON === 'function') ? simplify(m.toJSON()) : simplify(m);
            const action = mJ?.action ?? mJ?.message?.action ?? null;
            if (!action) continue;
            const g = action?.gift ?? action?.gift_info ?? null;
            if (!g) continue;
            const gid = g?.id ?? g?.gift_id ?? null;
            if (!gid) continue;
            if (String(gid) !== String(giftId)) continue;
            const owner = normId(g?.ownerId ?? g?.owner ?? null);
            if (owner && String(owner) !== String(ME_ID)) {
                return { owner, sourceMessage: mJ };
            }
        }
        return null;
    } catch (err) {
        console.warn('[giftrelayer] findPreviousOwner error', err?.message ?? err);
        return null;
    }
}

async function resolveSender(candidate, giftInfo, event) {
    // candidate is simplified (safe to access)
    let senderId = null;
    let senderUsername = null;

    // 1) candidate.fromId / senderId
    senderId = senderId ?? normId(candidate?.fromId ?? candidate?.senderId ?? null);
    if (!senderId && candidate?.from) {
        senderId = normId(candidate.from?.id ?? candidate.from?.userId ?? null);
        senderUsername = senderUsername ?? candidate.from?.username ?? null;
    }

    // 2) action.fromId (messageActionStarGift.from_id)
    const action = candidate?.action ?? candidate?.message?.action ?? null;
    senderId = senderId ?? normId(action?.fromId ?? action?.senderId ?? null);

    // 3) gift owner heuristic
    const giftObj = action?.gift ?? action?.gift_info ?? null;
    const giftOwner = giftObj ? normId(giftObj?.ownerId ?? giftObj?.owner ?? null) : null;
    if (!senderId && giftOwner && String(giftOwner) !== String(ME_ID)) {
        senderId = giftOwner;
        senderUsername = senderUsername ?? (giftObj?.ownerName ?? null);
    }

    // 4) if owner equals ME_ID or sender equals ME_ID, try searching previous messages
    if (giftInfo?.giftId && (!senderId || String(senderId) === String(ME_ID) || String(giftOwner) === String(ME_ID))) {
        try {
            const recipient = candidate?.peerId ?? candidate?.chatId ?? candidate?.toId ?? null;
            const prev = await findPreviousOwner(recipient, candidate?.id ?? null, giftInfo.giftId);
            if (prev && prev.owner) {
                senderId = senderId ?? prev.owner;
                senderUsername = senderUsername ?? prev.sourceMessage?.action?.gift?.ownerName ?? null;
            }
        } catch (e) { /* ignore */ }
    }

    // 5) event.getSender() fallback (works for NewMessage events)
    if (!senderId && event && typeof event.getSender === 'function') {
        try {
            const ent = await event.getSender();
            if (ent) {
                const ej = ent.toJSON ? simplify(ent.toJSON()) : simplify(ent);
                senderId = senderId ?? normId(ej?.id ?? ej?.userId ?? null);
                senderUsername = senderUsername ?? ej?.username ?? null;
            }
        } catch (e) { /* ignore */ }
    }

    // 6) resolve username via getEntity when we have numeric id
    if (senderId && !senderUsername) {
        try {
            const ent = await client.getEntity(Number(senderId));
            const ej = ent?.toJSON ? simplify(ent.toJSON()) : simplify(ent);
            senderUsername = senderUsername ?? ej?.username ?? null;
        } catch (e) { /* ignore */ }
    }

    return { senderId: senderId ?? null, senderUsername: senderUsername ?? null };
}

// ------------------ Extractor (keeps your heuristics, accepts alreadySimplified)
function extractGiftInfoFromJson(msgJson, alreadySimplified = false) {
    // (same extractor logic as before, adjusted for brevity here but kept full in implementation)
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
        const s = JSON.stringify(j || {});
        if (/\bGift\b|\bStarGift\b|\bunique_gift\b|\bmessageAction\b/i.test(s)) {
            out.isGift = true;
            out.rawAction = j;
        }
    } catch (e) { /* ignore */ }

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
        out.collectionName = giftCandidate.sticker?.set_name ?? giftCandidate.sticker?.setName ?? giftCandidate.sticker_set_name ?? giftCandidate.collection ?? giftCandidate.set_name ?? out.collectionName ?? out.giftId;
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
                out.collectionName = acGift.sticker?.set_name ?? acGift.sticker?.setName ?? acGift.collection ?? out.collectionName ?? out.giftId;
                out.ownedGiftId = acSimpl.owned_gift_id ?? acSimpl.ownedGiftId ?? out.ownedGiftId ?? null;
            }
        }
    }

    if (out.isGift && !out.rawAction) out.rawAction = j;
    return out;
}

// ------------------ Handlers ------------------
async function onRawUpdate(event) {
    try {
        console.log('[giftrelayer] onRawUpdate started');
        const update = event?.update ?? event;
        if (!update) return;

        // Use toJSON when available and safe; otherwise operate on shallow update
        const updateObj = (update && typeof update.toJSON === 'function') ? simplify(update.toJSON()) : simplify(update);

        // Cheap shallow key check
        const topKeys = Object.keys(updateObj || {}).join(' ');
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b|\bgift\b|unique_gift|messageAction|StarGift/i.test(topKeys)) {
            return; // not relevant
        }

        const candidateRaw = updateObj?.message ?? updateObj?.new_message ?? updateObj?.newMessage ?? updateObj?.msg ?? updateObj;
        const candidate = candidateRaw ? candidateRaw : updateObj;

        // dedupe
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

        console.log('[giftrelayer] checking if the event is gift related');
        const giftInfo = extractGiftInfoFromJson(candidate, true);
        if (!giftInfo?.isGift) {
            // not a gift
            return;
        }
        console.log('[giftrelayer] the event is in fact gift related', { giftId: giftInfo.giftId, collection: giftInfo.collectionName });

        // Resolve sender using multiple heuristics (may call client.getMessages if needed)
        const { senderId, senderUsername } = await resolveSender(candidate, giftInfo, event);
        console.log('[giftrelayer] resolveSender result', { senderId, senderUsername });

        const now = new Date().toISOString();
        const record = {
            uuid: uuidv4(),
            telegram_message_id: candidate?.id ?? null,
            telegram_chat_peer: JSON.stringify(candidate?.peerId ?? candidate?.chatId ?? null),
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

        // If we couldn't find a senderId, schedule retries (attempt a few times before giving up)
        if (!record.telegram_sender_id && giftInfo?.giftId && giftInfo.isUnique) {
            const key = String(giftInfo.giftId);
            const existing = unresolvedCache.get(key) ?? { attempts: 0, payload: record, timer: null };
            if (existing.attempts < MAX_RETRY) {
                existing.attempts += 1;
                unresolvedCache.set(key, existing);
                console.log('[giftrelayer] sender unknown, scheduling retry', { giftId: key, attempt: existing.attempts });
                existing.timer = setTimeout(async () => {
                    try {
                        // re-run resolve
                        const { senderId: s2, senderUsername: su2 } = await resolveSender(candidate, giftInfo, event);
                        if (s2) {
                            existing.payload.telegram_sender_id = s2;
                            existing.payload.sender_username = su2 ?? existing.payload.sender_username;
                            console.log('[giftrelayer] retry succeeded, persisting for gift', key, s2);
                            await persistGiftRecord(existing.payload);
                            unresolvedCache.delete(key);
                            return;
                        }
                        if (existing.attempts >= MAX_RETRY) {
                            console.warn('[giftrelayer] giving up after retries, persisting with null sender', { giftId: key });
                            await persistGiftRecord(existing.payload);
                            unresolvedCache.delete(key);
                        } else {
                            // schedule another retry
                            existing.timer = setTimeout(arguments.callee, RETRY_DELAY_MS);
                        }
                    } catch (err) {
                        console.error('[giftrelayer] retry processing error', err);
                    }
                }, RETRY_DELAY_MS);
                // do not persist now; will persist on success or after max retries
                return;
            }
        }

        // persist immediately (either we have sender or not - if not, fallback persist)
        console.log('[giftrelayer] raw update detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onRawUpdate error', err);
    }
}

async function onNewMessage(event) {
    try {
        const msg = event.message;
        if (!msg) return;
        console.log('[giftrelayer] found an incoming new message');
        const msgJson = msg.toJSON ? simplify(msg.toJSON()) : simplify(msg);
        console.log('incoming message id=', msgJson?.id, 'peer=', msgJson?.peerId ?? msgJson?.peer);

        // capture one sample dump to refine extractor if configured
        if (process.env.GIFTLR_CAPTURE_SAMPLE === '1') {
            console.log('[giftrelayer] SAMPLE MSG JSON (first run):', JSON.stringify(msgJson, null, 2).slice(0, 4000));
            process.env.GIFTLR_CAPTURE_SAMPLE = '0';
        }

        const giftInfo = extractGiftInfoFromJson(msgJson, true);
        console.log('[giftrelayer] onNewMessage giftInfo:', giftInfo);

        if (!giftInfo.isGift) {
            try {
                if (msg && typeof msg.reply === 'function') {
                    await msg.reply({ message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                    log('[giftrelayer] replied with greeting via msg.reply');
                } else {
                    const candidate = simplify(msgJson?.peerId?.userId ?? msgJson?.fromId?.userId ?? msgJson?.senderId ?? null);
                    if (candidate != null) {
                        await client.sendMessage(candidate, { message: "Привет! Я - бот. Пришли мне любые уникализированные подарки 🎁" });
                        log('[giftrelayer] sent fallback reply with client.sendMessage to', candidate);
                    } else {
                        try {
                            const senderEntity = await event.getSender();
                            if (senderEntity) {
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
            console.log('[giftrelayer] user sent random text message');
            return;
        }

        // if it is a gift: resolve sender similarly to Raw path
        const { senderId, senderUsername } = await resolveSender(msgJson, giftInfo, event);
        const now = new Date().toISOString();
        const record = {
            uuid: uuidv4(),
            telegram_message_id: msgJson?.id ?? null,
            telegram_chat_peer: JSON.stringify(msgJson?.peerId ?? msgJson?.chatId ?? null),
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

        console.log('[giftrelayer] detected gift -> persisting', { gift_id: record.gift_id, collection: record.collection_name, sender: record.telegram_sender_id });
        await persistGiftRecord(record);

    } catch (err) {
        console.error('[giftrelayer] onNewMessage error', err);
    }
}

// ------------------ start & registration ------------------
async function start() {
    try {
        console.log("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        // normalize ME_ID
        const meJson = me && typeof me.toJSON === 'function' ? simplify(me.toJSON()) : simplify(me);
        ME_ID = normId(meJson?.id ?? meJson?.userId ?? null);
        console.log("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim(), 'ME_ID=', ME_ID);

        // register NewMessage for normal messages
        client.addEventHandler(onNewMessage, new NewMessage({}));

        // register Raw for service updates with light predicate
        client.addEventHandler(onRawUpdate, new Raw({
            func: (u) => {
                try {
                    if (!u || typeof u !== 'object') return false;
                    if (u.message || u.new_message || u.action || u.message_action || u.messageAction) return true;
                    const ctor = u?.className ?? u?.CONSTRUCTOR_ID ?? u?._ ?? u?.constructor?.name;
                    if (typeof ctor === 'string' && /message|update|msg|action/i.test(String(ctor))) return true;
                    return false;
                } catch (e) { return false; }
            }
        }));

        console.log("[giftrelayer] connected — entering wait loop (ctrl+C to stop)");
        await new Promise(() => { });
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
