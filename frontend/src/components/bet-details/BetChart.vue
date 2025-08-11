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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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
    },
    // accept timestamptz as String | Number | Date
    closeTime: {
        type: [String, Number, Date],
        default: null
    }
})

// Time range options
const TimeRange = {
    HOUR: 'hour',
    DAY: 'day',
    ALL: 'all'
}
const selectedRange = ref(TimeRange.ALL)
// base set of options (used when market is open)
const baseOptions = [
    { label: '1 час', value: TimeRange.HOUR },
    { label: '24 часа', value: TimeRange.DAY },
    { label: 'Всё время', value: TimeRange.ALL }
]

// reactive options: only show "All" when closed
const options = computed(() => {
    if (isClosed.value) {
        return [{ label: 'Всё время', value: TimeRange.ALL }]
    }
    return baseOptions
})

// reactive time so we can recompute isClosed as time passes
const now = ref(Date.now())
let nowInterval = null

// parse closeTime prop into a numeric timestamp (ms).
function parseCloseTimeToMs(value) {
    if (value == null) return NaN
    if (typeof value === 'number') return value
    if (value instanceof Date) return value.getTime()
    // try string parsing
    const t = Date.parse(String(value))
    return Number.isFinite(t) ? t : NaN
}

// computed boolean: has the market closed already?
const closeTimeMs = computed(() => parseCloseTimeToMs(props.closeTime))
const isClosed = computed(() => {
    const ct = closeTimeMs.value
    if (!Number.isFinite(ct)) return false // unknown close time -> treat as open
    return now.value >= ct
})

/**
 * If there are >= 48 values and user selected ALL,
 * keep only every 3rd value starting from the latest and going back.
 * Return array in chronological order (oldest -> newest).
 */
function downsampleEveryThird(arr) {
    if (!Array.isArray(arr)) return []
    const n = arr.length
    if (n < 48) return arr.slice()

    // choose step depending on size
    let step = 3
    if (n >= 140 && n < 1000) step = 15
    else if (n >= 1000) step = 40

    const out = []
    // pick points from newest -> oldest, then reverse once to chronological order
    for (let i = n - 1; i >= 0; i -= step) {
        out.push(arr[i])
    }
    // now out is newest -> oldest; reverse to oldest -> newest
    return out.reverse()
}

// Filter data based on selected range
const filteredData = computed(() => {
    const raw = (props.data || []).slice() // copy to avoid mutating original

    // ALL: possibly downsample
    if (selectedRange.value === TimeRange.ALL || selectedRange.value === TimeRange.DAY) {
        return downsampleEveryThird(raw)
    }

    // HOUR: filter by time span
    const now = Date.now()
    const span = selectedRange.value === TimeRange.HOUR ? 3600e3 : 24 * 3600e3
    return raw.filter(p => now - new Date(p.timestamp).getTime() <= span)
})

const canvasRef = ref(null)
let chartInstance = null

// new helper: return only time (HH:MM) in Russian format for axis labels
function formatTimeOnly(ts) {
    const d = new Date(Number(ts))
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

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

function renderChart() {
    // Build cleaned dataPoints (x = ms, y = percent)
    const dataPoints = filteredData.value
        .map(p => ({
            x: new Date(p.timestamp).getTime(),
            y: Number(p.value * 100)
        }))
        .filter(d => Number.isFinite(d.x) && Number.isFinite(d.y))
        .sort((a, b) => a.x - b.x) // ensure chronological order

    // If no data: ensure chart exists (empty) or update existing to empty dataset
    if (!dataPoints.length) {
        if (chartInstance) {
            // defensive: clear any active tooltip elements so tooltip code won't access removed elements
            try { chartInstance.tooltip?.setActiveElements?.([], { x: 0, y: 0 }) } catch (e) { /* ignore */ }

            // ensure dataset exists and is empty
            if (chartInstance.data && chartInstance.data.datasets && chartInstance.data.datasets.length) {
                chartInstance.data.datasets[0].data = []
            } else {
                chartInstance.data = { datasets: [{ data: [] }] }
            }

            // remove any axis min/max we might have set previously
            if (chartInstance.options && chartInstance.options.scales && chartInstance.options.scales.x) {
                delete chartInstance.options.scales.x.min
                delete chartInstance.options.scales.x.max
                delete chartInstance.options.scales.x.stepSize
            }

            chartInstance.update('none')
        } else if (canvasRef.value) {
            // create a minimal empty chart so canvas has an instance
            const ctx = canvasRef.value.getContext('2d')
            const emptyCfg = {
                type: 'line',
                data: { datasets: [{ data: [] }] },
                options: { responsive: true, maintainAspectRatio: false }
            }
            chartInstance = new Chart(ctx, emptyCfg)
        }
        return
    }

    // Determine min/max from data
    const minX = dataPoints[0].x
    const maxX = dataPoints[dataPoints.length - 1].x

    // Desired number of ticks
    const desiredTicks = 6
    const span = Math.max(1, maxX - minX)
    const rawStep = Math.ceil(span / (desiredTicks - 1))

    const units = [
        1000, 5 * 1000, 15 * 1000, 30 * 1000,
        60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000,
        60 * 60 * 1000, 3 * 60 * 60 * 1000, 6 * 60 * 60 * 1000,
        12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000
    ]
    let step = units.find(u => u >= rawStep) ?? rawStep
    if (span <= 3600e3 && step > 60 * 60 * 1000) step = rawStep

    // Build config for creation or for replacing options
    const cfg = {
        type: 'line',
        data: {
            datasets: [{
                label: 'Вероятность "Да" (%)',
                data: dataPoints,
                parsing: false,
                fill: false,
                tension: 0.4,
                borderColor: '#0098ea',
                backgroundColor: 'rgba(0,152,234,0.2)',
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: {
                    type: 'linear',
                    grid: { color: '#444' },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 0,
                        color: '#ccc',
                        font: { family: 'Montserrat', size: 11 },
                        callback: (value) => formatTimeOnly(value)
                    },
                    min: minX,
                    max: maxX,
                    stepSize: step
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#444' },
                    ticks: { color: '#ccc', font: { family: 'Montserrat', size: 11 }, callback: v => `${v}` }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        title: (items) => {
                            if (!items || items.length === 0) return ''
                            const ts = items[0].parsed && items[0].parsed.x ? items[0].parsed.x : items[0].label
                            return formatRuTimestamp(ts)
                        },
                        label: (item) => {
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
        // Defensive: clear tooltip active elements to avoid tooltip accessing removed elements
        try { chartInstance.tooltip?.setActiveElements?.([], { x: 0, y: 0 }) } catch (e) { /* ignore */ }

        // Ensure dataset exists; prefer in-place mutation for performance & stability
        if (!chartInstance.data || !chartInstance.data.datasets || !chartInstance.data.datasets.length) {
            chartInstance.data = cfg.data
        } else {
            // update only the array reference that Chart.js uses
            chartInstance.data.datasets[0].data = dataPoints
            // if you changed dataset-level props (color, tension, etc.), update them too:
            const ds = chartInstance.data.datasets[0]
            ds.label = cfg.data.datasets[0].label
            ds.tension = cfg.data.datasets[0].tension
            ds.borderColor = cfg.data.datasets[0].borderColor
            ds.backgroundColor = cfg.data.datasets[0].backgroundColor
            ds.pointRadius = cfg.data.datasets[0].pointRadius
            ds.pointHoverRadius = cfg.data.datasets[0].pointHoverRadius
            ds.parsing = cfg.data.datasets[0].parsing
        }

        // Replace options (full replace is simplest); Chart.js will reuse elements where possible
        chartInstance.options = cfg.options

        // Update without animation to avoid transient states triggering tooltip code
        chartInstance.update('none')
    } else if (canvasRef.value) {
        // create the chart for the first time
        const ctx = canvasRef.value.getContext('2d')
        chartInstance = new Chart(ctx, cfg)
    }
}

function selectRange(val) {
    selectedRange.value = val
}

onMounted(() => {
    renderChart()
    // update now every second (keeps UI responsive if closeTime passes while viewing)
    nowInterval = setInterval(() => {
        now.value = Date.now()
    }, 1000)
})

watch(filteredData, renderChart)

// if market becomes closed while user is on page, force selection to ALL
watch(isClosed, (nowClosed) => {
    if (nowClosed) {
        selectedRange.value = TimeRange.ALL
    }
})

onUnmounted(() => {
    if (nowInterval) clearInterval(nowInterval)
    if (chartInstance) {
        try { chartInstance.destroy() } catch (e) { /* ignore */ }
        chartInstance = null
    }
})
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
