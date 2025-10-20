import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { installGlobalErrorHandlers } from '@/services/debugLogger'
import { watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import Toast from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

import "@fontsource/inter/200.css"
import "@fontsource/inter/400.css"
import "@fontsource/inter/600.css"

import "@fontsource/montserrat/400.css"

import '@fontsource/press-start-2p'

import App from './App.vue'
import router from './router'

import ru from './locales/ru.json'
import en from './locales/en.json'

import './assets/main.css'

installGlobalErrorHandlers()

const i18n = createI18n({
    legacy: false,
    locale: 'en',        // default
    fallbackLocale: 'ru',
    messages: {
        ru,
        en
    }
})

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)
app.use(Toast, {
    // global default timeout
    autoClose: 2000,        // toasts now disappear after 2 seconds
    hideProgressBar: false,
    closeOnClick: true,
    theme: 'dark'      // ← here’s the key
})

// wire store language -> i18n
const normalizeLangCode = (lc) => {
    if (!lc) return 'en'
    if (typeof lc !== 'string') return 'en'
    return lc.split('-')[0].toLowerCase()
}

const store = useAppStore()

// set initial i18n locale from store (store.language default is "en")
i18n.global.locale.value = normalizeLangCode(store.language ?? 'en')
document.documentElement.lang = i18n.global.locale.value

// watch for language changes in the store and update i18n
watch(
    () => store.language,
    (newLang) => {
        const lang = normalizeLangCode(newLang ?? 'en')
        if (i18n.global.locale.value !== lang) {
            i18n.global.locale.value = lang
            document.documentElement.lang = lang
            console.info('[i18n] locale changed to', lang)
        }
    },
    { immediate: true }
)

app.config.errorHandler = (err, vm, info) => {
    // logs to vConsole via console.error
    console.error('[vue errorHandler]', err, info, vm)
    // also push to our history
    import('@/services/debugLogger').then(({ error }) => error('[vue errorHandler]', { err: err?.message, info, stack: err?.stack }))
}

app.mount('#app')
