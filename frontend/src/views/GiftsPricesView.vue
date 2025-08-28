<template>
    <div class="page">
        <header class="header" :style="{ '--header-height': headerHeight + 'px' }">
            <h1 class="title">{{ $t('current-prices') }}</h1>
        </header>

        <main class="content">
            <ul class="gift-list" role="list">
                <li v-for="gift in visibleGifts" :key="gift.id" class="gift-item" role="listitem"
                    :title="gift.collection_name">
                    <img class="gift-icon" :src="gift.icon_url" :alt="gift.collection_name" @error="onImgError" />
                    <div class="gift-meta">
                        <div class="gift-name">{{ gift.collection_name }}</div>
                    </div>
                    <div class="gift-price">{{ formatPrice(gift.price_ton) }}</div>
                </li>

                <li ref="sentinel" class="sentinel" aria-hidden="true"></li>
            </ul>

            <div v-if="loading" class="loading">{{ $t('loading-dots') }}</div>
            <div v-else-if="!gifts.length" class="empty">{{ $t('no-gifts') }}</div>
        </main>
    </div>
</template>

<script setup>
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { onActivated } from 'vue'
import { getGiftsPrices } from '@/api/requests'

/* small exposed config so you can change header height from script if needed */
const headerHeight = 84 // px — change this number to instantly update header height

/* === existing code (unchanged) === */
const PAGE_SIZE = 12
const gifts = ref([])
const loading = ref(false)
const visibleCount = ref(0)
const sentinel = ref(null)

let observer = null

async function loadGifts() {
    loading.value = true
    try {
        const data = await getGiftsPrices()
        const arr = Array.isArray(data) ? data : (data?.data ?? [])
        gifts.value = [...arr].sort((a, b) => Number(b.price_ton ?? 0) - Number(a.price_ton ?? 0))
        visibleCount.value = Math.min(PAGE_SIZE, gifts.value.length)
        await nextTick()
        initObserver()
    } catch (err) {
        console.error('Unexpected error: ' + err)
    } finally {
        loading.value = false
    }
}

onActivated(async () => {
    if (!gifts.value.length) {
        await loadGifts()
    } else {
        await nextTick()
        initObserver()
    }
})

const visibleGifts = computed(() => gifts.value.slice(0, visibleCount.value))

function formatPrice(p) {
    const n = Number(p)
    if (Number.isInteger(n)) return `${n} TON`
    return `${n.toFixed(2).replace(/\.?0+$/, '')} TON`
}

function onImgError(e) {
    e.currentTarget.src = '/images/placeholder-gift.png'
}

function initObserver() {
    if (observer) {
        observer.disconnect()
        observer = null
    }
    if (!sentinel.value) return
    if (visibleCount.value >= gifts.value.length) return

    observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, gifts.value.length)
                    if (visibleCount.value >= gifts.value.length && observer) {
                        observer.disconnect()
                        observer = null
                    }
                }
            })
        },
        { root: null, rootMargin: '0px', threshold: 0.5 }
    )

    observer.observe(sentinel.value)
}

onUnmounted(() => {
    if (observer) observer.disconnect()
})
</script>

<style scoped>
/* Ensure the top-level fills the viewport so header sizes behave predictably.
   If your app sets heights elsewhere you can remove min-height:100vh and/or use html,body,#app { height: 100% } */
.page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #0f1113;
    color: #e9e9e9;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    box-sizing: border-box;
}

/* Elegant, visible header:
   - use CSS variable --header-height so you can change height in one place
   - remove h1 default margins (prevents margin collapse)
   - use backdrop-filter + soft gradient + thin border for an elegant look
*/
.header {
    /* Respect explicit size via variable and also allow content to center */
    min-height: var(--header-height, 72px);
    height: auto;
    /* avoid forcing the content; min-height is primary control */
    display: flex;
    align-items: center;
    /* vertical centering */
    justify-content: center;
    /* horizontal centering */
    padding: 0 18px;
    /* horizontal breathing room */
    box-sizing: border-box;

    /* Visual styling */
    background: linear-gradient(180deg, rgba(78, 78, 78, 0.36), rgba(0, 0, 0, 0.13));
    backdrop-filter: blur(6px) saturate(120%);
    -webkit-backdrop-filter: blur(6px) saturate(120%);

    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    box-shadow: 0 6px 20px rgba(2, 6, 8, 0.45);
    z-index: 10;
}

/* Reset h1 margins (this fixes the common "height won't change" symptom) */
.title {
    margin: 0;
    /* remove default margins that can collapse */
    padding: 8px 0;
    /* small vertical padding to visually center text inside header */
    line-height: 1;
    /* precise control of text height */
    font-weight: 700;
    font-size: 1.4rem;
    color: #f6f8f9;
    letter-spacing: 0.6px;
    text-transform: none;
    /* keep original Cyrillic text casing */
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
    white-space: nowrap;
    display: inline-block;
    -webkit-font-smoothing: antialiased;
}

/* If you really want the header to exactly match a pixel height, use this:
   .header { height: var(--header-height); }
   but prefer min-height + padding so small devices don't clip the text. */

/* Content area */
.content {
    padding: 10px 12px;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
}

/* rest of styles unchanged (kept minimal) */
.gift-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.gift-item {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    height: 56px;
    min-height: 56px;
    max-height: 56px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
    transition: transform 120ms ease, background 120ms ease;
}

.gift-item:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.03);
}

.gift-icon {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    display: block;
}

.gift-meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.gift-name {
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(233, 233, 233, 0.95);
    overflow: hidden;
    text-overflow: ellipsis;
}

.gift-price {
    font-weight: 700;
    font-size: 0.95rem;
    color: #3b82f6;
    margin-left: 8px;
    white-space: nowrap;
}

.sentinel {
    height: 1px;
    width: 100%;
}

.loading,
.empty {
    text-align: center;
    color: rgba(233, 233, 233, 0.6);
    padding: 14px 0;
    font-size: 0.95rem;
}
</style>
