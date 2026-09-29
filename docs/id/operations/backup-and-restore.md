# Backup dan pemulihan

StarDust menyimpan seluruh state permanennya di satu database yang Anda arahkan — tidak ada penyimpanan metadata terpisah, tidak ada indeks pencarian eksternal yang perlu disinkronkan, dan tidak ada state daemon yang hidup di tempat lain selain tabel-tabel yang dibuat `bootstrap()`. Itu membuat backup pada dasarnya soal mem-backup database Anda dengan benar, dengan beberapa hal khas StarDust yang layak Anda ketahui sebelum mengandalkan sebuah pemulihan di produksi.

## Apa saja yang perlu di-backup

**Seluruh database, sebagai satu kesatuan.** `entry_data` menyimpan system of record — payload JSON lengkap dari setiap entry, hal yang menjadi alasan keberadaan setiap tabel lain — sementara extension page (`entry_slots_page_*`) menyimpan cermin terindeks dari nilai field filterable, dan tabel-tabel `stardust_*` menyimpan schema registry plus antrean dan checkpoint setiap daemon (sync queue, job impor dan ekspor, dead-letter queue, backfill checkpoint, jadwal advisory). Semuanya bersifat relasional dan semuanya perlu berasal dari titik waktu yang sama — backup yang menangkap `entry_data` semenit lebih awal daripada tabel registry, misalnya, bisa pulih ke keadaan di mana sebuah slot assignment sebenarnya tidak lagi cocok.

**Yang tidak perlu Anda backup:** direktori filesystem lokal. `artifactDir` menampung output yang bersifat sementara — file ekspor yang seharusnya sudah Anda sajikan atau unduh, dan payload staging untuk impor asinkron yang sedang berjalan — tidak satu pun bersifat otoritatif, semuanya sudah terkirim atau bisa dibangun ulang dengan mengajukan ulang pekerjaannya. `pidFileDir` tidak menampung apa pun selain file lock dan penanda shutdown, yang tidak bermakna di luar host yang membuatnya. Kedua direktori itu bukan bagian dari data Anda.

## Membuat snapshot yang konsisten

Praktik backup MySQL/MariaDB yang biasa berlaku tanpa perubahan — StarDust tidak menambah persyaratan apa pun sendiri di atas `mysqldump --single-transaction`, snapshot filesystem atau volume, atau fitur backup point-in-time bawaan penyedia database terkelola Anda.

Satu hal yang layak direncanakan adalah bahwa Watcher menjalankan DDL saat menyediakan page baru, dan DDL yang berjalan bersamaan justru jenis aktivitas yang paling tidak nyaman dihadapi alat backup. Jika memungkinkan, ambil snapshot Anda pada jendela waktu ketika Anda sudah menjeda Watcher (atau baris cron `tick` Anda, jika Anda menjalankan mode itu) — snapshot level penyimpanan atau bawaan penyedia terkelola yang sama sekali tidak terpengaruh DDL yang berjalan bersamaan adalah pilihan yang lebih tangguh jika menjeda sesuatu tidak praktis. Reconciler, Liberator, dan Chronicler tidak pernah menjalankan DDL, sehingga tidak perlu dijeda untuk alasan ini.

## Memulihkan data

Pulihkan database dengan cara normal sesuai alat yang menghasilkan snapshot-nya, lalu verifikasi koneksinya sebelum mengarahkan aplikasi atau daemon Anda ke sana — pemeriksaan yang sama seperti setelah instalasi baru:

```php
echo $engine->serverEngine()->name;
var_dump($engine->listModels(tenantId: 1));
```

Pemulihan point-in-time kehilangan apa pun yang ditulis setelah snapshot diambil, sama seperti database mana pun — tidak ada yang khas StarDust soal itu. Memulihkan ke database dengan **nama berbeda** dari aslinya layak dipikirkan dua kali: `lockNamespace` menurunkan default-nya dari nama database, sehingga target pemulihan yang berganti nama mendapat namespace turunan yang berbeda dari yang dimiliki aslinya. Ini hanya penting jika Anda sengaja menjalankan salinan hasil pemulihan berdampingan dengan yang asli (klon staging yang diambil dari snapshot produksi, misalnya) — setel `lockNamespace` secara eksplisit jika Anda butuh keduanya berkoordinasi sebagai satu instalasi yang sama, dan biarkan saja jika tidak. Lihat [Konfigurasi](/id/usage/configuration#shared-hosting-dan-lock-namespace).

## Setelah pemulihan

Bersihkan `artifactDir` dan `pidFileDir` di host mana pun tempat Anda memulihkan sebelum menjalankan apa pun. Isi kedua direktori itu bukan bagian dari backup, jadi apa pun yang tersisa dari sebelumnya — file ekspor yang job id-nya tidak lagi cocok dengan registry hasil pemulihan, `watcher.pid` basi dari proses yang sudah tidak ada — adalah sisa, bukan data, dan aman dihapus begitu saja.

Selebihnya, tidak ada yang perlu dilakukan secara khusus: progres setiap daemon — kedalaman sync queue, status job impor dan ekspor, backfill checkpoint, cursor sweep — sepenuhnya hidup di database yang baru saja Anda pulihkan, bukan di memori daemon mana pun. Jalankan daemon-nya (atau lanjutkan jadwal `tick` Anda) dan mereka akan melanjutkan tepat dari titik yang dikatakan registry hasil pemulihan sedang tertunda, dengan cara yang sama seperti mereka melanjutkan setelah restart biasa.

## Ekspor bukan pengganti backup

Ekspor adalah dump CSV atau JSON read-only pada satu titik waktu dari entry (yang belum dihapus) milik satu model — berguna untuk menyerahkan data ke seseorang, atau untuk analisis sekali pakai, tetapi bukan pengganti backup database. Ia meninggalkan segala hal yang dibutuhkan sebuah pemulihan yang tidak ada di dalam payload model itu saja: schema registry, slot assignment, setiap model lain, state daemon yang sedang berjalan, dan entry mana pun yang sudah di-soft-delete sebelum ekspor dijalankan. Tidak ada jalur impor yang membangun ulang sebuah model dari file hasil ekspor, sehingga ekspor bisa memberi Anda *sebuah* salinan dari *sebagian* data, tetapi tidak pernah menjadi titik yang bisa Anda *pulihkan kembali* ke sana.

Jika Anda akan menghapus sebuah model atau field — satu-satunya tempat StarDust sendiri menyarankan untuk mengekspor lebih dulu, karena penghapusan model bersifat permanen dan tidak bisa dibatalkan — perlakukan ekspor itu sebagai arsip satu arah dari apa yang akan Anda hilangkan, bukan sebagai backup database Anda. Lihat [Menghapus model](/id/schema-changes/deleting-models) dan [Menghapus field](/id/schema-changes/deleting-fields).
