// src/services/debugLogger.js
const MAX_HISTORY = 300

// add near the bottom of src/services/debugLogger.js
export function replayHistory() {
    try {
        const hist = Array.isArray(window.__appDebugLog) ? window.__appDebugLog.slice() : []
        // replay in chronological order
        hist.forEach((entry) => {
            const level = (entry.level && typeof console[entry.level] === 'function') ? entry.level : 'log'
            try {
                console[level](`[replay] ${entry.ts} — ${entry.msg}`, entry.meta ?? '')
            } catch (e) {
                console.log(`[replay] ${entry.ts} — ${entry.msg}`, entry.meta ?? '')
            }
        })
    } catch (e) {
        try { console.error('replayHistory failed', e) } catch (_) { }
    }
}


function nowIso() {
    return (new Date()).toISOString()
}

// simple circular history on window so vConsole can inspect
if (!window.__appDebugLog) window.__appDebugLog = []

function pushHistory(level, msg, meta) {
    try {
        const entry = { ts: nowIso(), level, msg, meta }
        window.__appDebugLog.push(entry)
        if (window.__appDebugLog.length > MAX_HISTORY) window.__appDebugLog.shift()
    } catch (e) { /* ignore */ }
}

function safeConsole(method, ...args) {
    try { console[method](...args) } catch (e) { console.log(...args) }
}

export function debug(msg, meta) {
    pushHistory('debug', msg, meta)
    safeConsole('debug', `[debug] ${nowIso()} — ${msg}`, meta ?? '')
}
export function info(msg, meta) {
    pushHistory('info', msg, meta)
    safeConsole('info', `[info] ${nowIso()} — ${msg}`, meta ?? '')
}
export function warn(msg, meta) {
    pushHistory('warn', msg, meta)
    safeConsole('warn', `[warn] ${nowIso()} — ${msg}`, meta ?? '')
}
export function error(msg, meta) {
    pushHistory('error', msg, meta)
    safeConsole('error', `[error] ${nowIso()} — ${msg}`, meta ?? '')
}

// group helpers (maps to console.groupCollapsed when available)
export function group(name) {
    try { console.groupCollapsed(`${name} — ${nowIso()}`) } catch (e) { }
    pushHistory('group', name, null)
}
export function groupEnd() {
    try { console.groupEnd() } catch (e) { }
    pushHistory('groupEnd', '', null)
}

// instrument async function: returns wrapper that logs start/ok/error & timing
export function wrapAsync(fn, label) {
    return async function (...args) {
        const start = Date.now()
        debug(`start: ${label}`, { args })
        try {
            const res = await fn.apply(this, args)
            debug(`done: ${label}`, { durationMs: Date.now() - start })
            return res
        } catch (err) {
            error(`error: ${label}`, { durationMs: Date.now() - start, error: (err && (err.message || err.toString())) ?? err, stack: err?.stack })
            throw err
        }
    }
}

// capture global errors/unhandled rejections into logger
export function installGlobalErrorHandlers(opts = {}) {
    if (installGlobalErrorHandlers._installed) return
    installGlobalErrorHandlers._installed = true

    window.addEventListener('error', (ev) => {
        try {
            error('window.onerror', { message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, error: ev.error?.stack ?? ev.error })
        } catch (e) { }
    })

    window.addEventListener('unhandledrejection', (ev) => {
        try {
            error('unhandledrejection', { reason: ev.reason?.message ?? ev.reason, stack: ev.reason?.stack ?? null })
        } catch (e) { }
    })
}
