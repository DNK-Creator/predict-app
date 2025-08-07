import { fileURLToPath, URL } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import viteCompression from 'vite-plugin-compression';

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
            // All vendor code (deps) in node_modules goes into `vendor.[hash].js`
            return 'vendor';
          }
          if (id.includes('src/components/bet-details')) {
            // Group all chart-related code
            return 'bet-details';
          }
          if (id.includes('src/components/user-profile')) {
            // Group all chart-related code
            return 'user-profile';
          }
          // Add more rules as needed...
        }
      }
    }
  },
})