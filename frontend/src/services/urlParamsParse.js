// services/referral.js
function extractFirstInteger(str) {
    if (str === null || str === undefined) return null
    const s = String(str).trim()
    const m = s.match(/\d+/) // only positive digits
    if (!m) return null
    const n = Number(m[0])
    return Number.isFinite(n) ? n : null
}

/**
 * Simple, strict referral extractor
 * - only reads these explicit keys from the query/hash:
 *   start, startapp, start_app, ref
 * - returns Number (telegram id) or null
 */
export function getReferralFromUrl() {
    try {
        const search = new URLSearchParams(window.location.search || '')
        const canonicalKeys = ['start', 'startapp', 'start_app', 'ref']

        // 1) canonical keys in the query string (case-insensitive)
        for (const key of canonicalKeys) {
            // check exact and case-insensitive form
            for (const [k, v] of search.entries()) {
                if (k.toLowerCase() === key) {
                    const n = extractFirstInteger(v)
                    if (n !== null) return n
                }
            }
        }

        // 2) check hash fragment if it contains a query (e.g. "#/path?start=123")
        if (window.location.hash && window.location.hash.includes('=')) {
            const hashPart = window.location.hash.includes('?')
                ? window.location.hash.split('?').pop()
                : window.location.hash.replace(/^#/, '')
            const hashParams = new URLSearchParams(hashPart)
            for (const key of canonicalKeys) {
                for (const [k, v] of hashParams.entries()) {
                    if (k.toLowerCase() === key) {
                        const n = extractFirstInteger(v)
                        if (n !== null) return n
                    }
                }
            }
        }

        // nothing acceptable found
        return null
    } catch (err) {
        console.warn('getReferralFromUrl error', err)
        return null
    }
}
