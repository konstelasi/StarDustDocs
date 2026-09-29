# Apa itu StarDust?

StarDust adalah library PHP yang memberi setiap tenant di aplikasi Anda field mereka sendiri, dan memungkinkan Anda memfilter field tersebut lewat index SQL native. Ia berjalan di database MySQL atau MariaDB yang sudah Anda pakai, tanpa search cluster terpisah yang harus dioperasikan.

```php
// "industry" dan "employees" adalah field buatan pengguna, bukan kolom tabel,
// namun query ini dikompilasi menjadi range scan terindeks, bukan table scan.
$page = $engine->read(new EntryQuery(
    tenantId: 1,
    modelId:  $companyModelId,
    filter:   new AndNode([
        LeafNode::local('industry',  'eq', 'software'),
        LeafNode::local('employees', 'gt', 100),
    ]),
    selectFields: ['name', 'employees'],
));
```

Ia adalah package Composer yang tidak terikat framework. Dependensi runtime-nya hanya interface `psr/log` dan `psr/clock`: tanpa framework, ORM, atau query builder.

## Masalahnya: field dinamis yang tetap bisa difilter

Banyak aplikasi membiarkan setiap pelanggan mendefinisikan datanya sendiri: custom field pada kontak, form builder, tipe record per workspace. Menyimpan data itu mudah. Meng-query-nya adalah bagian yang membuat desain yang lazim kewalahan:

- **Satu kolom per field** menuntut perubahan skema setiap kali pelanggan menambah field, yang tidak skalabel untuk ribuan tenant dengan bentuk data berbeda-beda.
- **Tabel entity-attribute-value** (satu baris per nilai field) bisa menyimpan apa saja, tetapi memfilter dua field butuh dua self-join, tiga field butuh tiga, dan database melambat tajam seiring tabel membesar.
- **Kolom JSON** fleksibel dan murah untuk ditulis, tetapi filter pada nilai di dalamnya tidak bisa memakai index biasa, sehingga setiap query memindai.
- **Search engine terpisah** menyelesaikan masalah query tetapi menambah sistem kedua yang harus dijalankan, diamankan, di-backup, dan dijaga tetap sinkron.

## Cara StarDust mengatasinya

StarDust menyimpan setiap entry dalam dua bentuk. Record lengkapnya disimpan sebagai JSON, yang selalu menjadi salinan otoritatif. Setiap field yang Anda tandai filterable *juga* disalin ke kolom bertipe dengan B-tree index sungguhan, di tabel samping yang berelasi satu-satu dengan entry. Penyimpanan tetap schemaless dan murah, sementara filter membaca index. Rancangan ini disebut <Term id="vertical-schema-partitioning">vertical schema partitioning</Term>.

Di sekeliling gagasan itu, StarDust menambahkan bagian-bagian yang membuatnya layak dipakai di produksi:

- **Penulisan tidak pernah gagal karena kehabisan slot index.** Jika kapasitas habis, nilai tetap masuk ke JSON dan disalin kemudian.
- **Perubahan skema berlangsung online.** Me-retype, mengganti nama, menghapus, atau menjadikan sebuah field filterable tidak membutuhkan downtime. Pembacaan tetap berjalan dari JSON selagi index menyusul.
- **Empat proses latar belakang kecil** menyediakan kapasitas, menuntaskan pekerjaan yang tertunda, mereklamasi kolom yang tidak terpakai, dan menulis ekspor. Mereka hanya berkoordinasi lewat database.
- **Bounded read.** Setiap pembacaan terdiri dari dua query yang ukurannya dibatasi oleh ukuran halaman Anda, berapa pun besar tenant-nya.

[Sekilas arsitektur](/id/concepts/architecture) menunjukkan bagaimana bagian-bagiannya saling terhubung, dan [glosarium](/id/reference/glossary) menjelaskan setiap istilah.

## Yang sudah bisa digunakan

- **Bootstrap skema.** Pembuatan semua tabel yang dibutuhkan engine yang idempotent dan tidak destruktif.
- **Model dan field.** Helper get-or-create untuk mendaftarkannya, serta `listModels()` dan `describeModel()` untuk membacanya kembali, termasuk apakah setiap field dideklarasikan filterable dan apakah ia bisa difilter saat ini.
- **Penulisan.** Entry tunggal, bulk write sinkron hingga 1 000 entry per pemanggilan, dan pengiriman di latar belakang untuk batch yang lebih besar, dengan idempotency key. Payload bisa disusun dari objek bertipe, array, atau JSON.
- **Update dan delete.** `updateEntry()` mengganti seluruh field sebuah entry dan `deleteEntry()` melakukan soft delete.
- **Pembacaan dan pencarian.** Pembacaan berhalaman dengan cursor, point read, dan `search()` terpadu dengan dua belas operator serta nesting AND/OR/NOT penuh, tersedia sebagai objek PHP atau format wire JSON dengan validasi ketat. Pengurutan berdasarkan id entry, waktu pembuatan, atau satu field terindeks.
- **Pencarian yang bisa diganti.** Driver bawaan meng-query MySQL atau MariaDB. Implementasikan satu interface untuk melayani pembacaan dari backend lain.
- **Perubahan skema online.** Retype field, promosi atau demosi filterability, ganti nama field atau model, serta hapus field atau model, semuanya selagi aplikasi tetap berjalan.
- **Ekspor.** Ekspor CSV dan JSON dari sebuah model, dibuat di latar belakang, dengan batas jumlah job bersamaan per tenant dan kemampuan melanjutkan setelah crash.
- **Operasional.** Laporan spread slot dan kardinalitas index, compaction model, logging terstruktur dengan correlation id, dan perintah `tick` terbatas untuk host yang bisa menjalankan cron tetapi tidak proses persisten.

## Yang belum tersedia

- **Pengurutan hanya menerima satu key.** Anda bisa mengurutkan berdasarkan id entry, waktu pembuatan, atau satu field terindeks. Mengurutkan berdasarkan dua field sekaligus tidak didukung.
- **Ekspor tidak bisa difilter.** Ekspor selalu mencakup setiap entry yang belum dihapus dalam model. Request dengan filter ditolak, bukan diam-diam diabaikan.
- **Menjaga index pencarian eksternal tetap sinkron menjadi tanggung jawab Anda.** Driver kustom bisa melayani pembacaan dari layanan pencarian, tetapi driver bersifat read-only dan StarDust belum memberi tahu Anda ketika entry berubah. Rename, perubahan tipe, atau penghapusan dijalankan di latar belakang, bukan oleh penulisan yang Anda lakukan, sehingga meniru pemanggilan write Anda saja tidak cukup. Bangun ulang index eksternal dari ekspor penuh.

## Status rilis

Rilis saat ini adalah **`0.3.0-alpha.1`**, diterbitkan pada 2026-09-23. Semua yang tercantum di atas sudah diimplementasikan dan tercakup oleh test suite, tetapi ini masih alpha, dan **API publik mungkin masih berubah sebelum 0.3.0**. Rilis ini adalah penulisan ulang dari nol atas seri 0.2.x dan tidak berbagi API dengannya. Lihat [Seri 0.2.x](/id/project/legacy-0-2).

Composer secara bawaan hanya memasang versi stabil, sehingga instalasi membutuhkan flag `@alpha` yang eksplisit. Lihat [Instalasi](/id/guide/installation). Untuk menilai apakah StarDust cocok dengan proyek Anda, baca [Apakah StarDust cocok untuk Anda?](/id/guide/is-it-a-fit) berikutnya.
