import TonWeb from 'tonweb';
import TonWebMnemonic from 'tonweb-mnemonic';
import { createClient } from '@supabase/supabase-js';

const { HighloadWallets } = TonWeb; // contains HighloadWalletContractV3, HighloadQueryId
const { HighloadWalletContractV3, HighloadQueryId } = HighloadWallets;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;
const POLL_INTERVAL_MS = Number(30_000);
const walletKey = process.env.VITE_WALLET_KEY; // legacy text fallback
const WORKER_ID = process.env.VITE_WORKER_ID || 'worker-unknown';
const TON_API_KEY = process.env.VITE_SECOND_TONCENTER_API_KEY || '';
const IS_MAINNET = 'mainnet';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-worker-id': WORKER_ID } }
});

// tonweb provider
const tonweb = IS_MAINNET
    ? new TonWeb(new TonWeb.HttpProvider('https://toncenter.com/api/v2/jsonRPC', { apiKey: TON_API_KEY }))
    : new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC', { apiKey: TON_API_KEY }));

// small helpers
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function backoffMs(attempt, base = 500, max = 30000) {
    const expo = Math.min(max, base * Math.pow(2, attempt));
    const jitter = Math.floor((Math.random() * 0.6 - 0.3) * expo);
    return Math.max(0, expo + jitter);
}

// Helper to try wallet classes and pick the one that matches an active on-chain address.
// Cache by wallet_id to avoid repeated probing.
const walletClassCache = new Map(); // map wallet_id -> { classKey, walletInstance, addressStr }

async function findAndCreateWalletInstance(wallet_id, keyPair, timeoutSec = HIGHLOAD_WALLET_TIMEOUT) {
    // If cached, return immediately
    if (walletClassCache.has(wallet_id)) {
        return walletClassCache.get(wallet_id);
    }

    // tonweb.wallet.all contains wallet classes keyed by names like 'v4R2', 'v3', 'highload-v3', etc.
    const walletClasses = tonweb?.wallet?.all ?? {};
    const classKeys = Object.keys(walletClasses || {});
    if (classKeys.length === 0) {
        throw new Error('tonweb.wallet.all is empty — cannot auto-detect wallet class');
    }

    for (const key of classKeys) {
        try {
            // create wallet wrapper using class constructor
            const WalletClass = walletClasses[key];
            // Some wrappers expect (provider, { publicKey, wc? }) others different.
            // Common pattern: new WalletClass(tonweb.provider, { publicKey, timeout })
            // Use a try/catch with sensible constructor args.
            let instance;
            try {
                instance = new WalletClass(tonweb.provider, { publicKey: keyPair.publicKey, timeout: timeoutSec });
            } catch (e1) {
                try {
                    // fallback to newer-style: WalletClass(tonweb.provider, { publicKey })
                    instance = new WalletClass(tonweb.provider, { publicKey: keyPair.publicKey });
                } catch (e2) {
                    // Some factories use tonweb.wallet.create - try that
                    try {
                        instance = tonweb.wallet.create({ publicKey: keyPair.publicKey, walletId: undefined, wc: 0 });
                        // the returned object may have getAddress and methods
                    } catch (e3) {
                        // can't instantiate this class — skip it
                        continue;
                    }
                }
            }

            // Get address object and string
            const addrObj = await instance.getAddress();
            const addrStr = addrObj.toString(true, true, false); // bounceable, url safe - consistent format

            // Check address state on chain
            const info = await tonweb.provider.getAddressInfo(addrStr);
            if (info && info.state === 'active') {
                // cache and return
                const result = { classKey: key, walletInstance: instance, addressStr: addrStr };
                walletClassCache.set(wallet_id, result);
                console.log(`[wallet-detect] matched wallet class '${key}' -> ${addrStr}`);
                return result;
            } else {
                console.log(`[wallet-detect] class '${key}' yields ${addrStr} state=${info?.state ?? 'unknown'}`);
            }
        } catch (e) {
            // ignore and try next class
            console.warn('[wallet-detect] error probing class', key, e?.message ?? e);
            continue;
        }
    }

    // If we got here, nothing matched
    throw new Error('no_matching_wallet_class_found');
}

async function claimOne() {
    try {
        const rpcResp = await supabase.rpc('claim_withdrawal', { p_worker_id: WORKER_ID });
        const data = rpcResp?.data ?? rpcResp;
        if (!data || (Array.isArray(data) && data.length === 0)) return null;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || (!row.uuid && !row.wallet_id && !row.amount && !row.withdrawal_address)) {
            console.warn('[claimOne] unexpected RPC row shape', { raw: row });
            return null;
        }
        return row;
    } catch (err) {
        console.error('[claimOne] rpc error', err?.message ?? err);
        return null;
    }
}

async function reserveSeq(wallet_id) {
    if (!wallet_id) throw new Error('reserveSeq: wallet_id falsy');
    const { data, error } = await supabase.rpc('reserve_wallet_seq', { p_wallet_id: wallet_id });
    if (error) {
        console.error('[reserveSeq] rpc error', JSON.stringify(error));
        throw error;
    }
    if (!data) throw new Error('reserve_wallet_seq returned no data');
    const row = Array.isArray(data) ? data[0] : data;
    const val = row?.new_seq ?? Object.values(row || {})[0];
    if (val === undefined || val === null) throw new Error('reserve_wallet_seq returned empty new_seq');
    return Number(val);
}

async function fetchSeedFromVault(wallet_id) {
    // prefer uuid-based rpc, fall back to text key
    try {
        if (wallet_id) {
            try {
                const rpcResp = await supabase.rpc('get_wallet_seed_for_signer', { p_wallet_id: wallet_id });
                const data = rpcResp?.data ?? rpcResp;
                if (!data) throw new Error('no data from get_wallet_seed_for_signer');
                const row = Array.isArray(data) ? data[0] : data;
                if (typeof row === 'string') return row;
                const keys = Object.keys(row || {});
                if (keys.length === 1) return row[keys[0]];
                if (row.get_wallet_seed_for_signer) return row.get_wallet_seed_for_signer;
            } catch (e) {
                console.warn('[fetchSeedFromVault] uuid rpc failed, fallback', e?.message ?? e);
            }
        }
        if (typeof walletKey !== 'undefined' && walletKey !== null) {
            try {
                const rpcResp2 = await supabase.rpc('get_wallet_seed_for_signer_text', { p_wallet_key: walletKey });
                const data2 = rpcResp2?.data ?? rpcResp2;
                if (!data2) throw new Error('no data from get_wallet_seed_for_signer_text');
                const row2 = Array.isArray(data2) ? data2[0] : data2;
                if (typeof row2 === 'string') return row2;
                const keys2 = Object.keys(row2 || {});
                if (keys2.length === 1) return row2[keys2[0]];
                if (row2.get_wallet_seed_for_signer_text) return row2.get_wallet_seed_for_signer_text;
            } catch (e) {
                console.warn('[fetchSeedFromVault] text-based rpc failed', e?.message ?? e);
            }
        }
        throw new Error('no seed available for wallet_id and no fallback');
    } catch (err) {
        console.error('[fetchSeedFromVault] error', err?.message ?? err);
        throw err;
    }
}

async function finalizeSuccess(uuid, signed_boc, tx_hash, onchain_amount) {
    try {
        await supabase.from('transactions').update({
            status: 'Completed',
            handled: true,
            processed_at: new Date().toISOString(),
            signed_boc,
            tx_hash,
            onchain_amount
        }).eq('uuid', uuid);
        await supabase.from('withdrawal_audit').insert([{ tx_uuid: uuid, action: 'broadcasted', details: { tx_hash } }]);
    } catch (err) {
        console.error('[finalizeSuccess] error', err?.message ?? err);
        throw err;
    }
}

async function revertToPending(uuid, reason) {
    try {
        if (!uuid) {
            console.warn('[revertToPending] called without uuid', { reason });
            return;
        }
        await supabase.from('transactions').update({ status: 'Pending', worker_id: null }).eq('uuid', uuid);
        await supabase.from('withdrawal_audit').insert([{ tx_uuid: uuid, action: 'reverted_to_pending', details: { reason } }]);
    } catch (err) {
        console.error('[revertToPending] error', err?.message ?? err);
    }
}

// retry wrapper for transfer.send() (Highload transfer)
async function sendHighloadTransferWithRetry(transferObj, attempts = 5) {
    for (let i = 0; i < attempts; ++i) {
        try {
            // transferObj is the object returned by highloadWallet.methods.transfer(...)
            // .send() performs the provider call
            const resp = await transferObj.send();
            return { ok: true, resp };
        } catch (err) {
            // Basic detection for rate-limit or server errors
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 429) {
                const waitMs = backoffMs(i, 1000, 30000);
                console.warn(`[sendHighloadTransferWithRetry] rate-limited (429), attempt ${i + 1}/${attempts}, waiting ${waitMs}ms`);
                await sleep(waitMs);
                continue;
            }
            if (status && status >= 500 && i < attempts - 1) {
                const waitMs = backoffMs(i, 500, 20000);
                console.warn(`[sendHighloadTransferWithRetry] server error ${status}, attempt ${i + 1}/${attempts}, waiting ${waitMs}ms`);
                await sleep(waitMs);
                continue;
            }
            // non-retriable or last attempt - throw
            throw err;
        }
    }
    throw new Error('sendHighloadTransferWithRetry: exceeded attempts');
}

const HIGHLOAD_WALLET_TIMEOUT = 60 * 60; // 1 hour as example

async function processClaim(claim) {
    if (!claim) return;
    const uuid = claim.uuid;
    const amount = Number(claim.amount || 0);
    const withdrawal_address = claim.withdrawal_address;
    const wallet_id = claim.wallet_id;

    if (!wallet_id || !uuid) {
        console.warn('[worker] skipping invalid claim', { rawClaim: claim });
        return;
    }

    console.log('[withdrawals] Processing claim for withdrawal address -', withdrawal_address);

    // Build unsignedTransaction metadata (we'll convert using tonweb)
    // Reserve a query/seq for this wallet using your DB rpc
    let seq;
    try {
        seq = await reserveSeq(wallet_id); // integer
    } catch (err) {
        console.error('[worker] reserveSeq failed', err?.message ?? err);
        await revertToPending(uuid, 'reserve_seq_failed');
        return;
    }

    // fetch seed (mnemonic)
    let seedPhrase;
    try {
        seedPhrase = await fetchSeedFromVault(wallet_id);
        if (!seedPhrase) throw new Error('no seed retrieved');
    } catch (err) {
        console.error('[worker] fetchSeedFromVault failed', err?.message ?? err);
        await revertToPending(uuid, 'fetch_seed_failed');
        return;
    }

    // convert seed -> seed bytes -> keypair using tonweb-mnemonic
    let keyPair;
    try {
        const words = String(seedPhrase).trim().split(/\s+/);
        const seedBytes = await TonWebMnemonic.mnemonicToSeed(words); // Uint8Array
        keyPair = TonWeb.utils.keyPairFromSeed(seedBytes); // { publicKey, secretKey } Uint8Array
        if (!keyPair?.publicKey || !keyPair?.secretKey) throw new Error('invalid keyPair from seed');
    } catch (err) {
        console.error('[worker] mnemonic -> keyPair failed', err?.message ?? err);
        await revertToPending(uuid, 'seed_parsing_failed');
        return;
    }

    // Create wallet wrapper instance dynamically (auto-detect the matching class)
    let walletWrapperInfo;
    try {
        walletWrapperInfo = await findAndCreateWalletInstance(wallet_id, keyPair, HIGHLOAD_WALLET_TIMEOUT);
    } catch (e) {
        console.error('[worker] wallet class detection failed', e?.message ?? e);
        // helpful audit/log
        await supabase.from('withdrawal_audit').insert([{ tx_uuid: uuid, action: 'wallet_detect_failed', details: { error: String(e?.message ?? e) } }]);
        await revertToPending(uuid, 'wallet_class_detection_failed');
        return;
    }

    const walletClassKey = walletWrapperInfo.classKey;
    const walletInstance = walletWrapperInfo.walletInstance;
    const hotWalletAddressString = walletWrapperInfo.addressStr;
    console.log('[withdrawals] using wallet class:', walletClassKey, 'hot wallet address:', hotWalletAddressString);

    let nowUtime;
    try {
        const info = await tonweb.provider.getExtendedAddressInfo(hotWalletAddressString);
        nowUtime = Number(info.sync_utime ?? Math.floor(Date.now() / 1000));
    } catch (err) {
        console.warn('[worker] getExtendedAddressInfo failed, falling back to local time', err?.message ?? err);
        nowUtime = Math.floor(Date.now() / 1000);
    }

    // Build HighloadQueryId object
    // reserveSeq returned sequence number (we use as queryId)
    const qidObj = HighloadQueryId.fromQueryId(BigInt(seq)); // wrapper
    const queryIdToPersist = qidObj.getQueryId ? String(qidObj.getQueryId()) : String(BigInt(seq));

    // persist query_id and created_at into transactions table (so txTick can read it later)
    try {
        await supabase.from('transactions').update({
            query_id: queryIdToPersist,
            created_at: Number(nowUtime), // keep numeric seconds in DB
            worker_id: WORKER_ID,
            status: 'Processing'
        }).eq('uuid', uuid);
    } catch (err) {
        console.error('[worker] failed to persist query_id/created_at', err?.message ?? err);
        // continue — but this makes later matching harder
    }

    // Convert amount to nanotons using tonweb utils: returns BN (bn.js)
    let amountNano;
    try {
        amountNano = TonWeb.utils.toNano(String(amount)); // BN
    } catch (err) {
        console.error('[worker] toNano failed', err?.message ?? err);
        await revertToPending(uuid, 'invalid_amount');
        return;
    }

    // Convert target address to proper bounceable/nonbounceable form (example logic)
    try {
        const addrInfo = await tonweb.provider.getAddressInfo(String(withdrawal_address));
        const addr = new TonWeb.Address(String(withdrawal_address)).toString(true, true, addrInfo.state === 'active');
        // if different, you may want to persist — but we'll use the normalized one for send
        if (addr !== withdrawal_address) {
            console.log('[worker] normalized withdrawal address', withdrawal_address, '->', addr);
            // attempt to persist normalized address back to DB (optional)
            try {
                await supabase.from('transactions').update({ withdrawal_address: addr }).eq('uuid', uuid);
            } catch (e) { /* ignore */ }
        }
    } catch (e) {
        // log and continue using provided address
        console.warn('[worker] getAddressInfo/normalize failed', e?.message ?? e);
    }

    // Build & send transfer according to detected wallet class
    let transferObj;
    try {
        const keyLower = String(walletClassKey || '').toLowerCase();

        if (keyLower.includes('highload')) {
            // Highload wallet uses queryId + createdAt (existing logic)
            transferObj = walletInstance.methods.transfer({
                secretKey: keyPair.secretKey,
                queryId: qidObj,
                createdAt: nowUtime,   // plain Number
                toAddress: String(withdrawal_address),
                amount: amountNano,
                needDeploy: qidObj.getQueryId ? (BigInt(qidObj.getQueryId()) === 0n) : false
            });
        } else {
            // Non-highload (v4, simple, v3, etc.) wallets expect numeric seqno
            // Try to get seqno from walletInstance API, fallback to provider `getAddressInfo`
            let seqnoCandidate = null;

            // Some wrappers implement getSeqno()
            if (typeof walletInstance.getSeqno === 'function') {
                try { seqnoCandidate = await walletInstance.getSeqno(); } catch (e) { /* ignore */ }
            }

            // Some wrappers expose methods.seqno().call() style (less common)
            if ((seqnoCandidate === null || seqnoCandidate === undefined) && walletInstance.methods && typeof walletInstance.methods.seqno === 'function') {
                try {
                    // attempt common patterns
                    const maybe = walletInstance.methods.seqno();
                    // if it's a call-returning object like { call: fn } use call()
                    if (maybe && typeof maybe.call === 'function') {
                        seqnoCandidate = await maybe.call();
                    } else {
                        // direct promise/number
                        seqnoCandidate = await maybe;
                    }
                } catch (e) { /* ignore */ }
            }

            // fallback to provider address info (tonweb.provider.getAddressInfo)
            if (seqnoCandidate === null || seqnoCandidate === undefined) {
                try {
                    const info = await tonweb.provider.getAddressInfo(hotWalletAddressString);
                    // toncenter uses `seqno` field for wallet seq
                    seqnoCandidate = info?.seqno ?? info?.unconfirmed_seqno ?? 0;
                } catch (e) {
                    seqnoCandidate = 0;
                }
            }

            // normalize seqnoCandidate to Number
            const seqnoNum = Number(seqnoCandidate);
            if (!Number.isFinite(seqnoNum) || seqnoNum < 0) {
                throw new Error('invalid_seqno_fetched: ' + String(seqnoCandidate));
            }

            console.log('[worker] using seqno', seqnoNum, 'for wallet class', walletClassKey);

            // Build transfer for v4/simple style wallets
            transferObj = walletInstance.methods.transfer({
                secretKey: keyPair.secretKey,
                seqno: seqnoNum,
                toAddress: String(withdrawal_address),
                amount: amountNano,
                // some wrappers accept sendMode / bounce; include sendMode 3 to pay fees from sender and allow external messages
                sendMode: 3
            });
        }
    } catch (err) {
        console.error('[worker] build transfer object failed', err?.message ?? err);
        await revertToPending(uuid, 'build_transfer_failed');
        return;
    }

    // Try to send with retries
    let sendResp = null;
    // Try to send with retries (existing helper)
    try {
        const resp = await sendHighloadTransferWithRetry(transferObj, 5);
        sendResp = resp?.resp ?? resp;
        console.log('[worker] transfer.send() accepted (may be pending):', JSON.stringify(sendResp));

        // --- Detect rate-limit-style response and revert to pending instead of marking completed ---
        const looksLikeRateLimit = (r) => {
            if (!r) return false;
            // string responses like "Ratelimit per ip exceed"
            if (typeof r === 'string') {
                return /rate\s*-?\s*limit|ratelimit/i.test(r);
            }
            // common fields that might contain the error message
            const candidates = [
                r.error, r.message, r.body, r.data,
                r?.response?.data, r?.response?.statusText, r?.response?.body
            ];
            for (let c of candidates) {
                if (!c) continue;
                try {
                    const s = (typeof c === 'object') ? JSON.stringify(c) : String(c);
                    if (/rate\s*-?\s*limit|ratelimit/i.test(s)) return true;
                } catch (e) { /* ignore stringify errors */ }
            }
            return false;
        };

        if (looksLikeRateLimit(sendResp)) {
            console.warn('[worker] detected provider rate-limit response -> reverting to pending', JSON.stringify(sendResp));
            // revert state so this withdrawal can be retried later
            await revertToPending(uuid, 'rate_limit_exceeded').catch(e => {
                console.error('[worker] revertToPending failed', e?.message ?? e);
            });

            // write an audit entry so we can track this
            try {
                await supabase.from('withdrawal_audit').insert([{
                    tx_uuid: uuid,
                    action: 'send_rate_limited',
                    details: { info: sendResp }
                }]);
            } catch (e) {
                console.warn('[worker] failed to write withdrawal_audit for rate limit', e?.message ?? e);
            }

            // do not continue to mark as completed
            return;
        }
    } catch (err) {
        console.error('[worker] signing/sending failed', err?.message ?? err);
        await revertToPending(uuid, 'sign_or_send_failed');
        try {
            await supabase.from('withdrawal_audit').insert([{ tx_uuid: uuid, action: 'send_failed', details: { error: (err?.message ?? err) } }]);
        } catch (e) { /* ignore */ }
        return;
    } finally {
        try { if (keyPair.secretKey && keyPair.secretKey.fill) keyPair.secretKey.fill(0); } catch (e) { }
    }

    // We attempted send; tx hash might not be available immediately depending on provider.
    // Store the provider response for debug in audit, and finalize as Completed if you want immediate, or wait for txTick to mark success.
    try {
        await supabase.from('withdrawal_audit').insert([{
            tx_uuid: uuid,
            action: 'sent_highload_transfer',
            details: { sendResp }
        }]);
    } catch (e) { /* ignore */ }

    // Optionally finalize now with no tx hash (you may prefer to wait for txTick to assert onchain)
    try {
        await finalizeSuccess(uuid, null, null, amount);
    } catch (e) {
        console.error('[worker] finalizeSuccess failed', e?.message ?? e);
    }
}

// txTick: poll recent transactions for hot wallet and mark requests processed
async function txTickLoop() {
    // We need lastKnownTxLt and lastKnownTxUtime persisted somewhere.
    // For simplicity we keep in-memory but you should persist across restarts.
    let lastKnownTxLt = undefined;
    let lastKnownTxUtime = undefined;
    const TX_LIMIT = 20;

    // If you want to support multiple wallets, you'd store lastKnown per wallet id
    // We'll attempt to compute address of the hot wallet from the DB keys (take first non-null)
    // Simpler: query a wallet seed from DB to build highloadWallet address, or store it in config
    // For now we'll attempt to fetch most recent wallets used in transactions table
    try {
        // load distinct wallet_ids from recent processing transactions
        const { data: txRows } = await supabase.from('transactions').select('wallet_id').neq('wallet_id', null).limit(1);
        if (!txRows || txRows.length === 0) return;
        const exampleWalletId = txRows[0].wallet_id;
        // fetch seed (but don't keep in memory longer than needed)
        const seed = await fetchSeedFromVault(exampleWalletId);
        const words = String(seed).trim().split(/\s+/);
        const seedBytes = await TonWebMnemonic.mnemonicToSeed(words);
        const kp = TonWeb.utils.keyPairFromSeed(seedBytes);
        const highloadWallet = new HighloadWalletContractV3(tonweb.provider, { publicKey: kp.publicKey, timeout: HIGHLOAD_WALLET_TIMEOUT });
        const hotAddr = await highloadWallet.getAddress();
        const hotWalletAddressString = hotAddr.toString(true, true, false);

        // get transactions list (archive true = include archived)
        let txs = await tonweb.provider.getTransactions(hotWalletAddressString, TX_LIMIT, undefined, undefined, undefined, true);
        const fullTxList = [];
        mainloop: while (true) {
            for (const tx of txs.length < TX_LIMIT ? txs : txs.slice(0, txs.length - 1)) {
                if (tx.transaction_id.lt === lastKnownTxLt) {
                    break mainloop;
                }
                fullTxList.push(tx);
            }
            if (txs.length < TX_LIMIT) break;
            const last = txs[txs.length - 1];
            txs = await tonweb.provider.getTransactions(hotWalletAddressString, TX_LIMIT, last.transaction_id.lt, last.transaction_id.hash, undefined, true);
        }
        fullTxList.reverse();

        for (const tx of fullTxList) {
            try {
                // Only external messages (incoming) have source === '' in example logic
                if (tx.in_msg.source !== '') { throw new Error('Not an external message'); }

                const bodyStr = tx.in_msg.msg_data.body;
                if (!bodyStr) throw new Error('no body in in_msg');

                // parse cell body and extract inner fields (queryId, createdAt) per example
                const bodyCell = TonWeb.boc.Cell.oneFromBoc(TonWeb.utils.base64ToBytes(bodyStr));
                const bodyParser = bodyCell.beginParse();
                const msgInner = bodyParser.loadRef();
                // first 32+8 bits skip subwallet id + send mode
                msgInner.loadUint(32 + 8);
                const queryId = msgInner.loadUint(23);
                const createdAt = msgInner.loadUint(64);

                // find transaction in DB by query_id and created_at
                const qidStr = String(queryId.toString ? queryId.toString() : queryId);
                const createdAtNum = Number(createdAt.toString ? createdAt.toString() : createdAt);
                // update transactions row if present
                const { data: found } = await supabase.from('transactions').select('uuid').eq('query_id', qidStr).eq('created_at', createdAtNum).limit(1);
                if (found && found.length > 0) {
                    const txUuid = found[0].uuid;
                    // If this tx produced out_msgs, treat as sent
                    const sent = Array.isArray(tx.out_msgs) && tx.out_msgs.length > 0;
                    await supabase.from('transactions').update({
                        status: sent ? 'Completed' : 'Failed',
                        handled: sent ? true : false,
                        processed_at: new Date().toISOString()
                    }).eq('uuid', txUuid);
                    await supabase.from('withdrawal_audit').insert([{
                        tx_uuid: txUuid,
                        action: 'tx_tick_processed',
                        details: { lt: tx.transaction_id.lt, hash: tx.transaction_id.hash, sent }
                    }]);
                    if (!sent) {
                        console.error(`WARNING: request at TX ${tx.transaction_id.lt}:${tx.transaction_id.hash} WAS NOT SENT — manual intervention likely required.`);
                    }
                }
            } catch (e) {
                // ignore parsing or non-external messages
            }
            lastKnownTxLt = tx.transaction_id.lt;
            lastKnownTxUtime = tx.utime;
            // persist lastKnownTxLt/Utime in a durable store if you need restart resilience
        }

    } catch (e) {
        console.error('[txTick] error', e?.message ?? e);
    }
}

// main poll loop
async function mainLoop() {
    console.log('[withdrawal-worker] starting worker', WORKER_ID);
    while (true) {
        try {
            const claim = await claimOne();
            if (claim) {
                await processClaim(claim);
            }
        } catch (err) {
            console.error('[worker] loop error', err?.message ?? err);
        }
        // txTick runs more frequently in background but we can also run it here occasionally
        try { await txTickLoop(); } catch (e) { /* ignore */ }
        await sleep(POLL_INTERVAL_MS);
    }
}

// start
mainLoop().catch((err) => {
    console.error('[worker] fatal', err?.message ?? err);
    process.exit(1);
});
