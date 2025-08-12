<template>
    <button v-if="visible" :class="['debug-toggle', { active: isOpen }]" @click="toggleConsole"
        :title="isOpen ? 'Close dev console' : 'Open dev console'">
        🐞
    </button>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { replayHistory } from '@/services/debugLogger' // <-- new helper

// feature gate: visible in dev OR ?debug=1 OR localStorage.debugConsole === '1'
const urlParams = new URLSearchParams(window.location.search)
const visible = computed(() => {
    if (process.env.NODE_ENV === 'development') return true
    if (urlParams.get('debug') === '1') return true
    if (localStorage.getItem('debugConsole') === '1') return true
    return false
})

const isOpen = ref(false)
let vconsoleInstance = null

async function createVconsole() {
    if (vconsoleInstance) return vconsoleInstance
    try {
        // make sure vconsole is installed: npm i vconsole
        const mod = await import('vconsole') // dynamic import keeps bundle small
        const VConsole = mod?.default ?? mod
        vconsoleInstance = new VConsole({
            maxLogNumber: 2000,
            // you can customize plugins: defaultPlugins: ['system','network','element','storage']
        })

        // Replay previously collected logs (so app.init logs show up)
        try { replayHistory() } catch (e) { console.error('replayHistory failed', e) }

        // ensure it's visible right away
        try { vconsoleInstance.show() } catch (_) { /* vConsole opens by default on some builds */ }

        isOpen.value = true
        return vconsoleInstance
    } catch (err) {
        console.error('Failed to load vConsole:', err)
        throw err
    }
}

async function toggleConsole() {
    if (!vconsoleInstance) {
        await createVconsole()
        return
    }
    // destroy toggles it off
    try {
        vconsoleInstance.destroy()
    } catch (e) { /* ignore */ }
    vconsoleInstance = null
    isOpen.value = false
}

// auto-open if query param or localStorage set
onMounted(() => {
    if (!visible.value) return
    const shouldAutoOpen = urlParams.get('debug') === '1' || localStorage.getItem('debugConsole') === '1'
    if (shouldAutoOpen) {
        // don't await here — start creation but don't block render
        createVconsole().catch(() => { })
    }
})
</script>

<style scoped>
.debug-toggle {
    position: fixed;
    right: 12px;
    bottom: 84px;
    z-index: 2147483000;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    border: none;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    font-size: 18px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.debug-toggle.active {
    background: linear-gradient(180deg, #0f172a, #0b1220);
}
</style>
