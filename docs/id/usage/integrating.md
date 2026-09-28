# Integrasi dengan aplikasi Anda

StarDust adalah library PHP biasa, jadi ia bisa dipasang di aplikasi apa pun. Halaman ini membahas keputusan yang muncul saat Anda memasangnya: berapa instance yang dibuat, apakah koneksi PDO dibagi, bagaimana interaksinya dengan transaksi Anda sendiri, dari mana tenant id berasal, cara mendaftarkannya di container, dan cara menjalankan daemon berdampingan dengan aplikasi.

## Satu instance per koneksi

Sebuah instance `StarDust` membungkus satu `Config` dan karenanya satu koneksi PDO. Buat sekali per koneksi dan pakai ulang untuk semua yang dikerjakan koneksi itu dalam satu request atau satu worker.

- **Konstruksinya murah.** Ia tidak melakukan I/O, dan collaborator dibangun secara lazy saat pertama dipakai.
- **Memakai ulang ada gunanya.** Instance menyimpan cache skema milik jalur baca, jadi memakainya ulang menghindari pemuatan skema berulang, dan menghindari pembuatan ulang collaborator di setiap pemanggilan.
- **Jangan berbagi satu instance untuk koneksi yang berbeda.** Beri masing-masing koneksi instance sendiri.
- **PDO tidak menyambung ulang dengan sendirinya.** Pada worker yang berjalan lama, bila database memutus koneksi (misalnya setelah `wait_timeout` MySQL), pemanggilan berikutnya melempar exception. Buat ulang PDO dan instance-nya saat itu terjadi, seperti yang sudah Anda lakukan untuk akses database lainnya.

## Memakai PDO yang sama dengan aplikasi Anda

Anda punya dua pilihan: menyerahkan PDO yang sudah dipakai aplikasi kepada StarDust, atau memberinya koneksi khusus. **Koneksi khusus biasanya pilihan yang lebih baik.**

StarDust membutuhkan PDO yang dibuat dengan `PDO::ERRMODE_EXCEPTION` dan `PDO::ATTR_EMULATE_PREPARES => false`, seperti dijelaskan di [Konfigurasi](/id/usage/configuration#atribut-pdo-yang-wajib). Tidak ada atribut lain yang diwajibkan. Kalau Anda berbagi koneksi aplikasi, kedua atribut itu berlaku untuk *semua* kode yang memakainya. Mematikan emulasi mengubah cara nilai terikat diberi tipe dan cara sebagian statement berperilaku, jadi kode yang ditulis untuk koneksi yang meniru prepared statement bisa berperilaku berbeda. Berbagi hanya aman bila aplikasi Anda memang sudah berjalan dengan kedua pengaturan itu.

Koneksi khusus menghindari semua itu:

- atribut Anda dan atribut StarDust tidak bisa bertabrakan;
- transaksi StarDust tidak pernah bercampur dengan milik Anda (lihat bagian berikutnya);
- harganya satu koneksi database tambahan per proses yang memakai StarDust. Buat secara lazy, agar request yang tidak menyentuh StarDust tidak pernah membukanya. Resep container di bawah melakukan persis itu.

## Transaksi: milik Anda dan milik StarDust

**StarDust mengelola transaksinya sendiri.** Setiap pemanggilan yang mengubah data (`write()`, `updateEntry()`, `deleteEntry()`, setiap chunk `bulkWrite()`, dan perubahan skema) membuka transaksi di koneksinya, meng-commit-nya, dan me-rollback-nya bila gagal. Ada dua konsekuensi.

**Anda tidak bisa memanggil mutasi StarDust ketika transaksi Anda sendiri terbuka di koneksi yang sama.** PDO tidak mendukung transaksi bersarang, sehingga percobaan itu gagal dengan `PDOException` ("There is already an active transaction"). Kalau Anda berbagi PDO aplikasi, letakkan pemanggilan StarDust di luar transaksi yang sedang terbuka. Pembacaan (`read()`, `search()`, `get()`, `listModels()`, `describeModel()`) tidak membuka transaksi dan tidak terpengaruh.

**Penulisan StarDust tidak bisa bergabung ke transaksi Anda, bahkan di koneksi khusus.** Ia ter-commit sendiri, terpisah dari milik Anda. Tidak ada cara menjadikan "simpan baris saya dan tulis entry" satu unit atomik. Rancang untuk kegagalan sebagian:

```php
// 1. Tulis entry lebih dulu. Ini ter-commit sendiri.
$result = $engine->write($payload);

try {
    // 2. Baru catat di transaksi Anda sendiri.
    $pdo->beginTransaction();
    $insertInvoice->execute([$tenantId, $result->entryId]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // 3. Batalkan entry-nya agar tidak ada yang yatim. deleteEntry() idempotent.
    $engine->deleteEntry($tenantId, $result->entryId);
    throw $e;
}
```

Menulis ke StarDust lebih dulu berarti kegagalan di langkah Anda paling buruk meninggalkan entry yang bisa dihapus, bukan baris milik Anda yang menunjuk ke ketiadaan. Kalau penghapusan kompensasinya sendiri bisa gagal, catat entry id-nya di log agar job pembersihan bisa menemukannya. Untuk pekerjaan bulk, pakai [idempotency key](/id/usage/bulk-imports#idempotency-key) agar percobaan ulang aman.

## Menentukan tenant id

Setiap pemanggilan StarDust menerima `tenantId`, dan isolasi tenant sekuat nilai yang Anda berikan. **Ambil dari sesi terautentikasi Anda, jangan pernah dari input klien.** Request yang bisa memilih tenant id-nya sendiri bisa membaca data tenant lain.

Cara paling andal untuk menegakkannya adalah memastikan kode aplikasi tidak pernah mengoper tenant id sama sekali. Letakkan satu kelas tipis milik Anda di antara controller dan StarDust, dan biarkan kelas itu yang menyediakan tenant-nya:

```php
final class Entries
{
    public function __construct(
        private readonly StarDust $engine,
        private readonly CurrentTenant $tenant, // ditentukan dari sesi autentikasi Anda
    ) {
    }

    public function find(int $entryId): ?Entry
    {
        return $this->engine->get($this->tenant->id(), $entryId);
    }

    public function page(int $modelId, ?FilterNode $filter, ?Cursor $cursor): EntryPage
    {
        return $this->engine->read(new EntryQuery(
            tenantId: $this->tenant->id(),
            modelId:  $modelId,
            filter:   $filter,
            cursor:   $cursor,
        ));
    }
}
```

Tenant id harus berupa integer 1 atau lebih, kalau tidak pemanggilan memunculkan `InvalidTenantIdException` sebelum SQL apa pun dijalankan. Id model juga terikat pada tenant. Id model milik tenant lain berperilaku seperti model yang tidak ada, sehingga tidak bisa dipakai untuk menjangkau data tenant tersebut.

Cari model lewat id, bukan nama, di jalur yang sering dipanggil. Daftarkan sekali, saat setup atau langkah deploy, dan simpan id-nya di konfigurasi atau database Anda sendiri. [Mendefinisikan model dan field](/id/usage/defining-schema) menjelaskan mengapa get-or-create untuk setup, bukan untuk setiap request.

## Mendaftarkan ke container

Daftarkan satu service `StarDust`, ditopang PDO khusus yang dibuat secara lazy.

### Laravel

```php
<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use PDO;
use Psr\Log\LoggerInterface;
use StarDust\Config\Config;
use StarDust\StarDust;

final class StarDustServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Closure singleton dijalankan saat pertama kali di-resolve, jadi
        // koneksi baru dibuka ketika ada yang benar-benar meminta StarDust.
        $this->app->singleton(StarDust::class, function ($app): StarDust {
            $db = config('database.connections.mysql');

            $pdo = new PDO(
                sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                    $db['host'], $db['port'], $db['database']),
                $db['username'],
                $db['password'],
                [
                    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ],
            );

            return new StarDust(new Config(
                pdo:         $pdo,
                logger:      $app->make(LoggerInterface::class),
                artifactDir: storage_path('app/stardust'),
            ));
        });
    }
}
```

Daftarkan provider itu di daftar provider aplikasi Anda, lalu type-hint `StarDust` di mana pun Anda membutuhkannya.

### Symfony

Sebuah factory kecil menjaga pengaturannya tetap di PHP, tempat opsi PDO berupa konstanta:

```php
<?php

namespace App\StarDust;

use PDO;
use Psr\Log\LoggerInterface;
use StarDust\Config\Config;
use StarDust\StarDust;

final class StarDustFactory
{
    public function __construct(
        private readonly string $dsn,
        private readonly string $user,
        private readonly string $password,
        private readonly string $artifactDir,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function create(): StarDust
    {
        $pdo = new PDO($this->dsn, $this->user, $this->password, [
            PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        return new StarDust(new Config(
            pdo:         $pdo,
            logger:      $this->logger,
            artifactDir: $this->artifactDir,
        ));
    }
}
```

```yaml
# config/services.yaml
services:
    App\StarDust\StarDustFactory:
        arguments:
            $dsn: '%env(STARDUST_DSN)%'
            $user: '%env(STARDUST_USER)%'
            $password: '%env(STARDUST_PASS)%'
            $artifactDir: '%kernel.project_dir%/var/stardust'
            $logger: '@logger'

    StarDust\StarDust:
        factory: ['@App\StarDust\StarDustFactory', 'create']
```

Symfony hanya membangun service ketika ada yang memintanya, jadi koneksi dibuka saat pertama dipakai. Jangan menandai service ini `lazy`: `StarDust` adalah final class, yang tidak bisa dibungkus proxy lazy.

### PHP tanpa framework

Tanpa container, fungsi kecil yang membangun instance saat pertama dipakai sudah cukup:

```php
function stardust(): StarDust
{
    static $engine = null;

    return $engine ??= new StarDust(new Config(
        pdo: new PDO(getenv('STARDUST_DSN'), getenv('STARDUST_USER'), getenv('STARDUST_PASS') ?: '', [
            PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]),
        logger: $yourPsr3Logger,
    ));
}
```

Pada ketiganya, panggil `bootstrap()` dari langkah deploy atau console command, bukan di setiap request. Lihat [Instalasi](/id/guide/installation#bootstrap-skema).

## Menjalankan daemon berdampingan dengan aplikasi

Daemon adalah proses terpisah yang memakai database yang sama dengan aplikasi Anda. Jalankan dari instalasi Composer yang sama dengan aplikasi, agar versi StarDust-nya selalu sama:

```bash
STARDUST_DSN='mysql:host=db;dbname=app' STARDUST_USER=stardust STARDUST_PASS=secret \
  vendor/bin/stardust reconciler
```

[Deployment](/id/operations/deployment) membahas cara mengawasinya dan alternatif khusus cron. Ada tiga hal yang khusus penting untuk integrasi:

- **`bin/stardust` hanya membaca koneksi database dari environment.** Ia menerima `STARDUST_DSN`, `STARDUST_USER`, dan `STARDUST_PASS`, dan membangun `Config`-nya dengan semua pengaturan lain pada nilai bawaan. Ia tidak bisa diberi `artifactDir`, `pidFileDir`, logger, maupun nilai penyetelan milik aplikasi Anda.
- **Aplikasi dan daemon harus sepakat soal `artifactDir`.** Aplikasi menulis payload impor asinkron ke sana dan menyajikan ekspor yang selesai dari sana, sementara Reconciler membaca payload impor itu dan Chronicler menulis ekspornya. Daemon selalu memakai nilai bawaan, `sys_get_temp_dir()/stardust`. Jadi biarkan `artifactDir` pada nilai bawaan di aplikasi Anda juga dan pastikan keduanya menunjuk direktori fisik yang sama (host yang sama, atau volume yang di-mount di path yang sama pada setiap container), atau jalankan daemon dengan skrip runner Anda sendiri, seperti di bawah. Waspadai host yang memberi setiap service direktori temporer privat: dua proses di satu mesin tetap bisa menerjemahkan `sys_get_temp_dir()` ke tempat yang berbeda.
- **Apa pun yang Anda setel lewat `Config` hanya sampai ke proses yang membangun `Config` itu.** Perubahan `pageIndexHeadroom`, ukuran chunk, atau lease timeout di aplikasi Anda tidak mengubah perilaku daemon `bin/stardust`.

Untuk menjalankan daemon dengan pengaturan sendiri, tulis runner kecil yang membangun `Config` yang Anda inginkan dan menjalankan daemon dengan pemanggilan publik yang sama seperti yang dipakai CLI:

```php
#!/usr/bin/env php
<?php

require __DIR__ . '/vendor/autoload.php';

use StarDust\Config\Config;
use StarDust\StarDust;

$pdo = new PDO(getenv('STARDUST_DSN'), getenv('STARDUST_USER'), getenv('STARDUST_PASS') ?: '', [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

$engine = new StarDust(new Config(
    pdo:               $pdo,
    artifactDir:       '/var/lib/myapp/stardust',
    pageIndexHeadroom: 8,
));

// Reconciler polling terus-menerus (interval 0). Aman untuk multi-worker.
$engine->pollLoop()->run(
    $engine->reconciler(),
    $engine->shutdownSignal('reconciler'),
    0,
);
```

Daemon lain mengikuti pola yang sama, berbeda pada factory dan interval idle-nya:

| Daemon | Factory | Interval | Tambahan |
| :-- | :-- | :-- | :-- |
| Reconciler | `reconciler()` | `0` | Tidak ada. |
| Liberator | `liberator()` | `$engine->config()->liberatorIdleIntervalSeconds` | Tidak ada. |
| Chronicler | `chronicler($shutdown)` | `$engine->config()->chroniclerIdleIntervalSeconds` | Buat `$shutdown` sekali dan oper yang sama ke `chronicler()` dan `run()`. Berikan `pdoConnector` di `Config` agar koneksi yang putus di tengah ekspor bisa disambungkan kembali. |
| Watcher | `watcher()` | `$engine->config()->watcherPollIntervalSeconds` | Hanya boleh satu yang berjalan. Ambil pid-file lock dengan `PidFileGuard::acquire($engine->config()->pidFileDir, 'watcher')` lebih dulu, seperti yang dilakukan CLI. |

Pada host yang tidak bisa menjalankan proses persisten, panggil `$engine->tick()` dari tugas terjadwal, jangan pernah dari jalur request. Lihat [Deployment](/id/operations/deployment#hosting-yang-hanya-punya-cron-dan-shared-hosting).
