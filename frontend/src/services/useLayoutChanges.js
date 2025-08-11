// src/composables/useLayoutChanges.js
// lightweight composable — no Vue reactivity required here (pure DOM + CSS var helpers)

let _vvResize = null
let _vvScroll = null
let _windowResize = null
let _mutationObserver = null
let _tgListener = null
let _initialized = false
let _tgInstance = null

export function updateLayoutVars({ appSelector = '.app', headerSelector = '.app-header', menuSelector = '.menu', safety = 8 } = {}) {
    const appEl = document.querySelector(appSelector) || document.documentElement
    const headerEl = document.querySelector(headerSelector)
    const menuEl = document.querySelector(menuSelector)

    // header height
    const headerH = headerEl ? headerEl.offsetHeight : 56
    document.documentElement.style.setProperty('--app-header-height', `${headerH}px`)

    // compute bottom space required by measuring geometry
    if (menuEl && appEl) {
        const appRect = appEl.getBoundingClientRect()
        const menuRect = menuEl.getBoundingClientRect()
        let requiredBottom = Math.max(0, Math.round(appRect.bottom - menuRect.top))

        if (document.body.classList.contains('keyboard-open')) {
            requiredBottom = 0
        }

        requiredBottom += safety
        document.documentElement.style.setProperty('--app-bottom-space', `${requiredBottom}px`)
    } else {
        // no visible floating menu — reserve just the device safe-area bottom + a tiny safety margin
        document.documentElement.style.setProperty('--app-bottom-space', 'calc(env(safe-area-inset-bottom, 0px) + 12px)')
    }

    // Try to set Telegram viewport var too (non-fatal)
    try {
        const stable = (_tgInstance?.viewportStableHeight) ?? (_tgInstance?.viewportHeight)
        if (typeof stable === 'number') {
            document.documentElement.style.setProperty('--tg-viewport-stable-height', `${stable}px`)
        } else {
            document.documentElement.style.setProperty('--tg-viewport-stable-height', `${window.innerHeight}px`)
        }
    } catch (e) {
        document.documentElement.style.setProperty('--tg-viewport-stable-height', `${window.innerHeight}px`)
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

    try {
        if (_tgInstance && _tgListener) {
            if (typeof _tgInstance.offEvent === 'function') _tgInstance.offEvent('viewportChanged', _tgListener)
            if (typeof _tgInstance.off === 'function') _tgInstance.off('viewportChanged', _tgListener)
        }
    } catch (e) { }

    // reset refs
    _vvResize = null; _vvScroll = null; _windowResize = null; _mutationObserver = null; _tgListener = null; _tgInstance = null
}
