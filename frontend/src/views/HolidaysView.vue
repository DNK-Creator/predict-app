<template>
    <LoaderPepe v-if="spinnerShow" />

    <div v-show="!spinnerShow" class="holidays-container">
        <!-- Infinite scroll list -->
        <TransitionGroup name="card" tag="div" class="holiday-list">
            <HolidayCard v-for="holiday in holidays" :key="holiday.id" :title="holiday.name"
                :short-desc="getShortDescription(holiday.description)" :bg-image="holiday.image_path"
                :date="new Date(holiday.date)" @click="openModal(holiday)" />

        </TransitionGroup>
        <!-- Sentinel for IntersectionObserver -->
        <div ref="scrollAnchor" class="scroll-anchor"></div>

        <!-- Detail modal -->
        <HolidayModal v-if="showModal" :visible="showModal" :holiday="selectedHoliday" @close="closeModal" />
    </div>
</template>

<script setup>
// ✅ Vue & reactivity
import { ref, onMounted } from 'vue'

// ✅ Components
import HolidayCard from '@/components/HolidayCard.vue'
import HolidayModal from '@/components/HolidayModal.vue'

// ✅ Supabase client & your API helpers
import supabase from '@/services/supabase'
import LoaderPepe from '@/components/LoaderPepe.vue'

// ——— Reactive state ———
const holidays = ref([])
const page = ref(0)
const pageSize = 6
const loadingMore = ref(false)
const allLoaded = ref(false)

const showModal = ref(false)
const selectedHoliday = ref(null)

const spinnerShow = ref(true)

function getShortDescription(descriptionValue) {
    let shortDescription = descriptionValue
    if (descriptionValue.length > 60) {
        shortDescription = descriptionValue.slice(0, 60) + '…'
    }
    return shortDescription
}

// user setup (example usage of your API helpers)
onMounted(async () => {

    // load first page of holidays
    await loadMoreHolidays()

    // set up infinite scroll
    observeScrollEnd()

    spinnerShow.value = false;
})

// ——— Fetch a page of holidays ———
async function loadMoreHolidays() {
    if (loadingMore.value || allLoaded.value) return
    loadingMore.value = true

    const from = page.value * pageSize
    const to = from + pageSize - 1

    const { data, error } = await supabase
        .from('holidays')
        .select('id, name, description, image_path, date')
        .order('date', { ascending: true })
        .range(from, to)

    if (error) {
        console.error('Error loading holidays:', error)
    } else {
        if (data.length < pageSize) {
            allLoaded.value = true
        }
        holidays.value.push(...data)
        page.value += 1
    }

    loadingMore.value = false
}

// ——— IntersectionObserver for infinite scroll ———
const scrollAnchor = ref(null)
function observeScrollEnd() {
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (entry.isIntersecting) loadMoreHolidays()
        },
        { rootMargin: '200px' }
    )
    if (scrollAnchor.value) {
        observer.observe(scrollAnchor.value)
    }
}

// ——— Modal controls ———
function openModal(holiday) {
    selectedHoliday.value = holiday
    showModal.value = true
}
function closeModal() {
    showModal.value = false
    selectedHoliday.value = null
}
</script>

<style scoped>
.holidays-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 12px;
    flex-shrink: 0;
    user-select: none;
}

.holiday-list {
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
.holiday-list::after {
    content: attr(data-loading);
    display: block;
    text-align: center;
    padding: 16px;
    color: #666;
    font-size: 0.9rem;
}

.holiday-card:active {
    transform: scale(0.98);
    transition: transform 0.1s;
}
</style>
