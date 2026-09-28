# Menguji kode yang memakai StarDust

StarDust hanya bekerja di atas MySQL atau MariaDB sungguhan, dan tidak ada pengganti in-memory atau SQLite. Test suite milik StarDust sendiri berjalan di server sungguhan tanpa database tiruan, dan test Anda sebaiknya begitu juga untuk apa pun yang menyentuh StarDust. Halaman ini menunjukkan cara membuatnya cepat dan deterministik: database khusus, cara murah untuk memisahkan test satu dari yang lain, clock yang dibekukan, cara menjalankan pekerjaan latar belakang sesuai kebutuhan, dan logger yang bisa Anda periksa.

## Database khusus untuk pengujian

Arahkan test Anda ke database yang hanya ada untuk pengujian, jangan pernah database development Anda. Versinya harus MySQL atau Percona 8.0.13 ke atas, atau MariaDB 10.11 ke atas, sama seperti di produksi. Lihat [Persyaratan](/id/guide/requirements#database-yang-didukung).

Setup yang paling andal adalah container sekali pakai di lokal dan service container di CI:

```yaml
# .github/workflows/tests.yml (cuplikan)
services:
  mysql:
    image: mysql:8.0
    env:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: app_test
    ports:
      - 3306:3306
    options: >-
      --health-cmd="mysqladmin ping -proot"
      --health-interval=5s
      --health-retries=20
```

Reset database itu sekali di awal setiap run test, lalu buat skemanya sekali. `bootstrap()` bersifat idempotent, jadi menjalankannya lebih dari sekali tidak berbahaya:

```php
// tests/bootstrap.php
$pdo = new PDO($_ENV['TEST_DSN'], $_ENV['TEST_USER'], $_ENV['TEST_PASS'], [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

(new StarDust\StarDust(new StarDust\Config\Config(pdo: $pdo)))->bootstrap();
```

## Mengembalikan state di antara test

Setiap test perlu dimulai dari keadaan yang diketahui. Trik yang biasa tidak semuanya berfungsi dengan StarDust, jadi pilih dengan sengaja.

**Membungkus setiap test dalam transaksi lalu me-rollback-nya tidak berfungsi** untuk test yang memanggil mutasi StarDust. StarDust membuka transaksinya sendiri, dan PDO tidak mendukung transaksi bersarang, sehingga pemanggilan gagal pada koneksi yang sudah punya transaksi terbuka. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#transaksi-milik-anda-dan-milik-stardust).

**Menghapus dan membuat ulang tabel itu benar tetapi lambat.** Test suite StarDust sendiri mengukurnya sekitar 1,5 detik per test di MySQL 8.0.13, karena setiap drop dan create adalah perubahan skema yang di-commit oleh server. Lakukan itu paling banyak sekali per kelas test, atau sekali per run.

**Tenant baru untuk setiap test itu cepat dan tidak butuh pembersihan.** Setiap query yang dibangun StarDust membawa tenant id, sehingga data satu tenant tidak bisa dilihat tenant lain. Beri setiap test tenant-nya sendiri, definisikan model di dalam test, dan tidak ada yang perlu dihapus:

```php
abstract class StarDustTestCase extends PHPUnit\Framework\TestCase
{
    private static int $nextTenantId = 1;

    protected StarDust\StarDust $engine;
    protected int $tenantId;

    protected function setUp(): void
    {
        $this->tenantId = self::$nextTenantId++;
        $this->engine   = new StarDust\StarDust(new StarDust\Config\Config(
            pdo: TestDatabase::pdo(),
            // ... clock, logger, dan pidFileDir dari bagian-bagian di bawah
        ));
    }
}
```

Karena database test di-reset di awal setiap run, memulai penghitung dari 1 aman. Dua batasan yang perlu diketahui:

- **Slot dan page dipakai bersama.** Data satu tenant terisolasi, tetapi kumpulan slot bebas tidak. Itu tidak masalah untuk test perilaku. Test yang memeriksa jumlah page, spread, atau kapasitas sebaiknya berjalan di database tersendiri.
- **Pekerjaan latar belakang bersifat global.** `tick()` (di bawah) memproses pekerjaan tertunda milik semua tenant, bukan hanya milik test yang sedang berjalan. Bila test berjalan berurutan, itu tidak berbahaya. Test yang berjalan paralel membutuhkan database terpisah.

## Membekukan clock

StarDust membaca waktu dari clock PSR-20 yang disuntikkan. Berikan clock yang bisa Anda kendalikan:

```php
use Psr\Clock\ClockInterface;

final class FrozenClock implements ClockInterface
{
    public function __construct(private DateTimeImmutable $now)
    {
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    public function advance(string $interval): void
    {
        $this->now = $this->now->modify($interval);
    }
}

$clock  = new FrozenClock(new DateTimeImmutable('2026-01-01T00:00:00Z'));
$engine = new StarDust(new Config(pdo: $pdo, clock: $clock));
```

Clock yang dibekukan membuat timestamp yang dicatat engine dan `ts` pada record lognya menjadi deterministik. **Ia tidak mengendalikan semua hal yang berkaitan dengan waktu.** Sebagian keputusan diambil oleh database terhadap jamnya sendiri, bukan jam PHP, terutama apakah heartbeat sebuah job yang diklaim sudah terhenti dan apakah ekspor yang selesai sudah melewati TTL-nya. Memajukan `FrozenClock` tidak akan memicu hal-hal itu. Untuk mengujinya, atur timestamp yang tersimpan secara langsung, atau gunakan pengaturan lease dan TTL yang pendek.

## Menuntaskan pekerjaan latar belakang sesuai kebutuhan

Banyak perilaku baru selesai setelah sebuah daemon berjalan: field menjadi filterable, rename selesai, import job diproses. Di test, Anda tidak ingin menunggu daemon sungguhan. Panggil `tick()` untuk menjalankan Watcher, Liberator, dan Reconciler di dalam proses sampai tidak ada lagi yang harus dikerjakan:

```php
use StarDust\Daemon\TickStopReason;

$this->engine->write(new EntryPayload($this->tenantId, $modelId, ['name' => 'Acme']));

// Field-nya belum punya slot, jadi penulisan masuk antrean. Kuras antrean itu.
$report = $this->engine->tick(budgetSeconds: 10);

$this->assertSame(TickStopReason::IDLE, $report->stopReason); // sudah tuntas

// Sekarang field itu indexed dan bisa difilter.
$page = $this->engine->read(new EntryQuery(
    tenantId: $this->tenantId,
    modelId:  $modelId,
    filter:   LeafNode::local('name', 'eq', 'Acme'),
));
```

`tick()` mengembalikan `TickReport` berisi jumlah `rounds` yang dijalankan dan `stopReason`:

| `stopReason` | Artinya dalam test |
| :-- | :-- |
| `IDLE` | Satu putaran tidak menemukan pekerjaan: semuanya sudah tuntas. Inilah hasil yang Anda inginkan. |
| `BUDGET_SPENT` | Waktu habis lebih dulu. Naikkan budget atau cari pekerjaan yang tidak pernah selesai. |
| `SHUTDOWN` | Shutdown diminta. |
| `LOCK_CONTENDED` | Proses lain memegang pid file Watcher, sehingga **tidak ada pekerjaan yang berjalan**. |

Selalu periksa bahwa hasilnya `IDLE`, agar test tidak pernah lolos hanya karena tidak ada yang benar-benar dikuras.

**Beri setiap proses test `pidFileDir`-nya sendiri.** `tick()` mengambil pid-file lock milik Watcher, dan secara bawaan lock itu berada di direktori yang dipakai bersama oleh semua proses di mesin tersebut. Dua proses test yang berjalan bersamaan akan bertabrakan, dan yang kalah diam-diam tidak mengerjakan apa pun. Buat direktori privat per proses:

```php
$dir = sys_get_temp_dir() . '/stardust-test-' . getmypid();
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$config = new Config(pdo: $pdo, pidFileDir: $dir);
```

Dua opsi lagi untuk kendali yang lebih halus:

- `tick(exports: true)` juga menjalankan Chronicler, sehingga ekspor yang diajukan di test sudah tertulis sebelum Anda memeriksanya. Beri test itu `artifactDir` sendiri juga.
- Untuk menghentikan proses di tengah jalan dan memeriksa keadaan antaranya, jalankan satu daemon per satu waktu dengan `$engine->watcher()->tick()`, `$engine->reconciler()->tick()`, `$engine->liberator()->tick()`, dan `$engine->chronicler()->tick()`. Masing-masing menjalankan satu tick.

## Memeriksa event log dalam test

Berikan logger PSR-3 yang merekam apa yang diterimanya. Setiap event StarDust membawa nama `event` di context-nya, sehingga perekam bisa menyaring berdasarkan itu:

```php
use Psr\Log\AbstractLogger;

final class EventRecorder extends AbstractLogger
{
    /** @var list<array<string, mixed>> */
    public array $events = [];

    public function log($level, string|Stringable $message, array $context = []): void
    {
        if (isset($context['event'])) {
            $this->events[] = $context;
        }
    }

    /** @return list<array<string, mixed>> */
    public function named(string $event): array
    {
        return array_values(array_filter(
            $this->events,
            static fn (array $e): bool => $e['event'] === $event,
        ));
    }
}
```

Pakai untuk memeriksa perilaku yang tidak punya nilai kembalian, seperti fallback kapasitas atau query yang ditolak:

```php
$events = new EventRecorder();
$engine = new StarDust(new Config(pdo: $pdo, logger: $events));

$result = $engine->write($payloadForAFieldWithNoSlot);

$this->assertTrue($result->enqueuedForBackfill);
$this->assertCount(1, $events->named('exhaustion_fallback'));
```

Untuk memastikan beberapa event berasal dari satu operasi yang sama, berikan `correlationId` Anda sendiri pada pemanggilan dan pastikan nilai yang sama muncul pada setiap event yang dihasilkan operasi itu. Memeriksa bahwa `correlation_id` sekadar ada hanya sedikit membuktikan: nilai yang samalah yang menunjukkan bahwa event-event itu tersambung. Lihat [Observabilitas](/id/operations/observability). Daftar event beserta field-nya ada di [Event log](/id/reference/log-events).
