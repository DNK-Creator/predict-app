import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

import App from './App.vue'
import router from './router'

import "@fontsource-variable/inter";       // defaults to the wght axis (100–900)
import "@fontsource-variable/inter/wght.css";  // explicit wght axis

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
