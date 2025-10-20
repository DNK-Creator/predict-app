<template>
  <span ref="el" :title="titleText" class="fit-text">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  maxRem: { type: Number, default: 0.9 },
  minRem: { type: Number, default: 0.55 },
  stepPx: { type: Number, default: 1 },
  // horizontal padding to reserve inside the parent (px)
  hPaddingPx: { type: Number, default: 8 }
})

const el = ref(null)
const titleText = computed(() => props.text || '')

// Canvas context for deterministic width measuring
let _ctx = null
function getCanvasContext() {
  if (_ctx) return _ctx
  const c = document.createElement('canvas')
  _ctx = c.getContext('2d')
  return _ctx
}

function pxFromRem(rem) {
  return rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
}

function measureTextWidth(text, fontPx, computedStyle) {
  const family = computedStyle.fontFamily || 'sans-serif'
  const weight = computedStyle.fontWeight || '400'
  const style = computedStyle.fontStyle || 'normal'
  const ctx = getCanvasContext()
  ctx.font = `${style} ${weight} ${fontPx}px ${family}`
  return ctx.measureText(text).width
}

function escapeHtml(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function scheduleFit() {
  if (el.value) {
    if (el.__fitRaf) cancelAnimationFrame(el.__fitRaf)
    el.__fitRaf = requestAnimationFrame(() => fitOnce())
  }
}

function fitOnce() {
  if (!el.value) return

  // raw text (slot or prop)
  const rawText = (el.value.textContent || props.text || '').trim()
  if (!rawText) return

  // available width = parent width minus left/right padding we reserve
  const parent = el.value.parentElement || el.value
  const parentRect = parent.getBoundingClientRect()
  const containerWidth = Math.max(0, parentRect.width)
  const pad = Number(props.hPaddingPx) || 0
  const available = Math.max(10, containerWidth - pad * 2)

  const computedStyle = getComputedStyle(el.value)
  const maxPx = Math.round(pxFromRem(props.maxRem))
  const minPx = Math.round(pxFromRem(props.minRem))
  const step = Math.max(0.5, props.stepPx)

  // Reset element to single-line measuring baseline (clear any previous <wbr>/clamp)
  // Use textContent to drop any inserted HTML from previous wrap mode
  el.value.textContent = rawText
  el.value.style.boxSizing = 'border-box'
  el.value.style.display = 'block'
  el.value.style.width = '100%'
  el.value.style.paddingLeft = `${pad}px`
  el.value.style.paddingRight = `${pad}px`
  el.value.style.whiteSpace = 'nowrap'
  el.value.style.overflow = 'hidden'
  el.value.style.textOverflow = 'ellipsis'
  el.value.style.lineHeight = computedStyle.lineHeight || '1.25'
  el.value.style.textAlign = 'center'
  el.value.style.webkitLineClamp = '' // clear clamp if previously set
  el.value.style.webkitBoxOrient = ''

  // shrink from max -> min and measure by canvas for deterministic results
  let font = maxPx
  let measured = measureTextWidth(rawText, font, computedStyle)

  while (measured > available && font > minPx) {
    font = Math.max(minPx, Math.round(font - step))
    measured = measureTextWidth(rawText, font, computedStyle)
  }

  // If text fits at some font >= minPx -> set that font and stay single-line
  if (measured <= available || font > minPx) {
    el.value.style.fontSize = font + 'px'
    // ensure not wrapped
    el.value.style.whiteSpace = 'nowrap'
    el.value.style.overflow = 'hidden'
    el.value.style.textOverflow = 'ellipsis'
    return
  }

  // Otherwise: even min font doesn't fit in a single line -> enable two-line fallback
  const finalFont = minPx
  el.value.style.fontSize = finalFont + 'px'

  // Build HTML with explicit break opportunities after spaces and dashes:
  // Insert <wbr> after each space or dash so browser can break there.
  // We escape text first to avoid XSS.
  // Note: we preserve the original separators (space / dash) then add <wbr>.
  const withBreaks = escapeHtml(rawText).replace(/([ \-])/g, '$1<wbr>')
  // apply the wrapped HTML, allow wrapping, and clamp to 2 lines with ellipsis
  el.value.innerHTML = withBreaks
  el.value.style.whiteSpace = 'normal'
  el.value.style.overflow = 'hidden'
  el.value.style.display = '-webkit-box'
  el.value.style.webkitBoxOrient = 'vertical'
  el.value.style.webkitLineClamp = '2'
  // center lines
  el.value.style.textAlign = 'center'
  // keep text-overflow: ellipsis (depends on -webkit-line-clamp)
}

let ro = null
let mo = null

onMounted(() => {
  const run = () => {
    nextTick(scheduleFit)
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run).catch(run)
  } else {
    setTimeout(run, 0)
  }

  ro = new ResizeObserver(scheduleFit)
  if (el.value) {
    ro.observe(el.value)
    if (el.value.parentElement) ro.observe(el.value.parentElement)
  }

  mo = new MutationObserver(scheduleFit)
  if (el.value) mo.observe(el.value, { childList: true, characterData: true, subtree: true })

  window.addEventListener('resize', scheduleFit)
})

onBeforeUnmount(() => {
  if (ro) ro.disconnect()
  if (mo) mo.disconnect()
  if (el.value && el.value.__fitRaf) cancelAnimationFrame(el.value.__fitRaf)
  window.removeEventListener('resize', scheduleFit)
})

watch(() => props.text, () => nextTick(scheduleFit))
</script>

<style scoped>
.fit-text {
  display: inline-block;
  font-size: 1rem;
  /* fallback */
  color: white;
  line-height: 1.25;
  vertical-align: middle;
  text-align: center;
  /* do not add CSS padding here — padding is set inline to match measurement */
}
</style>
