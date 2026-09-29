# Observabilitas

## Aliran log NDJSON

StarDust mencatat log NDJSON terstruktur ke stdout secara default — satu objek JSON per baris, tanpa record multi-baris yang perlu diurai. Setiap daemon, setiap penulisan, setiap pembacaan, setiap perubahan skema tercatat lewat aliran yang sama, sehingga satu `tail -f` atau log aggregator saja sudah menangkap seluruh engine. Suntikkan logger PSR-3 Anda sendiri lewat `Config` jika Anda ingin mengarahkannya ke pipeline logging yang sudah ada; bentuk event-nya identik terlepas dari cara mana yang Anda pakai.

Setiap record membawa nama `event` dari kosakata yang tertutup — Anda tidak akan pernah menemukan nama event yang tidak terdokumentasi di produksi, yang membuat membangun alert terhadap event tertentu jadi aman, bukan target yang terus bergerak.

## Correlation ID

Setiap event membawa `correlation_id` yang mengikatnya ke operasi yang menghasilkannya. Secara default engine mencetak satu per operasi, tetapi Anda bisa menyertakan milik Anda sendiri — kirimkan id request HTTP Anda dan ia mengalir lewat setiap event yang dihasilkan operasi itu, termasuk yang dipancarkan sebuah daemon di latar belakang beberapa menit kemudian dalam proses yang berbeda:

```php
$payload = new EntryPayload($tenantId, $modelId, $fields, correlationId: $requestId);
$engine->write($payload);

$query = new EntryQuery($tenantId, $modelId, correlationId: $requestId);
$engine->read($query);
```

Setiap entry point yang menerimanya membuatnya opsional dan ditambahkan di akhir, sehingga kode yang sudah ada tetap berfungsi dan cukup mendapat id yang dibuatkan jika Anda tidak menyertakan milik sendiri.

## Menelusuri pekerjaan asinkron

Di sinilah correlation id benar-benar berguna. Penulisan yang melampaui kapasitas indeks yang tersedia mencatat exhaustion fallback-nya di bawah id Anda, dan jika backfill di latar belakang nantinya tidak bisa menuntaskan entry itu, baris dead-letter mencatat id Anda beserta id siklus worker yang menggagalkannya — sehingga tiket dukungan yang mengutip satu id request bisa dijawab dari ujung ke ujung. Begitu pula, ekspor yang Anda ajukan dan `job_complete` yang dipancarkan proses Chronicler terpisah beberapa menit kemudian berbagi id yang Anda kirimkan.

Dua hal yang perlu Anda ketahui saat membaca outputnya:

- **Worker latar belakang memproses banyak request dalam satu batch.** Di sana, correlation id milik batch itu sendiri menggambarkan batch-nya, dan id Anda muncul di bawah kunci kedua sebagai gantinya — `job_correlation_id` untuk impor massal, `origin_correlation_id` pada baris dead-letter.
- **Backfill latar belakang yang berhasil tidak dicatat per entry**, hanya per batch. Tidak adanya record per-entry itu wajar; amati kedalaman antrean sebagai sinyalnya.

## Satu tick adalah satu trace tersendiri

`bin/stardust tick` adalah batas trace-nya sendiri, bukan yang menggabungkan. Setiap run mencetak satu correlation id dan memancarkan event mulai serta selesainya di bawah id itu — tetapi Watcher, Liberator, Reconciler, dan (dengan `--exports`) Chronicler yang ia susun masing-masing tetap mencetak id per-job atau per-tick mereka sendiri, sama seperti saat berjalan di bawah daemon persisten. Log satu pemanggilan `tick` tidak tergabung dari ujung ke ujung di bawah satu id seperti halnya sebuah request; jika Anda perlu mengorelasikan semua yang dikerjakan satu pemanggilan, kelompokkan berdasarkan kedekatan timestamp pada output run itu sebagai gantinya.

Satu run `tick` juga bisa menjadi yang memicu advisory kardinalitas dan spread yang berkala, karena jadwalnya dipakai bersama di seluruh deployment alih-alih terikat pada satu proses persisten tertentu. Lihat [Perawatan slot](/id/operations/slot-maintenance) untuk penjelasan makna event-event itu.

## Event yang perlu dipasangi alert

Daftar singkat untuk memulai, kurang lebih berurutan dari yang paling mendesak:

- **Apa pun yang mendarat di dead-letter queue.** Bukan keadaan darurat dengan sendirinya, tetapi tidak ada yang membersihkannya secara otomatis, dan jumlah yang terus bertambah berarti ada masalah data sungguhan yang layak diperiksa. Lihat [Reconciler](/id/operations/reconciler#dead-letter-queue).
- **Tick yang berulang kali melaporkan lock contention**, bukan sekadar tumpang tindih sesekali antar-run terjadwal. Lihat [Pemecahan masalah](/id/operations/troubleshooting#tick-melaporkan-lock-contention).
- **Peringatan ruang disk rendah dari pengaman pra-klaim Chronicler.** Job ekspor baru berhenti diklaim begitu ini terpicu, secara diam-diam dari sudut pandang pemanggil sampai mereka memeriksa status job.
- **Advisory spread tinggi pada model yang sering Anda filter.** Murni informatif dengan sendirinya — tidak pernah memblokir apa pun — tetapi inilah sinyal yang memberi tahu Anda bahwa compaction layak dijalankan. Lihat [Perawatan slot](/id/operations/slot-maintenance).
- **Advisory kardinalitas rendah pada indeks yang Anda andalkan untuk filter selektif.** Memberi tahu Anda bahwa indeks itu tidak melakukan tugas yang dibutuhkan query planner.
- **Kenaikan sweep-gap yang terus berlanjut melewati beberapa siklus Liberator pada slot yang sama.** Satu gap sembuh sendiri; yang terus berulang pada slot yang sama berarti kontensinya tidak reda dengan sendirinya.

Tidak satu pun dari ini adalah exception yang dilempar engine ke aplikasi Anda — semuanya sinyal operasional yang ditujukan bagi siapa pun yang mengamati aliran log, dan justru karena itulah semuanya layak dipasangi alert, bukan sekadar diperiksa manual.
