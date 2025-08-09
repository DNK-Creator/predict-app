import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

import "@fontsource/inter/200.css"; // thin
import "@fontsource/inter/400.css"; // regular
import "@fontsource/inter/600.css"; // bold

import "@fontsource/montserrat/400.css"; // regular

import App from './App.vue'
import router from './router'

import './assets/main.css'

const app = createApp(App)

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
