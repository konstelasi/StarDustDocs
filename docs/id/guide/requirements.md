# Persyaratan

StarDust membutuhkan PHP yang modern dan jenis database tertentu. Ia memeriksa database-nya sendiri saat dijalankan, sehingga server yang tidak didukung ditolak sejak awal, bukan baru ketahuan di produksi.

## PHP dan ekstensi

- **PHP 8.1 atau lebih baru.** Test suite dijalankan di 8.1, 8.2, 8.3, dan 8.4.
- **`ext-pdo` dan `ext-pdo_mysql`.** StarDust berbicara dengan database hanya lewat PDO.

Satu-satunya dependensi Composer package ini adalah package interface `psr/log` dan `psr/clock`.

## Database yang didukung

### MySQL dan Percona 8.0.13+

MySQL dan Percona Server 8.0.13 atau lebih baru. Batas bawahnya tegas: StarDust bergantung pada functional unique index, yang tidak ada di bawah 8.0.13. Itu menyingkirkan seluruh seri awal 8.0 (8.0.0 sampai 8.0.12), bukan hanya 5.7.

### MariaDB 10.11+

MariaDB 10.11 atau lebih baru. MariaDB tidak punya padanan jenis index yang disediakan MySQL, sehingga jaminan "paling banyak satu slot aktif per field" di sana ditegakkan dengan generated column dan unique index biasa. Itulah sebabnya batas bawah MariaDB ditentukan berdasarkan pertimbangannya sendiri, bukan sekadar menyamai MySQL. **Shared hosting umumnya memakai MariaDB**, jadi periksa versinya kepada penyedia hosting Anda.

### Perbedaan perilaku di MariaDB

Filter rentang (`lt`, `lte`, `gt`, `gte`, dan `between` yang batasnya melintasinya) serta pengurutan berdasarkan field menempatkan karakter Unicode supplementary-plane, kebanyakan emoji dan jauh di luar teks sehari-hari, di ujung yang berlawanan dari MySQL. Semua perbandingan lain, dan teks biasa dalam bahasa apa pun, berperilaku identik di keduanya.

## Engine yang tidak didukung

Ini terdeteksi dan ditolak, bukan sekadar belum diuji:

- **MariaDB di bawah 10.11**, termasuk 10.7 sampai 10.10. Versi-versi itu membandingkan teks di dalam kolom JSON dengan cara yang berbeda, dan tidak ada perbaikan yang bisa diberikan oleh konfigurasi saja.
- **MySQL dan Percona di bawah 8.0.13.**
- **Apa pun yang bukan MySQL, Percona, atau MariaDB.** PostgreSQL, SQLite, dan SQL Server tidak didukung. Skema dan SQL StarDust ditulis untuk database keluarga MySQL, dan tidak ada pengganti in-memory untuk test. Lihat [FAQ](/id/guide/faq#apakah-bisa-memakai-postgresql-atau-sqlite).

## Deteksi engine saat boot

Anda tidak pernah mengonfigurasi engine apa yang dipakai. StarDust membaca versi server dari koneksi yang aktif dan memilih varian statement yang sesuai untuk beberapa statement yang berbeda. Jika server berada di bawah salah satu batas bawah, ia memunculkan `UnsupportedServerException` alih-alih melanjutkan.

Pemeriksaan terjadi saat pertama kali engine perlu tahu dialek-nya, misalnya di `bootstrap()`, atau ketika Anda memanggil `serverEngine()`. Ia tidak terjadi ketika Anda membuat instance `StarDust`. Untuk melihat apa yang terdeteksi:

```php
echo $engine->serverEngine()->name; // MYSQL atau MARIADB
```

## Persyaratan hosting

Untuk deployment acuan Anda membutuhkan:

- proses latar belakang persisten atau container yang berjalan lama (systemd, supervisor, Docker, Kubernetes, ECS, atau sejenisnya);
- PHP dengan akses CLI, untuk entry point `bin/stardust`;
- akses tulis filesystem lokal, untuk file ekspor dan payload impor latar belakang (volume yang di-mount pada container);
- tepat satu proses Watcher, yang dijaga oleh process supervisor Anda. StarDust menambahkan pengaman sendiri, tetapi supervisor adalah penjaga utamanya.

Jika Anda tidak bisa menjalankan proses persisten, `bin/stardust tick` terbatas yang dijadwalkan mengerjakan hal yang sama. Host tanpa shell, tanpa cron, dan tanpa pengambilan URL terjadwal tidak didukung pada tingkat mana pun. [Deployment](/id/operations/deployment) mendaftar tingkatan hosting mana yang memenuhi syarat untuk tiap mode.
