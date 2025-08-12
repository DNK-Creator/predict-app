import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import { installGlobalErrorHandlers } from '@/services/debugLogger'
installGlobalErrorHandlers()

import "@fontsource/inter/200.css"; // thin
import "@fontsource/inter/400.css"; // regular
import "@fontsource/inter/600.css"; // bold

import "@fontsource/montserrat/400.css"; // regular

import App from './App.vue'
import router from './router'

import './assets/main.css'

const app = createApp(App)

app.config.errorHandler = (err, vm, info) => {
    // logs to vConsole via console.error
    console.error('[vue errorHandler]', err, info, vm)
    // also push to our history
    import('@/services/debugLogger').then(({ error }) => error('[vue errorHandler]', { err: err?.message, info, stack: err?.stack }))
}

app.use(Toast, {
    // global default timeout
    autoClose: 2000,        // toasts now disappear after 2 seconds
    hideProgressBar: false,
    closeOnClick: true,
    theme: 'dark'      // ← here’s the key
})

app.use(createPinia())
app.use(router)


app.mount('#app')
