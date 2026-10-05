# Coba dalam lima menit

Satu perintah menyalakan database, membuat skema, mengisi model contoh, menjalankan filter terindeks, dan menjalankan keempat proses latar belakang. Ini cara tercepat untuk melihat StarDust bekerja sebelum Anda memasang apa pun di proyek sendiri.

## Prasyarat

- Docker beserta Docker Compose.
- Git, untuk meng-clone repositori.
- Koneksi internet pada run pertama: langkah setup memasang dependensi Composer di dalam container.

Tidak ada lagi yang dibutuhkan di mesin Anda. PHP dan MySQL sama-sama berjalan di container.

## Menjalankan stack

```bash
git clone https://github.com/damarbob/StarDust.git
cd StarDust
docker compose up
```

Perintah ini menjalankan, berurutan:

1. **`mysql`**: MySQL 8.0 dengan database `stardust`.
2. **`init`**: service sekali jalan yang memasang dependensi, mem-bootstrap skema, menjalankan skrip seed, lalu selesai.
3. **`watcher`, `reconciler`, `liberator`, dan `chronicler`**: empat proses latar belakang, dijalankan setelah `init` selesai dengan sukses.

Container MySQL juga dipublikasikan di host Anda pada port **3307**, kalau Anda ingin menyambungkan klien database ke sana. Atur `STARDUST_HOST_DB_PORT` untuk memakai port lain bila 3307 terpakai. Container-container itu sendiri saling berbicara lewat jaringan Compose dan tidak bergantung pada pemetaan tersebut.

## Apa yang baru saja terjadi

Service `init` menjalankan [`docker/seed.php`](https://github.com/damarbob/StarDust/blob/main/docker/seed.php), yaitu seluruh alur StarDust dalam satu skrip pendek:

1. Ia terhubung dengan PDO yang diatur untuk melempar exception lalu mem-bootstrap skema.
2. Ia mendaftarkan model `company` dengan empat field filterable: `name`, `industry`, `employees`, dan `founded`.
3. Ia menyediakan satu page terindeks dan memesan satu slot untuk setiap field, sehingga query pertama pun sudah memakai index. Pada deployment sungguhan, Watcher yang mengerjakan ini secara otomatis.
4. Ia menulis lima perusahaan dari array JSON mentah, seperti yang dilakukan CMS atau lapisan HTTP saat menyerahkan entry.
5. Ia men-decode filter dari payload wire JSON dan menjalankannya.

[Contoh lengkap](/id/guide/tutorial) menelusuri langkah yang sama satu per satu.

## Melihat hasil query dari data seed

Hasil filter dicetak oleh service `init`. Bacalah dengan:

```bash
docker compose logs init
```

Anda akan melihat perusahaan software dengan lebih dari 100 karyawan:

```text
=== StarDust quickstart ===
Software companies with more than 100 employees:
  - Initech      software       510 employees
  - Hooli        software       240 employees
```

Kedua baris itu berasal dari `industry = 'software' AND employees > 100`. `industry` dan `employees` adalah field buatan pengguna, bukan kolom tabel, dan query berjalan sebagai range scan terindeks.

Untuk bereksperimen, ubah `docker/seed.php` lalu jalankan `docker compose up init` lagi. Skripnya idempotent: model dan field bersifat get-or-create, dan proses seed dilewati begitu model sudah punya entry.

## Mengamati kerja para daemon

Keempat proses latar belakang berjalan sebagai container terpisah:

```bash
docker compose ps
docker compose logs -f watcher reconciler
```

Masing-masing menulis satu objek JSON per baris ke lognya. Mereka tetap menganggur sampai ada pekerjaan.

Untuk melihat mereka bekerja, jalankan contoh siklus hidup field di dalam stack. Contoh itu mempromosikan sebuah field menjadi filterable dan menunjukkan apa yang terjadi berikutnya, dan `--observe` membuatnya tidak menjalankan tick sendiri, melainkan mengamati daemon Anda yang sedang berjalan:

```bash
docker compose run --rm init php examples/01-field-lifecycle.php --observe
```

Watcher memeriksa pekerjaan sekali per menit secara bawaan, jadi penyediaan page bisa memakan waktu. Penantian itu nyata, dan itulah persisnya [backfill window](/id/concepts/background-work#backfill-window) yang hendak ditunjukkan contoh ini. Lihat [Contoh yang bisa dijalankan](/id/guide/examples).

## Membersihkan semuanya

```bash
docker compose down -v
```

`-v` juga menghapus volume database, sehingga `docker compose up` berikutnya mulai dari nol. Hilangkan opsi itu bila ingin menyimpan data Anda.

## Bukan konfigurasi produksi

Stack ini untuk mencoba StarDust. Ia bukan templat untuk deployment:

- password database-nya `root`, dan port database dipublikasikan di host Anda;
- repositori di-bind-mount ke setiap container;
- ada satu container per daemon, tanpa pengawasan selain kebijakan restart Docker;
- entry-nya adalah data contoh.

Untuk produksi, lihat [Deployment](/id/operations/deployment).
