// giftrelayer-listener.js
// ESM worker: listens for gift events on a service user account (MTProto / GramJS)
// Requirements: TG_API_ID, TG_API_HASH, TG_STRING_SESSION, BACKEND_FAILED_URL

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Raw } from "telegram/events/index.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

// ---- config / env ----
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = process.env.TG_STRING_SESSION || "";
// Worker will call BACKEND_FAILED_URL for failed gifts.
const BACKEND_FAILED_URL = process.env.BACKEND_FAILED_URL || "https://api.giftspredict.ru/api/giftFailed";
const DEBUG = (process.env.GIFTR_DEBUG || "1") === "1";

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

// Notify backend that a gift failed and should be returned to inventory
async function notifyBackendGiftFailed(info) {
    try {
        const resp = await fetch(BACKEND_FAILED_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(info),
        });
        if (!resp.ok) {
            log('[giftrelayer] notify backend failed non-ok', resp.status, await resp.text().catch(() => '<no-body>'));
        } else {
            log('[giftrelayer] notify backend failed success for', info?.gift?.uuid ?? info?.gift?.telegram_message_id ?? '(unknown)');
        }
    } catch (err) {
        console.warn('[giftrelayer] notify backend failed error', err?.message ?? err);
    }
}

/* ---------------------------
   Helper: building InputSavedStarGift
   --------------------------- */
function buildInputSavedStarGiftFromPayload(g) {
    // g may include: telegram_message_id (int), saved_id (long), slug (string), peer (optional for saved chat)
    if (g.telegram_message_id) {
        return new Api.InputSavedStarGiftUser({ msgId: Number(g.telegram_message_id) });
    }
    if (g.saved_id && g.peer && typeof g.peer === 'object') {
        // peer must be an InputPeer-like object. We'll build InputPeer from provided peer if possible.
        const peer = buildInputPeerFromRaw(g.peer);
        return new Api.InputSavedStarGiftChat({ peer, savedId: BigInt(g.saved_id) });
    }
    if (g.slug) {
        return new Api.InputSavedStarGiftSlug({ slug: String(g.slug) });
    }
    throw new Error('no suitable saved-star-gift identifier available (need telegram_message_id / saved_id / slug)');
}

function buildInputPeerFromRaw(rawPeer) {
    // rawPeer may be { userId, className: 'PeerUser' } as in your raw updates
    if (!rawPeer) throw new Error('missing raw peer');
    if (rawPeer.userId) {
        return new Api.InputPeerUser({ userId: Number(rawPeer.userId), accessHash: BigInt(rawPeer.accessHash ?? 0) });
    }
    if (rawPeer.chatId) {
        return new Api.InputPeerChat({ chatId: Number(rawPeer.chatId) });
    }
    // fallback: use InputPeerEmpty
    return new Api.InputPeerEmpty();
}

/* ---------------------------
   Core function: transfer a single gift
   - tries paid flow (GetPaymentForm + SendStarsForm) if transfer requires stars
   - falls back to payments.transferStarGift if free transfer
   Returns: { ok: boolean, error?: string, result?: any }
   --------------------------- */
async function transferSingleGiftToRecipient(recipientIdentifier, giftPayload) {
    try {
        const stargift = buildInputSavedStarGiftFromPayload(giftPayload);

        // Resolve recipient to an InputPeer
        let toIdPeer;
        try {
            const ent = await client.getEntity(recipientIdentifier);
            const aid = Number(ent.id ?? ent.userId ?? ent.id);
            const accessHash = ent.accessHash ?? ent.access_hash ?? 0n;
            toIdPeer = new Api.InputPeerUser({ userId: BigInt(aid), accessHash: BigInt(accessHash) });
        } catch (e) {
            if (recipientIdentifier && recipientIdentifier.userId) {
                const ah = recipientIdentifier.accessHash ?? recipientIdentifier.access_hash ?? 0;
                toIdPeer = new Api.InputPeerUser({ userId: BigInt(Number(recipientIdentifier.userId)), accessHash: BigInt(ah) });
            } else {
                throw new Error('failed to resolve recipient: ' + (e?.message ?? e));
            }
        }

        // Build invoice for transfer
        const invoice = new Api.InputInvoiceStarGiftTransfer({ stargift, toId: toIdPeer });

        // Step 1: ask server for payment form (if transfer requires stars)
        let paymentForm;
        try {
            paymentForm = await client.invoke(new Api.payments.GetPaymentForm({ invoice }));
        } catch (err) {
            const em = String(err?.message ?? err);
            log('[giftrelayer] GetPaymentForm failed (maybe free transfer). err=', em);
            // try direct transfer
            try {
                const transferResult = await client.invoke(new Api.payments.TransferStarGift({ stargift, toId: toIdPeer }));
                return { ok: true, result: transferResult };
            } catch (tErr) {
                return { ok: false, error: `GetPaymentForm failed and transfer fallback failed: ${tErr?.message ?? tErr}` };
            }
        }

        // If we got a paymentForm, finalize with stars (SendStarsForm)
        try {
            const formId = paymentForm.formId ?? paymentForm.form_id ?? null;
            if (!formId) {
                return { ok: true, result: paymentForm };
            }

            const sendRes = await client.invoke(new Api.payments.SendStarsForm({ formId: BigInt(formId), invoice }));
            return { ok: true, result: sendRes };
        } catch (sendErr) {
            const em = String(sendErr?.message ?? sendErr);
            if (/BALANCE|LOW|INSUFFICIENT/i.test(em)) {
                return { ok: false, error: 'BALANCE_TOO_LOW: relayer account doesn\'t have enough Stars' };
            }
            if (/PEER_INVALID|USER_NOT_FOUND|USER_DEACTIVATED/i.test(em)) {
                return { ok: false, error: 'RECIPIENT_INVALID_OR_UNREACHABLE' };
            }
            if (/STARGIFT_TRANSFER_TOO_EARLY|TRANSFER_TOO_EARLY/i.test(em)) {
                return { ok: false, error: 'GIFT_NOT_TRANSFERABLE_YET' };
            }
            if (/FORBIDDEN|PRIVATE|RESTRICTED|GIFT_NOT_ALLOWED/i.test(em)) {
                return { ok: false, error: 'RECIPIENT_REJECTS_GIFTS_OR_PRIVACY_BLOCK' };
            }
            return { ok: false, error: `sendStarsForm failed: ${em}` };
        }
    } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
    }
}

/* ---------------------------
   The public IPC command: withdrawGifts
   payload shape expected:
   {
     requestId: 'optional id',
     recipient: <recipient identifier (id|username|object)>,
     requester_telegram: <owner telegram id (number)>,
     gifts: [
       { uuid, telegram_message_id, gift_id_long, slug, saved_id, name, model, number, ... }
     ]
   }
   --------------------------- */
async function withdrawGifts(payload) {
    if (!payload || !payload.recipient || !Array.isArray(payload.gifts)) {
        throw new Error('invalid payload: require recipient and gifts array');
    }
    // Defensive per-request limits
    const MAX_GIFTS = 15;
    if (payload.gifts.length > MAX_GIFTS) {
        return { ok: false, error: `Too many gifts requested (${payload.gifts.length}). Max ${MAX_GIFTS}` };
    }

    // owner telegram (who originally owned these gifts) — backend should include this
    const ownerTelegram = payload.requester_telegram ?? payload.requesterTelegram ?? payload.owner_telegram ?? null;

    const results = [];
    for (const g of payload.gifts) {
        try {
            const res = await transferSingleGiftToRecipient(payload.recipient, g);
            if (res.ok) {
                // SUCCESS: do not call backend to remove inventory (backend already removed).
                log(`[giftrelayer] transfer success for ${g.uuid ?? g.telegram_message_id ?? '(unknown)'} -> recipient`, payload.recipient);
            } else {
                // FAILURE: inform backend to re-add the failed gift to inventory
                log(`[giftrelayer] transfer FAILED for ${g.uuid ?? g.telegram_message_id ?? '(unknown)'}:`, res.error);
                try {
                    // build a gift object similar to what backend expects
                    const giftForBackend = {
                        uuid: g.uuid ?? null,
                        telegram_message_id: g.telegram_message_id ?? null,
                        gift_id_long: g.gift_id_long ?? null,
                        saved_id: g.saved_id ?? null,
                        slug: g.slug ?? null,
                        name: g.name ?? g.collection_name ?? null,
                        model: g.model ?? null,
                        number: g.number ?? g.num ?? null,
                        value: g.value ?? null
                    };

                    await notifyBackendGiftFailed({
                        owner_telegram: ownerTelegram,
                        gift: giftForBackend,
                        reason: res.error ?? 'unknown_error',
                        attempted_at: new Date().toISOString()
                    });
                } catch (nbErr) {
                    log('[giftrelayer] notifyBackendGiftFailed error:', nbErr?.message ?? nbErr);
                }
            }

            // push result (the parent can still inspect the per-gift result if needed)
            results.push({ gift: g.uuid ?? g.telegram_message_id ?? '(unknown)', ...res });
        } catch (e) {
            // Unexpected per-gift error: notify backend and move on
            const errMsg = String(e?.message ?? e);
            log('[giftrelayer] unexpected error during transfer:', errMsg);
            try {
                const giftForBackend = {
                    uuid: g.uuid ?? null,
                    telegram_message_id: g.telegram_message_id ?? null,
                    gift_id_long: g.gift_id_long ?? null,
                    saved_id: g.saved_id ?? null,
                    slug: g.slug ?? null,
                    name: g.name ?? g.collection_name ?? null,
                    model: g.model ?? null,
                    number: g.number ?? g.num ?? null,
                    value: g.value ?? null
                };
                await notifyBackendGiftFailed({
                    owner_telegram: ownerTelegram,
                    gift: giftForBackend,
                    reason: errMsg,
                    attempted_at: new Date().toISOString()
                });
            } catch (nbErr) {
                log('[giftrelayer] notifyBackendGiftFailed error on exception:', nbErr?.message ?? nbErr);
            }

            results.push({ gift: g.uuid ?? g.telegram_message_id ?? '(unknown)', ok: false, error: errMsg });
        }
    }

    return { ok: true, results };
}

/* ---------------------------
   IPC listener
   incoming commands:
     - manualTrigger
     - ping
     - withdrawGifts  <-- main implemented public function
   --------------------------- */
async function manualTrigger(payload) {
    log('[giftrelayer] manualTrigger called with payload:', payload);
    const record = {
        uuid: uuidv4(),
        telegram_message_id: payload?.telegram_message_id ?? null,
        telegram_sender_id: payload?.sender ?? null,
        collection_name: payload?.collection_name ?? payload?.collection ?? null,
        num: payload?.num ?? null,
        model: payload?.model ?? null,
        created_at: new Date().toISOString()
    };
    return { note: 'acknowledged', record };
}

process.on('message', async (msg) => {
    try {
        if (!msg || typeof msg !== 'object' || !msg.cmd) return;
        const id = msg.id ?? null;
        if (msg.cmd === 'manualTrigger') {
            const result = await manualTrigger(msg.payload);
            if (process.send) process.send({ replyTo: id, ok: true, result });
            return;
        }
        if (msg.cmd === 'withdrawGifts') {
            // msg.payload expected as described above
            try {
                const out = await withdrawGifts(msg.payload);
                if (process.send) process.send({ replyTo: id, ok: true, result: out });
            } catch (err) {
                if (process.send) process.send({ replyTo: id, ok: false, error: (err && err.message) || String(err) });
            }
            return;
        }
        if (msg.cmd === 'ping') {
            if (process.send) process.send({ replyTo: id, ok: true, result: 'pong' });
            return;
        }
        if (process.send) process.send({ replyTo: id, ok: false, error: `unknown cmd ${msg.cmd}` });
    } catch (err) {
        if (process.send) process.send({ replyTo: msg?.id ?? null, ok: false, error: (err && err.message) || String(err) });
    }
});

/* ---------------------------
   The rest of your original code (simplify(), makeUpdateKey, onRawUpdate, start, shutdown)
   - unchanged except I included persistGiftRecord usage as you had it before
   --------------------------- */

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
    const id = msgPlain?.id ?? 'no-id';
    const actionType = msgPlain?.action?.className ?? 'no-action';
    const giftId = msgPlain?.action?.gift?.id ?? '';
    return `${String(id)}|${String(actionType)}|${String(giftId)}`;
}

/**
 * Raw update handler: only does cheap top-level checks and then examines message.action.gift.
 */
async function onRawUpdate(event) {
    try {
        const update = event?.update ?? event;
        if (!update) return;

        const topKeys = Object.keys(update || {}).join(' ');
        if (!/\bmessage\b|\bnew_message\b|\bmessage_action\b|\baction\b/i.test(topKeys)) {
            return;
        }

        const tlMessage = update.message ?? null;
        let msgPlain;
        try {
            if (tlMessage && typeof tlMessage.toJSON === 'function') {
                msgPlain = tlMessage.toJSON();
            } else if (tlMessage) {
                msgPlain = simplify(tlMessage);
            } else {
                msgPlain = simplify(update);
            }
        } catch (e) {
            msgPlain = tlMessage ?? update;
        }

        const potentitialMessageID = msgPlain?.id ?? null;
        const collectionName = msgPlain?.action?.gift?.title ?? null;
        const giftNum = msgPlain?.action?.gift?.num ?? null;
        const giftModel = msgPlain?.action?.gift?.attributes?.[0]?.name ?? null;

        if (potentitialMessageID != null) {
            const key = makeUpdateKey(msgPlain);
            if (_processedMessageIds.has(key)) {
                log('[giftrelayer] duplicate update ignored', key);
                return;
            }
            _processedMessageIds.add(key);
            if (_processedMessageIds.size > 100) {
                const it = _processedMessageIds.values();
                for (let i = 0; i < 100; i++) {
                    const v = it.next().value;
                    if (!v) break;
                    _processedMessageIds.delete(v);
                }
            }
        }

        const action = msgPlain?.action ?? null;
        if (!action || !action.gift) {
            return;
        }

        const sender = msgPlain.peerId?.userId ?? null;
        const now = new Date().toISOString();

        // collect rich gift metadata to persist
        const giftObj = msgPlain?.action?.gift ?? {};
        const savedId = msgPlain?.action?.saved_id ?? null; // sometimes present
        const giftIdLong = giftObj?.id ?? null; // long numeric string in your sample
        const slug = giftObj?.slug ?? null;

        const record = {
            uuid: uuidv4(),
            telegram_message_id: msgPlain?.id ?? null,
            telegram_sender_id: sender,
            collection_name: collectionName,
            num: giftNum,
            model: giftModel,
            gift_id_long: giftIdLong,
            gift_slug: slug,
            saved_id: savedId,
            created_at: now
        };

        log('[giftrelayer] raw update detected gift -> persisting', { collection: record.collection_name, sender: record.telegram_sender_id });

        await persistGiftRecord(record);
    } catch (err) {
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
