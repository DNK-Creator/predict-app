<template>
    <div v-if="enabled" class="dev-safe-debug" :class="{ collapsed }">
        <div class="header" @click="collapsed = !collapsed">
            <strong>DEV SAFE DEBUG</strong>
            <div class="controls">
                <button @click.stop="copyReport">Copy</button>
                <button @click.stop="forceRefresh">Refresh</button>
                <button @click.stop="close">Close</button>
            </div>
        </div>

        <div v-if="!collapsed" class="body">
            <div class="col">
                <h4>CSS Vars</h4>
                <div class="row"><span>--app-top-offset</span><code>{{ cssVars['--app-top-offset'] }}</code></div>
                <div class="row"><span>--tg-safe-area-top</span><code>{{ cssVars['--tg-safe-area-top'] }}</code></div>
                <div class="row"><span>--tg-safe-area-bottom</span><code>{{ cssVars['--tg-safe-area-bottom'] }}</code>
                </div>
                <div class="row"><span>--keyboard-height</span><code>{{ cssVars['--keyboard-height'] }}</code></div>
                <div class="row"><span>--app-bottom-space</span><code>{{ cssVars['--app-bottom-space'] }}</code></div>
                <div class="row">
                    <span>--tg-viewport-stable-height</span><code>{{ cssVars['--tg-viewport-stable-height'] }}</code>
                </div>
            </div>

            <div class="col">
                <h4>Telegram.WebApp</h4>
                <div class="row"><span>platform</span><code>{{ tg.platform }}</code></div>
                <div class="row"><span>version</span><code>{{ tg.version }}</code></div>
                <div class="row"><span>isExpanded</span><code>{{ tg.isExpanded }}</code></div>
                <div class="row"><span>isFullscreen</span><code>{{ tg.isFullscreen }}</code></div>
                <div class="row"><span>viewportHeight</span><code>{{ tg.viewportHeight }}</code></div>
                <div class="row"><span>viewportStableHeight</span><code>{{ tg.viewportStableHeight }}</code></div>
                <div class="row"><span>requestFullscreen()</span><code>{{ tg.requestFullscreen ? 'yes' : 'no' }}</code>
                </div>
                <div class="row"><span>expand()</span><code>{{ tg.expand ? 'yes' : 'no' }}</code></div>
                <div class="row"><span>safeAreaInset</span><code>{{ tg.safeAreaInsetStr }}</code></div>
                <div class="row"><span>contentSafeAreaInset</span><code>{{ tg.contentSafeAreaInsetStr }}</code></div>
            </div>

            <div class="col wide">
                <h4>visualViewport / UA</h4>
                <div class="row"><span>visual.innerHeight</span><code>{{ vv.height }}</code></div>
                <div class="row"><span>visual.offsetTop</span><code>{{ vv.offsetTop }}</code></div>
                <div class="row"><span>window.innerHeight</span><code>{{ winInner }}</code></div>
                <div class="row"><span>userAgent</span><code class="ua">{{ ua }}</code></div>
            </div>

            <div class="footerNote">Updates on: visualViewport resize, orientationchange, and Telegram events
                (viewportChanged, safeAreaChanged, contentSafeAreaChanged, fullscreenChanged).</div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'

// enable heuristics: show only in non-production by default, but allow override via window.__DEV_SAFE_DEBUG === true
const envMode = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE) ? import.meta.env.MODE : (process && process.env && process.env.NODE_ENV ? process.env.NODE_ENV : 'production')
const enabledByEnv = envMode !== 'production'
const explicitOverride = typeof window !== 'undefined' && typeof window.__DEV_SAFE_DEBUG !== 'undefined' ? Boolean(window.__DEV_SAFE_DEBUG) : null
const enabled = explicitOverride === null ? enabledByEnv : explicitOverride

const collapsed = ref(false)
const visible = ref(enabled)

const cssVars = reactive({
    '--app-top-offset': '',
    '--tg-safe-area-top': '',
    '--tg-safe-area-bottom': '',
    '--keyboard-height': '',
    '--app-bottom-space': '',
    '--tg-viewport-stable-height': ''
})

const tg = reactive({
    platform: '',
    version: '',
    isExpanded: undefined,
    isFullscreen: undefined,
    viewportHeight: undefined,
    viewportStableHeight: undefined,
    requestFullscreen: null,
    expand: null,
    safeAreaInsetStr: '',
    contentSafeAreaInsetStr: ''
})

const vv = reactive({ height: null, offsetTop: null })
const winInner = ref(window.innerHeight)
const ua = navigator.userAgent

let interval = null
let vvHandlers = []
let tgHandlers = []

function readCssVars() {
    const s = getComputedStyle(document.documentElement)
    for (const k of Object.keys(cssVars)) {
        cssVars[k] = (s.getPropertyValue(k) || '').trim() || ''
    }
}

function readVisualViewport() {
    if (window.visualViewport) {
        vv.height = Math.round(window.visualViewport.height)
        vv.offsetTop = Math.round(window.visualViewport.offsetTop || 0)
    } else {
        vv.height = null
        vv.offsetTop = null
    }
    winInner.value = window.innerHeight
}

function readTelegram() {
    const W = window || {}
    const WebApp = W.Telegram && W.Telegram.WebApp ? W.Telegram.WebApp : null
    if (!WebApp) {
        tg.platform = 'no-telegram'
        tg.version = ''
        tg.isExpanded = false
        tg.isFullscreen = false
        tg.viewportHeight = undefined
        tg.viewportStableHeight = undefined
        tg.requestFullscreen = null
        tg.expand = null
        tg.safeAreaInsetStr = ''
        tg.contentSafeAreaInsetStr = ''
        return
    }

    try {
        tg.platform = WebApp.platform || ''
        tg.version = WebApp.version || ''
        tg.isExpanded = WebApp.isExpanded
        tg.isFullscreen = WebApp.isFullscreen
        tg.viewportHeight = WebApp.viewportHeight
        tg.viewportStableHeight = WebApp.viewportStableHeight
        tg.requestFullscreen = typeof WebApp.requestFullscreen === 'function'
        tg.expand = typeof WebApp.expand === 'function'
        tg.safeAreaInsetStr = JSON.stringify(WebApp.safeAreaInset || {})
        tg.contentSafeAreaInsetStr = JSON.stringify(WebApp.contentSafeAreaInset || {})
    } catch (e) {
        // ignore read errors
    }
}

function refresh() {
    readCssVars()
    readVisualViewport()
    readTelegram()
}

function forceRefresh() { refresh() }

function copyReport() {
    const report = {
        cssVars: { ...cssVars },
        telegram: { ...tg },
        visualViewport: { ...vv },
        windowInner: winInner.value,
        ua
    }
    try {
        navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    } catch (e) { /* ignore */ }
}

function close() { visible.value = false }

onMounted(() => {
    if (!enabled) return
    refresh()
    interval = setInterval(refresh, 400)

    // visualViewport listeners
    if (window.visualViewport) {
        const onVV = () => refresh()
        window.visualViewport.addEventListener('resize', onVV)
        window.visualViewport.addEventListener('scroll', onVV)
        vvHandlers.push(() => { window.visualViewport.removeEventListener('resize', onVV); window.visualViewport.removeEventListener('scroll', onVV) })
    }

    // orientationchange
    const onOrient = () => setTimeout(refresh, 80)
    window.addEventListener('orientationchange', onOrient)
    vvHandlers.push(() => window.removeEventListener('orientationchange', onOrient))

    // Telegram event listeners (defensive)
    try {
        const WebApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null
        if (WebApp) {
            const handler = function (ev, params) {
                // just refresh — this is a dev overlay
                try { refresh() } catch (e) { }
            }
            if (typeof WebApp.onEvent === 'function') {
                const events = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'fullscreenFailed', 'activated', 'deactivated']
                for (const e of events) WebApp.onEvent(e, handler)
                tgHandlers.push(() => { for (const e of events) WebApp.offEvent && WebApp.offEvent(e, handler) })
            } else if (typeof WebApp.on === 'function') {
                const events = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'fullscreenFailed', 'activated', 'deactivated']
                for (const e of events) WebApp.on(e, handler)
                tgHandlers.push(() => { for (const e of events) WebApp.off && WebApp.off(e, handler) })
            }
        }
    } catch (e) { /* ignore */ }
})

onBeforeUnmount(() => {
    if (interval) clearInterval(interval)
    for (const fn of vvHandlers) try { fn() } catch (e) { }
    for (const fn of tgHandlers) try { fn() } catch (e) { }
})
</script>

<style scoped>
.dev-safe-debug {
    position: fixed;
    left: 8px;
    bottom: 8px;
    width: 360px;
    max-width: calc(100% - 16px);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    padding: 0;
    border-radius: 8px;
    z-index: 999999;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    pointer-events: auto;
}

.dev-safe-debug .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
    cursor: pointer;
}

.dev-safe-debug .header strong {
    font-size: 12px
}

.dev-safe-debug .controls {
    display: flex;
    gap: 6px
}

.dev-safe-debug button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #fff;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px
}

.dev-safe-debug .body {
    padding: 8px 10px;
    display: flex;
    gap: 10px;
}

.dev-safe-debug .col {
    flex: 1;
    min-width: 0
}

.dev-safe-debug .col.wide {
    flex: 1.4
}

.dev-safe-debug h4 {
    margin: 0 0 6px 0;
    font-size: 11px;
    color: #ddd
}

.dev-safe-debug .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    margin: 4px 0
}

.dev-safe-debug .row span {
    color: #bbb;
    font-size: 11px
}

.dev-safe-debug code {
    background: rgba(255, 255, 255, 0.02);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis
}

.dev-safe-debug .ua {
    max-width: 160px
}

.dev-safe-debug .footerNote {
    font-size: 10px;
    color: #999;
    margin-top: 8px
}

.dev-safe-debug.collapsed {
    width: 200px
}

.dev-safe-debug.collapsed .body {
    display: none
}
</style>
