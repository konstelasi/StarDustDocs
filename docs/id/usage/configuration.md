# Konfigurasi

Semua yang menentukan perilaku StarDust di aplikasi Anda diatur sekali, saat konstruksi, lewat satu objek `Config`. Halaman ini membahas bagian yang akan Anda sentuh sejak hari pertama. Daftar lengkap pengaturan beserta nilai bawaannya ada di [referensi konfigurasi](/id/reference/configuration).

## Objek Config

`Config` hanya punya satu argumen wajib, yaitu koneksi PDO. Sisanya opsional dan punya nilai bawaan, jadi setup yang berfungsi cukup dua baris:

```php
use StarDust\Config\Config;
use StarDust\StarDust;

$engine = new StarDust(new Config(pdo: $pdo));
$engine->bootstrap(); // idempotent: aman dipanggil di setiap deploy
```

Beberapa hal yang perlu diketahui:

- **Pakai named argument.** `Config` punya puluhan parameter opsional, dan parameter baru selalu ditambahkan di belakang, jadi named argument menjaga kode Anda tetap mudah dibaca dan tetap valid setelah upgrade.
- **Ia immutable.** Setiap properti bersifat read-only begitu objek terbentuk. Untuk mengubah pengaturan, buat `Config` dan `StarDust` yang baru.
- **Konstruksi tidak melakukan I/O.** Membuat `Config` tidak pernah menyentuh database maupun filesystem. Direktori seperti `artifactDir` baru dibuat ketika ada yang pertama kali menulis ke sana.
- **Baca kembali lewat `$engine->config()`.** Berguna ketika Anda butuh pengaturan yang sama di tempat lain, misalnya `$engine->config()->queryFilterLimits` untuk decoder filter JSON.

`bootstrap()` menyediakan semua tabel yang dibutuhkan engine, dan aman dijalankan ulang. Ia tidak pernah menghapus atau menulis ulang data yang sudah ada, jadi memanggilnya di setiap deploy adalah pola yang wajar. Lihat [Instalasi](/id/guide/installation#bootstrap-skema).

## Atribut PDO yang wajib

PDO yang Anda berikan harus dibuat dengan kedua atribut berikut:

```php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
```

**Keduanya wajib, bukan sekadar hiasan.**

- **`ATTR_EMULATE_PREPARES => false`.** Driver MySQL milik PHP secara bawaan meniru prepared statement, yang mengirim setiap nilai terikat sebagai string berkutip. Itu merusak pembacaan berhalaman StarDust, yang mengikat ukuran halaman ke `LIMIT`: `read()` atau `search()` pertama gagal dengan syntax error MySQL (errno 1064). Mematikan emulasi juga membuat nilai kembali dari database dengan tipe aslinya, yang diandalkan engine.
- **`ATTR_ERRMODE => ERRMODE_EXCEPTION`.** Beberapa pengaman di engine membutuhkan statement yang gagal untuk melempar exception, bukan diam-diam mengembalikan `false`.

Jika aplikasi Anda berbagi satu koneksi dengan kode lain, buatlah PDO terpisah untuk StarDust, jangan mengubah atribut ini di bawah kode tersebut. [Integrasi dengan aplikasi Anda](/id/usage/integrating#memakai-pdo-yang-sama-dengan-aplikasi-anda) menjelaskan mengapa koneksi khusus biasanya pilihan yang lebih baik.

## Logging

StarDust menulis record log terstruktur untuk hampir semua yang ia kerjakan: penulisan, pembacaan, penolakan, dan setiap langkah daemon latar belakang. Secara bawaan record itu dikirim ke **standard output, satu objek JSON per baris** (NDJSON), yang memang diharapkan dari daemon CLI di bawah systemd atau container runtime.

Untuk mengirimnya ke tempat lain, berikan logger PSR-3 apa pun:

```php
$engine = new StarDust(new Config(
    pdo:    $pdo,
    logger: $yourPsr3Logger, // Monolog, logger framework, atau buatan Anda sendiri
));
```

Setiap record adalah pemanggilan PSR-3 yang context-nya membawa nama `event`, `source`, `correlation_id`, dan field khusus event tersebut. Dua konsekuensinya:

- **Suntikkan logger pada web request.** Logger bawaan dirancang untuk daemon CLI. Pada aplikasi yang melayani HTTP, berikan logger PSR-3 milik aplikasi Anda agar record masuk ke alur log Anda yang biasa.
- **Logger kustom memegang format record.** Engine mengoper field sebagai context. Logger Andalah yang menentukan cara serialisasinya, jadi bentuk satu-objek-JSON-per-baris hanya berlaku untuk logger bawaan.

Setiap event membawa `correlation_id`, dan Anda bisa memberikan milik sendiri agar satu request id mengikuti sebuah operasi sampai ke latar belakang. Lihat [Observabilitas](/id/operations/observability). Daftar event ada di [Event log](/id/reference/log-events).

## Menyuntikkan clock

StarDust tidak pernah memanggil jam sistem secara langsung. Ia meminta clock PSR-20 yang disuntikkan (`Psr\Clock\ClockInterface`), yang secara bawaan berupa jam sistem UTC:

```php
$engine = new StarDust(new Config(
    pdo:   $pdo,
    clock: $yourClock,
));
```

Di mana pun engine butuh waktu saat ini, misalnya untuk timestamp yang ia catat atau `ts` pada record log, ia membaca clock ini. Menyuntikkan clock sendiri paling berguna di test, karena clock yang dibekukan atau bisa dimajukan membuat perilaku yang bergantung waktu menjadi deterministik. Lihat [Menguji kode yang memakai StarDust](/id/usage/testing-your-app#membekukan-clock).

## Pengaturan yang paling mungkin Anda ubah

Nilai bawaannya cocok untuk sebagian besar instalasi. Berikut yang paling dulu biasa diubah orang:

| Pengaturan | Bawaan | Kapan diubah |
| :-- | :-- | :-- |
| `logger` | NDJSON ke stdout | Di setiap proses yang menghadap web, agar record masuk ke alur log Anda. |
| `clock` | Jam sistem UTC | Di test. |
| `artifactDir` | `sys_get_temp_dir()/stardust` | Di produksi, untuk mengarahkan ke direktori yang persisten dan bisa ditulis yang **tidak bisa diakses lewat web**. File ekspor dan payload impor asinkron disimpan di sini, jadi daemon harus memakai direktori yang sama. Lihat [catatan di bawah](#pengaturan-dan-daemon-bawaan). |
| `pidFileDir` | `sys_get_temp_dir()/stardust` | Tempat pid file Watcher dan flag file shutdown berada. Arahkan ke direktori lokal yang bisa ditulis. |
| `queryFilterLimits` | Kedalaman 8, 256 node, string 4 096 karakter | Jika Anda menerima filter dari klien yang tidak tepercaya dan ingin batas yang lebih ketat. Lihat [Keamanan](/id/operations/security#menerima-filter-dari-sumber-yang-tidak-tepercaya). |
| `searchDriver` | Driver MySQL bawaan | Untuk mendelegasikan pembacaan ke layanan pencarian eksternal. Lihat [Driver pencarian kustom](/id/extending/custom-search-drivers). |
| `pageIndexHeadroom` | 4 | Untuk mengubah seberapa banyak kapasitas index cadangan yang dibawa setiap page baru. Lihat [Penyetelan](/id/operations/tuning#index-headroom). |
| `chroniclerPerTenantActiveCap` | 3 | Untuk mengizinkan lebih banyak ekspor bersamaan per tenant. |
| `tickBudgetSeconds` | 50 | Saat Anda memanggil `tick()` sendiri, agar sesuai dengan jadwal Anda. CLI memakai `--budget`. Lihat [Deployment](/id/operations/deployment#batas-waktu-budget). |

Penyetelan daemon (ukuran chunk, pengaturan laju worker, percobaan ulang lock) dibahas di [Penyetelan](/id/operations/tuning).

### Pengaturan dan daemon bawaan

`Config` hanya memengaruhi proses yang membangunnya. **`bin/stardust` membangun `Config`-nya sendiri hanya dari `STARDUST_DSN`, `STARDUST_USER`, dan `STARDUST_PASS`, dan membiarkan semua pengaturan lain pada nilai bawaan.** Jadi nilai yang Anda atur di aplikasi, seperti `artifactDir`, `pidFileDir`, `pageIndexHeadroom`, atau ukuran chunk, tidak sampai ke daemon yang dijalankan dengan `bin/stardust`.

Untuk sebagian besar pengaturan, artinya daemon memakai nilai bawaan. Untuk `artifactDir` dampaknya lebih besar, karena aplikasi Anda dan daemon harus memakai direktori yang sama. [Integrasi dengan aplikasi Anda](/id/usage/integrating#menjalankan-daemon-berdampingan-dengan-aplikasi) menjelaskan cara menjaganya tetap sepakat, dan cara menjalankan daemon dari skrip Anda sendiri bila butuh pengaturan khusus.

## Shared hosting dan lock namespace

StarDust mengambil dua advisory lock MySQL. MySQL membatasi cakupan nama advisory lock pada seluruh *server*, bukan pada database Anda, sehingga di host tempat banyak akun berbagi satu server MySQL, dua instalasi StarDust akan berebut nama lock yang sama dan masing-masing sesekali tertahan menunggu yang lain.

`Config::$lockNamespace` bernilai bawaan `null`, yang menurunkan namespace privat dari nama database Anda. Itu sudah benar secara otomatis dan tidak butuh tindakan apa pun dari Anda.

Atur secara eksplisit hanya dalam dua situasi:

- Anda mengganti nama database dan ingin identitas lock tetap sama setelah pemindahan;
- Anda sengaja menjalankan dua instalasi yang harus berkoordinasi sebagai satu.

String tidak kosong apa pun boleh dipakai. Ia hanya pengenal, bukan rahasia, dan nilainya tidak pernah keluar dari server Anda.

**Satu catatan upgrade.** Lock yang dinamai dengan skema lama yang tidak terkualifikasi dan skema per-instalasi yang sekarang tidak saling mengenali. Saat Anda men-deploy versi yang mengubah skema itu, hentikan dulu daemon Anda (atau jeda baris cron), jangan me-restart-nya satu per satu. Pada jadwal cron, ongkosnya hanya satu putaran yang terlewat. Lihat [Upgrade](/id/operations/upgrading).
