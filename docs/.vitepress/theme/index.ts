import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeHero from './components/HomeHero.vue'
import Term from './components/Term.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-before': () => h(HomeHero),
    }),
  enhanceApp({ app }) {
    app.component('Term', Term)
  },
} satisfies Theme
