<template>
    <div class="gauge">
        <svg viewBox="0 0 100 50" class="gauge__svg">
            <!-- Background arc (half circle) -->
            <path class="gauge__arc bg" d="M 5,50 A 45,45 0 0 1 95,50" />
            <!-- Foreground arc -->
            <path class="gauge__arc fg" d="M 5,50 A 45,45 0 0 1 95,50" :style="fgStyle" />
        </svg>
        <div class="gauge__text">
            <div class="gauge__value">{{ percent }}%</div>
            <div class="gauge__label">шанс</div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    /** fill percent from 0 to 100 */
    percent: {
        type: Number,
        required: true,
        validator: v => v >= 0 && v <= 100
    }
})

// Path length of the half-circle arc: it's π·r = Math.PI * 45
const arcLen = Math.PI * 45

// compute stroke-dashoffset to fill according to percent
const fgStyle = computed(() => {
    const offset = arcLen * (1 - props.percent / 100)
    return {
        strokeDasharray: `${arcLen} ${arcLen}`,
        strokeDashoffset: offset
    }
})
</script>

<style scoped>
/* Gauge: fixed width, reserve space below the arc for the value/label */
.gauge {
    position: relative;
    flex: 0 0 auto;
    /* don't shrink */
    width: 4.8rem;
    box-sizing: border-box;
    margin-right: 1.5rem;
    user-select: none;
}

/* keep the svg height strictly for the half-circle */
.gauge__svg {
    display: block;
    width: 100%;
    height: 2.3rem;
    /* arc area height */
    overflow: visible;
}

/* arc styling (unchanged) */
.gauge__arc {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    d: path("M 5,50 A 45,45 0 0 1 95,50");
}

.gauge__arc.bg {
    stroke: #161616;
}

.gauge__arc.fg {
    stroke: #0098ea;
    transition: stroke-dashoffset 0.6s ease;
}

/* place text centered horizontally, just BELOW the SVG (top:100%) */
.gauge__text {
    position: absolute;
    left: 50%;
    top: 50%;
    /* immediately below the svg */
    transform: translateX(-50%);
    /* center horizontally */
    text-align: center;
    width: 100%;
    pointer-events: none;
}

/* value sits directly under the half circle (no extra margin pushing it up) */
.gauge__value {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    line-height: 1;
    margin: 2px 0 0;
    /* small gap from the arc */
    font-family: "Inter", sans-serif;
}

/* small label under the value */
.gauge__label {
    font-size: 0.72rem;
    color: #9ca3af;
    margin-top: 2px;
    text-transform: lowercase;
    font-family: "Inter", sans-serif;
}
</style>
