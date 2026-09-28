<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type Star = { x: number; y: number; z: number; r: number; tw: number }

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0
let observer: ResizeObserver | undefined

// Port of StarDustWebsite's components/Starfield.tsx: quiet ambient drift,
// no star brighter than body text, fading out toward the bottom edge.
onMounted(() => {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let stars: Star[] = []
  let w = 0
  let h = 0

  const seed = () => {
    const density = Math.round((w * h) / 9000)
    const count = Math.max(40, Math.min(260, density))
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.25 + Math.random() * 0.75,
      r: 0.4 + Math.random() * 1.15,
      tw: Math.random() * Math.PI * 2,
    }))
  }

  const resize = () => {
    const rect = el.getBoundingClientRect()
    w = rect.width
    h = rect.height
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(w * ratio)
    el.height = Math.round(h * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    seed()
  }

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h)
    for (const s of stars) {
      if (!reduced) s.x -= s.z * 0.05
      if (s.x < -2) s.x = w + 2

      const twinkle = reduced ? 0.6 : 0.55 + 0.45 * Math.sin(t / 1400 + s.tw)
      ctx.globalAlpha = 0.1 + s.z * 0.34 * twinkle
      ctx.fillStyle = s.z > 0.82 ? '#d4d4d4' : '#eaeaea'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    if (!reduced) raf = requestAnimationFrame(draw)
  }

  resize()
  draw(0)

  observer = new ResizeObserver(() => {
    resize()
    if (reduced) draw(0)
  })
  observer.observe(el)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="HeroStarfield" />
</template>

<style scoped>
.HeroStarfield {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Fade the field out before it reaches the section edge, so the
     boundary below reads as a clean line rather than a smudge. */
  mask-image: linear-gradient(180deg, #000 0%, #000 55%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 55%, transparent 100%);
}
</style>
