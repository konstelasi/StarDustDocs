# Sekilas arsitektur

StarDust adalah library PHP ditambah empat proses latar belakang kecil, semuanya berjalan di atas database MySQL atau MariaDB yang sudah Anda pakai. Tidak ada search cluster, message broker, atau layanan terpisah yang perlu di-deploy. Rancangannya punya nama: <Term id="vertical-schema-partitioning">vertical schema partitioning</Term>. Setiap entry dipecah menjadi dua bagian, yaitu payload JSON lengkap untuk penyimpanan dan sekumpulan kolom bertipe yang terindeks untuk query.

Kalau ada istilah di halaman ini yang belum Anda kenal, [glosarium](/id/reference/glossary) menjelaskan semuanya dengan bahasa sederhana. Bagian pembukanya, [Bagaimana semuanya saling terhubung](/id/reference/glossary#bagaimana-semuanya-saling-terhubung), merangkai istilah-istilah inti sekali jalan.

## System of record

Payload lengkap setiap entry disimpan sebagai JSON di tabel bernama `entry_data`. Inilah <Term id="system-of-record">system of record</Term>: tabel ini selalu memegang entry secara utuh, semua field, baik filterable maupun tidak, dan tidak ada bagian lain dari engine yang boleh berbeda dengannya.

Kalau hanya sampai di sini, hasilnya adalah document store yang tidak bisa di-query dengan efisien. Karena itu ada bagian kedua dari rancangannya.

## Extension page dan kolom slot

Field yang Anda tandai <Term id="filterable">filterable</Term> juga disalin ke sebuah kolom bertipe yang terindeks, disebut <Term id="slot">slot</Term>, di sebuah <Term id="extension-page">extension page</Term>. Extension page adalah tabel samping (`entry_slots_page_1`, `entry_slots_page_2`, dan seterusnya) yang berelasi satu-satu dengan `entry_data`. Filter pada field tersebut membaca B-tree index sungguhan, bukan memindai JSON.

```text
                       write(EntryPayload)
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  entry_data            (system of record — full payload)    │
   │  id │ tenant_id │ model_id │ fields (JSON)                  │
   │   7 │     1     │    42    │ {"name":"Acme","employees":340,│
   │     │           │          │  "city":"Berlin"}              │
   └─────────────────────────────────────────────────────────────┘
                                │  mirror the filterable fields
                                │  into typed slot columns
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  entry_slots_page_1    (indexed 1:1 extension page)         │
   │  entry_id │ i_str_01 │ i_int_01 │ …  (typed slot columns)   │
   │     7     │  "Acme"  │   340    │                           │
   │           │ (name)   │(employees)                           │
   └─────────────────────────────────────────────────────────────┘
        ▲ composite index (tenant_id, i_str_01), (tenant_id, i_int_01), …

   "city" tidak pernah dijadikan filterable, jadi tidak memakai kolom
   slot sama sekali. Ia hanya ada di JSON: tetap bisa dibaca, tetapi
   tidak terindeks.
```

Dua konsekuensi dari pemisahan ini perlu diingat:

- **Field non-filterable itu gratis.** Ia tidak memakai slot dan tidak menambah beban pemeliharaan index. Jadikan sebuah field filterable hanya bila Anda memang perlu memfilter atau mengurutkan berdasarkan field itu.
- **Slot bisa dibangun ulang kapan saja.** Karena payload adalah sumber yang sah, engine bebas mengosongkan, memindahkan, atau mengisi ulang slot tanpa risiko apa pun bagi data Anda. Konversi yang gagal atau slot yang kosong hanya memengaruhi apa yang bisa di-*query*, tidak pernah apa yang *tersimpan*.

Sebuah page dibuat dengan sekumpulan kolom terindeks yang tetap dan tidak pernah diubah sesudahnya. Lihat [Slot dan page](/id/concepts/slots-and-pages) untuk cara kapasitas dikelola.

## Schema registry

Engine mencatat pembukuannya sendiri di sekumpulan tabel berawalan `stardust_`: model dan field apa saja yang ada, page apa saja yang ada, dan field mana yang saat ini memegang slot mana. Inilah **schema registry**. Anda membuatnya sekali dengan `bootstrap` dan membacanya lewat API introspeksi ([`listModels()` dan `describeModel()`](/id/usage/defining-schema)), bukan dengan meng-query tabelnya.

Registry menyimpan satu penghitung **schema version** yang dinaikkan setiap kali ada perubahan state yang relevan bagi koordinasi. Jalur baca menyimpan cache hasil lookup skema dan memakai penghitung itu untuk tahu kapan cache-nya sudah usang, sehingga perubahan skema yang sedang berjalan langsung terbaca tanpa perlu me-restart aplikasi Anda.

## Empat daemon latar belakang

Empat proses yang berjalan lama menjaga mesin slot tetap sehat. Semuanya dijalankan lewat `bin/stardust`:

```text
        ┌──────────── MySQL — sole coordination point ──────────────┐
        │   entry_data · entry_slots_page_N · stardust_* registry   │
        └───────────────────────────────────────────────────────────┘
             ▲             ▲              ▲                ▲
   provisions│     drains  │    reclaims  │      streams   │
   capacity  │     queues  │    freed     │      exports   │
             │             │    slots     │                │
      ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
      │ Watcher  │  │ Reconciler │  │ Liberator  │  │ Chronicler │
      │ singleton│  │multi-worker│  │multi-worker│  │multi-worker│
      └──────────┘  └────────────┘  └────────────┘  └────────────┘
```

| Daemon | Tugasnya | Jumlah |
| :-- | :-- | :-- |
| [Watcher](/id/operations/watcher) | Menambah page terindeks saat kapasitas menipis atau saat ada field filterable yang menunggu slot. | Tepat satu |
| [Reconciler](/id/operations/reconciler) | Mengerjakan semua pekerjaan "menyusul": menguras sync queue dan impor asinkron, serta menuntaskan retype, rename, dan penghapusan. | Berapa pun |
| [Liberator](/id/operations/liberator) | Mengosongkan nilai dari slot yang tidak lagi dipakai, lalu mengembalikannya ke kumpulan slot bebas. | Berapa pun |
| [Chronicler](/id/operations/chronicler) | Mengubah export job menjadi file CSV atau JSON. | Berapa pun |

Kalau host Anda tidak bisa menjalankan proses yang hidup lama, `bin/stardust tick` menjalankan satu putaran terbatas dari Watcher, Liberator, dan Reconciler lewat baris cron. Lihat [Deployment](/id/operations/deployment).

## Database sebagai satu-satunya titik koordinasi

Para daemon tidak pernah berbicara satu sama lain, dan tidak ada message bus. Semua yang perlu mereka sepakati tersimpan di database, sehingga:

- daemon mana pun bisa crash lalu dijalankan ulang tanpa kehilangan state;
- Anda bisa menjalankan beberapa worker untuk daemon yang mendukung multi-worker, dan mereka membagi pekerjaan tanpa saling mengganggu;
- satu-satunya infrastruktur tambahan yang dibutuhkan StarDust di luar aplikasi Anda adalah database yang memang sudah Anda punya.

## Menelusuri satu penulisan dari awal sampai akhir

Inilah yang terjadi ketika Anda memanggil `write()` untuk entry yang modelnya punya dua field filterable:

1. **Validasi.** Tenant id diperiksa (harus 1 atau lebih) dan field-field milik model diambil dari registry.
2. **Satu transaksi.** Payload lengkap dimasukkan ke `entry_data`. Untuk setiap field filterable yang punya slot aktif, nilainya di-upsert ke baris extension page yang sesuai, satu statement per page. Field non-filterable tidak disalin sama sekali.
3. **Kalau ada field filterable yang belum punya slot,** nilainya tetap masuk ke payload, entry ditambahkan ke **sync queue** kecil dalam transaksi yang sama, dan pemanggilan tetap berhasil. `EntryWriteResult::$enqueuedForBackfill` memberi tahu Anda bahwa hal ini terjadi. Inilah [exhaustion fallback](/id/concepts/filterable-vs-indexed#penulisan-tidak-pernah-gagal-karena-kehabisan-slot).
4. **Pemanggilan selesai.** Entry langsung bisa dibaca dan, untuk field yang punya slot, langsung bisa difilter.

Kemudian, di latar belakang, Watcher menyediakan page yang punya ruang untuk slot yang belum ada itu, dan Reconciler menguras sync queue sambil mengisi nilai slot. Setelah itu entry bisa difilter pada semua field-nya. Tidak ada yang perlu Anda ubah di sela-selanya.

Pola yang sama berulang pada setiap operasi yang tidak bisa selesai dalam satu request: pemanggilan meng-commit apa yang bisa, lalu kembali, dan sebuah daemon menyelesaikan sisanya. [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work) merinci operasi mana saja yang bekerja seperti ini.
