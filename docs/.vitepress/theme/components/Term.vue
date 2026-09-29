<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import en from '../glossary-data/en.json'
import id from '../glossary-data/id.json'

const props = defineProps<{ id: string }>()

const { lang, site } = useData()

type Entry = { term: string; short: string }
const CATALOGS: Record<'en' | 'id', Record<string, Entry>> = { en, id }
const MORE_LABEL: Record<'en' | 'id', string> = {
  en: 'Full definition →',
  id: 'Definisi lengkap →',
}

const entry = computed<Entry>(() => {
  const localeKey = lang.value === 'id' ? 'id' : 'en'
  const found = CATALOGS[localeKey][props.id]
  if (!found) throw new Error(`<Term id="${props.id}"> has no matching glossary entry`)
  return found
})

const moreLabel = computed(() => MORE_LABEL[lang.value === 'id' ? 'id' : 'en'])

// Plain anchors bypass VitePress's link normalisation (same gotcha
// HomeHero.vue's own resolve() works around) — withBase() adds the /docs/
// base, and .html must be appended by hand when cleanUrls is off.
const glossaryHref = computed(() => {
  const path = lang.value === 'id' ? '/id/reference/glossary' : '/reference/glossary'
  let out = withBase(path)
  if (!site.value.cleanUrls) out += '.html'
  return `${out}#${props.id}`
})

const popupId = computed(() => `term-popup-${props.id}`)

/** Only one glossary popup open at a time, across every <Term> on the page. */
let activeClose: (() => void) | null = null

const GUTTER = 12
const OPEN_DELAY_MS = 80
const CLOSE_DELAY_MS = 220

interface Position {
  left: number
  top: number
  placement: 'above' | 'below'
  caretX: number
}

const open = ref(false)
const pos = ref<Position | null>(null)
const rootEl = ref<HTMLSpanElement | null>(null)
const triggerEl = ref<HTMLSpanElement | null>(null)
const popupEl = ref<HTMLDivElement | null>(null)

let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (openTimer) {
    clearTimeout(openTimer)
    openTimer = null
  }
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function close() {
  clearTimers()
  open.value = false
  pos.value = null
}

function openNow() {
  clearTimers()
  activeClose?.()
  activeClose = close
  open.value = true
}

function scheduleOpen() {
  clearTimers()
  openTimer = setTimeout(openNow, OPEN_DELAY_MS)
}

function scheduleClose() {
  clearTimers()
  closeTimer = setTimeout(close, CLOSE_DELAY_MS)
}

function reposition() {
  const trigger = triggerEl.value
  const popup = popupEl.value
  if (!trigger || !popup) return

  const rects = Array.from(trigger.getClientRects())
  if (rects.length === 0) {
    close()
    return
  }

  const anchorLeft = rects[0].left
  const anchorRight = rects[0].right
  const top = Math.min(...rects.map(r => r.top))
  const bottom = Math.max(...rects.map(r => r.bottom))

  if (bottom < 0 || top > window.innerHeight) {
    close()
    return
  }

  const popupRect = popup.getBoundingClientRect()
  const left = Math.min(
    Math.max(anchorLeft, GUTTER),
    Math.max(GUTTER, window.innerWidth - popupRect.width - GUTTER),
  )

  const fitsBelow = bottom + 8 + popupRect.height <= window.innerHeight - GUTTER
  const placement: Position['placement'] = fitsBelow ? 'below' : 'above'
  const placedTop = placement === 'below' ? bottom + 8 : top - popupRect.height - 8

  const caretX = Math.min(
    Math.max(anchorLeft + (anchorRight - anchorLeft) / 2 - left, 14),
    Math.max(14, popupRect.width - 14),
  )

  pos.value = { left, top: placedTop, placement, caretX }
}

// flush: 'post' runs after Vue patches the DOM for this `open` change, so
// trigger/popup already reflect the new hidden/visibility state before we
// measure — the same pre-paint timing Term.tsx gets from useLayoutEffect.
watch(
  open,
  (isOpen, _prev, onCleanup) => {
    if (!isOpen) return
    reposition()

    let raf = 0
    const onScrollOrResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(reposition)
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
    window.addEventListener('resize', onScrollOrResize, { passive: true })

    onCleanup(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScrollOrResize, { capture: true })
      window.removeEventListener('resize', onScrollOrResize)
    })
  },
  { flush: 'post' },
)

watch(open, (isOpen, _prev, onCleanup) => {
  if (!isOpen) return

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  const onPointerDown = (e: PointerEvent) => {
    const root = rootEl.value
    if (root && e.target instanceof Node && !root.contains(e.target)) close()
  }

  document.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onPointerDown)

  onCleanup(() => {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onPointerDown)
  })
})

onBeforeUnmount(clearTimers)

function onPointerEnter(e: PointerEvent) {
  if (e.pointerType === 'mouse') scheduleOpen()
}
function onPointerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') scheduleClose()
}
function onTriggerKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (open.value) close()
    else openNow()
  }
}
function closeUnlessStillInside(e: FocusEvent) {
  const next = e.relatedTarget
  if (next instanceof Node && rootEl.value?.contains(next)) return
  close()
}

const popupStyle = computed(() => {
  if (!pos.value) return { left: '0px', top: '0px', visibility: 'hidden' as const }
  return {
    left: `${pos.value.left}px`,
    top: `${pos.value.top}px`,
    visibility: 'visible' as const,
    '--caret-x': `${pos.value.caretX}px`,
  }
})
</script>

<template>
  <span ref="rootEl" class="root">
    <span
      ref="triggerEl"
      role="button"
      tabindex="0"
      :aria-expanded="open"
      :aria-controls="popupId"
      class="trigger"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @click="open ? close() : openNow()"
      @focus="openNow"
      @blur="closeUnlessStillInside"
      @keydown="onTriggerKeyDown"
    ><slot /></span>
    <div
      ref="popupEl"
      :id="popupId"
      :hidden="!open"
      class="popup"
      :style="popupStyle"
      :data-placement="pos?.placement ?? 'below'"
      @pointerenter="clearTimers"
      @pointerleave="onPointerLeave"
    >
      <strong class="term">{{ entry.term }}</strong>
      <p class="short">{{ entry.short }}</p>
      <a class="more" :href="glossaryHref" @blur="closeUnlessStillInside">{{ moreLabel }}</a>
    </div>
  </span>
</template>

<style scoped>
.root {
  position: relative;
  display: inline;
}

.trigger {
  display: inline;
  border-bottom: 1px dotted var(--vp-c-indigo-1);
  cursor: help;
  touch-action: manipulation;
}
.trigger:hover,
.trigger:focus-visible {
  border-bottom-style: solid;
}
.trigger:focus-visible {
  outline: 2px solid var(--vp-c-indigo-1);
  outline-offset: 2px;
  border-radius: 3px;
}

.popup {
  position: fixed;
  z-index: 70;
  width: max-content;
  max-width: min(320px, calc(100vw - 24px));
  padding: 12px 14px;
  background: var(--sd-well);
  border: 1px solid var(--sd-border-hover);
  border-radius: 10px;
  box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.95);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: normal;
  cursor: auto;
}

.popup::before {
  content: '';
  position: absolute;
  left: var(--caret-x, 20px);
  width: 9px;
  height: 9px;
  background: var(--sd-well);
  border: 1px solid var(--sd-border-hover);
  transform: translateX(-50%) rotate(45deg);
}
.popup[data-placement='below']::before {
  top: -5px;
  border-right: none;
  border-bottom: none;
}
.popup[data-placement='above']::before {
  bottom: -5px;
  border-left: none;
  border-top: none;
}

.term {
  display: block;
  margin: 0 0 4px;
  color: var(--vp-c-text-1);
  font-size: 13px;
}

.short {
  margin: 0;
  color: var(--vp-c-text-2);
  /* VitePress's own `.vp-doc p { line-height: 28px }` directly targets this
     <p>, and a direct rule on an element always beats an inherited value
     (the `line-height: 1.5` on .popup) regardless of specificity — so it
     must be set here explicitly, not left to inherit. */
  line-height: 1.5;
}

.more {
  display: inline-block;
  margin-top: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-indigo-1);
  text-decoration: none;
}
.more:hover {
  text-decoration: underline;
}
</style>
