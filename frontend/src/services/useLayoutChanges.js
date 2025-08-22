// src/composables/useLayoutChanges.js
// lightweight composable — no Vue reactivity required here (pure DOM + CSS var helpers)

let _vvResize = null
let _vvScroll = null
let _windowResize = null
let _mutationObserver = null
let _tgListener = null
let _initialized = false
let _tgInstance = null

/**
 * Robust layout var updater for Telegram WebApp + keyboard handling.
 *
 * @param {Object} opts
 * @param {string} opts.appSelector
 * @param {string} opts.headerSelector
 * @param {string} opts.menuSelector
 * @param {number} opts.safety  extra px of safety padding to add to bottom space
 * @param {object} [tgInstance] optional Telegram webapp instance (used to read viewportStableHeight)
 * @returns {Object} measured values (useful for debugging)
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

        // --- header height (keep previous fallback of 56) ---
        const headerH = headerEl ? Math.round(headerEl.offsetHeight) : 56
        docEl.style.setProperty('--app-header-height', `${headerH}px`)

        // --- visual viewport & insets ---
        const visual = window.visualViewport
        const topInset = (visual && typeof visual.offsetTop === 'number') ? Math.round(visual.offsetTop) : 0
        docEl.style.setProperty('--app-top-offset', `${topInset}px`)

        // expose a configurable extra top offset so we can add +20px globally (defaults to 20)
        docEl.style.setProperty('--app-top-extra', `20px`) // change value if you want a different default

        // --- keyboard height (when visualViewport exists, this is the simplest reliable calc) ---
        // keyboardHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop (if any)
        let keyboardHeight = 0
        if (visual && typeof visual.height === 'number') {
            keyboardHeight = Math.max(0, Math.round(window.innerHeight - visual.height - (visual.offsetTop || 0)))
        }
        // expose keyboard height as CSS var (default 0)
        docEl.style.setProperty('--keyboard-height', `${keyboardHeight}px`)

        // --- compute bottom space required (account for menu + keyboard) ---
        let bottomSpaceValue = null

        if (menuEl && appEl) {
            const menuRect = menuEl.getBoundingClientRect()

            // space from menu top to bottom of viewport
            // (use window.innerHeight so this reflects the actual visible chrome; visualViewport.height is used for keyboard)
            let requiredBottom = Math.max(0, Math.round(window.innerHeight - menuRect.top))

            // if keyboard open (based on body class), ensure keyboardHeight is respected
            // otherwise prefer the measured requiredBottom (menu) but include keyboard height if larger
            if (document.body.classList.contains('keyboard-open')) {
                // when keyboard is open we want to ensure content can scroll above it:
                // prefer keyboardHeight when it's available, else fallback to requiredBottom
                requiredBottom = Math.max(requiredBottom, keyboardHeight)
            } else {
                // keyboard not reported open: still ensure bottom padding covers keyboard if it's unexpectedly present
                requiredBottom = Math.max(requiredBottom, keyboardHeight)
            }

            requiredBottom = Math.max(0, requiredBottom + Math.round(safety))
            bottomSpaceValue = `${requiredBottom}px`
            docEl.style.setProperty('--app-bottom-space', bottomSpaceValue)
        } else {
            // no floating menu visible — reserve just the device safe-area bottom + a tiny safety margin
            bottomSpaceValue = `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(safety)}px)`
            docEl.style.setProperty('--app-bottom-space', bottomSpaceValue)
        }

        // --- try to set Telegram viewport var too (non-fatal) ---
        // prefer explicit Telegram-provided value, then visualViewport.height, then window.innerHeight
        try {
            const stableFromTg =
                (tgInstance && (typeof tgInstance.viewportStableHeight === 'number' ? tgInstance.viewportStableHeight : undefined)) ??
                (tgInstance && (typeof tgInstance.viewportHeight === 'number' ? tgInstance.viewportHeight : undefined))
            const stable = (typeof stableFromTg === 'number') ? Math.round(stableFromTg)
                : (visual && typeof visual.height === 'number') ? Math.round(visual.height)
                    : Math.round(window.innerHeight)

            docEl.style.setProperty('--tg-viewport-stable-height', `${stable}px`)
        } catch (e) {
            // fallback if something inside tgInstance threw
            docEl.style.setProperty('--tg-viewport-stable-height', `${Math.round(window.innerHeight)}px`)
        }

        // at the end of updateLayoutVars()
        applyToastTopInset()

        // return useful values for debugging/testing
        return {
            headerH,
            topInset,
            keyboardHeight,
            bottomSpace: bottomSpaceValue,
            tgViewportStable: getComputedStyle(docEl).getPropertyValue('--tg-viewport-stable-height')?.trim()
        }
    } catch (err) {
        // safe fallback in case of unexpected DOM errors
        try {
            document.documentElement.style.setProperty('--app-bottom-space', `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(safety)}px)`)
            document.documentElement.style.setProperty('--app-header-height', `56px`)
            document.documentElement.style.setProperty('--app-top-offset', `0px`)
            document.documentElement.style.setProperty('--keyboard-height', `0px`)
            document.documentElement.style.setProperty('--tg-viewport-stable-height', `${Math.round(window.innerHeight)}px`)
            // inside the catch fallback
            document.documentElement.style.setProperty('--app-top-extra', '20px')

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

    // compute px robustly
    let topPx = 0;
    try {
        const pxTop = parseInt(top, 10) || 0;
        const pxHeader = parseInt(header, 10) || 56;
        const pxExtra = parseInt(extra, 10) || 20;
        topPx = pxTop + pxHeader + pxExtra + 8;
    } catch (e) {
        topPx = 56 + 20 + 8; // safe fallback
    }

    // Apply inline styles to any existing containers
    const containers = Array.from(document.querySelectorAll('.Toastify__toast-container'));
    if (containers.length) {
        containers.forEach(el => {
            el.style.top = `${topPx}px`;
            el.style.zIndex = '1200';
        });
    }

    // If no container exists yet, observe the DOM and style container(s) as soon as they appear.
    // This handles the lazy-creation case (first toast).
    if (!containers.length) {
        try {
            // create observer once
            if (!_toastObserver) {
                _toastObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            try {
                                if (node && node.nodeType === 1) {
                                    // the toast container might be added directly or inside a wrapper
                                    if (node.matches && node.matches('.Toastify__toast-container')) {
                                        node.style.top = `${topPx}px`;
                                        node.style.zIndex = '1200';
                                    } else {
                                        // also check descendants
                                        const found = node.querySelector && node.querySelector('.Toastify__toast-container');
                                        if (found) {
                                            found.style.top = `${topPx}px`;
                                            found.style.zIndex = '1200';
                                        }
                                    }
                                }
                            } catch (inner) {
                                // ignore any match errors for exotic nodes
                            }
                        }
                    }
                });
                _toastObserver.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) {
            // final fallback: do nothing (CSS override will still help)
        }
    }
}

// optionally expose simple setter for keyboard height CSS var
export function setKeyboardHeight(px) {
    document.documentElement.style.setProperty('--keyboard-height', `${px}px`)
}

// init listeners (call once in App.vue onMounted). Returns nothing; use disposeLayout to cleanup.
export function initLayout({ telegram = null, appSelector = '.app', headerSelector = '.app-header', menuSelector = '.menu' } = {}) {
    if (_initialized) return
    _initialized = true
    _tgInstance = telegram ?? null

    // window resize
    _windowResize = () => updateLayoutVars({ appSelector, headerSelector, menuSelector })
    window.addEventListener('resize', _windowResize)

    // visualViewport (soft keyboard / pinch)
    if (window.visualViewport) {
        _vvResize = () => {
            // set keyboard height var
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

    // DOM mutation observer on body.class to react to keyboard-open toggles
    _mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class') {
                updateLayoutVars({ appSelector, headerSelector, menuSelector })
            }
        }
    })
    _mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // Telegram SDK event wiring (defensive)
    try {
        if (_tgInstance && typeof _tgInstance.onEvent === 'function') {
            _tgListener = () => updateLayoutVars({ appSelector, headerSelector, menuSelector })
            _tgInstance.onEvent('viewportChanged', _tgListener)
        } else if (_tgInstance && typeof _tgInstance.on === 'function') {
            _tgListener = () => updateLayoutVars({ appSelector, headerSelector, menuSelector })
            _tgInstance.on('viewportChanged', _tgListener)
        }
    } catch (e) {
        _tgListener = null
    }

    // initial run
    updateLayoutVars({ appSelector, headerSelector, menuSelector })
}

// cleanup function — call in onBeforeUnmount of App.vue
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
            if (typeof _tgInstance.offEvent === 'function') _tgInstance.offEvent('viewportChanged', _tgListener)
            if (typeof _tgInstance.off === 'function') _tgInstance.off('viewportChanged', _tgListener)
        }
    } catch (e) { }

    // reset refs
    _vvResize = null; _vvScroll = null; _windowResize = null; _mutationObserver = null; _tgListener = null; _tgInstance = null
}
