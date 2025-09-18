import { fileURLToPath, URL } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import viteCompression from 'vite-plugin-compression';

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
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
  }
})