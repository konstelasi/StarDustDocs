<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import HeroStarfield from './HeroStarfield.vue'

interface LandingAction {
  text: string
  link: string
  icon?: 'arrow' | 'help' | 'github'
}

interface Landing {
  badge: { text: string; link: string }
  titleLine1: string
  titleLine2: string
  lede: string
  actions: LandingAction[]
}

const { frontmatter, site, isDark } = useData()
const landing = computed<Landing | undefined>(() => frontmatter.value.landing)

const isExternal = (link: string) => /^https?:\/\//.test(link)

// Plain anchors bypass VitePress's link normalisation, which is what
// appends .html when cleanUrls is off, so do the same here.
function resolve(link: string) {
  if (isExternal(link)) return link
  const [path, hash] = link.split('#')
  let out = withBase(path)
  if (!site.value.cleanUrls && !out.endsWith('/') && !/\.\w+$/.test(out)) out += '.html'
  return hash ? `${out}#${hash}` : out
}
</script>

<template>
  <section v-if="landing" class="SdHero">
    <div class="bg" aria-hidden="true">
      <ClientOnly>
        <HeroStarfield v-if="isDark" />
      </ClientOnly>
      <div class="glow" />
    </div>

    <div class="inner">
      <a class="badge" :href="resolve(landing.badge.link)">
        <span class="dot" />
        {{ landing.badge.text }}
      </a>

      <h1 class="title">
        {{ landing.titleLine1 }}
        <br />
        <span class="grad">{{ landing.titleLine2 }}</span>
      </h1>

      <p class="lede">{{ landing.lede }}</p>

      <div class="ctas">
        <a
          v-for="(action, i) in landing.actions"
          :key="action.link"
          class="btn"
          :class="{ primary: i === 0 }"
          :href="resolve(action.link)"
          :target="isExternal(action.link) ? '_blank' : undefined"
          :rel="isExternal(action.link) ? 'noreferrer' : undefined"
        >
          <svg
            v-if="action.icon === 'arrow'"
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <svg
            v-else-if="action.icon === 'help'"
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
          <svg
            v-else-if="action.icon === 'github'"
            class="icon"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          {{ action.text }}
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.SdHero {
  position: relative;
  overflow: hidden;
  /* Same pull-under-the-nav trick VPHero uses: the bar is transparent at
     the top of a home page, so the hero background has to run behind it. */
  margin-top: calc((var(--vp-nav-height) + var(--vp-layout-top-height, 0px)) * -1);
  padding: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + clamp(40px, 6vw, 72px))
    24px clamp(56px, 7vw, 88px);
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.glow {
  position: absolute;
  top: -30%;
  left: 50%;
  width: min(1100px, 120vw);
  height: 780px;
  transform: translateX(-50%);
  background: radial-gradient(
    ellipse at center,
    rgba(var(--sd-accent-rgb), var(--sd-glow-alpha)) 0%,
    rgba(var(--sd-indexed-rgb), calc(var(--sd-glow-alpha) * 0.4)) 38%,
    transparent 68%
  );
  filter: blur(6px);
}

.inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  max-width: 1152px;
  text-align: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 13px;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg-elv) 70%, transparent);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.3;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.14s, border-color 0.14s;
}

.badge:hover {
  color: var(--vp-c-text-1);
  border-color: var(--sd-border-hover);
}

.dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sd-pending);
}

.title {
  margin: 26px 0 0;
  max-width: 17ch;
  font-size: clamp(34px, 6.2vw, 66px);
  font-weight: 600;
  letter-spacing: -0.032em;
  line-height: 1.05;
  color: var(--vp-c-text-1);
}

.grad {
  background: var(--sd-title-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lede {
  margin: 24px 0 0;
  max-width: 62ch;
  font-size: clamp(16px, 1.6vw, 18.5px);
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.ctas {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 34px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.4;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: background 0.14s, border-color 0.14s, transform 0.14s;
}

.btn:hover {
  border-color: var(--sd-border-hover);
  background: var(--vp-c-bg-elv);
}

.btn:active {
  transform: translateY(1px);
}

.btn.primary {
  border-color: var(--sd-btn-border);
  background: var(--sd-btn-gradient);
  font-weight: 600;
  color: var(--sd-on-accent);
}

.btn.primary:hover {
  border-color: var(--sd-btn-border-hover);
  background: var(--sd-btn-gradient-hover);
}

.icon {
  flex: none;
  width: 16px;
  height: 16px;
}
</style>
