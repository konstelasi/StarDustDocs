# Referensi konfigurasi

Setiap field `Config`, dikelompokkan menurut subsistem yang disetelnya. Lihat [Konfigurasi](/id/usage/configuration) untuk objeknya sendiri, cara menyuntikkan logger, clock, atau search driver, dan lock namespace untuk shared hosting; lihat [Penyetelan](/id/operations/tuning) untuk panduan kapan sebaiknya mengubah nilai bawaan, bukan sekadar apa nilainya.

## Koneksi dan logging

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `pdo` | — (wajib) | Koneksinya. Harus dibuat dengan `ATTR_EMULATE_PREPARES => false` dan `ATTR_ERRMODE => ERRMODE_EXCEPTION`. Lihat [Menyiapkan koneksi PDO](/id/guide/installation#menyiapkan-koneksi-pdo). |
| `logger` | `StdoutNdjsonLogger` | Logger PSR-3. Suntikkan milik Anda sendiri untuk mengarahkan event ke tempat lain selain stdout NDJSON. |
| `clock` | `SystemClock` | Implementasi `psr/clock`. Suntikkan clock yang dibekukan dalam test. |

## Penulisan dan impor

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `artifactDir` | `sys_get_temp_dir() . '/stardust'` | Tempat payload bulk-ingest asinkron ditulis. Dipakai bersama artifact ekspor — lihat [Chronicler dan ekspor](#chronicler-dan-ekspor) di bawah. |
| `reconcilerImportLeaseTimeoutSeconds` | 30 | Detik sebelum heartbeat sebuah import job dianggap terhenti dan Reconciler lain mengklaim ulang. |

## Pembacaan dan pencarian

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `queryFilterLimits` | `FilterLimits::defaults()` | Enam batasan QueryFilter (kedalaman, jumlah node, args, elemen `in`, panjang string, ukuran payload). Lihat [Batasan](/id/usage/query-filter#batasan). |
| `searchDriver` | `null` | Menyuntikkan `EntrySearchInterface` kustom; `null` memakai driver MySQL bawaan. Lihat [Driver pencarian kustom](/id/extending/custom-search-drivers). |

## Watcher

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `watcherPollIntervalSeconds` | 60 | Detik antar siklus poll pada daemon persisten. |
| `watcherCapacityThreshold` | 0.20 | Batas bawah kapasitas cadangan yang memicu provisioning; field yang menunggu index tetap di-provisioning terlepas dari ini. |
| `watcherProvisionLockTimeoutSeconds` | 10 | Berapa lama Watcher menunggu advisory lock database-nya seputar provisioning. |
| `cardinalityIntervalSeconds` | 86.400 (24 jam) | Kadensi advisory kardinalitas, dibagikan ke seluruh fleet lewat database. |
| `cardinalityJitterSeconds` | ~10% dari interval (8.640 secara bawaan) | Jendela acak tempat Watcher mengambil offset baru setiap siklus, agar fleet yang dimulai serentak tidak berbondong-bondong pada jadwal yang sama. |
| `cardinalitySelectivityThreshold` | 0.01 | Rasio distinct-terhadap-baris di bawah mana sebuah index ditandai berkardinalitas rendah. |
| `cardinalityRowFloor` | 10.000 | Jumlah baris minimum sebelum sebuah index bahkan dipertimbangkan untuk pemeriksaan kardinalitas. |
| `cardinalityDistinctFloor` | 10 | Jumlah nilai distinct minimum sebelum pemeriksaan yang sama berlaku. |
| `spreadExcessPageThreshold` | 2 | Berapa banyak page yang bisa dihindari sebelum advisory spread menandai sebuah model. |
| `pageIndexHeadroom` | 4 | Kolom terindeks cadangan dari setiap keluarga yang dibawa page yang baru di-provisioning, melebihi permintaan saat ini. Tetap per page sejak dibuat — menaikkannya tidak pernah melebarkan page yang sudah ada. Lihat [Index headroom](/id/operations/tuning#index-headroom). |

## Reconciler

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `reconcilerChunkSize` | 500 | Baris per klaim `SKIP LOCKED` di seluruh work source Reconciler. |
| `reconcilerInterChunkDelayMicros` | 0 | Jeda antar chunk, untuk mengatur laju throughput. |
| `reconcilerCapacityWaitMillis` | 5.000 | Jeda tidur setelah sebuah tick melaporkan sedang menunggu kapasitas dari Watcher, sebelum mencoba lagi. |
| `reconcilerLockRetryBudget` | 3 | Percobaan ulang kegagalan lock berturut-turut pada lima dari enam work source Reconciler sebelum ditunda ke tick berikutnya. |
| `reconcilerLockRetryDelayMicros` | 0 | Jeda antar percobaan ulang tersebut. |
| `modelPurgeChunkSize` | 200 | Penghapusan `entry_data` per transaksi pembersihan penghapusan model. Sengaja lebih kecil dari `reconcilerChunkSize` — lihat [Ukuran chunk](/id/operations/tuning#ukuran-chunk). |
| `modelPurgeLockRetryBudget` | 3 | Percobaan ulang kegagalan lock berturut-turut sebelum work source model-purge menyerah dan melempar ulang alih-alih menunda. |

## Liberator

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `liberatorIdleIntervalSeconds` | 10 | Interval poll saat tidak ada yang tombstoned. |
| `liberatorBatchSize` | 50 | Slot tombstoned yang dipertimbangkan per tick Liberator. |
| `liberatorChunkSize` | 500 | Baris yang di-null-kan per transaksi sweep. |
| `liberatorInterChunkDelayMicros` | 0 | Jeda antar chunk, untuk mengatur laju sweep. |
| `liberatorDeadlockRetryBudget` | 3 | Percobaan ulang deadlock berturut-turut pada satu chunk sebelum Liberator mengambil sweep gap. Lihat [Sweep gap](/id/operations/liberator#sweep-gap). |

## Chronicler dan ekspor

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `chroniclerIdleIntervalSeconds` | 10 | Jeda tidur saat tidak ada export job yang bisa diklaim. |
| `chroniclerLeaseTimeoutSeconds` | 30 | Ambang batas heartbeat terhenti untuk sweep klaim yang ditinggalkan. |
| `chroniclerPageSize` | 500 | Baris `entry_data` yang dipaginasi per chunk ekspor. |
| `chroniclerInterChunkDelayMicros` | 0 | Jeda antar chunk. |
| `chroniclerDeadlockRetryBudget` | 3 | Percobaan ulang deadlock berturut-turut pada satu chunk ekspor sebelum dilewati. |
| `chroniclerSkipCountCap` | 1.000 | Batas gabungan skip per baris dan per chunk sebelum job gagal sebagai `excessive_skips`. |
| `chroniclerArtifactSizeCapBytes` | 5 GiB | Batas ukuran per artifact; ekspor yang akan melewatinya gagal sebagai `artifact_size_exceeded`. |
| `chroniclerArtifactTtlSeconds` | 86.400 (24 jam) | Berapa lama artifact yang selesai bertahan sebelum garbage collection menghapusnya. |
| `chroniclerOrphanedPartialTtlSeconds` | 3.600 (1 jam) | TTL untuk artifact parsial milik job yang gagal. |
| `chroniclerLowDiskThresholdPct` | 0.10 | Pengaman disk pra-klaim: batas bawah rasio ruang kosong. |
| `chroniclerDiskProbeBytes` | 65.536 (64 KiB) | Pengaman disk pra-klaim: ukuran write probe yang menangkap kuota per akun yang tidak terlihat oleh rasio. `0` menonaktifkan probe. |
| `chroniclerPerTenantActiveCap` | 3 | Maksimum export job `pending` + `processing` per tenant, ditegakkan secara atomik saat pengiriman. |
| `chroniclerDbDisconnectBackoffSeconds` | `[1, 4, 16]` | Jadwal backoff reconnect tetap setelah koneksi terputus di tengah ekspor. |
| `pdoConnector` | `null` | Factory reconnect yang dipakai Chronicler untuk membangun ulang koneksi yang terputus di tengah ekspor. `bin/stardust chronicler` menyambungkannya secara otomatis; `null` berarti koneksi yang terputus mengakhiri job sebagai `failed:query_failure`. |

`artifactDir` (di atas, di bawah [Penulisan dan impor](#penulisan-dan-impor)) dipakai bersama antara impor asinkron dan ekspor — lihat [Penyimpanan artifact](/id/operations/deployment#penyimpanan-artifact).

## Combined tick

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `tickBudgetSeconds` | 50 | Berapa lama satu jalankan `tick()` / `bin/stardust tick` bekerja sebelum berhenti. |
| `tickBudgetMarginSeconds` | 5 | Dikurangkan dari `max_execution_time` milik PHP sendiri saat SAPI melaporkan batas bukan nol, sehingga budget efektif tidak pernah melebihi apa yang akan membuat host mematikan prosesnya. |

Lihat [Batas waktu (budget)](/id/operations/deployment#batas-waktu-budget).

## Lock dan file proses

| Field | Bawaan | Mengatur |
| :-- | :-- | :-- |
| `pidFileDir` | `sys_get_temp_dir() . '/stardust'` | Tempat file lock Watcher dan flag-file shutdown setiap daemon berada. |
| `lockNamespace` | `null` | Mengkualifikasi dua nama advisory lock database milik engine agar dua instalasi yang berbagi satu server database tidak bertabrakan. `null` menurunkannya dari nama database. Lihat [Shared hosting dan lock namespace](/id/usage/configuration#shared-hosting-dan-lock-namespace). |
