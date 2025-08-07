import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import "@fontsource-variable/inter";       // defaults to the wght axis (100–900)
import "@fontsource-variable/inter/wght.css";  // explicit wght axis

import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)


app.mount('#app')
