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
 * Robust referral extractor for Telegram WebApp + regular querystrings.
 *
 * Order of checks:
 *  1) Telegram WebApp initDataUnsafe.start_param (if tgInstance or window.Telegram available)
 *  2) window.location.search (keys: start, startapp, start_app, ref, tgWebAppStartParam)
 *  3) window.location.hash (maybe contains ?start=123)
 *  4) document.referrer (parses querystring there; Telegram sometimes puts tgWebAppStartParam in referrer)
 *  5) localStorage fallback if persist=true
 *
 * Returns Number or null.
 */
export function getReferralFromUrl({ tgInstance = undefined, persist = false } = {}) {
    try {
        // 0) attempt to read from Telegram WebApp initDataUnsafe (best)
        try {
            const tg = tgInstance ?? (window && window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : undefined)
            const startParam =
                (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
                (tg && tg.initData && tg.initData.start_param)
            if (startParam) {
                const n = extractFirstInteger(startParam)
                if (n !== null) {
                    if (persist) localStorage.setItem('referral', String(n))
                    return n
                }
            }
        } catch (e) {
            // ignore any errors reading Telegram SDK
        }

        // 1) canonical keys to accept (case-insensitive)
        const canonicalKeys = ['start', 'startapp', 'start_app', 'ref', 'tgwebappstartparam']

        // helper for scanning a URLSearchParams instance
        const scanParams = (params) => {
            for (const [k, v] of params.entries()) {
                const kl = k.toLowerCase()
                if (canonicalKeys.includes(kl)) {
                    const n = extractFirstInteger(v)
                    if (n !== null) return n
                }
            }
            return null
        }

        // 2) window.location.search
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const search = new URLSearchParams(window.location.search.slice(1))
            const found = scanParams(search)
            if (found !== null) {
                if (persist) localStorage.setItem('referral', String(found))
                return found
            }
        }

        // 3) hash fragment (e.g. "#/path?start=123")
        if (typeof window !== 'undefined' && window.location && window.location.hash) {
            const hash = window.location.hash
            if (hash.includes('=')) {
                const hashPart = (hash.includes('?') ? hash.split('?').pop() : hash.replace(/^#/, ''))
                try {
                    const hashParams = new URLSearchParams(hashPart)
                    const found = scanParams(hashParams)
                    if (found !== null) {
                        if (persist) localStorage.setItem('referral', String(found))
                        return found
                    }
                } catch (e) { /* ignore malformed hash */ }
            }
        }

        // 4) document.referrer (server logs show tgWebAppStartParam may be here)
        try {
            if (typeof document !== 'undefined' && document.referrer) {
                const refUrl = document.referrer
                try {
                    const u = new URL(refUrl)
                    const refSearch = new URLSearchParams(u.search)
                    const found = scanParams(refSearch)
                    if (found !== null) {
                        if (persist) localStorage.setItem('referral', String(found))
                        return found
                    }
                } catch (e) {
                    // document.referrer may be relative or malformed; fallback to simple regex parse
                    const m = refUrl.match(/(?:start|startapp|start_app|ref|tgWebAppStartParam)[^=\d]*=?\D*(\d+)/i)
                    if (m && m[1]) {
                        const n = Number(m[1])
                        if (Number.isFinite(n)) {
                            if (persist) localStorage.setItem('referral', String(n))
                            return n
                        }
                    }
                }
            }
        } catch (e) {
            // ignore referrer errors
        }

        // 5) optional fallback: previously persisted referral
        if (persist) {
            const saved = localStorage.getItem('referral')
            const n = extractFirstInteger(saved)
            if (n !== null) return n
        }

        return null
    } catch (err) {
        console.warn('getReferralFromUrl error', err)
        return null
    }
}
