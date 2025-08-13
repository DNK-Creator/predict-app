// worker.js
import axios from 'axios';

const TONCENTER = process.env.VITE_TONCENTER_URL || 'https://api.toncenter.com/api/v2';
const TON_API_KEY = process.env.VITE_TONCENTER_API_KEY;
const HOT_WALLET = process.env.VITE_HOT_WALLET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL; // e.g. https://xyz.supabase.co
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_API_KEY; // service_role key (server-only)
const POLL_INTERVAL_MS = Number(7000);
const LIMIT = 5; // how many recent transactions to fetch per poll

if (!TON_API_KEY || !HOT_WALLET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required env vars: VITE_TONCENTER_API_KEY, VITE_HOT_WALLET, VITE_SUPABASE_URL, VITE_SUPABASE_API_KEY');
    process.exit(1);
}

/**
 * UUID regex: matches typical UUID strings like:
 * 787515bc-2fac-4240-aceb-bb8dd1c14207
 */
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// small in-memory cache of seen tx hashes to avoid reprocessing identical txs each poll
const seenTxHashes = new Set();
const SEEN_SET_MAX = 10000; // arbitrary cap — trimmed when exceeded

function rememberTxHash(hash) {
    if (!hash) return;
    seenTxHashes.add(hash);
    if (seenTxHashes.size > SEEN_SET_MAX) {
        // simple trim strategy: clear the set (keeps memory bounded)
        // you can replace with an LRU if you want more sophistication
        seenTxHashes.clear();
        console.log('[worker] seenTxHashes cleared to avoid unbounded growth');
    }
}

function hasSeenTxHash(hash) {
    if (!hash) return false;
    return seenTxHashes.has(hash);
}

function extractTextComment(tx) {
    // adapt to TONCenter response shape — common location: tx.in_msg.message
    if (tx?.in_msg?.message && typeof tx.in_msg.message === 'string') {
        return tx.in_msg.message.trim();
    }
    if (tx?.comment && typeof tx.comment === 'string') return tx.comment.trim();
    return null;
}

/**
 * Try to extract a UUID substring from arbitrary text.
 * Returns the first matched UUID string or null if none.
 */
function extractUuidFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(UUID_REGEX);
    return match ? match[0] : null;
}


function extractAmountTON(tx) {
    // This attempts to get the incoming value and convert from nanotons -> TON
    // Inspect your TONCenter responses and adjust this if units differ.
    const maybe = tx?.in_msg?.value ?? tx?.value ?? tx?.amount;
    if (!maybe) return null;
    const n = Number(maybe);
    if (Number.isNaN(n)) return null;
    // TONCenter often reports value in nanotons (1 TON = 1e9 nTON)
    return n / 1e9;
}

function extractExitCode(tx) {
    // adapt to response; try multiple common fields
    if (typeof tx?.decoded?.exit_code === 'number') return tx.decoded.exit_code;
    if (typeof tx?.out_msgs?.[0]?.exit_code === 'number') return tx.out_msgs[0].exit_code;
    if (typeof tx?.status?.exit_code === 'number') return tx.status.exit_code;
    // Default to 0 (success) if not provided — you should adapt this after inspecting responses
    return 0;
}

async function callProcessDepositRPC({ uuid, onchain_amount, onchain_hash, from_address, exit_code }) {
    try {
        const url = `${SUPABASE_URL}/rest/v1/rpc/process_deposit`;
        const body = {
            p_uuid: uuid,
            p_onchain_amount: onchain_amount,
            p_onchain_hash: onchain_hash,
            p_from_address: from_address,
            p_exit_code: exit_code
        };
        const headers = {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation' // optional
        };

        const resp = await axios.post(url, body, { headers, timeout: 15_000 });
        console.log('[rpc] resp', resp.status, resp.data);
        return resp.data;
    } catch (err) {
        // Keep original error logging but do not crash worker
        console.error('[rpc] call failed', err?.response?.data ?? err?.message ?? err);
        throw err;
    }
}

async function processOnchainTx(tx) {
    const txHash = tx?.hash ?? tx?.id ?? null;

    // 0) quick dedupe: if we've already seen this tx hash in-memory skip it
    if (txHash && hasSeenTxHash(txHash)) {
        // debug-level log to reduce noise
        // console.debug('[skip] already seen', txHash);
        return;
    }

    // 1) get the human-readable comment (if any)
    const textComment = extractTextComment(tx);
    if (!textComment) {
        // no comment/message present — nothing we can match on
        // console.debug('[skip] no text comment for tx', txHash);
        rememberTxHash(txHash);
        return;
    }

    // 2) try to extract a UUID substring from the text
    const txUuid = extractUuidFromText(textComment);
    if (!txUuid) {
        // The tx has a text comment but it doesn't contain a UUID — skip it.
        console.log('[skip] tx comment without UUID (not from our app). comment=', textComment, 'txHash=', txHash);
        rememberTxHash(txHash);
        return;
    }

    // 3) we have a uuid-looking string — proceed to extract other info and call RPC
    const onchainAmount = extractAmountTON(tx);
    const onchainHash = txHash;
    const exitCode = extractExitCode(tx);
    const fromAddress = tx?.in_msg?.source ?? null;

    console.log('[found] uuid=%s amount=%s hash=%s exit=%s', txUuid, onchainAmount, onchainHash, exitCode);

    try {
        const res = await callProcessDepositRPC({
            uuid: txUuid,
            onchain_amount: onchainAmount,
            onchain_hash: onchainHash,
            from_address: fromAddress,
            exit_code: exitCode
        });
        console.log('[processed]', txUuid, res);
    } catch (err) {
        console.error('[error processing tx]', txUuid, err?.message ?? err);
    } finally {
        // mark seen regardless so we don't keep reattempting this same tx hash repeatedly
        rememberTxHash(txHash);
    }
}


async function pollOnce() {
    try {
        const url = `${TONCENTER}/getTransactions`;
        const params = {
            address: HOT_WALLET,
            limit: LIMIT,
            archival: 'true',
            api_key: TON_API_KEY
        };

        const resp = await axios.get(url, { params, timeout: 15_000 });
        if (resp.status !== 200) {
            console.warn('[toncenter] status', resp.status);
            return;
        }

        const result = resp.data?.result;
        const txs = Array.isArray(result) ? result : Array.isArray(result?.transactions) ? result.transactions : [];

        for (const tx of txs) {
            try {
                await processOnchainTx(tx);
            } catch (e) {
                console.error('[worker] processOnchainTx error', e?.message ?? e);
            }
        }
    } catch (e) {
        console.error('[worker] poll error', e?.response?.status ?? e?.message ?? e);
    }
}

async function mainLoop() {
    console.log('[worker] poller starting for', HOT_WALLET);
    while (true) {
        await pollOnce();
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
}

mainLoop().catch(err => {
    console.error('[worker] fatal', err);
    process.exit(1);
});
