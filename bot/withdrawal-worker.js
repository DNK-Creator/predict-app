import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { WalletContractV4 } from '@ton/ton';
import { internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Buffer } from 'buffer';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY; // server-only
const POLL_INTERVAL_MS = Number(15000);
const walletKey = process.env.VITE_WALLET_KEY;
const WORKER_ID = process.env.VITE_WORKER_ID;

// TON broadcast / provider configuration.
// Replace this with your provider's recommended endpoint & auth method.
const TON_BROADCAST_URL = 'https://toncenter.com/api/v2/sendBoc';
const TON_API_KEY = process.env.VITE_TONCENTER_API_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-worker-id': WORKER_ID } }
});

async function claimOne() {
    try {
        const res = await supabase.rpc('claim_withdrawal', { p_worker_id: WORKER_ID });
        if (!res || (Array.isArray(res) && res.length === 0)) return null;
        return Array.isArray(res) ? res[0] : res;
    } catch (err) {
        console.error('[claimOne] error', err?.message ?? err);
        return null;
    }
}

async function reserveSeq(wallet_id) {
    try {
        const res = await supabase.rpc('reserve_wallet_seq', { p_wallet_id: wallet_id });
        const row = Array.isArray(res) ? res[0] : res;
        // Expect field new_seq (depends on your SQL)
        const val = row?.new_seq ?? row?.reserve_wallet_seq ?? Object.values(row || {})[0];
        return val !== undefined && val !== null ? Number(val) : null;
    } catch (err) {
        console.error('[reserveSeq] error', err?.message ?? err);
        throw err;
    }
}

async function fetchSeedFromVault(wallet_id) {
    try {
        const res = await supabase.rpc('get_wallet_seed_for_signer_text', { p_wallet_key: walletKey });
        const row = Array.isArray(res) ? res[0] : res;
        // function returns plain text; supabase client wraps it — handle shapes
        if (!row) throw new Error('no seed returned');
        if (typeof row === 'string') return row;
        // object with single field
        const keys = Object.keys(row);
        if (keys.length === 1) return row[keys[0]];
        throw new Error('unexpected seed return shape');
    } catch (err) {
        console.error('[fetchSeedFromVault] error', err?.message ?? err);
        throw err;
    }
}

async function signTransactionWithSeed(unsignedTransaction, seedPhrase, walletAddress, seqno) {
    if (!seedPhrase) throw new Error('seedPhrase required');
    if (!unsignedTransaction?.messages || !Array.isArray(unsignedTransaction.messages) || unsignedTransaction.messages.length === 0) {
        throw new Error('unsignedTransaction must include messages array');
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length < 12) {
        // still allow but warn
        console.warn('[sign] mnemonic looks short (<12 words) — ensure this is correct for your wallet type');
    }
    const keyPair = await mnemonicToPrivateKey(words);
    // keyPair typically contains: { publicKey: Buffer, secretKey: Buffer } (library returns Buffers)
    if (!keyPair?.publicKey || !keyPair?.secretKey) {
        throw new Error('mnemonicToPrivateKey returned invalid keypair');
    }

    const wallet = WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0
    });

    const messages = unsignedTransaction.messages.map((m) => {
        // value must be string or bigint — convert to BigInt string if needed
        let value = m.amount;
        if (typeof value === 'number') value = String(Math.round(value)); // assume already nanotons if passed as integer
        if (typeof value === 'string') {
            // If caller passed TON instead of nanotons, they should convert before calling signer.
            // We will assume it's nanotons (as earlier pattern used amount * 1e9)
        }
        // optional payload: if provided as base64 BOC or text, embed as body cell
        const body = m.payload ?? null;
        return internal({
            to: m.address,
            value: value,
            body: body ? body : undefined,
            bounce: false
        });
    });

    const signedCell = wallet.createTransfer({
        messages,
        secretKey: keyPair.secretKey,
        seqno: Number(seqno),
    });

    const bocBytes = signedCell.toBoc(); // Uint8Array
    const bocBase64 = Buffer.from(bocBytes).toString('base64');

    try {
        if (keyPair.secretKey && Buffer.isBuffer(keyPair.secretKey)) {
            keyPair.secretKey.fill(0);
        }
    } catch (e) {
        // ignore
    }

    return bocBase64;
}

async function broadcastBocBase64(bocBase64) {
    try {
        // Example: call provider's sendBoc endpoint
        // TonCenter / QuickNode may accept JSON body { boc: "<base64>" }
        const headers = {};
        const params = {};
        if (TON_API_KEY) {
            // TonCenter style API key as param
            params.api_key = TON_API_KEY;
        }
        const resp = await axios.post(TON_BROADCAST_URL, { boc: bocBase64 }, { params, headers, timeout: 30_000 });
        return resp.data;
    } catch (err) {
        console.error('[broadcastBocBase64] error', err?.response?.data ?? err?.message ?? err);
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

    if (!wallet_id) {
        console.error('[worker] missing wallet_id for', uuid);
        await revertToPending(uuid, 'missing_wallet_id');
        return;
    }

    let seqno;
    try {
        seqno = await reserveSeq(wallet_id);
        if (seqno === null || seqno === undefined) throw new Error('no seqno');
    } catch (err) {
        console.error('[worker] reserveSeq failed', err?.message ?? err);
        await revertToPending(uuid, 'reserve_seq_failed');
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
        meta: { source_uuid: uuid, seqno }
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
    let signed_boc;
    try {
        signed_boc = await signTransactionWithSeed(unsignedTransaction, seed, claim.withdrawal_address, seqno);
        if (!signed_boc) throw new Error('no signed boc returned');
    } catch (err) {
        console.error('[worker] signing failed', err?.message ?? err);
        await revertToPending(uuid, 'sign_failed');
        return;
    } finally {
        // best-effort zero out seed variable
        try { seed = null; } catch (e) { }
    }

    // broadcast
    let broadcastResp;
    try {
        broadcastResp = await broadcastBocBase64(signed_boc);
    } catch (err) {
        console.error('[worker] broadcast failed', err?.message ?? err);
        await revertToPending(uuid, 'broadcast_failed');
        return;
    }

    // Extract tx hash from provider response — provider dependent.
    const txHash = broadcastResp?.result ?? broadcastResp?.hash ?? broadcastResp?.tx_hash ?? null;

    try {
        await finalizeSuccess(uuid, signed_boc, txHash, amount);
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