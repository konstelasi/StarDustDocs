---
layout: home

# Hero rendered by .vitepress/theme/components/HomeHero.vue, not VitePress's
# built-in hero. The first action is the primary button. Cards are one per
# documentation section, in sidebar order.
landing:
  badge:
    text: Documentation · v0.3.0-alpha.1
    link: /project/changelog
  titleLine1: The StarDust documentation,
  titleLine2: from first query to production.
  lede: Guides, concepts and reference for filtering dynamic fields through native SQL indexes on MySQL and MariaDB. From installation and schema changes to the background daemons and the full API.
  actions:
    - text: Get Started
      link: /guide/installation
      icon: arrow
    - text: Why StarDust?
      link: /guide/is-it-a-fit
      icon: help
    - text: GitHub
      link: https://github.com/konstelasi/StarDust
      icon: github

features:
  - icon: '<span class="sd-icon sd-icon-play"></span>'
    title: Getting Started
    details: What StarDust is, whether it fits, and how to install it and run your first query.
    link: /guide/what-is-stardust
  - icon: '<span class="sd-icon sd-icon-layers"></span>'
    title: How It Works
    details: Tenants, models, slots and pages, and how filterable fields become indexed columns.
    link: /concepts/architecture
  - icon: '<span class="sd-icon sd-icon-code"></span>'
    title: Using StarDust
    details: Configure, write, read, search and export, with worked examples for each.
    link: /usage/configuration
  - icon: '<span class="sd-icon sd-icon-refresh"></span>'
    title: Changing Your Schema
    details: Retype, rename, promote and delete fields and models without downtime.
    link: /schema-changes/
  - icon: '<span class="sd-icon sd-icon-server"></span>'
    title: Running in Production
    details: Deploy, run and monitor the background daemons, then tune, secure and back up.
    link: /operations/deployment
  - icon: '<span class="sd-icon sd-icon-plus"></span>'
    title: Extending
    details: Plug in your own search driver by implementing one interface.
    link: /extending/custom-search-drivers
  - icon: '<span class="sd-icon sd-icon-book"></span>'
    title: Reference
    details: The full API, configuration, CLI, errors, log events and glossary.
    link: /reference/api
  - icon: '<span class="sd-icon sd-icon-info"></span>'
    title: Project
    details: Changelog, versioning policy, contributing, and the legacy 0.2.x line.
    link: /project/changelog
---
