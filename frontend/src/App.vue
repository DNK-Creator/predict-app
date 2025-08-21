<template>
  <!-- App shell: RouterView always mounted so pages can render while loader is visible -->
  <div class="app">
    <!-- MAIN SCROLL CONTAINER -->
    <div class="app-scroll-container" ref="appScrollRef">
      <Header :balance="app.points" :address="walletAddress" @deposit-click="openDepositWindow"
        @settings-click="openSettings" @wallet-connect="reconnectWallet" />

      <!-- RouterView always mounted. keep-alive preserved. -->
      <RouterView v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </RouterView>
    </div>

    <!-- SETTINGS MODAL & BLUR OVERLAY -->
    <SettingsModal :show="showSettings" @close="closeSettings" @open-privacy="openPrivacy"
      @open-support="openSupport" />

    <Navbar />
  </div>

  <!-- OVERLAY (covers entire app while appDataLoading or overlayVisible is true) -->
  <transition name="overlay-fade" @after-leave="onOverlayHidden">
    <div v-show="overlayVisible" class="app-overlay" aria-hidden="true" role="presentation">
      <!-- Centered loader - reuse your AppLoader. Keep loader visible while overlayShown -->
      <div class="app-overlay__center">
        <AppLoader :stage="loadingStage" />
      </div>
    </div>
  </transition>

  <TutorialOverlay :show="showTutorialOverlay" :images="tutorialImages" :tgsFiles="[null, null, DuckMedia]"
    @close="closeTutorial" @finished="onTutorialFinished" />

  <ChannelFollowModal :show="showChannelFollowModal" channel="@giftspredict" @close="closeChannelModal"
    @subscribe="onSubscribeToChannel" />

</template>

<script setup>
import { useRouter, useRoute, RouterView } from 'vue-router'
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue'
// at top of App.vue script setup
import { debug, info, warn, error, group, groupEnd, wrapAsync, installGlobalErrorHandlers } from '@/services/debugLogger'
import { initLayout, disposeLayout, updateLayoutVars } from '@/services/useLayoutChanges' // ensure updateLayoutVars is exported
import { getReferralFromUrl } from './services/urlParamsParse'
import { userFirstTimeOpening } from './api/requests'
import { useAppStore } from '@/stores/appStore.js'
import { useTelegram } from '@/services/telegram.js'
import { getTonConnect } from '@/services/ton-connect-ui'
import { Address } from '@ton/core'
import supabase from './services/supabase'
import Navbar from './components/Navbar.vue'
import Header from './components/Header.vue'
import SettingsModal from './components/SettingsModal.vue'
import AppLoader from './components/AppLoader.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import ChannelFollowModal from './components/ChannelFollowModal.vue'

const appDataLoading = ref(true)
const loadingStage = ref(0)
const app = useAppStore()

const DuckMedia = ref('https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/DuckClicking.tgs')

const { user, tg } = useTelegram()

const showSettings = ref(false)

const router = useRouter()

const route = useRoute()

const API_BASE = 'https://api.giftspredict.ru'

const userFirstTime = ref(false)
const userFollowsChannel = ref(false)

const walletAddress = computed(() => {
  return app.walletAddress ?? null
})

const overlayVisible = ref(true)          // initially true so loader overlay blocks page on cold start
const overlayShownAt = ref(Date.now())   // timestamp when overlay was shown (for min visible time)

const MIN_OVERLAY_VISIBLE_MS = 450  // ensure overlay visible at least this long (tweak as needed)
const EXTRA_PAINT_FRAMES = 2        // number of requestAnimationFrame steps to wait for paint
const SAFETY_TIMEOUT = 60           // small timeout (ms) to give the browser a bit more time

/* ---------- new: UI state for the two overlays ---------- */
const showTutorialOverlay = ref(false)
const showChannelFollowModal = ref(false)

/* ---------- Tutorial configuration ---------- */
/*
 Replace these with the actual tutorial image paths in your project.
 If your images are in /src/assets/tutorial1.png you can use:
   import t1 from '@/assets/tutorial1.png'
 or just provide absolute/relative URLs if served from public/.
*/
const tutorialImages = [
  'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/PromoTutorialFirst.png',
  'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/gifts-images/PhoneDepositPng.png',
  'https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/LipsDay.png'
]

// helper to preload and confirm caching
function preloadTutorialImages(urls) {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ src, ok: true })
          img.onerror = () => resolve({ src, ok: false })
          img.src = src
        })
    )
  )
}


const currentTutorialIndex = ref(0)
const isLastTutorialStep = computed(() => currentTutorialIndex.value === (tutorialImages.length - 1))

/* ---------- helper functions for overlays ---------- */
async function openTutorial() {
  currentTutorialIndex.value = 0
  showTutorialOverlay.value = true
}

function closeTutorial() {
  showTutorialOverlay.value = false
  // optional: persist that user saw tutorial (so userFirstTime stays false next time)
  // await supabase.from('users').update({ seen_tutorial: true }).eq('telegram', user?.id ?? 99)
}

function onTutorialFinished() {
  // Called when the user clicked "Я готов!" on the last step
  userFirstTime.value = false
  showTutorialOverlay.value = false
  // Optionally persist the seen_tutorial flag to supabase here
}

/* ---------- channel modal handlers ---------- */
function closeChannelModal() {
  showChannelFollowModal.value = false
}

/* Clicking subscribe should try to open the channel and then close modal.
   Optionally you may want to re-check membership afterwards with checkChannelMembership()
*/
async function onSubscribeToChannel() {
  try {
    // try to open channel: prefer tg native (if available)
    try {
      tg.openTelegramLink('https://t.me/giftspredict')
    } catch (e) {
      // fallback
      window.open('https://t.me/giftspredict', '_blank')
    }

    // Give user a moment to subscribe (you might call checkChannelMembership again after a short delay).
    // For now, close the modal and mark as "not shown".
    showChannelFollowModal.value = false
    // Optionally re-check membership:
    // userFollowsChannel.value = await checkChannelMembership()
  } catch (err) {
    console.error('Failed to open channel link', err)
    showChannelFollowModal.value = false
  }
}


// Wait for a couple of frames and a small timeout to ensure rendering is painted.
// Returns a promise that resolves once we believe the route is painted.
// This is intentionally conservative to avoid "semi-page" flashes.
async function waitForPaint() {
  // ensure DOM updates flushed
  await nextTick()

  // wait for N consecutive rAF frames
  await new Promise((resolve) => {
    let frames = 0
    const loop = () => {
      frames += 1
      if (frames >= EXTRA_PAINT_FRAMES) {
        return resolve()
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })

  // small safety timeout to let images / webfonts kick in (very short)
  await new Promise((r) => setTimeout(r, SAFETY_TIMEOUT))
}

// Called when we want to hide the overlay but ensure the page is painted first.
// Ensures a minimum visible time (so very quick operations don't cause flicker).
async function hideOverlayWhenReady() {
  const elapsed = Date.now() - overlayShownAt.value
  if (elapsed < MIN_OVERLAY_VISIBLE_MS) {
    await new Promise((r) => setTimeout(r, MIN_OVERLAY_VISIBLE_MS - elapsed))
  }

  // Wait for the route component to mount + paint
  await waitForPaint()

  // Finally hide overlay (triggers transition)
  overlayVisible.value = false
}

async function onOverlayHidden() {
  // small safety: ensure scroller reset to top after overlay gone
  if (appScrollRef.value) {
    try { appScrollRef.value.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch (e) { appScrollRef.value.scrollTop = 0 }
  }

  // Give DOM a tick
  await nextTick()

  // If tutorial was already prepared and shown earlier, don't try to reopen it
  if (showTutorialOverlay.value) {
    // tutorial already visible (it was prepared before overlay hide) — keep it and do nothing
    return
  }

  // If user is first-time but tutorial wasn't prepared for some reason, show it now
  if (userFirstTime.value) {
    openTutorial()
    showChannelFollowModal.value = false
    return
  }

  // not first time -> if user does NOT follow the channel -> show channel follow modal
  if (!userFollowsChannel.value) {
    showChannelFollowModal.value = true
  }
}

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

async function reconnectWallet() {
  ton.value = getTonConnect();

  // If already connected, drop the session
  if (ton.value.connected) {
    app.walletAddress = null
    await ton.value.disconnect()

    const { error } = await supabase
      .from('users')
      .update({ wallet_address: null })
      .eq('telegram', user?.id ?? 99)
    if (error) {
      console.error('Error updating wallet_address:', error)
    }

  }
  // Then always open the wallet selector
  const wallet = await ton.value.connectWallet()
  if (wallet) {
    await handleConnected(wallet)
  }
}

// add this helper near the other functions
async function handleConnected(wallet) {
  // normalize address
  app.walletAddress = wallet?.account?.address || null

  let parsedAddress = null
  if (app.walletAddress !== null) {
    try {
      parsedAddress = (Address.parse(app.walletAddress)).toString({ urlSafe: true, bounceable: false })
    } catch (err) {
      console.warn('Failed to parse address', err)
    }
  }

  // update Supabase users.wallet_address (keep your previous logic)
  if (user || !user) {
    const { error } = await supabase
      .from('users')
      .update({ wallet_address: parsedAddress })
      .eq('telegram', user?.id ?? 99)
    if (error) {
      console.error('Error updating wallet_address:', error)
    }
  }
}

function openDepositWindow() {
  router.push({ name: 'profile' })
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
const ROUTES_SHOW_BACK_BUTTON = new Set(['BetDetails', 'deposit', 'privacy', 'bets-history', 'gifts-prices'])

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

// ---------------------
// Backend-backed channel membership check
// ---------------------
async function checkChannelMembership() {
  // user may be null/undefined; we'll still call backend with a missing id check
  const userId = encodeURIComponent(String(user?.id ?? ''));

  if (!userId) {
    // If you prefer: return false silently instead of hitting backend
    console.warn('checkChannelMembership called without user id');
    return false;
  }

  try {
    const url = `${API_BASE}/api/channelMembership?userId=${userId}`;
    const resp = await fetch(url, { credentials: 'include' }); // include credentials if your API uses cookies
    if (!resp.ok) {
      // try to show any helpful server error, but return false to the caller
      const body = await resp.json().catch(() => null);
      console.error('Membership endpoint error', resp.status, body);
      return false;
    }

    const json = await resp.json().catch(() => null);
    if (!json || typeof json.isMember !== 'boolean') {
      console.error('Unexpected response shape from membership endpoint', json);
      return false;
    }

    return json.isMember;
  } catch (err) {
    console.error('checkChannelMembership error', err);
    return false;
  }
}

onMounted(async () => {
  installGlobalErrorHandlers()

  debug('[App] onMounted start', { location: window.location.href })

  window.addEventListener('menu-toggled', handleMenuToggled);
  const appEl = document.querySelector('.app') || document.documentElement;
  const mo = new MutationObserver((mutations) => { handleMenuToggled(); });
  mo.observe(appEl, { childList: true, subtree: true });
  __menuMo = mo;

  // Attempt to ready/expand Telegram early — log failures
  try {
    debug('[App] waiting for tg.ready() (if available)')
    await (tg?.ready?.() ?? Promise.resolve())
    info('[App] tg.ready() resolved')
  } catch (e) {
    warn('[App] tg.ready() failed or threw', { err: e?.message ?? e, stack: e?.stack })
  }

  loadingStage.value = 1

  try {
    debug('[App] calling tg.expand() (if available)')
    await (tg?.expand?.() ?? Promise.resolve())
    info('[App] tg.expand() ok')
  } catch (e) {
    warn('[App] tg.expand() failed', { err: e?.message ?? e })
  }

  loadingStage.value = 2

  try {
    // pass user id if you have it; else userFirstTimeOpening will use the current user from useTelegram()
    const isFirst = await userFirstTimeOpening(user?.id ?? 99)
    userFirstTime.value = Boolean(isFirst)
    debug('[App] userFirstTime set', { userFirstTime: userFirstTime.value })
  } catch (e) {
    // Conservative fallback: not first time (do not block init)
    console.error('[App] userFirstTimeOpening failed, defaulting to false', e)
    userFirstTime.value = false
  }

  if (userFirstTime.value === false) {
    try {
      // pass user id if you have it; else userFirstTimeOpening will use the current user from useTelegram()
      const followsChannel = await checkChannelMembership()
      userFollowsChannel.value = Boolean(followsChannel)
    } catch (e) {
      // Conservative fallback: not first time (do not block init)
      console.error('[App] userChannelMembership check failed, defaulting to false', e)
      userFollowsChannel.value = false
    }
  }

  // If user is first-time, prepare & show the tutorial overlay *early*
  if (userFirstTime.value) {
    // Preload images so they appear instantly when overlay fades
    const results = await preloadTutorialImages(tutorialImages)
    console.log('Preloaded tutorial images:', results)

    // you could also delay showing the tutorial until they are ready:
    showTutorialOverlay.value = results.every(r => r.ok)

    // We do NOT open channel modal in this case — tutorial is superior
    showChannelFollowModal.value = false
  }

  // visualViewport settle wait
  debug('[App] waiting for visualViewport settle (180ms max)')
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
  info('[App] visualViewport settled (or timeout)')

  // init layout subsystem, measure/layout
  try {
    initLayout({ telegram: tg })
    debug('[App] initLayout called')
    updateLayoutVars()
    debug('[App] updateLayoutVars initial call done', {
      tgViewportStable: getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-stable-height')
    })
  } catch (e) {
    warn('[App] layout init failed', { err: e?.message ?? e, stack: e?.stack })
  }

  // attach visualViewport resize -> updateLayoutVars
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLayoutVars)
    info('[App] visualViewport resize handler attached')
  }
  window.addEventListener('orientationchange', updateLayoutVars)

  loadingStage.value = 3

  const referral = getReferralFromUrl({ tgInstance: tg, persist: true }) // returns Number or null
  info('[App] referral detected', { referral })

  // Make app.init observable/wrapped so errors/time reported
  const wrappedInit = wrapAsync(app.init.bind(app), 'app.init')
  try {
    group('[App] app.init')
    const t0 = Date.now()
    await wrappedInit(referral)
    info('[App] app.init completed', { durationMs: Date.now() - t0, userTelegram: app.user?.telegram })
  } catch (err) {
    error('[App] app.init failed', { err: (err && (err.message || String(err))) ?? err, stack: err?.stack })
    // optional: rethrow or show UI
  } finally {
    groupEnd()
  }

  loadingStage.value = 4

  // set initial state for current route
  updateBackButtonForRoute(router.currentRoute.value)

  // update on each navigation
  _removeBackHandler = router.afterEach((to) => updateBackButtonForRoute(to))

  // ensure initial state starts at the top
  if (appScrollRef.value) {
    appScrollRef.value.scrollTop = 0
    debug('[App] scroller reset to top')
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
  debug('[App] onMounted done')

  // When you decide you finished loading, instead of setting appDataLoading=false directly,
  // leave appDataLoading for any logic that depends on it, but ensure overlay hide waits for paint:
  loadingStage.value = 5

  // mark when overlay was shown (so minimum visible time is honored)
  overlayShownAt.value = Date.now()

  // ensure any final microtasks done, then begin hide sequence
  // (your previous code used: setTimeout(() => { appDataLoading.value = false }, 700);
  //  you can keep that if you need minimum loader time - here we call hide logic)
  setTimeout(() => {
    // mark that data is loaded — keep this for any other logic that depends on appDataLoading
    appDataLoading.value = false

    // then start the conservative hide routine which waits for router view to paint
    hideOverlayWhenReady().catch((e) => {
      // always hide overlay even on errors after fallback small timeout
      setTimeout(() => { overlayVisible.value = false }, 250)
      console.error('hideOverlayWhenReady failed', e)
    })
  }, 500);
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
/* overlay styles - absolutely cover the app and center loader */
.app-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  /* put above everything */
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 1);
  /* transparent base so underlying page can still be measured during paint */
  pointer-events: auto;
}

/* center wrapper for loader - keeps loader centered and stacked in overlay */
.app-overlay__center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* fade transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 360ms cubic-bezier(.22, .9, .32, 1), transform 360ms ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.overlay-fade-enter-to,
.overlay-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* When overlay is hidden we disable pointer events so the page receives interaction */
.app-overlay[style*="display: none"],
.app-overlay[aria-hidden="true"][v-cloak] {
  pointer-events: none;
}

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
