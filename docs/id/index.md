---
layout: home

# Hero dirender oleh .vitepress/theme/components/HomeHero.vue, bukan hero
# bawaan VitePress. Aksi pertama adalah tombol utama. Kartu mewakili satu
# bagian dokumentasi per kartu, sesuai urutan sidebar.
landing:
  badge:
    text: Dokumentasi · v0.3.0-alpha.1
    link: /id/project/changelog
  titleLine1: Dokumentasi StarDust,
  titleLine2: dari query pertama sampai produksi.
  lede: Panduan, konsep, dan referensi untuk memfilter field dinamis dengan kecepatan indeks SQL asli di MySQL dan MariaDB. Mulai dari instalasi dan perubahan skema, daemon latar belakang, sampai API lengkap.
  actions:
    - text: Mulai
      link: /id/guide/installation
      icon: arrow
    - text: Mengapa StarDust?
      link: /id/guide/is-it-a-fit
      icon: help
    - text: GitHub
      link: https://github.com/konstelasi/StarDust
      icon: github

features:
  - icon: '<span class="sd-icon sd-icon-play"></span>'
    title: Memulai
    details: Apa itu StarDust, apakah cocok untuk Anda, cara menginstalnya, dan menjalankan query pertama.
    link: /id/guide/what-is-stardust
  - icon: '<span class="sd-icon sd-icon-layers"></span>'
    title: Cara Kerja
    details: Tenant, model, slot, dan page, serta bagaimana field filterable menjadi kolom terindeks.
    link: /id/concepts/architecture
  - icon: '<span class="sd-icon sd-icon-code"></span>'
    title: Menggunakan StarDust
    details: Konfigurasi, menulis, membaca, mencari, dan mengekspor, lengkap dengan contoh.
    link: /id/usage/configuration
  - icon: '<span class="sd-icon sd-icon-refresh"></span>'
    title: Mengubah Skema
    details: Ubah tipe, ganti nama, promosikan, dan hapus field maupun model tanpa downtime.
    link: /id/schema-changes/
  - icon: '<span class="sd-icon sd-icon-server"></span>'
    title: Menjalankan di Produksi
    details: Deploy, jalankan, dan pantau daemon latar belakang, lalu setel, amankan, dan backup.
    link: /id/operations/deployment
  - icon: '<span class="sd-icon sd-icon-plus"></span>'
    title: Pengembangan Lanjutan
    details: Pasang driver pencarian Anda sendiri dengan mengimplementasikan satu interface.
    link: /id/extending/custom-search-drivers
  - icon: '<span class="sd-icon sd-icon-book"></span>'
    title: Referensi
    details: API lengkap, konfigurasi, CLI, error, event log, dan glosarium.
    link: /id/reference/api
  - icon: '<span class="sd-icon sd-icon-info"></span>'
    title: Proyek
    details: Catatan perubahan, kebijakan versi, kontribusi, dan seri 0.2.x.
    link: /id/project/changelog
---
