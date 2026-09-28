# Instalasi

Halaman ini membawa Anda dari proyek kosong sampai memiliki instance StarDust yang terhubung ke database yang sudah di-bootstrap. Halaman ini mengasumsikan Anda sudah memenuhi [persyaratan](/id/guide/requirements) dan punya database MySQL atau MariaDB kosong untuk dipakai.

## Instalasi lewat Composer

```bash
composer require damarbob/stardust:^0.3@alpha
```

**Flag `@alpha` wajib** selama StarDust belum punya rilis stabil. Composer secara bawaan hanya memasang versi stabil, sehingga `composer require damarbob/stardust` tanpa flag gagal dengan pesan "Could not find a version … matching your minimum-stability". Flag ini hanya berlaku untuk package ini, dan dependensi Anda yang lain tetap memakai versi stabil.

Package ini hanya menarik `psr/log` dan `psr/clock`, dua package yang hanya berisi interface. Ia tidak membawa framework, ORM, query builder, maupun implementasi logging.

## Menyiapkan koneksi PDO

StarDust menerima PDO yang Anda buat sendiri. Dua atribut wajib:

```php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
```

Dengan prepared statement emulasi bawaan PHP, `read()` atau `search()` pertama gagal dengan syntax error MySQL. Lihat [Konfigurasi](/id/usage/configuration#atribut-pdo-yang-wajib) untuk alasannya, dan [Integrasi dengan aplikasi Anda](/id/usage/integrating#memakai-pdo-yang-sama-dengan-aplikasi-anda) bila aplikasi Anda sudah punya PDO yang berencana Anda pakai ulang.

Database yang disebut di DSN harus sudah ada. StarDust membuat tabel di dalamnya tetapi tidak membuat databasenya sendiri. User database harus punya hak untuk membuat tabel: bootstrap membuat skemanya, dan Watcher kemudian membuat tabel tambahan saat menambah kapasitas.

## Membuat instance StarDust

```php
use StarDust\Config\Config;
use StarDust\StarDust;

$engine = new StarDust(new Config(pdo: $pdo));
```

`Config` hanya membutuhkan PDO. Yang lain punya nilai bawaan. Membuat objeknya tidak melakukan I/O, jadi belum ada yang menyentuh database. Lihat [Konfigurasi](/id/usage/configuration) untuk pengaturan yang mungkin ingin Anda ubah.

## Bootstrap skema

Bootstrap membuat semua tabel yang dibutuhkan engine. Ia idempotent dan tidak destruktif: menjalankannya lagi pada database yang sudah di-bootstrap tidak mengubah apa pun, dan ia tidak pernah menghapus atau menulis ulang data yang ada, sehingga aman dijalankan di setiap deploy.

### Dari PHP

```php
$engine->bootstrap();
```

### Dari CLI

CLI membaca koneksinya dari environment variable:

```bash
STARDUST_DSN='mysql:host=127.0.0.1;dbname=app' \
STARDUST_USER=app STARDUST_PASS=secret \
  vendor/bin/stardust bootstrap
```

`STARDUST_DSN` dan `STARDUST_USER` wajib, sedangkan `STARDUST_PASS` bawaannya kosong. Bila berhasil, ia mencetak `stardust: bootstrap complete.` Pakai bentuk CLI di skrip deploy, dan bentuk PHP dari console command atau setup test.

## Memastikan instalasi berhasil

Periksa versi yang dilaporkan CLI:

```bash
vendor/bin/stardust --version
# 0.3.0-alpha.1
```

Lalu periksa apa yang terdeteksi engine pada database Anda, dan bahwa registry bisa dijangkau:

```php
echo $engine->serverEngine()->name;   // MYSQL atau MARIADB

var_dump($engine->listModels(tenantId: 1)); // array(0) {} pada database baru
```

Jika server berada di bawah batas yang didukung, `serverEngine()` memunculkan `UnsupportedServerException` di sini, dan itulah gunanya pemeriksaan ini. Jika `listModels()` mengembalikan daftar kosong tanpa error, berarti koneksi, atribut PDO yang wajib, dan skemanya sudah beres.

## Langkah berikutnya

- Ikuti [contoh lengkap](/id/guide/tutorial) untuk mendefinisikan model, menulis entry, dan memfilternya.
- Atau jalankan semuanya tanpa setup lewat [quickstart lima menit](/id/guide/quickstart).
- Baca [Deployment](/id/operations/deployment) sebelum masuk produksi. StarDust membutuhkan proses latar belakangnya berjalan, atau `tick` terjadwal, untuk kapasitas dan pekerjaan yang tertunda.
