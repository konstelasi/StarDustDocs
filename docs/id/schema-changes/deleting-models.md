# Menghapus model

```php
$deleted = $engine->deleteModel(tenantId: 42, modelId: $modelId);
```

**Ini satu-satunya operasi di engine yang benar-benar menghapus baris entry secara fisik, dan tidak ada undelete.** Entry, nilai slot terindeksnya, dan penulisan yang masih tertunda semuanya dihancurkan, beserta definisi field dan model itu sendiri. Mengembalikan `false`, bukan melempar exception, saat memang tidak ada yang perlu dilakukan — modelnya tidak ada untuk tenant ini, atau penghapusannya sudah berjalan.

## Yang langsung hilang

Model itu lenyap dari semua yang bisa Anda amati begitu method-nya kembali. `listModels()` dan `describeModel()` berhenti melaporkannya, dan `read()`, `search()`, serta `get()` menjadi **gelap** — halaman kosong, `null` dari `get()`, persis seperti model itu tidak pernah didaftarkan. Ini beda yang disengaja dari penghapusan field, tempat entry di sekitarnya tetap bertahan dengan satu field yang hilang: di sini tidak ada entry yang tersisa untuk dilayani.

## Penulisan ditolak

Kalau penghapusan field diam-diam membuang key yang dihapus dan menyimpan sisa entry-nya, penghapusan model tidak bisa melakukan itu — tidak ada entry sah yang tersisa untuk ditumpangi penulisan yang masuk. `write()`, `updateEntry()`, `bulkWrite()`, dan `submitBulkWrite()` semuanya memunculkan `ModelDeletionInProgressException`; `deleteEntry()` mengembalikan `false`, sesuai bentuk idempotennya yang biasa. [`compactModel()`](/id/operations/slot-maintenance) dan [`submitExport()`](/id/usage/exports) ditolak dengan alasan yang sama — tidak ada lagi yang layak dipadatkan atau diekspor.

## Pembersihan di latar belakang

Yang tertinggal adalah data itu sendiri. [Reconciler](/id/operations/reconciler) menghapus entry-entry model itu per chunk yang terbatas dan menghapus baris registry model itu — ikut menghapus baris field-nya juga — sebagai langkah terakhir. Sampai selesai, baris-barisnya masih secara fisik tersimpan: tidak terjangkau lewat API, terlihat di dump tabel mentah, dan ekspor yang sudah diklaim [Chronicler](/id/operations/chronicler) sebelum Anda memanggil ini akan menghasilkan artifact kosong, bukan gagal.

## Data yang terhapus tidak bisa dikembalikan

Nama model itu belum bisa dipakai lagi sebelum pembersihannya selesai: `createModel()` dan `defineModel()` memunculkan `ModelDeletionInProgressException`, bukan diam-diam mengembalikan id model yang sedang dihancurkan — penting diketahui bila ada skrip seed yang mungkin berjalan ulang selama window itu.

Model tidak bisa dihapus selagi salah satu field-nya sedang punya rename, retype, atau penghapusan field yang berjalan — `RenameInProgressException`, `RetypeInProgressException`, atau `FieldDeletionInProgressException` — dan sebaliknya, begitu penghapusan model dimulai, tidak satu pun dari ketiganya bisa dimulai pada field-field miliknya. Lihat [Operasi yang saling menghalangi](/id/schema-changes/#operasi-yang-saling-menghalangi).

Kalau Anda mungkin masih membutuhkan datanya nanti, [ekspor dulu](/id/usage/exports) dan tunggu job-nya selesai sebelum menghapus — ini adalah ketidakterbalikan yang sama yang sengaja dihindari oleh [soft deletion di level entry](/id/concepts/entries-and-payloads#soft-deletion), yang tidak pernah benar-benar menghapus barisnya.
