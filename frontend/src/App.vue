<template>
  <!-- add ref here so we can programmatically reset scrollTop -->
  <div class="app-scroll-container" ref="appScrollRef">
    <Header :balance="app.points" @deposit-click="openDepositHistory" @settings-click="openSettings" />
    <RouterView v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </RouterView>
  </div>

  <!-- SETTINGS MODAL & BLUR OVERLAY -->
  <SettingsModal :show="showSettings" @close="closeSettings" @open-privacy="openPrivacy" @open-support="openSupport" />

  <Navbar />
</template>

<script setup>
import { useRouter, useRoute, RouterView } from 'vue-router'
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { initLayout, disposeLayout, updateLayoutVars } from '@/services/useLayoutChanges' // ensure updateLayoutVars is exported
import { getReferralFromUrl } from './services/urlParamsParse'
import { useAppStore } from '@/stores/appStore.js'
import { useTelegram } from '@/services/telegram.js'
import Navbar from './components/Navbar.vue'
import Header from './components/Header.vue'
import SettingsModal from './components/SettingsModal.vue'

const loaded = ref(false)
const app = useAppStore()

const { tg } = useTelegram()

const showSettings = ref(false)

const router = useRouter()

const route = useRoute()

// handler that ensures DOM updated + painted before measuring
function handleMenuToggled(e) {
  // defensive: event may be CustomEvent or called without event
  const detail = e?.detail ?? {}
  // if the Navbar provided a direct measured pixel, use it right away
  if (typeof detail.requiredBottom === 'number') {
    // set the CSS var to exactly this px (no extra env() addition — measurement already includes everything)
    document.documentElement.style.setProperty('--app-bottom-space', `${detail.requiredBottom}px`)
    // ensure any keyboard var remains respected: keyboard var is separate in CSS
    return
  }

  // fallback: attempt to recalc via updateLayoutVars (if available)
  // wait for DOM update then call updateLayoutVars
  nextTick(() => {
    requestAnimationFrame(() => {
      try {
        updateLayoutVars?.() // call if exported; if not, you can call your local fallback
      } catch (err) { /* ignore */ }
    })
  })
}

// watch route name changes and recalc layout after DOM update
watch(
  () => route.name,
  async () => {
    await nextTick()
    // a short RAF can still help on mobile
    requestAnimationFrame(() => {
      try { updateLayoutVars() } catch (e) { }
    })
  }
)

function openDepositHistory() {
  router.push({ name: 'deposit' })
}

function openPrivacy() {
  // navigate to the privacy route — RouterView will render PrivacyView
  router.push({ name: 'privacy' }).catch(() => { })
  // close settings modal if open
  closeSettings()
}

function openSupport() {
  try {
    tg.openTelegramLink('https://t.me/giftspredict_support')
  } catch (e) {
    // fallback: open share link in new tab
    window.open('https://t.me/giftspredict_support', '_blank')
  }
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

/* -------------------------
   NEW: ref for scroll container
   ------------------------- */
const appScrollRef = ref(null)
let removeAfterHook = null

// near the top of your <script setup>
let __menuMo = null

// keep a reference to the current back handler so we can offClick it later
let _removeBackHandler = null
let _backHandler = null
// routes where we want Telegram's back button visible
const ROUTES_SHOW_BACK_BUTTON = new Set(['BetDetails', 'deposit', 'privacy', 'bets-history'])

function enableTelegramBackButton() {
  if (!tg?.BackButton) return

  // remove any previous handler (defensive)
  try { if (_backHandler) tg.BackButton.offClick?.(_backHandler) } catch (e) { /* ignore */ }

  // create new handler that routes back in-app
  _backHandler = () => {
    // If your app uses a more specific navigation logic, adapt this:
    // e.g. router.back() or router.push({ name: 'bets' })
    try {
      // prefer router.back so browser history works naturally
      router.back()
    } catch (e) {
      // fallback to go to main bets view if back fails
      router.push({ name: 'bets' }).catch(() => { })
    }
  }

  // register handler then show the button
  try { tg.BackButton.onClick?.(_backHandler) } catch (e) { /* ignore */ }
  try { tg.BackButton.show?.() } catch (e) { /* ignore */ }
}

function disableTelegramBackButton() {
  if (!tg?.BackButton) return

  // hide the button and remove click handler
  try { tg.BackButton.hide?.() } catch (e) { /* ignore */ }
  try {
    if (_backHandler) {
      tg.BackButton.offClick?.(_backHandler)
      _backHandler = null
    }
  } catch (e) { /* ignore */ }
}

// call on each route change to show/hide button as needed
function updateBackButtonForRoute(route) {
  const name = route?.name ?? (route?.matched && route.matched[0]?.name) ?? ''
  if (ROUTES_SHOW_BACK_BUTTON.has(name)) {
    enableTelegramBackButton()
  } else {
    disableTelegramBackButton()
  }
}

const urlParams = new URLSearchParams(window.location.search)

onMounted(async () => {
  window.addEventListener('menu-toggled', handleMenuToggled);
  const appEl = document.querySelector('.app') || document.documentElement;
  const mo = new MutationObserver((mutations) => { handleMenuToggled(); });
  mo.observe(appEl, { childList: true, subtree: true });
  __menuMo = mo;

  // Wait for Telegram to be ready and attempt to expand BEFORE initial layout measurement
  try { await tg?.ready?.(); } catch (e) { /* ignore */ }
  try { await tg?.expand?.(); } catch (e) { /* ignore */ }

  // Wait for visualViewport to settle OR fallback to short timeout
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const cleanup = () => {
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', finish);
      window.removeEventListener('orientationchange', finish);
      clearTimeout(timer);
    };

    // prefer the visualViewport resize event (fires when host UI changes)
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', finish);
      window.addEventListener('orientationchange', finish);
    }

    // always fallback if no event or it doesn't fire quickly
    const timer = setTimeout(finish, 180); // 120-250ms is a good sweet spot
  });

  // Now initialise layout (listeners etc.) and do the first measurement
  initLayout({ telegram: tg });
  try { updateLayoutVars(); } catch (e) { /* ignore */ }

  // make visualViewport trigger layout recalcs going forward
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLayoutVars);
  }
  window.addEventListener('orientationchange', updateLayoutVars);

  try { await tg?.ready?.() } catch (e) { }
  try { tg?.expand?.() } catch (e) { }

  const referral = getReferralFromUrl() // returns Number or null
  console.info('[App] referral detected:', referral)

  try {
    // pass referral (number or null) directly
    await app.init(referral)
    loaded.value = true
  } catch (err) {
    console.error('[App] app.init failed', err)
  }

  // set initial state for current route
  updateBackButtonForRoute(router.currentRoute.value)

  // update on each navigation
  _removeBackHandler = router.afterEach((to) => updateBackButtonForRoute(to))

  // ensure initial state starts at the top
  if (appScrollRef.value) {
    appScrollRef.value.scrollTop = 0
  }

  removeAfterHook = router.afterEach((to) => {
    // Wait for Vue DOM update, then measure — wrapped in RAF for extra safety
    nextTick(() => {
      requestAnimationFrame(() => {
        // Reset the custom scroll container position (your existing logic)
        if (appScrollRef.value) {
          try {
            appScrollRef.value.scrollTo({ top: 0, left: 0, behavior: 'auto' })
          } catch (e) {
            appScrollRef.value.scrollTop = 0
          }
        }

        // Recalculate layout AFTER DOM updates (menu/header v-if changes)
        try {
          updateLayoutVars()
        } catch (e) {
          // ignore errors
        }
      })
    })
  })
})

// cleanup at top-level
onBeforeUnmount(() => {
  if (typeof _removeBackHandler === 'function') _removeBackHandler()   // cleanup router hook
  disableTelegramBackButton()   // ensure Telegram button state cleaned up

  disposeLayout()

  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateLayoutVars);
  }
  window.removeEventListener('orientationchange', updateLayoutVars);

  window.removeEventListener('menu-toggled', handleMenuToggled)
  try {
    if (__menuMo) __menuMo.disconnect()
    __menuMo = null
  } catch (e) { }
})
</script>

<style lang="css" scoped>
/* base overlay = fully dark + blurred */
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
  z-index: 10;
}

.overlay--visible {
  background-color: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(3px);
}

/* Modal container, 45vh tall, pinned bottom */
.settings-modal {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 45vh;
  background: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 1rem;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 12;
}

/* FADE TRANSITION FOR OVERLAY OPACITY */
.fade-enter-active,
.fade-leave-active {
  transition:
    background-color 300ms ease-out,
    backdrop-filter 300ms ease-out;
}

/* transition on both props */
.fade-enter-active,
.fade-leave-active {
  transition:
    background-color 300ms ease-out,
    backdrop-filter 300ms ease-out;
}

/* override on enter-from & leave-to → “start at zero” */
.fade-enter-from,
.fade-leave-to {
  background-color: rgba(0, 0, 0, 0);
  backdrop-filter: blur(0px);
}

/* SLIDE-UP TRANSITION FOR MODAL */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 300ms ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.slide-up-enter-to,
.slide-up-leave-from {
  transform: translateY(0%);
}

.app-scroll-container {
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* hide in IE/Edge */

  /* enable scrolling */
  overflow-y: auto;

  /* hide scrollbar in WebKit browsers */
  -webkit-overflow-scrolling: touch;
  /* smooth on iOS */
}

.app-scroll-container::-webkit-scrollbar {
  width: 0;
  height: 0;
}
</style>
