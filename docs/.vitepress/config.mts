import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'StarDust',
  description: 'Documentation for StarDust, a vertical schema partitioning engine.',

  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/konstelasi/StarDust' },
    ],
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/what-is-stardust' },
          { text: 'Concepts', link: '/concepts/architecture' },
          { text: 'Usage', link: '/usage/configuration' },
          { text: 'Operations', link: '/operations/deployment' },
          { text: 'Reference', link: '/reference/api' },
          {
            text: '0.3.0-alpha.1',
            items: [
              { text: 'Changelog', link: '/project/changelog' },
              { text: 'Contributing', link: '/project/contributing' },
              { text: '0.2.x legacy', link: '/project/legacy-0-2' },
            ],
          },
        ],
        sidebar: [
          {
            text: 'Getting Started',
            items: [
              { text: 'What is StarDust?', link: '/guide/what-is-stardust' },
              { text: 'Is StarDust a fit?', link: '/guide/is-it-a-fit' },
              { text: 'Requirements', link: '/guide/requirements' },
              { text: 'Installation', link: '/guide/installation' },
              { text: 'Try it in five minutes', link: '/guide/quickstart' },
              { text: 'Complete example', link: '/guide/tutorial' },
              { text: 'Runnable examples', link: '/guide/examples' },
              { text: 'Frequently asked questions', link: '/guide/faq' },
            ],
          },
          {
            text: 'How It Works',
            items: [
              { text: 'Architecture at a glance', link: '/concepts/architecture' },
              { text: 'Tenants, models and fields', link: '/concepts/tenants-models-fields' },
              { text: 'Entries and payloads', link: '/concepts/entries-and-payloads' },
              { text: 'Slots and pages', link: '/concepts/slots-and-pages' },
              { text: 'Filterable vs. indexed', link: '/concepts/filterable-vs-indexed' },
              { text: 'Background work and eventual consistency', link: '/concepts/background-work' },
            ],
          },
          {
            text: 'Using StarDust',
            items: [
              { text: 'Configuration', link: '/usage/configuration' },
              { text: 'Defining models and fields', link: '/usage/defining-schema' },
              { text: 'Writing entries', link: '/usage/writing-entries' },
              { text: 'Bulk and async imports', link: '/usage/bulk-imports' },
              { text: 'Updating and deleting entries', link: '/usage/updating-and-deleting' },
              { text: 'Reading entries', link: '/usage/reading-entries' },
              { text: 'Searching', link: '/usage/searching' },
              { text: 'The QueryFilter wire format', link: '/usage/query-filter' },
              { text: 'Exports', link: '/usage/exports' },
              { text: 'Integrating with your application', link: '/usage/integrating' },
              { text: 'Testing code that uses StarDust', link: '/usage/testing-your-app' },
            ],
          },
          {
            text: 'Changing Your Schema',
            items: [
              { text: 'Changing your schema', link: '/schema-changes/' },
              { text: "Changing a field's type", link: '/schema-changes/retype' },
              { text: 'Promoting and demoting filterability', link: '/schema-changes/filterability' },
              { text: 'Renaming fields and models', link: '/schema-changes/renaming' },
              { text: 'Deleting a field', link: '/schema-changes/deleting-fields' },
              { text: 'Deleting a model', link: '/schema-changes/deleting-models' },
            ],
          },
          {
            text: 'Running in Production',
            items: [
              { text: 'Deployment', link: '/operations/deployment' },
              { text: 'Watcher', link: '/operations/watcher' },
              { text: 'Reconciler', link: '/operations/reconciler' },
              { text: 'Liberator', link: '/operations/liberator' },
              { text: 'Chronicler', link: '/operations/chronicler' },
              { text: 'Slot maintenance', link: '/operations/slot-maintenance' },
              { text: 'Observability', link: '/operations/observability' },
              { text: 'Security', link: '/operations/security' },
              { text: 'Tuning', link: '/operations/tuning' },
              { text: 'Upgrading', link: '/operations/upgrading' },
              { text: 'Backup and restore', link: '/operations/backup-and-restore' },
              { text: 'Troubleshooting', link: '/operations/troubleshooting' },
            ],
          },
          {
            text: 'Extending',
            items: [
              { text: 'Custom search drivers', link: '/extending/custom-search-drivers' },
            ],
          },
          {
            text: 'Reference',
            items: [
              { text: 'StarDust API', link: '/reference/api' },
              { text: 'Configuration reference', link: '/reference/configuration' },
              { text: 'CLI reference', link: '/reference/cli' },
              { text: 'Errors', link: '/reference/errors' },
              { text: 'Types', link: '/reference/types' },
              { text: 'Tables in your database', link: '/reference/database-tables' },
              { text: 'Log events', link: '/reference/log-events' },
              { text: 'Glossary', link: '/reference/glossary' },
            ],
          },
          {
            text: 'Project',
            items: [
              { text: 'Changelog', link: '/project/changelog' },
              { text: 'Versioning and stability', link: '/project/versioning' },
              { text: 'Contributing', link: '/project/contributing' },
              { text: 'The 0.2.x line', link: '/project/legacy-0-2' },
            ],
          },
        ],
      },
    },

    id: {
      label: 'Bahasa Indonesia',
      lang: 'id',
      link: '/id/',
      themeConfig: {
        nav: [
          { text: 'Memulai', link: '/id/guide/what-is-stardust' },
          { text: 'Cara Kerja', link: '/id/concepts/architecture' },
          { text: 'Menggunakan StarDust', link: '/id/usage/configuration' },
          { text: 'Menjalankan di Produksi', link: '/id/operations/deployment' },
          { text: 'Referensi', link: '/id/reference/api' },
          {
            text: '0.3.0-alpha.1',
            items: [
              { text: 'Catatan perubahan', link: '/id/project/changelog' },
              { text: 'Berkontribusi', link: '/id/project/contributing' },
              { text: 'Seri 0.2.x', link: '/id/project/legacy-0-2' },
            ],
          },
        ],
        sidebar: [
          {
            text: 'Memulai',
            items: [
              { text: 'Apa itu StarDust?', link: '/id/guide/what-is-stardust' },
              { text: 'Apakah StarDust cocok untuk Anda?', link: '/id/guide/is-it-a-fit' },
              { text: 'Persyaratan', link: '/id/guide/requirements' },
              { text: 'Instalasi', link: '/id/guide/installation' },
              { text: 'Coba dalam lima menit', link: '/id/guide/quickstart' },
              { text: 'Contoh lengkap', link: '/id/guide/tutorial' },
              { text: 'Contoh yang bisa dijalankan', link: '/id/guide/examples' },
              { text: 'Pertanyaan yang sering diajukan', link: '/id/guide/faq' },
            ],
          },
          {
            text: 'Cara Kerja',
            items: [
              { text: 'Sekilas arsitektur', link: '/id/concepts/architecture' },
              { text: 'Tenant, model, dan field', link: '/id/concepts/tenants-models-fields' },
              { text: 'Entry dan payload', link: '/id/concepts/entries-and-payloads' },
              { text: 'Slot dan page', link: '/id/concepts/slots-and-pages' },
              { text: 'Filterable vs. indexed', link: '/id/concepts/filterable-vs-indexed' },
              { text: 'Pekerjaan latar belakang dan konsistensi eventual', link: '/id/concepts/background-work' },
            ],
          },
          {
            text: 'Menggunakan StarDust',
            items: [
              { text: 'Konfigurasi', link: '/id/usage/configuration' },
              { text: 'Mendefinisikan model dan field', link: '/id/usage/defining-schema' },
              { text: 'Menulis entry', link: '/id/usage/writing-entries' },
              { text: 'Impor massal dan asinkron', link: '/id/usage/bulk-imports' },
              { text: 'Memperbarui dan menghapus entry', link: '/id/usage/updating-and-deleting' },
              { text: 'Membaca entry', link: '/id/usage/reading-entries' },
              { text: 'Pencarian', link: '/id/usage/searching' },
              { text: 'Format wire QueryFilter', link: '/id/usage/query-filter' },
              { text: 'Ekspor', link: '/id/usage/exports' },
              { text: 'Integrasi dengan aplikasi Anda', link: '/id/usage/integrating' },
              { text: 'Menguji kode yang memakai StarDust', link: '/id/usage/testing-your-app' },
            ],
          },
          {
            text: 'Mengubah Skema',
            items: [
              { text: 'Mengubah skema', link: '/id/schema-changes/' },
              { text: 'Mengubah tipe field', link: '/id/schema-changes/retype' },
              { text: 'Promosi dan demosi filterability', link: '/id/schema-changes/filterability' },
              { text: 'Mengganti nama field dan model', link: '/id/schema-changes/renaming' },
              { text: 'Menghapus field', link: '/id/schema-changes/deleting-fields' },
              { text: 'Menghapus model', link: '/id/schema-changes/deleting-models' },
            ],
          },
          {
            text: 'Menjalankan di Produksi',
            items: [
              { text: 'Deployment', link: '/id/operations/deployment' },
              { text: 'Watcher', link: '/id/operations/watcher' },
              { text: 'Reconciler', link: '/id/operations/reconciler' },
              { text: 'Liberator', link: '/id/operations/liberator' },
              { text: 'Chronicler', link: '/id/operations/chronicler' },
              { text: 'Perawatan slot', link: '/id/operations/slot-maintenance' },
              { text: 'Observabilitas', link: '/id/operations/observability' },
              { text: 'Keamanan', link: '/id/operations/security' },
              { text: 'Penyetelan', link: '/id/operations/tuning' },
              { text: 'Upgrade', link: '/id/operations/upgrading' },
              { text: 'Backup dan pemulihan', link: '/id/operations/backup-and-restore' },
              { text: 'Pemecahan masalah', link: '/id/operations/troubleshooting' },
            ],
          },
          {
            text: 'Pengembangan Lanjutan',
            items: [
              { text: 'Driver pencarian kustom', link: '/id/extending/custom-search-drivers' },
            ],
          },
          {
            text: 'Referensi',
            items: [
              { text: 'API StarDust', link: '/id/reference/api' },
              { text: 'Referensi konfigurasi', link: '/id/reference/configuration' },
              { text: 'Referensi CLI', link: '/id/reference/cli' },
              { text: 'Error', link: '/id/reference/errors' },
              { text: 'Tipe data', link: '/id/reference/types' },
              { text: 'Tabel di database Anda', link: '/id/reference/database-tables' },
              { text: 'Event log', link: '/id/reference/log-events' },
              { text: 'Glosarium', link: '/id/reference/glossary' },
            ],
          },
          {
            text: 'Proyek',
            items: [
              { text: 'Catatan perubahan', link: '/id/project/changelog' },
              { text: 'Versi dan stabilitas', link: '/id/project/versioning' },
              { text: 'Berkontribusi', link: '/id/project/contributing' },
              { text: 'Seri 0.2.x', link: '/id/project/legacy-0-2' },
            ],
          },
        ],
      },
    },
  },
})
