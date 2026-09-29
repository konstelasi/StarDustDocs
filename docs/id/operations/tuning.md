# Penyetelan

Sebagian besar StarDust berjalan baik dengan pengaturan defaultnya. Halaman ini membahas pengaturan yang layak ditinjau ulang setelah Anda punya beban kerja nyata untuk dijadikan acuan penyetelan — lihat [Referensi konfigurasi](/id/reference/configuration) untuk daftar field lengkap dan [Deployment](/id/operations/deployment) untuk mode-mode yang berlaku bagi pengaturan ini.

## Jumlah worker

Watcher adalah singleton ketat dan tidak termasuk dalam pembahasan ini — lihat [Watcher](/id/operations/watcher#hanya-satu-instance). Tiga daemon lainnya diskalakan lewat jumlah proses, bukan lewat pengaturan `Config`:

- <Term id="reconciler">Reconciler</Term> — tambah worker saat sync queue, backlog impor, atau backfill window butuh waktu lebih lama untuk tuntas daripada yang Anda inginkan. `SELECT … FOR UPDATE SKIP LOCKED` menjaga mereka tetap tidak tumpang tindih, sehingga tidak ada biaya koordinasi untuk menambah worker selain lock wait biasa yang dialami penulis konkuren mana pun.
- <Term id="liberator">Liberator</Term> — tambah worker saat slot tombstoned usianya melewati satu-dua siklus. Throughput dibatasi oleh jumlah page berbeda yang sedang menampung tombstone, bukan jumlah worker, sehingga melewati titik itu worker tambahan tidak merugikan tetapi juga tidak menguntungkan.
- <Term id="chronicler">Chronicler</Term> — tambah worker saat ekspor menumpuk di antrean alih-alih tuntas, atau saat Anda ingin pemulihan lebih cepat untuk job yang ditinggalkan worker yang crash.

Mulai dengan satu untuk masing-masing selain Watcher dan amati sinyal-sinyal di [Observabilitas](/id/operations/observability) sebelum menambah jumlahnya.

## Ukuran chunk

Setiap daemon bekerja dalam chunk yang terbatas sehingga tidak ada satu transaksi pun memegang lock cukup lama untuk memengaruhi request yang sedang berjalan. Setiap ukuran chunk bisa disetel secara independen:

| Pengaturan | Default | Mengatur |
| :-- | :-- | :-- |
| `reconcilerChunkSize` | 500 | Baris per klaim `SKIP LOCKED` di seluruh sumber pekerjaan Reconciler. |
| `liberatorChunkSize` | 500 | Baris yang dikosongkan per transaksi sweep Liberator. |
| `liberatorBatchSize` | 50 | Slot tombstoned yang dipertimbangkan per tick Liberator. |
| `chroniclerPageSize` | 500 | Baris `entry_data` yang dipaginasi per chunk ekspor. |
| `modelPurgeChunkSize` | 200 | Penghapusan `entry_data` per transaksi pembersihan penghapusan model. |

`modelPurgeChunkSize` sengaja punya default sendiri yang lebih kecil: satu chunk pembersihan model menghapus entry **dan** merambat ke setiap extension page yang mereka tempati **dan** sync queue, semuanya dalam satu transaksi, sehingga mengerjakan lebih banyak hal per baris dibanding chunk jenis lain. Menurunkan `reconcilerChunkSize` bersama agar purge besar lebih ringan justru akan memperlambat semua jenis pekerjaan Reconciler lainnya secara bersamaan — pakai `modelPurgeChunkSize` sebagai gantinya saat sebuah purge secara khusus butuh jejak yang lebih kecil.

Ukuran chunk yang lebih kecil berarti lock individual lebih singkat dan lebih banyak round-trip total; yang lebih besar berarti lebih sedikit round-trip dengan biaya memegang setiap lock lebih lama. Nilai default adalah titik tengah yang masuk akal — ubah hanya setelah Anda melihat masalah spesifik (lock wait yang panjang akibat chunk kecil di tempat lain, atau terlalu banyak round-trip pada volume yang sangat tinggi), bukan secara preventif.

`reconcilerInterChunkDelayMicros`, `liberatorInterChunkDelayMicros`, dan `chroniclerInterChunkDelayMicros` (semuanya `0` secara default) mengatur laju throughput sebuah daemon dengan menjeda di antara chunk — berguna jika sebuah daemon yang menguras dengan kecepatan penuh justru menjadi hal yang menekan database bersama.

## Index headroom

`pageIndexHeadroom` (default **4**) mengatur berapa banyak kolom terindeks cadangan dari setiap tipe yang dibawa page yang baru disediakan, melebihi apa yang dibutuhkan permintaan saat ini. Karena kumpulan kolom terindeks sebuah page bersifat tetap selamanya begitu dibuat, headroom-lah yang mencegah serangkaian promosi masing-masing memicu page-nya sendiri: dengan headroom, beberapa field yang dipromosikan berturut-turut mendarat bersama di page yang sudah punya ruang, alih-alih tersebar ke sebanyak page seperti jumlah promosinya.

Menaikkan ini hanya memengaruhi page yang dibuat sejak saat itu — tidak pernah melebarkan page yang sudah ada. Jika Anda melihat [spread tinggi](/id/operations/slot-maintenance#laporan-spread) pada model yang menambah field secara bertahap, menaikkan `pageIndexHeadroom` sebelum pertumbuhan itu terjadi lebih murah daripada melakukan compaction setelahnya.

## Menunggu lock dan percobaan ulang

Setiap daemon mencoba ulang sejumlah kali yang terbatas saat InnoDB menolak sebuah chunk karena kontensi lock atau deadlock, alih-alih langsung crash atau menyerah:

| Pengaturan | Default | Mengatur |
| :-- | :-- | :-- |
| `reconcilerLockRetryBudget` | 3 | Percobaan ulang berturut-turut akibat kegagalan lock pada lima dari enam sumber pekerjaan Reconciler. |
| `reconcilerLockRetryDelayMicros` | 0 | Jeda di antara percobaan ulang itu. |
| `modelPurgeLockRetryBudget` | 3 | Percobaan ulang berturut-turut akibat kegagalan lock sebelum sumber pembersihan model menyerah dan melempar ulang error-nya (inilah satu-satunya sumber yang tidak diam-diam mencoba lagi pada tick berikutnya). |
| `liberatorDeadlockRetryBudget` | 3 | Percobaan ulang deadlock berturut-turut pada satu chunk sebelum Liberator mengambil sweep gap. Lihat [Liberator](/id/operations/liberator#sweep-gap). |
| `chroniclerDeadlockRetryBudget` | 3 | Percobaan ulang deadlock berturut-turut pada satu chunk ekspor sebelum dilewati. |
| `watcherProvisionLockTimeoutSeconds` | 10 | Berapa lama Watcher menunggu advisory lock level-database-nya di sekitar provisioning. |
| `reconcilerCapacityWaitMillis` | 5.000 | Jeda setelah sebuah tick melaporkan sedang menunggu kapasitas dari Watcher, sebelum mencoba lagi. |

Menaikkan budget percobaan ulang membuat sebuah daemon lebih sabar menghadapi kontensi dengan biaya membiarkan pekerjaan sebuah chunk menggantung lebih lama sebelum jatuh ke fallback-nya (sweep gap, chunk ekspor yang dilewati, atau exception yang dilempar ulang, tergantung sumbernya). Nilai default sudah cukup baik di beban normal; pertimbangkan menaikkannya hanya jika Anda melihat gap atau skip yang disebabkan kontensi yang Anda perkirakan sifatnya sementara — lonjakan penulisan lain ke page yang sama, misalnya — bukan bottleneck persisten yang tidak akan diselesaikan budget percobaan ulang berapa pun besarnya.

## Budget tick

Ini hanya relevan jika Anda menjalankan `bin/stardust tick` alih-alih daemon persisten — lihat [Deployment](/id/operations/deployment#batas-waktu-budget).

`tickBudgetSeconds` (default 50) adalah berapa lama satu pemanggilan `tick` berjalan sebelum berhenti, dikirim lewat `--budget` atau dibiarkan pada default `Config`-nya. `tickBudgetMarginSeconds` (default 5) dikurangkan dari `max_execution_time` milik PHP sendiri saat SAPI melaporkan batas yang bukan nol, sehingga budget efektif tidak pernah melampaui apa yang akan membuat host mematikan prosesnya — Anda tidak perlu menyelaraskan keduanya secara manual, cukup pastikan `tickBudgetSeconds` nyaman muat di dalam interval cron Anda.
