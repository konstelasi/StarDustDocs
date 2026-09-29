# Pemecahan masalah

## Field filterable ditolak saat difilter

Filter pada field yang Anda yakin filterable tetap saja memunculkan `FieldNotFilterableException` atau `FieldNotSortableException`. Ini hampir selalu soal backfill window: `isFilterable` (apa yang dideklarasikan registry) dan `isIndexed` (apakah filter padanya benar-benar bekerja *saat ini*) adalah dua flag yang berbeda, dan keduanya tidak sinkron selama backfill promosi atau retype berlangsung. Periksa keduanya:

```php
$field = $engine->describeModel($tenantId, $modelId)?->fields[...];
var_dump($field->isFilterable, $field->isIndexed);
```

Jika `isFilterable` bernilai `true` dan `isIndexed` bernilai `false`, field itu masih menunggu penyalinan latar belakangnya selesai — lihat [Rename, retype, atau penghapusan tidak kunjung selesai](#rename-retype-atau-penghapusan-tidak-kunjung-selesai) di bawah, karena solusinya sama: pastikan Reconciler berjalan. Bangun UI filter Anda berdasarkan `isIndexed`, bukan `isFilterable`, dan Anda tidak akan pernah menawarkan filter yang saat ini ditolak engine.

## Rename, retype, atau penghapusan tidak kunjung selesai

Anda memanggil `renameField()`, `retypeField()`, `promoteFieldToFilterable()`, `deleteField()`, atau `deleteModel()`, pemanggilannya kembali, dan perubahannya tampak tidak pernah tuntas — pembacaan masih menampilkan nama lama, filter masih menolak field itu, baris field yang sudah dihapus masih terlihat di dump tabel mentah. Kelima operasi ini kembali begitu registry diperbarui; sisanya dikerjakan oleh proses latar belakang, dan **proses itu adalah tugas Reconciler**. Tanpa Reconciler yang berjalan, tidak satu pun dari window ini pernah tertutup.

Solusinya sama di setiap kasus: pastikan minimal satu Reconciler berjalan, baik sebagai proses persisten atau lewat `bin/stardust tick` yang terjadwal. Lihat [Reconciler](/id/operations/reconciler) untuk penjelasan apa yang ia tuntaskan dan [Deployment](/id/operations/deployment) untuk kedua modenya.

Jika Reconciler memang benar-benar berjalan dan operasi tertentu tetap tidak maju, periksa apakah ia terhalang menunggu operasi lain — field yang sedang di tengah retype tidak bisa sekaligus di-rename atau dipromosikan sampai backfill retype-nya selesai, dan model yang sedang di tengah penghapusan menolak operasi baru terhadap field mana pun miliknya. Itu muncul sebagai exception bertipe (`RetypeInProgressException`, `RenameInProgressException`, `FieldDeletionInProgressException`, `ModelDeletionInProgressException`), bukan sekadar diam saja, jadi periksa log error Anda sendiri untuk salah satunya sebelum mengasumsikan Reconciler-nya sendiri yang jadi masalah.

## Ekspor tertahan di status pending

Job dari `submitExport()` tidak pernah beranjak dari `pending`. Ada dua hal independen yang perlu diperiksa, berurutan:

1. **Apakah Chronicler berjalan?** Ekspor hanya maju saat minimal satu proses `bin/stardust chronicler`, atau jadwal `tick --exports`, aktif. Tidak ada satu pun yang berjalan secara default — `tick` khususnya butuh flag `--exports` secara eksplisit, karena ekspor tidak aktif secara default bahkan di bawah mode itu. Lihat [Chronicler](/id/operations/chronicler) dan [Deployment](/id/operations/deployment#menyertakan-ekspor-dalam-tick).
2. **Apakah pengaman ruang disk pra-klaim sedang menolak pekerjaan baru?** Jika ruang bebas direktori artifact rendah, atau probe tulis kecil ke dalamnya gagal (kuota per akun bisa membuat filesystem melaporkan dirinya sebagian besar bebas padahal setiap penulisan tetap gagal), Chronicler mencatat peringatan di setiap tick dan menolak mengklaim job baru — job yang sudah berjalan tetap berlanjut, tetapi tidak ada yang baru dimulai. Lihat [Chronicler](/id/operations/chronicler#pengaman-ruang-disk).

Jika keduanya tidak menjelaskan situasinya, pantau job itu langsung — `getExportJob()` melaporkan `failed` dengan alasan spesifik begitu benar-benar sudah dicoba dan menyerah, yang mempersempit masalahnya lebih jauh daripada sekadar "masih pending".

## Watcher menolak berjalan

`bin/stardust watcher` langsung keluar dengan kode bukan-nol alih-alih berjalan. Watcher adalah singleton ketat: ia mengambil file lock eksklusif di `pidFileDir` saat startup, dan instance kedua terhadap direktori lock yang sama menolak untuk mulai alih-alih berjalan berdampingan dengan yang pertama. Periksa apakah sudah ada Watcher yang berjalan terhadap `pidFileDir` yang sama — termasuk yang diluncurkan oleh `tick`, yang mengambil lock yang identik. Jika Anda berniat menjalankan `tick` dan `watcher` persisten pada saat yang sama, berhenti: itulah satu-satunya kombinasi yang memang tidak pernah didukung — lihat [Deployment](/id/operations/deployment#memilih-mode-deployment).

Jika memang tidak ada apa pun yang sedang berjalan, penyebab umum lainnya adalah file lock basi yang ditinggalkan proses yang mati secara tidak bersih — periksa apakah pid yang tercatat di dalamnya masih hidup sebelum menghapusnya secara manual.

## Tick melaporkan lock contention

`bin/stardust tick` melaporkan dirinya di-skip, atau alasan berhentinya menyebut lock contention, alih-alih benar-benar bekerja. Ini berarti proses lain sudah memegang file lock Watcher saat pemanggilan `tick` ini dimulai — paling sering karena pemanggilan cron yang tumpang tindih di mana run sebelumnya belum selesai, atau proses `bin/stardust watcher` persisten yang berjalan terhadap `pidFileDir` yang sama (yang, sesuai catatan di atas, memang seharusnya tidak Anda jalankan berdampingan dengan `tick` sama sekali). Skip seperti ini sama sekali tidak menyentuh database, sehingga sifatnya rutin, bukan kegagalan — satu run yang terlewat pada jadwal cron per menit adalah pembulatan angka, bukan insiden.

Jika Anda melihat ini di hampir setiap pemanggilan alih-alih sesekali, periksa apakah penjaga tumpang tindih crontab Anda sendiri (`flock -n` pada contoh di [halaman deployment](/id/operations/deployment#perintah-tick)) benar-benar berfungsi, dan apakah `--budget` Anda nyaman muat di dalam interval cron Anda — run yang secara rutin memakan waktu lebih lama daripada interval antar-pemanggilan akan berbenturan dengan dirinya sendiri.

## Baris menumpuk di dead-letter queue

Dead-letter queue yang terus membesar berarti baris-baris yang memang tidak bisa direkonsiliasi, bukan Reconciler yang tertinggal (Reconciler yang sekadar lambat justru terlihat sebagai sync queue yang membesar atau backfill window yang melebar — lihat [Reconciler](/id/operations/reconciler#apa-yang-tertahan-jika-reconciler-tidak-berjalan)). Setiap baris di sini gagal karena alasan spesifik yang tercatat — paling umum rujukan ke data entry yang sudah lenyap, atau nilai tersimpan yang tidak bisa lagi dikonversi ke tipe field-nya saat ini.

Periksa alasan kegagalannya sebelum memproses ulang apa pun:

```bash
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

Baris yang penyebab mendasarnya belum benar-benar Anda perbaiki akan langsung gagal lagi dan mendarat kembali di antrean saat diproses ulang — itu wajar, bukan bug, dan cara yang berguna untuk memastikan apakah perbaikan Anda memang berhasil. Lihat [Reconciler](/id/operations/reconciler#dead-letter-queue) untuk alur proses ulang lengkapnya.

## Server ditolak saat boot

Engine memunculkan `UnsupportedServerException` pertama kali ia perlu mengetahui dialek database Anda — selama `bootstrap()`, atau pemanggilan `serverEngine()` mana pun. Ini berarti server yang terhubung berada di bawah ambang batas yang didukung: MySQL atau Percona di bawah 8.0.13, atau MariaDB di bawah 10.11. Tidak ada override konfigurasi untuk ambang batas ini — lihat [Persyaratan](/id/guide/requirements#database-yang-didukung) untuk versi persis mana yang memenuhi syarat, termasuk alasan MariaDB secara khusus punya ambang batas keras di 10.11 alih-alih versi lebih lama yang mungkin disarankan logika ambang batas MySQL.

Periksa versi dan vendor server Anda yang sesungguhnya (`SELECT VERSION();`) alih-alih berasumsi dari nama pemasaran paket hosting Anda — hosting "MySQL 8" terkadang sebenarnya MariaDB di baliknya, dan shared hosting khususnya umumnya memakai MariaDB yang lebih lama dari 10.11 secara default.
