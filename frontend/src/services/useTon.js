// src/services/useTon.js
import { ref } from 'vue'
import { getTonConnect } from '@/services/ton-connect-ui.js'

const ton = ref(null)

export function useTon() {
    function ensureTon() {
        if (!ton.value) ton.value = getTonConnect()
        return ton.value
    }
    return { ton, ensureTon }
}