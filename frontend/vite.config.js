import { fileURLToPath, URL } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import viteCompression from 'vite-plugin-compression';

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  },
  plugins: [
    vue(),
    nodePolyfills(),
    [viteCompression()],
  ],
  assetsInclude: ['**/*.tgs'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Core Vue libs
            if (id.match(/node_modules\/(vue|vue-router|pinia)\//)) {
              return 'vue-core'
            }
            // TON & auth
            if (id.match(/node_modules\/(@tonconnect|@ton\/core|@supabase|firebase)\//)) {
              return 'auth-ton'
            }
            // UI & animations
            if (id.match(/node_modules\/(lottie-web|canvas-confetti|vue3-toastify)\//)) {
              return 'ui-anim'
            }
            // Charts & compression
            if (id.match(/node_modules\/(chart\.js|pako|vite-plugin-compression)\//)) {
              return 'charts-compress'
            }
            // Date utilities and hashing
            if (id.match(/node_modules\/(date-fns|js-sha256)\//)) {
              return 'utils'
            }
            // Telegram bot runtime (only used in your build scripts, not the client)
            if (id.match(/node_modules\/telegraf\//)) {
              return 'telegraf'
            }
            // Defaults all other libs into vendor
            return 'vendor'
          }
        }
      }
    }
  },
})