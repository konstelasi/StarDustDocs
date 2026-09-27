import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'StarDust',
  description: 'Documentation for StarDust, a vertical schema partitioning engine.',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/konstelasi/StarDustDocs' }
    ]
  }
})
