<template>
    <div v-if="!hideMenu" ref="menuRoot" class="menu" role="navigation" aria-label="Main menu">
        <RouterLink to="/" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" :class="{ active: isActive }" @click="navigate" role="button"
                :aria-current="isActive ? 'page' : null" tabindex="0">
                <i class="fas fa-house icon" :aria-hidden="true"></i>
                <span class="menu-label">{{ $t('main-page') }}</span>
            </div>
        </RouterLink>

        <RouterLink to="/holidays" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" :class="{ active: isActive }" @click="navigate" role="button"
                :aria-current="isActive ? 'page' : null" tabindex="0">
                <i class="fas fa-calendar-days icon" :aria-hidden="true"></i>
                <span class="menu-label">{{ $t('holidays') }}</span>
            </div>
        </RouterLink>

        <RouterLink to="/profile" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" :class="{ active: isActive }" @click="navigate" role="button"
                :aria-current="isActive ? 'page' : null" tabindex="0">
                <i class="fas fa-user icon" :aria-hidden="true"></i>
                <span class="menu-label">{{ $t('profile') }}</span>
            </div>
        </RouterLink>

        <RouterLink to="/history" custom v-slot="{ isActive, navigate }">
            <div class="menu-item" :class="{ active: isActive }" @click="navigate" role="button"
                :aria-current="isActive ? 'page' : null" tabindex="0">
                <i class="fas fa-clock-rotate-left icon" :aria-hidden="true"></i>
                <span class="menu-label">{{ $t('history') }}</span>
            </div>
        </RouterLink>
    </div>
</template>

<script setup>
import { useRoute, RouterLink } from 'vue-router'
import { computed, watch, onMounted, nextTick, ref, onUpdated, onBeforeUnmount } from 'vue'

const route = useRoute()

// route names where we want the bottom navbar hidden (match your router names)
const menuHideRoutes = ['deposit', 'BetDetails', 'privacy', 'bets-history', 'gifts-prices']

const hideMenu = computed(() => menuHideRoutes.includes(route.name))

// ref to the menu root so we can measure it precisely
const menuRoot = ref(null)

// helper: compute how many pixels the menu visually occupies from bottom of app
function computeRequiredBottom() {
    try {
        const appEl = document.querySelector('.app') || document.documentElement
        const appRect = appEl.getBoundingClientRect()
        const el = menuRoot.value
        if (!el) return null
        const menuRect = el.getBoundingClientRect()
        // number of px from menu top down to bottom edge of app
        const requiredBottom = Math.max(0, Math.round(appRect.bottom - menuRect.top))
        return requiredBottom
    } catch (e) {
        return null
    }
}

// dispatch a deterministic event with the measured px (or just visibility)
async function emitMenuToggled() {
    // wait for DOM updates in this component first
    await nextTick()
    // measure
    const requiredBottom = computeRequiredBottom()
    window.dispatchEvent(new CustomEvent('menu-toggled', { detail: { visible: !hideMenu.value, requiredBottom } }))
}

// watch the computed so we emit when visibility toggles
watch(hideMenu, () => {
    emitMenuToggled()
})

// when the component mounts, emit initial state
onMounted(() => {
    emitMenuToggled()
})

// also emit after updates (in case style/layout changed)
onUpdated(() => {
    emitMenuToggled()
})

// cleanup: nothing special to do here for the event; App.vue should remove its listener
</script>



<style scoped>
/* ---------- container: glass panel ---------- */
.menu {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(15px + env(safe-area-inset-bottom, 0));
    width: min(520px, 92%);
    height: 76px;
    display: flex;
    justify-content: space-around;
    align-items: center;
    padding: 8px 12px;
    border-radius: 24px;
    z-index: 3;

    background: rgba(18, 23, 28, 0.82);
    border: none;
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    backdrop-filter: blur(10px) saturate(120%);
    box-shadow: 0 8px 24px rgba(6, 10, 16, 0.48);
    box-sizing: border-box;
}

/* ---------- menu item layout (no backgrounds) ---------- */
.menu-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    gap: 6px;
    width: 80px;
    padding: 6px 4px;
    border-radius: 12px;
    border: none;
    background: transparent;
    /* <-- explicit: no background */
    transition: transform 220ms cubic-bezier(.2, .9, .3, 1),
        box-shadow 220ms ease;
    /* removed background-color transition */
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    flex-shrink: 0;
    outline: none;
}

/* ---------- hover/press scale (subtle) ---------- */
@media (prefers-reduced-motion: no-preference) {
    .menu-item:hover {
        transform: translateY(-2px) scale(1.03);
    }

    .menu-item:active {
        transform: translateY(-1px) scale(0.995);
    }
}

/* ---------- active state (no background) ---------- */
.menu-item.active {
    transform: translateY(-2px) scale(1.04);
    background: transparent;
    /* ensure absolutely no background */
    box-shadow: 0 8px 22px rgba(12, 20, 30, 0.45);
}

/* ---------- icon & label ---------- */
.icon {
    font-size: 1.55rem;
    color: #9aa7b2;
    opacity: 0.95;
    transition: transform 180ms cubic-bezier(.2, .9, .3, 1), color 160ms ease, opacity 160ms ease;
    display: block;
    line-height: 1;
    transform-origin: center;
}

.menu-label {
    font-size: 0.78rem;
    color: #9aa7b2;
    opacity: 0.75;
    font-weight: 600;
    font-family: "Inter", sans-serif;
    transition: color 160ms ease, opacity 160ms ease;
    white-space: nowrap;
}

/* active icon + label color (subtle) */
.menu-item.active .icon,
.menu-item.active .menu-label {
    color: #ffffff;
    opacity: 1;
}

/* icon micro-scale on hover/active */
@media (prefers-reduced-motion: no-preference) {
    .menu-item:hover .icon {
        transform: scale(1.06);
    }

    .menu-item.active .icon {
        transform: scale(1.06);
    }
}

/* ---------- focus handling ---------- */
.menu-item:focus {
    outline: none;
    box-shadow: none;
}

.menu-item:focus-visible {
    box-shadow: 0 0 0 3px rgba(30, 130, 230, 0.12);
    border-radius: 12px;
}

@media (pointer: fine) {
    .menu-item:focus {
        box-shadow: none;
    }
}

/* ---------- responsive tweaks ---------- */
@media (max-width: 420px) {
    .menu {
        height: 70px;
        border-radius: 20px;
        padding: 6px 10px;
    }

    .menu-item {
        width: 68px;
    }

    .icon {
        font-size: 1.35rem;
    }

    .menu-label {
        font-size: 0.72rem;
    }
}

/* ---------- respects reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {

    .menu-item,
    .menu-item .icon,
    .menu-item .menu-label {
        transition: none !important;
    }
}
</style>
