// server/middleware/telegramAuth.js
import crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

/**
 * Helper: verify session token created by createSessionToken
 * Token format: base64(payloadJSON) + '.' + hex(hmac)
 */
export function verifySessionToken(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [b64, sig] = parts;
    try {
        const payloadStr = Buffer.from(b64, 'base64').toString('utf8');
        const expectedSig = crypto
            .createHmac('sha256', INTERNAL_SECRET)
            .update(payloadStr)
            .digest('hex');

        // safe timing compare
        const A = Buffer.from(expectedSig);
        const B = Buffer.from(sig);
        if (A.length !== B.length) return null;
        if (!crypto.timingSafeEqual(A, B)) return null;

        const payload = JSON.parse(payloadStr);
        if (!payload || typeof payload !== 'object') return null;
        if (Date.now() > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * Create HMAC-signed session token for a validated Telegram user.
 * payload should be { id: Number, username?: string, ... }
 */
export function createSessionToken(payloadObj, ttlMs = 1000 * 60 * 60) {
    const now = Date.now();
    const payload = {
        ...payloadObj,
        iat: now,
        exp: now + ttlMs
    };
    const payloadStr = JSON.stringify(payload);
    const b64 = Buffer.from(payloadStr).toString('base64');
    const sig = crypto.createHmac('sha256', INTERNAL_SECRET).update(payloadStr).digest('hex');
    return `${b64}.${sig}`;
}

/**
 * Middleware that requires a valid Bearer session token.
 * Attaches req.user = payload (id, username, ...)
 */
export function requireTelegramSession(req, res, next) {
    try {
        const auth = (req.headers['authorization'] || '').trim();
        if (!auth) {
            return res.status(401).json({ error: 'missing_authorization' });
        }
        // expected: "Bearer <token>"
        const [kind, token] = auth.split(' ');
        if (String(kind).toLowerCase() !== 'bearer' || !token) {
            return res.status(401).json({ error: 'invalid_authorization' });
        }
        const payload = verifySessionToken(token);
        if (!payload) {
            return res.status(401).json({ error: 'invalid_session' });
        }
        // attach minimal user object to req.user
        req.user = {
            id: Number(payload.id),
            username: payload.username ?? null,
            first_name: payload.first_name ?? null,
            language_code: payload.language_code ?? null,
            photo_url: payload.photo_url ?? 'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/TiredPepeResized.png'
        };
        return next();
    } catch (err) {
        console.error('requireTelegramSession error', err);
        return res.status(500).json({ error: 'internal_error' });
    }
}