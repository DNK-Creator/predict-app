// Helper: put in App.vue script or utils/referral.js
function extractFirstInteger(str) {
    if (!str && str !== 0) return null
    const s = String(str)
    const m = s.match(/-?\d+/)   // first digits sequence (handles negative just in case)
    if (!m) return null
    const n = Number(m[0])
    if (!Number.isFinite(n)) return null
    return n
}

/**
 * Robust referral param extractor
 * - checks common query keys (case-insensitive)
 * - falls back to any query key containing `ref`, `start`, `invite`, `app` etc.
 * - checks window.location.hash for ?key=value
 * - checks pathname segments for a number
 * - returns Number (telegram id) or null
 */
export function getReferralFromUrl() {
    try {
        const search = new URLSearchParams(window.location.search || '')
        const canonicalKeys = [
            'start', 'startapp', 'start_app',
            'ref', 'referral', 'referal', 'referal_id', 'refid', 'ref_id', 'referral_id',
            'invite', 'inv', 'inviter', 'utm_ref', 'r'
        ]

        // 1) check canonical keys first (case-insensitive)
        for (const key of canonicalKeys) {
            // check exact key and also case-insensitive variants present in search
            if (search.has(key)) {
                const v = search.get(key)
                const n = extractFirstInteger(v)
                if (n !== null) return n
            }
            // case-insensitive: iterate search keys once (faster to do below)
        }

        // 2) check any query key that LOOKS LIKE referral (contains keywords)
        const keyKeywords = ['ref', 'start', 'invite', 'inv', 'app']
        for (const [k, v] of search.entries()) {
            const kl = k.toLowerCase()
            if (keyKeywords.some(kw => kl.includes(kw))) {
                const n = extractFirstInteger(v)
                if (n !== null) return n
            }
        }

        // 3) attempt to parse hash fragment like "#/path?start=123" or "#start=123"
        if (window.location.hash) {
            const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
            // treat hash as search part if it contains '='
            if (hash.includes('=')) {
                const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?').pop() : hash)
                for (const [k, v] of hashParams.entries()) {
                    const kl = k.toLowerCase()
                    if (canonicalKeys.includes(kl) || keyKeywords.some(kw => kl.includes(kw))) {
                        const n = extractFirstInteger(v)
                        if (n !== null) return n
                    }
                }
            } else {
                // hash might contain a plain number or username: try digits
                const n = extractFirstInteger(hash)
                if (n !== null) return n
            }
        }

        // 4) fallback: examine pathname segments for a numeric segment
        const path = window.location.pathname || ''
        const parts = path.split('/').filter(Boolean)
        for (const p of parts) {
            const n = extractFirstInteger(p)
            if (n !== null) return n
        }

        // 5) last resort: check entire query string for digits anywhere
        const wholeQs = window.location.search || ''
        const m = wholeQs.match(/-?\d+/)
        if (m) {
            const n = Number(m[0])
            if (Number.isFinite(n)) return n
        }

        return null
    } catch (err) {
        // fail-safe
        console.warn('getReferralFromUrl error', err)
        return null
    }
}
