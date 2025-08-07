<template>
    <LoaderPepe v-if="spinnerShow" />
    <div v-show="!spinnerShow" class="bets-container">
        <!-- Infinite scroll list -->
        <TransitionGroup name="card" tag="div" class="bets-list">
            <BetsCard v-for="bet in bets" :key="bet.id" :title="bet.name"
                :short-desc="getShortDescription(bet.description)" :bg-image="bet.image_path"
                @click="$router.push({ name: 'BetDetails', params: { id: bet.id } })" />

        </TransitionGroup>
        <!-- Sentinel for IntersectionObserver -->
        <div ref="scrollAnchor" class="scroll-anchor"></div>
    </div>
</template>

<script setup>
// ✅ Vue & reactivity
import { ref, onMounted } from 'vue'

// ✅ Components
import BetsCard from '@/components/BetsCard.vue'
import LoaderPepe from '@/components/LoaderPepe.vue'

// ✅ Supabase client & your API helpers
import supabase from '@/services/supabase'

// ——— Reactive state ———
const bets = ref([])
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)

const showModal = ref(false)
const selectedBet = ref(null)
const spinnerShow = ref(true)

function getShortDescription(descriptionValue) {
    let shortDescription = descriptionValue
    if (descriptionValue.length > 45) {
        shortDescription = descriptionValue.slice(0, 43) + '…'
    }
    return shortDescription
}

// user setup (example usage of your API helpers)
onMounted(async () => {

    // load first page of bets
    await loadMoreBets()

    // set up infinite scroll
    observeScrollEnd()

    spinnerShow.value = false;
})

// ——— Fetch a page of bets ———
async function loadMoreBets() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    const from = page.value * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
        .from('bets')
        .select('id, name, description, image_path')
        .order('date', { ascending: true })
        .range(from, to)

    if (error) {
        console.error('Error loading bets:', error)
    } else {
        if (data.length < pageSize) {
            allLoaded.value = true
        }
        bets.value.push(...data)
        page.value += 1
    }

    loadingMore.value = false
}

// ——— IntersectionObserver for infinite scroll ———
const scrollAnchor = ref(null)
function observeScrollEnd() {
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMoreBets()
        },
        { rootMargin: '200px' }
    )
    if (scrollAnchor.value) {
        observer.observe(scrollAnchor.value)
    }
}

// ——— Modal controls ———
function openModal(bet) {
    selectedBet.value = bet
    showModal.value = true
}
function closeModal() {
    showModal.value = false
    selectedBet.value = null
}
</script>

<style scoped>
.bets-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;

    /* Reserve space under the list equal to the navbar height */
    padding-bottom: 95px;
    /* ← same as your .menu height */
}

.bets-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: stretch;
}

/* Just an invisible box to trigger loading more */
.scroll-anchor {
    height: 1px;
    width: 100%;
    /* ← ensure it doesn’t collapse */
}

/* Optional loading indicator */
.bets-list::after {
    content: attr(data-loading);
    display: block;
    text-align: center;
    padding: 16px;
    color: #666;
    font-size: 0.9rem;
}

.bet-card:active {
    transform: scale(0.98);
    transition: transform 0.1s;
}
</style>
