<template>
    <div class="bet-chart">
        <!-- Chart Canvas -->
        <div class="chart-container">
            <canvas ref="canvasRef"></canvas>
        </div>

        <!-- Range Selector -->
        <div class="range-selector">
            <button v-for="opt in options" :key="opt.value"
                :class="['range-btn', { active: selectedRange === opt.value }]" @click="selectRange(opt.value)">
                {{ opt.label }}
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const props = defineProps({
    data: {
        type: Array,
        required: true
    }
})

// Time range options
const TimeRange = {
    HOUR: 'hour',
    DAY: 'day',
    ALL: 'all'
}
const selectedRange = ref('all')
const options = [
    { label: 'Last Hour', value: TimeRange.HOUR },
    { label: 'Last 24h', value: TimeRange.DAY },
    { label: 'All Time', value: TimeRange.ALL }
]

// Filter data based on selected range
const filteredData = computed(() => {
    if (selectedRange.value === TimeRange.ALL) return props.data
    const now = Date.now()
    const span = selectedRange.value === TimeRange.HOUR ? 3600e3 : 24 * 3600e3
    return props.data.filter(p => now - new Date(p.timestamp).getTime() <= span)
})

const canvasRef = ref(null)
let chartInstance = null

function renderChart() {
    // Format labels manually as HH:mm
    const labels = filteredData.value.map(p => {
        const date = new Date(p.timestamp)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
    const values = filteredData.value.map(p => p.value * 100)

    const cfg = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Yes Probability (%)',
                data: values,
                fill: false,
                tension: 0.4,
                borderColor: '#0098ea',
                backgroundColor: 'rgba(0,152,234,0.2)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: '#444' },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 6,
                        color: '#ccc'
                    }
                },
                y: {
                    beginAtZero: false,
                    max: 100,
                    grid: { color: '#444' },
                    ticks: { color: '#ccc' }
                }
            },
            plugins: { legend: { display: false } }
        }
    }

    if (chartInstance) {
        chartInstance.data = cfg.data
        chartInstance.options = cfg.options
        chartInstance.update()
    } else if (canvasRef.value) {
        chartInstance = new Chart(canvasRef.value.getContext('2d'), cfg)
    }
}

function selectRange(val) {
    selectedRange.value = val
}

onMounted(renderChart)
watch(filteredData, renderChart)
</script>

<style scoped>
.bet-chart {
    background: #1e1e1e;
    border-radius: 1rem;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.range-selector {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
}

.range-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #555;
    background: transparent;
    color: #aaa;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    font-weight: 500;
}

.range-btn:hover {
    background: #333;
}

.range-btn.active {
    background: #fff;
    color: #000;
    border-color: #fff;
}

.chart-container {
    position: relative;
    height: 300px;
}
</style>
