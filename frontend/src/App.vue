<template>
  <Header :balance="app.points" @deposit-click="openDepositHistory" @settings-click="openSettings" />

  <div class="app-scroll-container">
    <RouterView v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </RouterView>
  </div>

  <!-- SETTINGS MODAL & BLUR OVERLAY -->
  <SettingsModal :show="showSettings" @close="closeSettings" />

  <Navbar />
</template>

<script setup>
import { useRouter, RouterView } from 'vue-router'
import { onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/appStore.js'
import { useTelegram } from '@/services/telegram.js'
import Navbar from './components/Navbar.vue'
import Header from './components/Header.vue'
import SettingsModal from './components/SettingsModal.vue'

const loaded = ref(false)
const app = useAppStore()

const { tg } = useTelegram()

const showSettings = ref(false)

const urlParams = new URLSearchParams(window.location.search)

const router = useRouter()

function openDepositHistory() {
  router.push({ name: 'deposit' })
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

onMounted(async () => {
  tg.ready()
  tg.expand()
  await app.init(urlParams.get('ref')).then(() => {
    loaded.value = true
  })
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
/* since your base is zero,
   fade-enter-from == overlay (0), fade-enter-to == overlay--visible (10px+0.7) */
.fade-leave-to {
  /* leave-to must match the base (zero) */
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