<template>

    <!-- replace original modal invocation -->
    <GiftItemModal :visible="showItemModal" @close="closeGiftModal" @action="onGiftAction" :name="selectedGiftName"
        :gift_id="selectedGiftId" :image="selectedGiftImage" />

    <Teleport to="body">
        <!-- backdrop -->
        <transition name="fade">
            <div v-if="show" class="overlay overlay--visible" @click.self="onClose" />
        </transition>

        <!-- modal -->
        <transition name="slide-up">
            <div v-if="show" class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
                <div class="footer">
                    <h2>{{ $t('inventory-caps') }}</h2>
                    <button class="close-btn" @click="onClose" :disabled="saving">✖</button>
                </div>

                <div v-if="invLoading" class="inventory-loading">{{ $t('loading') }}</div>

                <!-- Inventory section -->
                <div class="items-group inventory-group" v-if="!invLoading && inventoryItems.length > 0">
                    <!-- Grid container (80% width centered) -->
                    <div class="inventory-container" tabindex="0" role="region" aria-label="Inventory">
                        <div class="inventory-grid">
                            <template v-for="(gift, idx) in inventoryItems" :key="gift.uid || `${gift.type}-${idx}`">
                                <div class="inventory-cell" :title="gift.name || gift.type"
                                    @click="openGiftModal(gift)">
                                    <div class="cell-name">{{ gift.name || gift.type }}</div>
                                    <div class="cell-image">
                                        <img :src="getGiftImage(gift)" :alt="gift.name || gift.type" />
                                    </div>
                                    <div class="cell-value">{{ gift.value || '-' }}</div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- If empty inventory -->
                <div class="items-group" v-else-if="!invLoading">
                    <p class="empty-note">{{ $t('inventory-empty') || 'You have no items yet.' }}</p>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
/* placeholder images — replace with real assets */
import Gift_UI_Cookie from '@/assets/game/Cookie_Close.png'
import Gift_UI_Snake from '@/assets/game/Snake_Close.png'
import Gift_UI_Cat from '@/assets/game/Cat_Close.png'

import { useInventory } from '@/services/useInventory'
import { ref, watch, computed } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from 'vue-i18n'
import 'vue3-toastify/dist/index.css'
import { toast } from 'vue3-toastify'
import GiftItemModal from './GiftItemModal.vue'

// get props as an object so we can watch props.show cleanly
const props = defineProps({
    show: Boolean,
    inventory: { type: [Array, Object], default: () => [] }
})

const { inventory: invRef, loading: invLoading, loadInventory } = useInventory()

const emit = defineEmits(['close', 'open-privacy', 'open-support'])

const store = useAppStore()

// saving state
const saving = ref(false)

const showItemModal = ref(false)
const selectedGift = ref(null)

// computed props to pass to GiftItemModal
const selectedGiftName = computed(() => {
    return selectedGift.value?.name ?? humanizeGiftId(selectedGift.value?.type ?? selectedGift.value?.uid ?? null)
})
const selectedGiftId = computed(() => selectedGift.value?.type ?? selectedGift.value?.uid ?? null)
const selectedGiftImage = computed(() => {
    // if gift object provides image/url use it; otherwise use resolver
    if (!selectedGift.value) return null
    if (selectedGift.value.image) return selectedGift.value.image
    return getGiftImage(selectedGift.value)
})

const { t } = useI18n()
const { withdrawGift } = useInventory()

async function onGiftAction(payload) {
    // payload is what the modal emits, but we prefer using the selectedGift object
    const giftToWithdraw = selectedGift.value
    if (!giftToWithdraw) {
        console.warn('onGiftAction: no selected gift')
        return
    }

    try {
        // optional: show some UI lock (disable button) — omitted for brevity
        const res = await withdrawGift(giftToWithdraw)

        // success toast using i18n key 'gift-withdrawal'
        toast.success(t('gift-withdrawal') || 'Gift withdrawn')

        // close modal and clear selection
        closeGiftModal()
    } catch (err) {
        console.error('onGiftAction error', err)
        // show error toast
        toast.error(t('gift-withdrawal-failed') || 'Failed to withdraw item')
    }
}

// helper: map gift id -> friendly fallback name
function humanizeGiftId(id) {
    if (!id) return 'Unknown'
    const map = {
        cat: 'Scared Cat',
        cookie: 'Ginger Cookie',
        snake: 'Pet Snake'
    }
    return map[id] ?? String(id).replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function openGiftModal(gift) {
    selectedGift.value = gift || null
    showItemModal.value = true
}

function closeGiftModal() {
    showItemModal.value = false
    // small timeout to clear selection after close animation (optional)
    setTimeout(() => {
        selectedGift.value = null
    }, 220)
}

// language
const selectedLanguage = ref((store.language ?? 'en').toUpperCase())
watch(
    () => store.language,
    (v) => selectedLanguage.value = (v ?? 'en').toUpperCase(),
    { immediate: true }
)

function onClose() {
    if (saving.value) return
    emit('close')
}

// ---------- Inventory handling ----------

/**
 * Normalize inventory into an array of items with shape:
 * { uid?, type, name, value, added_at (ISO or ts) }
 *
 * Accepts:
 * - Array: pass-through (we map and ensure fields exist)
 * - Object: treat as map values
 */
function normalizeInventory(invRaw) {
    if (!invRaw) return []
    if (Array.isArray(invRaw)) {
        return invRaw.map((it, i) => ({
            uid: it.uid ?? it.id ?? `${Date.now()}-${i}`,
            type: it.type ?? it.id ?? 'unknown',
            name: it.name ?? (it.type ?? it.id ?? 'Unknown'),
            value: it.value ?? it.valueLabel ?? it.amount ?? '',
            added_at: it.added_at ?? it.addedAt ?? it.addedAtIso ?? it.created_at ?? null
        }))
    }
    // object map: extract values
    if (typeof invRaw === 'object') {
        return Object.values(invRaw).map((it, i) => ({
            uid: it.uid ?? it.id ?? `${Date.now()}-${i}`,
            type: it.type ?? it.id ?? 'unknown',
            name: it.name ?? (it.type ?? it.id ?? 'Unknown'),
            value: it.value ?? it.valueLabel ?? it.amount ?? '',
            added_at: it.added_at ?? it.addedAt ?? it.created_at ?? null
        }))
    }
    return []
}

/* Use local prop inventory if provided, otherwise try store.currentUser.inventory
   (this is optional — adjust to how you keep user data) */
const inventoryRaw = computed(() => {

    // 2) prefer composable inventory (reactive ref from useInventory)
    if (invRef && Array.isArray(invRef.value)) {
        return invRef.value
    }

    // 3) fallback to store user inventory if present
    return store?.currentUser?.inventory ?? []
})

// normalized array
const inventoryArray = computed(() => normalizeInventory(inventoryRaw.value))

// sort newest first by added_at (if no date, keep original position but put them at end)
const inventoryItems = computed(() => {
    const arr = [...inventoryArray.value]
    arr.sort((a, b) => {
        const ta = a.added_at ? Date.parse(a.added_at) : 0
        const tb = b.added_at ? Date.parse(b.added_at) : 0
        // newest first
        return tb - ta
    })
    return arr
})

// simple resolver to return an image path for a gift item
function getGiftImage(gift) {
    const type = (gift?.type || '').toString().toLowerCase()
    switch (type) {
        case 'cookie':
        case 'ginger':
        case 'ginger_cookie':
            return Gift_UI_Cookie
        case 'cat':
        case 'scared_cat':
            return Gift_UI_Cat
        case 'snake':
        case 'gift_snake':
        case 'christmas_snake':
            return Gift_UI_Snake
        default:
            // if gift has explicit image URL, prefer it
            if (gift?.image) return gift.image
            return Gift_UI_Cookie
    }
}

// prefer the shared composable inventory; only fetch from server when it's empty or never loaded
watch(() => props.show, (val) => {
    if (!val) return
    // if invRef already has items, we skip the fetch because local state is authoritative/most recent
    if (invRef && Array.isArray(invRef.value) && invRef.value.length > 0) {
        // already have local items (maybe optimistic) — don't overwrite
        return
    }
    // otherwise fetch from server
    loadInventory().catch(err => console.error('loadInventory failed', err))
})

</script>

<style scoped>
/* keep your existing modal styles (copied & extended) */

/* base overlay = fully dark + blurred */
.overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0);
    z-index: 30;
}

.overlay--visible {
    background-color: rgba(0, 0, 0, 0.4);
}

/* Modal container, pinned bottom */
.settings-modal {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: max(72vh, 400px);
    max-width: 900px;
    /* slightly larger to fit inventory nicely */
    margin: auto auto;
    align-self: center;
    background: #292a2a;
    color: White;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 1.25rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 32;
    user-select: none;
    overflow: hidden;
}

.settings-modal h2 {
    margin: 0;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
}

/* groups */
.items-group {
    margin-bottom: 1.25rem;
}

/* options grid unchanged */
.options-grid {
    display: grid;
    grid-auto-flow: column;
    width: 12rem;
    column-count: 2;
    margin-top: 0.75rem;
}

/* actions and other buttons unchanged... (kept for brevity) */

/* INVENTORY styles */
.inventory-group {
    margin-top: 0.5rem;
}

.inventory-container {
    width: 80%;
    margin: 0.75rem auto 0 auto;
    /* height: allow the modal to control total size; make it scrollable */
    max-height: calc(75vh - 230px);
    /* adjust to leave room for header/buttons */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    /* space for scrollbar */
    outline: none;
}

/* grid: two columns, auto rows */
.inventory-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    align-items: start;
}

/* each cell: rectangular square-ish card */
.inventory-cell {
    cursor: pointer;
    background: #202121;
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    min-height: 120px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    transition: transform 160ms ease, box-shadow 160ms ease;
}

.inventory-cell:hover {
    transform: translateY(-6px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
}

/* name at top */
.cell-name {
    font-size: 0.85rem;
    color: #e6e6e6;
    width: 100%;
    text-align: center;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* center image */
.cell-image {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 6px 0;
}

.cell-image img {
    max-width: 80%;
    max-height: 72px;
    object-fit: contain;
    display: block;
}

/* value at bottom */
.cell-value {
    font-size: 0.8rem;
    color: #b8b8b8;
    width: 100%;
    text-align: center;
    margin-top: 6px;
}

/* empty note */
.empty-note {
    color: #cfcfcf;
    opacity: 0.7;
    padding: 6px 0;
}

.close-btn {
    background: transparent;
    border: none;
    font-size: 1.75rem;
    cursor: pointer;
    color: white;
}

/* simple scrollbar styling (WebKit) */
.inventory-container::-webkit-scrollbar {
    width: 10px;
}

.inventory-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
}

/* keep your transitions intact */
.fade-enter-active,
.fade-leave-active {
    transition:
        background-color 300ms ease-out;
}

.fade-enter-from,
.fade-leave-to {
    background-color: rgba(0, 0, 0, 0);
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 300ms ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}

.slide-up-enter-to,
.slide-up-leave-from {
    transform: translateY(0%);
}
</style>
