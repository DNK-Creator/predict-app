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

// --- ensure Chart.js draws with Montserrat ---
Chart.defaults.font.family = 'Montserrat, "Helvetica Neue", Arial, sans-serif'
Chart.defaults.font.size = 12
Chart.defaults.color = '#ccc'
Chart.defaults.font.weight = '400'

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
const selectedRange = ref(TimeRange.ALL)
const options = [
    { label: '1 час', value: TimeRange.HOUR },
    { label: '24 часа', value: TimeRange.DAY },
    { label: 'Всё время', value: TimeRange.ALL }
]

/**
 * If there are >= 48 values and user selected ALL,
 * keep only every 3rd value starting from the latest and going back.
 * Return array in chronological order (oldest -> newest).
 */
function downsampleEveryThird(arr) {
    if (!Array.isArray(arr)) return []
    const n = arr.length
    if (n < 48) return arr.slice() // no change

    if (n < 140) {

        const out = []
        // start from last (latest), step back by 3
        for (let i = n - 1; i >= 0; i -= 3) {
            out.push(arr[i])
        }
        // currently out is newest->oldest; reverse to oldest->newest for Chart.js
        return out.reverse()
    }

    if (n < 1000) {

        const out = []
        // start from last (latest), step back by 15
        for (let i = n - 1; i >= 0; i -= 15) {
            out.push(arr[i])
        }
        // currently out is newest->oldest; reverse to oldest->newest for Chart.js
        return out.reverse()
    }

    const out = []
    // start from last (latest), step back by 60
    for (let i = n - 1; i >= 0; i -= 60) {
        out.push(arr[i])
    }
    // currently out is newest->oldest; reverse to oldest->newest for Chart.js
    return out.reverse()
}

// Filter data based on selected range
const filteredData = computed(() => {
    const raw = (props.data || []).slice() // copy to avoid mutating original

    // ALL: possibly downsample
    if (selectedRange.value === TimeRange.ALL) {
        return downsampleEveryThird(raw)
    }

    // HOUR / DAY: filter by time span
    const now = Date.now()
    const span = selectedRange.value === TimeRange.HOUR ? 3600e3 : 24 * 3600e3
    return raw.filter(p => now - new Date(p.timestamp).getTime() <= span)
})

const canvasRef = ref(null)
let chartInstance = null

// Helper: format timestamp in russian, adding date if not same day
function formatRuTimestamp(ts) {
    const d = new Date(Number(ts))
    if (Number.isNaN(d.getTime())) return ''

    const now = new Date()
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()

    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return time

    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) // "8 июля"
    return `${date} ${time}` // "8 июля 14:25"
}

// Render (or update) the chart
function renderChart() {
    // Use data points with x (timestamp) and y (value percent)
    const dataPoints = filteredData.value.map(p => ({
        x: new Date(p.timestamp).getTime(),
        y: Number(p.value * 100)
    }))

    const cfg = {
        type: 'line',
        data: {
            // no labels array — using object data points (x,y)
            datasets: [{
                label: 'Вероятность "Да" (%)',
                data: dataPoints,
                parsing: false,          // we already give {x,y}
                fill: false,
                tension: 0.4,
                borderColor: '#0098ea',
                backgroundColor: 'rgba(0,152,234,0.2)',
                pointRadius: 3,
                pointHoverRadius: 6,
                // make line clickable/hoverable across an easier vertical band
                // (Chart's interaction with intersect:false handles the rest)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,

            // make it easy to hover near the x position (not strictly on the dot)
            interaction: {
                mode: 'nearest', // find nearest item
                axis: 'x',       // matching on x-axis only
                intersect: false // don't require exact intersection on the point
            },

            scales: {
                x: {
                    type: 'linear', // numeric timestamps
                    grid: { color: '#444' },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 6,
                        color: '#ccc',
                        font: { family: 'Montserrat', size: 11 },
                        callback: (value) => {
                            // value is numeric timestamp (ms)
                            return formatRuTimestamp(value)
                        }
                    },
                    min: Math.min(...dataPoints.map(d => d.x)) - 1000,
                    max: Math.max(...dataPoints.map(d => d.x)) + 1000
                },
                y: {
                    beginAtZero: false,
                    max: 100,
                    grid: { color: '#444' },
                    ticks: { color: '#ccc', font: { family: 'Montserrat', size: 11 }, callback: v => `${v}` }
                }
            },

            plugins: {
                legend: {
                    display: false,
                    labels: { font: { family: 'Montserrat', size: 12 } }
                },

                // Tooltip formatting: show date+time as requested and the probability as percent.
                tooltip: {
                    enabled: true,
                    // follow the pointer (pointer position)
                    external: null,
                    callbacks: {
                        // Title: show date/time per your rules
                        title: (items) => {
                            if (!items || items.length === 0) return ''
                            // items[0].parsed.x is numeric timestamp when using numeric x
                            const ts = items[0].parsed && items[0].parsed.x ? items[0].parsed.x : items[0].label
                            return formatRuTimestamp(ts)
                        },
                        label: (item) => {
                            // show: Вероятность "Да" — 54%
                            const v = item.parsed && item.parsed.y !== undefined ? item.parsed.y : item.raw
                            const percent = (Number(v) || 0).toFixed(1).replace(/\.00$/, '')
                            return `Вероятность "Да" — ${percent}%`
                        }
                    },
                    titleFont: { family: 'Montserrat', size: 12, weight: '600' },
                    bodyFont: { family: 'Montserrat', size: 11 }
                }
            }
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
    font-family: "Montserrat", "Helvetica Neue", Arial, sans-serif;
    /* fallback chain */
}

/* ensure controls also inherit the font */
.bet-chart,
.bet-chart * {
    font-family: inherit;
}

.range-selector {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
    font-family: "Montserrat";
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
