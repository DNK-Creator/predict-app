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
            <div class="gauge__label">chance</div>
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
.gauge {
    position: relative;
    width: 5rem;
    height: 2.5rem;
    margin-bottom: 0.75rem;
    margin-right: 1.5rem;
}

.gauge__svg {
    width: 100%;
    height: 100%;
    overflow: visible;
}

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

.gauge__text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
}

.gauge__value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    margin-top: 2.25rem;
}

.gauge__label {
    font-size: 0.8rem;
    color: #9ca3af;
    text-transform: lowercase;
}
</style>
