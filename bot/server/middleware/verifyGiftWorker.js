// server/middleware/verifyGiftWorker.js
import crypto from 'crypto';

const ALLOWED_SKEW_MS = Number(process.env.GIFT_WORKER_SKEW_MS ?? 120_000); // 120 sec by default
const SECRET = process.env.GIFT_WORKER_SECRET; // same value as worker env
if (!SECRET) {
    console.warn('GIFT_WORKER_SECRET is not set — giftHandle endpoint will be insecure until configured.');
}

// deterministic canonicalize must match worker's implementation:
function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function safeEqHex(aHex, bHex) {
    try {
        const a = Buffer.from(aHex, 'hex');
        const b = Buffer.from(bHex, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch (e) {
        return false;
    }
}

export function verifyGiftWorkerSignature(req, res, next) {
    try {
        if (!SECRET) {
            // fail closed in production — but allow for development if desired; here we reject.
            return res.status(500).json({ error: 'server_misconfigured' });
        }

        // ensure JSON body parsed (express.json() should have run).
        const bodyObj = req.body;
        if (!bodyObj || typeof bodyObj !== 'object') {
            return res.status(400).json({ error: 'invalid_body' });
        }

        const sig = String(req.headers['x-gift-signature'] || '');
        const ts = String(req.headers['x-gift-timestamp'] || '');
        if (!sig || !ts) {
            return res.status(401).json({ error: 'missing_signature' });
        }

        // validate timestamp freshness
        const tsNum = Number(ts);
        if (!Number.isFinite(tsNum)) {
            return res.status(401).json({ error: 'invalid_timestamp' });
        }
        const now = Date.now();
        if (Math.abs(now - tsNum) > ALLOWED_SKEW_MS) {
            return res.status(401).json({ error: 'timestamp_out_of_range' });
        }

        // rebuild canonical string from parsed JSON (must match worker canonicalization)
        const canonical = canonicalize(bodyObj);
        const data = `${ts}.${canonical}`;

        const expected = crypto.createHmac('sha256', SECRET).update(data).digest('hex');

        if (!safeEqHex(expected, sig)) {
            console.warn('giftHandle: signature mismatch', { expected, got: sig });
            return res.status(403).json({ error: 'invalid_signature' });
        }

        // optional: verify worker id header if you expect a specific worker id
        // const workerId = req.headers['x-gift-worker-id'];
        // if (workerId !== process.env.GIFT_WORKER_ID) return res.status(403).json({ error: 'unknown_worker' });

        // passed verification
        return next();
    } catch (err) {
        console.error('verifyGiftWorkerSignature error', err);
        return res.status(500).json({ error: 'internal' });
    }
}
