# Event log

StarDust mencatat satu record NDJSON per event ke stdout secara bawaan (`StdoutNdjsonLogger`), atau ke mana pun logger PSR-3 milik Anda sendiri mengirimkannya. Lihat [Observabilitas](/id/operations/observability) untuk correlation id dan menelusuri pekerjaan asinkron lintas proses; halaman ini adalah tabel referensi nama event.

## Struktur record

Setiap record membawa:

| Field | Artinya |
| :-- | :-- |
| `ts` | Timestamp ISO 8601. |
| `level` | Level log PSR-3. |
| `event` | Nama dari tabel-tabel di bawah. Event yang dicatat kode Anda sendiri lewat logger yang sama, tanpa key `event`, jatuh ke `generic_log`. |
| `message` | Ringkasan singkat yang bisa dibaca manusia. |
| `correlation_id` | Id operasi tempat event ini berasal — milik Anda bila Anda menyediakannya, dibuatkan bila tidak. Dua event dari operasi yang sama selalu berbagi satu nilai. |

Di luar ini, setiap event membawa field apa pun yang berguna baginya — jumlah baris sebuah chunk, id field, alasan kegagalan. Key payload itu bukan bagian dari kontrak tertutup seperti nama event; perlakukan yang didokumentasikan di bawah sebagai stabil dan yang lain sebagai informasional saja.

## Penulisan dan pembacaan

| Event | Muncul ketika |
| :-- | :-- |
| `entry_written` | Sebuah pemanggilan `write()` ter-commit. |
| `entry_updated` | Sebuah pemanggilan `updateEntry()` ter-commit. |
| `entry_deleted` | Sebuah pemanggilan `deleteEntry()` ter-commit. |
| `exhaustion_fallback` | Field pada sebuah penulisan tidak punya slot aktif dan diantrekan untuk backfill — berpasangan dengan `entry_written` atau `entry_updated` di bawah correlation id yang sama. |
| `bulk_chunk_committed` / `bulk_chunk_rolled_back` | Satu chunk `bulkWrite()` selesai, dengan cara apa pun. |
| `bulk_accepted` | Sebuah pengiriman `submitBulkWrite()` dicatat. |
| `payload_too_large` | Pemanggilan `bulkWrite()` sinkron melebihi 1 000 entitas. |
| `pre_flight_rejected` | Sebuah filter atau sort ditolak sebelum SQL apa pun berjalan — field yang tidak dikenal, non-filterable atau non-indexed, target sort yang salah, atau cursor yang dikeluarkan di bawah urutan yang berbeda. |
| `capability_unsupported` | Search driver aktif tidak mendukung operator atau field yang diminta, sengaja dipisah dari `pre_flight_rejected` agar bisa diukur sendiri. |
| `cache_miss` | Cache skema dalam proses milik jalur baca menyegarkan diri setelah `stardust_schema_version` berubah. Wajar terjadi tepat setelah perubahan skema apa pun. |
| `search_request` | Sekali per pemanggilan `search()` (dan karenanya sekali per `read()`, yang melewatinya), membawa latensi, jumlah baris, dan apakah query yang dikompilasi memakai join atau `EXISTS`. |

## Watcher

| Event | Muncul ketika |
| :-- | :-- |
| `poll_started` / `poll_complete` | Satu siklus Watcher dimulai dan berakhir. |
| `provision_started` / `provision_complete` / `provision_failed` | Extension page baru di-provisioning, atau percobaannya gagal. |
| `lock_contention` | Watcher tidak bisa mengambil advisory lock provisioning-nya dalam batas waktunya. |
| `cardinality_sampled` | Advisory kardinalitas berkala atau on-demand berjalan. |
| `low_cardinality_index` | Sample itu menemukan sebuah index dengan selektivitas rendah pada jumlah baris yang cukup berarti. |
| `spread_sampled` | Advisory spread berkala atau on-demand berjalan. |
| `high_spread_model` | Sample itu menemukan sebuah model yang tersebar di lebih banyak page daripada ambang batasnya. |
| `tick_started` / `tick_complete` / `tick_skipped` | Sebuah run `tick()` dimulai, berakhir, atau dilewati sama sekali karena proses lain sudah memegang lock Watcher. Lihat [Satu tick adalah satu trace tersendiri](/id/operations/observability#satu-tick-adalah-satu-trace-tersendiri). |

Lihat [Perawatan slot](/id/operations/slot-maintenance) untuk arti kedua advisory itu dan cara menindaklanjutinya.

## Reconciler

| Event | Muncul ketika |
| :-- | :-- |
| `chunk_claimed` | Sebuah work source mengklaim satu chunk pekerjaan yang terbatas. |
| `chunk_complete` | Chunk itu selesai — membawa penghitung khusus sumbernya (baris yang di-backfill, ditulis ulang, dibersihkan, dan seterusnya). |
| `chunk_partial` | Loop chunk sebuah import job berhenti di tengah sebuah batch, bisa dilanjutkan dari titik itu. |
| `capacity_wait` | Sebuah chunk butuh slot yang belum di-provisioning Watcher. |
| `coercion_null` | Backfill retype tidak bisa mengoersi nilai tersimpan ke tipe baru dan menulis `NULL` sebagai gantinya. |
| `lease_lost` | Sebuah worker menyadari di tengah chunk bahwa klaimnya sudah dialihkan (sebuah sweep klaim yang ditinggalkan mengklaim ulang job yang sama) dan berhenti. |
| `lock_wait` | Sebuah chunk menghabiskan budget percobaan ulang lock-nya dan dikembalikan tanpa disentuh untuk dicoba lagi pada tick berikutnya. Bukan error — chunk itu di-rollback penuh. |
| `deadlock_retry` | Sebuah chunk dicoba ulang setelah InnoDB melaporkan deadlock atau lock-wait timeout. |
| `dlq_inserted` | Sebuah baris dipindahkan ke dead-letter queue alih-alih dicoba ulang selamanya. |

`lock_wait`, `deadlock_retry`, dan `capacity_wait` mendeskripsikan tiga situasi berbeda dan layak dibedakan — lihat [Reconciler](/id/operations/reconciler#apa-yang-tertahan-jika-reconciler-tidak-berjalan).

## Liberator

| Event | Muncul ketika |
| :-- | :-- |
| `sweep_started` | Sebuah batch Liberator dimulai. |
| `sweep_chunk` | Satu chunk terbatas dari pengosongan sebuah slot ter-commit. |
| `sweep_complete` | Sebuah slot selesai dikosongkan dan berpindah kembali ke `free`. |
| `deadlock_retry` | Sebuah chunk sweep dicoba ulang setelah deadlock. |
| `sweep_gap_flagged` | Sebuah chunk menghabiskan budget percobaan ulang deadlock-nya dan sweep-nya maju melewatinya alih-alih dicoba ulang selamanya — lihat [Sweep gap](/id/operations/liberator#sweep-gap). |

## Chronicler dan ekspor

| Event | Muncul ketika |
| :-- | :-- |
| `export_accepted` | Sebuah pemanggilan `submitExport()` dicatat. |
| `job_claimed` | Sebuah Chronicler mengklaim export job yang pending atau ditinggalkan. |
| `chunk_written` | Satu halaman `entry_data` ditulis ke artifact. |
| `chunk_skipped` | Sebuah chunk menghabiskan budget percobaan ulang deadlock-nya dan dilewati. |
| `row_skipped` | Satu entry tidak bisa dikodekan dan dilewati, dihitung di `skipCount` job itu. |
| `artifact_resumed` | Job yang diklaim ulang mengadopsi artifact parsial milik worker sebelumnya alih-alih memulai dari nol. |
| `job_yielded` | Ekspor besar mengalah secara kooperatif di batas chunk — batas waktu tercapai atau shutdown diminta — dengan resume anchor-nya tetap utuh. |
| `job_complete` / `job_failed` | Sebuah ekspor selesai, dengan cara apa pun. |
| `low_disk` | Pengaman disk pra-klaim menolak mengklaim pekerjaan baru. |
| `artifact_oversized` | Artifact sebuah ekspor akan melewati batas ukuran. |
| `gc_swept` | Satu pass garbage collection saat idle berjalan, membersihkan artifact yang kedaluwarsa dan partial yang yatim. |

Lihat [Ekspor](/id/usage/exports) dan [Chronicler](/id/operations/chronicler).

## Perubahan skema

| Event | Muncul ketika |
| :-- | :-- |
| `retype_started` | `retypeField()`, `promoteFieldToFilterable()`, atau `demoteFieldFromFilterable()` meng-commit transaksi registry-nya. |
| `promote_to_ready` | Backfill latar belakang sebuah retype atau promosi selesai dan slot barunya aktif. |
| `rename_started` / `rename_complete` | Sebuah rename field dimulai dan selesai. |
| `model_renamed` | `renameModel()` ter-commit — sinkron, sehingga ini satu-satunya event di tabel ini tanpa pasangan `_complete`. |
| `delete_started` / `delete_complete` | Sebuah penghapusan field dimulai dan selesai. |
| `model_delete_started` / `model_delete_complete` | Sebuah penghapusan model dimulai dan selesai. |
| `compaction_planned` / `compaction_complete` | `compactModel()` menghitung sebuah rencana dan, kecuali dry run, selesai menjalankannya. |

Setiap pasangan asinkron di sini berbagi satu correlation id lintas batas proses — pemanggilan yang menginisiasi dan chunk Reconciler yang akhirnya menuntaskannya. Lihat [Menelusuri pekerjaan asinkron](/id/operations/observability#menelusuri-pekerjaan-asinkron).
