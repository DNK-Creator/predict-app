// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Raw } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";
const DEBUG = true;

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

// helper
function makeUpdateKey(msgPlain) {
    // message id (if available) + action type + gift id/num
    const id = msgPlain?.id ?? 'no-id';
    const actionType = msgPlain?.action?.className ?? 'no-action';
    const giftId = msgPlain?.action?.gift?.id ?? '';
    return `${String(id)}|${String(actionType)}|${String(giftId)}`;
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
        const tlMessage = update.message ?? null;
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

        // dedupe - some TL updates may be delivered multiple times
        const potentitialMessageID = msgPlain?.id ?? null;
        const collectionName = msgPlain?.action?.gift?.title ?? null;

        if (potentitialMessageID != null) {
            const key = makeUpdateKey(msgPlain);
            if (_processedMessageIds.has(key)) {
                log('[giftrelayer] duplicate update ignored', key);
                return;
            }
            _processedMessageIds.add(key);
            if (_processedMessageIds.size > 100) {
                // trim oldest ~100 entries
                const it = _processedMessageIds.values();
                for (let i = 0; i < 100; i++) {
                    const v = it.next().value;
                    if (!v) break;
                    _processedMessageIds.delete(v);
                }
            }
        }

        // Now check the well-known gift location: message.action.gift
        const action = msgPlain?.action ?? null;

        if (!action || !action.gift) {
            // Not a gift transfer — ignore
            return;
        }

        // Build record
        const sender = msgPlain.peerId.userId ?? null;
        const now = new Date().toISOString();

        const record = {
            uuid: uuidv4(),
            telegram_message_id: msgPlain?.id ?? null,
            telegram_sender_id: sender,
            collection_name: collectionName,
            created_at: now
        };

        log('[giftrelayer] raw update detected gift -> persisting', { collection: record.collection_name, sender: record.telegram_sender_id });

        await persistGiftRecord(record);
    } catch (err) {
        // Always avoid calling JSON.stringify(event) here — circular objects live in the envelope
        console.error('[giftrelayer] onRawUpdate error', err?.message ?? err);
    }
}

// startup: connect, register handlers
async function start() {
    try {
        log("[giftrelayer] starting Telegram client...");
        await client.start();
        const me = await client.getMe();
        log("[giftrelayer] logged in as", me?.username || `${me?.firstName || ""} ${me?.lastName || ""}`.trim());

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

        log("[giftrelayer] connected — entering wait loop (ctrl+C to stop)");
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