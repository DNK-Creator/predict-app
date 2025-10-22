// src/composables/useLayoutChanges.js
let _vvResize = null
let _vvScroll = null
let _windowResize = null
let _mutationObserver = null
let _tgListener = null
let _initialized = false
let _tgInstance = null
let _tgEventNames = [
    'viewportChanged',
    'safeAreaChanged',
    'contentSafeAreaChanged',
    'fullscreenChanged',
    'fullscreenFailed',
    'activated',
    'deactivated'
]

function setCssVar(name, value) {
    try { document.documentElement.style.setProperty(name, value) } catch (e) { /* ignore */ }
}

// --- REPLACEMENT: applyTelegramInsets (reads visualViewport and returns effective top) ---
function applyTelegramInsets(tg) {
    // fallbacks (px)
    const DEFAULT_TOP = 8
    const DEFAULT_BOTTOM = 8
    const DEFAULT_SIDE = 0

    const safe = (tg && tg.safeAreaInset) ? tg.safeAreaInset : {}
    const contentSafe = (tg && tg.contentSafeAreaInset) ? tg.contentSafeAreaInset : {}

    // visual viewport offset (some Telegram clients shift the webview down; use as fallback)
    let visualTop = 0
    try {
        if (typeof window !== 'undefined' && window.visualViewport && typeof window.visualViewport.offsetTop === 'number') {
            visualTop = Math.round(window.visualViewport.offsetTop || 0)
        }
    } catch (e) { visualTop = 0 }

    // prefer contentSafe (it excludes Telegram chrome). If contentSafe.top is 0 but visualTop > 0,
    // use the visualTop to avoid leaving a gap between Telegram chrome and our content.
    const top = (typeof contentSafe.top === 'number')
        ? Math.round(contentSafe.top)
        : (typeof safe.top === 'number' ? Math.round(safe.top) : undefined)

    // final effective top: prefer explicit content/safe; else fallback to visualTop or DEFAULT_TOP
    const effectiveTop = (typeof top === 'number' && top >= 0)
        ? Math.max(top, visualTop)         // use the larger one -> avoids leaving visual gap
        : Math.max(visualTop || 0, DEFAULT_TOP)

    const bottom = (typeof contentSafe.bottom === 'number') ? Math.round(contentSafe.bottom)
        : (typeof safe.bottom === 'number') ? Math.round(safe.bottom)
            : DEFAULT_BOTTOM

    const left = (typeof contentSafe.left === 'number') ? Math.round(contentSafe.left)
        : (typeof safe.left === 'number') ? Math.round(safe.left)
            : DEFAULT_SIDE

    const right = (typeof contentSafe.right === 'number') ? Math.round(contentSafe.right)
        : (typeof safe.right === 'number') ? Math.round(safe.right)
            : DEFAULT_SIDE

    setCssVar('--tg-safe-area-top', `${effectiveTop}px`)
    setCssVar('--tg-safe-area-bottom', `${bottom}px`)
    setCssVar('--tg-safe-area-left', `${left}px`)
    setCssVar('--tg-safe-area-right', `${right}px`)

    // Keep app-top-offset in sync for backward compatibility with existing code
    setCssVar('--app-top-offset', `${effectiveTop}px`)

    // return info for callers if they need to make decisions
    return { effectiveTop, contentTop: contentSafe.top, safeTop: safe.top, visualTop }
}

/**
 * updateLayoutVars — computes keyboard height, bottom space, header height, and viewport stable height
 */
export function updateLayoutVars(
    { appSelector = '.app', headerSelector = '.app-header', menuSelector = '.menu', safety = 8 } = {},
    tgInstance = undefined
) {
    try {
        const docEl = document.documentElement
        const appEl = document.querySelector(appSelector) || document.documentElement
        const headerEl = document.querySelector(headerSelector)
        const menuEl = document.querySelector(menuSelector)

        const headerH = headerEl ? Math.round(headerEl.offsetHeight) : 56
        setCssVar('--app-header-height', `${headerH}px`)

        let computedTopExtra = 20
        const tg = tgInstance ?? _tgInstance
        try {
            if (tg) {
                // call applyTelegramInsets (it will set --app-top-offset and related vars and return effective top info)
                const insetInfo = applyTelegramInsets(tg)

                // smaller extra if Telegram environment or WebApp provides non-zero top/visual offset
                // - if content safe or visual top exists -> small gap (8px)
                // - otherwise in Telegram but no offsets -> medium (12px)
                const anyTop = (insetInfo && (insetInfo.effectiveTop > 0 || (typeof tg.isExpanded !== 'undefined' && tg.isExpanded)))
                if (anyTop) {
                    computedTopExtra = 8
                } else {
                    computedTopExtra = 12
                }
            } else {
                // no Telegram: keep a larger default so browser chrome has some space
                computedTopExtra = 20
            }
        } catch (e) {
            computedTopExtra = 20
        }

        setCssVar('--app-top-extra', `${computedTopExtra}px`)

        const visual = window.visualViewport
        let keyboardHeight = 0
        if (visual && typeof visual.height === 'number') {
            keyboardHeight = Math.max(0, Math.round(window.innerHeight - visual.height - (visual.offsetTop || 0)))
        }
        setCssVar('--keyboard-height', `${keyboardHeight}px`)

        // compute bottom space required (menu + keyboard)
        let bottomSpaceValue = null
        if (menuEl && appEl) {
            const menuRect = menuEl.getBoundingClientRect()
            let requiredBottom = Math.max(0, Math.round(window.innerHeight - menuRect.top))

            if (document.body.classList.contains('keyboard-open')) {
                requiredBottom = Math.max(requiredBottom, keyboardHeight)
            } else {
                requiredBottom = Math.max(requiredBottom, keyboardHeight)
            }

            requiredBottom = Math.max(0, requiredBottom + Math.round(safety))
            bottomSpaceValue = `calc(${requiredBottom}px + 20px)`
            setCssVar('--app-bottom-space', bottomSpaceValue)
        } else {
            bottomSpaceValue = `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(safety)}px + 20px)`
            setCssVar('--app-bottom-space', bottomSpaceValue)
        }

        // compute app-bottom-extra (adaptive extra spacing)
        // rationale:
        // - when Telegram expands/fullscreen we want more extra bottom padding to avoid UI hitting Telegram chrome
        // - when not expanded (fullsize / desktop) we prefer less extra so layout feels tighter
        let computedBottomExtra = 12; // default small extra for fullsize browser views

        try {
            // if inside Telegram, prefer Telegram-provided state
            if (tg) {
                const isExpanded = Boolean(tg.isExpanded) || Boolean(tg.isFullscreen)
                // start with baseline: expanded -> more extra; not expanded -> small extra
                computedBottomExtra = isExpanded ? 40 : 12

                // if keyboard present, increase extra a bit so input area has breathing room
                if (keyboardHeight && keyboardHeight > 0) {
                    // add 10-20px buffer when keyboard is open (you can tune this)
                    computedBottomExtra = Math.max(computedBottomExtra, 20)
                }
            } else {
                // not inside Telegram (regular browser): minimal default
                computedBottomExtra = (keyboardHeight && keyboardHeight > 0) ? 20 : 8
            }
        } catch (e) {
            computedBottomExtra = 12
        }

        // set CSS var (JS writes var; CSS uses it)
        setCssVar('--app-bottom-extra', `${computedBottomExtra}px`)

        // prefer Telegram-provided viewportStableHeight
        try {
            const stableFromTg =
                (tg && (typeof tg.viewportStableHeight === 'number' ? tg.viewportStableHeight : undefined)) ??
                (tg && (typeof tg.viewportHeight === 'number' ? tg.viewportHeight : undefined))
            const stable = (typeof stableFromTg === 'number') ? Math.round(stableFromTg)
                : (visual && typeof visual.height === 'number') ? Math.round(visual.height)
                    : Math.round(window.innerHeight)

            setCssVar('--tg-viewport-stable-height', `${stable}px`)
        } catch (e) {
            setCssVar('--tg-viewport-stable-height', `${Math.round(window.innerHeight)}px`)
        }

        // after everything set, apply toast positioning
        applyToastTopInset()

        try {
            const scrollEl = document.querySelector('.app-scroll-container')
            if (scrollEl) {
                // clear inline style if present
                scrollEl.style.paddingTop = '' // remove inline style so CSS rule (0 !important) wins
                // double-ensure computed result: set 0 if computed still non-zero (very defensive)
                const computed = getComputedStyle(scrollEl).paddingTop
                if (computed && computed !== '0px') {
                    // apply inline 0 (only if something else in the cascade still gives non-zero)
                    scrollEl.style.paddingTop = '0px'
                }
            }
        } catch (e) {
            // non-fatal; ignore
        }

        return {
            headerH,
            keyboardHeight,
            bottomSpace: bottomSpaceValue,
            tgViewportStable: getComputedStyle(docEl).getPropertyValue('--tg-viewport-stable-height')?.trim(),
            topInset: getComputedStyle(docEl).getPropertyValue('--app-top-offset')?.trim()
        }
    } catch (err) {
        // fallback safe defaults
        try {
            setCssVar('--app-bottom-space', `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(8)}px)`)
            setCssVar('--app-header-height', `56px`)
            setCssVar('--app-top-offset', `8px`)
            setCssVar('--keyboard-height', `0px`)
            setCssVar('--tg-viewport-stable-height', `${Math.round(window.innerHeight)}px`)
            setCssVar('--app-top-extra', '20px')
        } catch (e) { /* ignore */ }
        return null
    }
}

let _toastObserver = null
function applyToastTopInset() {
    const docEl = document.documentElement;
    const top = getComputedStyle(docEl).getPropertyValue('--app-top-offset').trim() || '0px';
    const header = getComputedStyle(docEl).getPropertyValue('--app-header-height').trim() || '56px';
    const extra = getComputedStyle(docEl).getPropertyValue('--app-top-extra').trim() || '20px';

    let topPx = 0;
    try {
        const pxTop = parseInt(top, 10) || 0;
        const pxHeader = parseInt(header, 10) || 56;
        const pxExtra = parseInt(extra, 10) || 20;
        topPx = pxTop + pxHeader + pxExtra + 8;
    } catch (e) {
        topPx = 56 + 20 + 8;
    }

    const containers = Array.from(document.querySelectorAll('.Toastify__toast-container'));
    if (containers.length) {
        containers.forEach(el => {
            el.style.top = `${topPx}px`;
            el.style.zIndex = '1200';
        });
    }

    if (!containers.length) {
        try {
            if (!_toastObserver) {
                _toastObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            try {
                                if (node && node.nodeType === 1) {
                                    if (node.matches && node.matches('.Toastify__toast-container')) {
                                        node.style.top = `${topPx}px`;
                                        node.style.zIndex = '1200';
                                    } else {
                                        const found = node.querySelector && node.querySelector('.Toastify__toast-container');
                                        if (found) {
                                            found.style.top = `${topPx}px`;
                                            found.style.zIndex = '1200';
                                        }
                                    }
                                }
                            } catch (inner) { }
                        }
                    }
                });
                _toastObserver.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) { }
    }
}

export function setKeyboardHeight(px) {
    setCssVar('--keyboard-height', `${px}px`)
}

export function initLayout({ telegram = null, appSelector = '.app', headerSelector = '.app-header', menuSelector = '.menu' } = {}) {
    if (_initialized) return
    _initialized = true
    _tgInstance = telegram ?? null

    _windowResize = () => updateLayoutVars({ appSelector, headerSelector, menuSelector })
    window.addEventListener('resize', _windowResize)

    if (window.visualViewport) {
        _vvResize = () => {
            const kv = Math.max(0, window.innerHeight - window.visualViewport.height)
            setKeyboardHeight(kv)
            updateLayoutVars({ appSelector, headerSelector, menuSelector })
        }
        _vvScroll = () => {
            const kv = Math.max(0, window.innerHeight - window.visualViewport.height)
            setKeyboardHeight(kv)
            updateLayoutVars({ appSelector, headerSelector, menuSelector })
        }
        window.visualViewport.addEventListener('resize', _vvResize)
        window.visualViewport.addEventListener('scroll', _vvScroll)
    }

    _mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class') {
                updateLayoutVars({ appSelector, headerSelector, menuSelector })
            }
        }
    })
    _mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    try {
        if (_tgInstance) {
            _tgListener = function (eventType, eventParams) {
                try {
                    if (eventType === 'viewportChanged') {
                        if (eventParams && eventParams.isStateStable) {
                            try {
                                const stable = (typeof this.viewportStableHeight === 'number') ? Math.round(this.viewportStableHeight) : undefined
                                if (stable) setCssVar('--tg-viewport-stable-height', `${stable}px`)
                            } catch (e) { /* ignore */ }
                        }
                    } else if (eventType === 'safeAreaChanged' || eventType === 'contentSafeAreaChanged') {
                        try { applyTelegramInsets(this) } catch (e) { /* ignore */ }
                    } else if (eventType === 'fullscreenChanged') {
                        try { setCssVar('--tg-is-fullscreen', this.isFullscreen ? '1' : '0') } catch (e) { }
                    } else if (eventType === 'fullscreenFailed') {
                        try {
                            const err = (eventParams && eventParams.error) ? String(eventParams.error) : 'UNKNOWN'
                            setCssVar('--tg-fullscreen-failed', err)
                        } catch (e) { }
                    }
                } finally {
                    updateLayoutVars({ appSelector, headerSelector, menuSelector }, this)
                }
            }.bind(_tgInstance)

            if (typeof _tgInstance.onEvent === 'function') {
                for (const ev of _tgEventNames) _tgInstance.onEvent(ev, _tgListener)
            } else if (typeof _tgInstance.on === 'function') {
                for (const ev of _tgEventNames) _tgInstance.on(ev, _tgListener)
            }
        }
    } catch (e) {
        _tgListener = null
    }

    updateLayoutVars({ appSelector, headerSelector, menuSelector }, _tgInstance)
}

export function disposeLayout() {
    if (!_initialized) return
    _initialized = false

    try { if (_windowResize) window.removeEventListener('resize', _windowResize) } catch (e) { }
    try { if (window.visualViewport && _vvResize) window.visualViewport.removeEventListener('resize', _vvResize) } catch (e) { }
    try { if (window.visualViewport && _vvScroll) window.visualViewport.removeEventListener('scroll', _vvScroll) } catch (e) { }
    try { if (_mutationObserver) _mutationObserver.disconnect() } catch (e) { }

    if (_toastObserver) {
        try { _toastObserver.disconnect() } catch (e) { /* ignore */ }
        _toastObserver = null;
    }

    try {
        if (_tgInstance && _tgListener) {
            if (typeof _tgInstance.offEvent === 'function') {
                for (const ev of _tgEventNames) _tgInstance.offEvent(ev, _tgListener)
            }
            if (typeof _tgInstance.off === 'function') {
                for (const ev of _tgEventNames) _tgInstance.off(ev, _tgListener)
            }
        }
    } catch (e) { }

    _vvResize = null; _vvScroll = null; _windowResize = null; _mutationObserver = null; _tgListener = null; _tgInstance = null
}