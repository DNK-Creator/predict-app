import { createClient } from '@supabase/supabase-js';
import { WalletContractV4, TonClient } from '@ton/ton';
import { internal, toNano, Cell, loadTransaction } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Buffer } from 'buffer';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY; // server-only
const POLL_INTERVAL_MS = Number(30000);
const walletKey = process.env.VITE_WALLET_KEY;
const WORKER_ID = process.env.VITE_WORKER_ID;

const TON_API_KEY = process.env.VITE_TONCENTER_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-worker-id': WORKER_ID } }
});

// create client (use json-rpc endpoint)
const tonClient = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

async function claimOne() {
    try {
        // supabase.rpc often returns { data, error } with v2 client
        const rpcResp = await supabase.rpc('claim_withdrawal', { p_worker_id: WORKER_ID });
        // support both shapes: { data, error } or direct array/object
        const data = rpcResp?.data ?? rpcResp;

        // No data or nothing claimed
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return null;
        }

        // If data is an array, pick the first row
        const row = Array.isArray(data) ? data[0] : data;

        // If row is empty object or has no uuid, log and return null
        if (!row || (!row.uuid && !row.wallet_id && !row.amount && !row.withdrawal_address)) {
            console.warn('[claimOne] unexpected RPC row shape, skipping', { raw: row });
            return null;
        }

        // Good row — return it
        return row;
    } catch (err) {
        // If RPC error object (supabase returns { error } or throws)
        console.error('[claimOne] rpc error', err?.message ?? err);
        return null;
    }
}

async function reserveSeq(wallet_id) {
    if (!wallet_id) {
        throw new Error('reserveSeq: wallet_id is falsy');
    }

    try {
        // Use the supabase-js destructuring pattern so we get { data, error }
        const { data, error } = await supabase.rpc('reserve_wallet_seq', { p_wallet_id: wallet_id });

        if (error) {
            // log full error body to help debugging
            console.error('[reserveSeq] rpc error', JSON.stringify(error, null, 2));
            throw error;
        }

        if (!data) {
            console.error('[reserveSeq] rpc returned no data', { wallet_id });
            throw new Error('reserve_wallet_seq returned no data');
        }

        const row = Array.isArray(data) ? data[0] : data;
        // the function returns column new_seq
        const val = row?.new_seq ?? Object.values(row || {})[0];

        if (val === undefined || val === null) {
            console.error('[reserveSeq] no sequence value in rpc row', { row });
            throw new Error('reserve_wallet_seq returned empty new_seq');
        }

        return Number(val);
    } catch (err) {
        console.error('[reserveSeq] error thrown', err?.message ?? err);
        throw err; // let caller handle revert
    }
}

async function fetchSeedFromVault(wallet_id) {
    try {
        // 1) prefer calling the UUID-based RPC if we have a wallet_id
        if (wallet_id) {
            try {
                const rpcResp = await supabase.rpc('get_wallet_seed_for_signer', { p_wallet_id: wallet_id });
                const data = rpcResp?.data ?? rpcResp;
                if (!data) throw new Error('no data returned from get_wallet_seed_for_signer');
                const row = Array.isArray(data) ? data[0] : data;
                if (typeof row === 'string') return row;
                // If supabase wraps result in object field, pick its first value
                const keys = Object.keys(row || {});
                if (keys.length === 1) return row[keys[0]];
                // if row has direct column named get_wallet_seed_for_signer, return that
                if (row.get_wallet_seed_for_signer) return row.get_wallet_seed_for_signer;
            } catch (err) {
                console.warn('[fetchSeedFromVault] uuid-based rpc failed, trying text-based rpc or env fallback', err?.message ?? err);
                // fallthrough to text-based or env
            }
        }

        // 2) try text-based RPC using worker env key if available (legacy)
        if (typeof walletKey !== 'undefined' && walletKey !== null) {
            try {
                const rpcResp2 = await supabase.rpc('get_wallet_seed_for_signer_text', { p_wallet_key: walletKey });
                const data2 = rpcResp2?.data ?? rpcResp2;
                if (!data2) throw new Error('no data returned from get_wallet_seed_for_signer_text');
                const row2 = Array.isArray(data2) ? data2[0] : data2;
                if (typeof row2 === 'string') return row2;
                const keys2 = Object.keys(row2 || {});
                if (keys2.length === 1) return row2[keys2[0]];
                if (row2.get_wallet_seed_for_signer_text) return row2.get_wallet_seed_for_signer_text;
            } catch (err) {
                console.warn('[fetchSeedFromVault] text-based rpc failed', err?.message ?? err);
            }
        }

        throw new Error('no seed available for wallet_id and no fallback');
    } catch (err) {
        console.error('[fetchSeedFromVault] error', err?.message ?? err);
        throw err;
    }
}

async function signTransactionWithSeed(unsignedTransaction, seedPhrase, withdrawal_address) {
    if (!seedPhrase) throw new Error('seedPhrase required');
    if (!unsignedTransaction?.messages || !Array.isArray(unsignedTransaction.messages) || unsignedTransaction.messages.length === 0) {
        throw new Error('unsignedTransaction must include messages array');
    }

    const words = seedPhrase.trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(words);
    if (!keyPair?.publicKey || !keyPair?.secretKey) throw new Error('mnemonicToPrivateKey returned invalid keypair');

    // Create wallet contract
    let workchain = 0; // Usually you need a workchain 0
    let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    let contract = tonClient.open(wallet);

    // Get balance
    let balance = await contract.getBalance();
    console.log('[debug] the balance of hot wallet is ' + balance)

    console.log(withdrawal_address)

    let seqno = await contract.getSeqno();

    console.log('The seqno of the contract is: ' + seqno)

    let transfer = await contract.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
            value: '0.1',
            to: String(withdrawal_address),
            body: 'Gifts Predict'
        })]
    });

    console.log('The create transfer awaited result is : ' + transfer)

    // zero secretKey in memory (best-effort)
    try { if (keyPair.secretKey && Buffer.isBuffer(keyPair.secretKey)) keyPair.secretKey.fill(0); } catch (e) { }

    return transfer;
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
            console.warn('[revertToPending] called without uuid, ignoring', { reason });
            return;
        }
        await supabase.from('transactions').update({ status: 'Pending', worker_id: null }).eq('uuid', uuid);
        await supabase.from('withdrawal_audit').insert([{ tx_uuid: uuid, action: 'reverted_to_pending', details: { reason } }]);
    } catch (err) {
        console.error('[revertToPending] error', err?.message ?? err);
    }
}

async function processClaim(claim) {
    if (!claim) return;
    const uuid = claim.uuid;
    const amount = Number(claim.amount || 0);
    const withdrawal_address = claim.withdrawal_address;
    const wallet_id = claim.wallet_id;

    if (!wallet_id || !uuid) {
        console.warn('[worker] skipping invalid claim (missing uuid or wallet_id)', { rawClaim: claim });

        return;
    }

    // Build unsignedTransaction using nanotons as amount values (string)
    const unsignedTransaction = {
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
            {
                address: withdrawal_address,
                amount: String(Math.round(amount * 1e9)),
                // no payload
            }
        ],
        meta: { source_uuid: uuid }
    };

    // fetch seed
    let seed;
    try {
        seed = await fetchSeedFromVault(wallet_id);
        if (!seed) throw new Error('no seed retrieved');
    } catch (err) {
        console.error('[worker] fetchSeedFromVault failed', err?.message ?? err);
        await revertToPending(uuid, 'fetch_seed_failed');
        return;
    }

    // sign
    let sendResp;
    let signedBocBase64 = null;
    console.log('[debug] unsignedTransaction.validUntil', unsignedTransaction.validUntil, 'nowSec', Math.floor(Date.now() / 1000));
    try {
        const signedResponse = await signTransactionWithSeed(unsignedTransaction, seed, claim.withdrawal_address);
    } catch (err) {
        // Log detailed error object to see why provider rejected (500)
        console.error('[worker] signing/sending failed:', err?.message ?? err);
        if (err?.response?.data) console.error('[worker] provider response:', JSON.stringify(err.response.data).slice(0, 2000));
        await revertToPending(uuid, 'sign_or_send_failed');
        return;
    } finally {
        try { seed = null; } catch (e) { }
    }

    // Inspect sendResp for tx hash (provider-dependent)
    let txHash = null;
    // try {
    //     txHash = sendResp?.transactionId ?? sendResp?.id ?? sendResp?.hash ?? sendResp?.result?.hash ?? sendResp?.result?.id ?? null;
    //     console.log('[worker] sendResp extracted txHash:', txHash);
    // } catch (e) {
    //     console.warn('[worker] failed to extract txHash from sendResp', e?.message ?? e);
    // }

    try {
        await finalizeSuccess(uuid, signedBocBase64, txHash, amount);
        // also store provider response in audit table for debugging
        await supabase.from('withdrawal_audit').insert([{
            tx_uuid: uuid,
            action: 'sent_via_library',
            details: { signedResponse }
        }]);
        console.log('[worker] completed', uuid, 'tx', txHash);
    } catch (err) {
        console.error('[worker] finalize failure', err?.message ?? err);
    }
}

/**
 * Poll loop
 */
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
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
}

mainLoop().catch((err) => {
    console.error('[worker] fatal', err?.message ?? err);
    process.exit(1);
});