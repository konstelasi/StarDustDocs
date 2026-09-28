# Testing code that uses StarDust

StarDust only works against a real MySQL or MariaDB, and there is no in-memory or SQLite substitute. Its own test suite runs against real servers with no mocked database, and yours should do the same for anything that touches StarDust. This page shows how to make that fast and deterministic: a dedicated database, a cheap way to keep tests apart, a frozen clock, a way to run the background work on demand, and a logger you can assert on.

## A dedicated test database

Point your tests at a database that exists only for testing, never your development database. It must be MySQL or Percona 8.0.13 or later, or MariaDB 10.11 or later, the same as production. See [Requirements](/guide/requirements#supported-databases).

The simplest reliable setups are a throwaway container locally and a service container in CI:

```yaml
# .github/workflows/tests.yml (excerpt)
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

Reset that database once at the start of the test run, then create the schema once. `bootstrap()` is idempotent, so running it more than once is harmless:

```php
// tests/bootstrap.php
$pdo = new PDO($_ENV['TEST_DSN'], $_ENV['TEST_USER'], $_ENV['TEST_PASS'], [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

(new StarDust\StarDust(new StarDust\Config\Config(pdo: $pdo)))->bootstrap();
```

## Resetting state between tests

You need each test to start from a known state. The usual tricks do not all work with StarDust, so pick deliberately.

**Wrapping each test in a transaction and rolling it back does not work** for tests that call a StarDust mutation. StarDust opens its own transactions, and PDO does not nest them, so the call fails on a connection that already has one open. See [Integrating with your application](/usage/integrating#transactions-yours-and-stardusts).

**Dropping and recreating the tables is correct but slow.** StarDust's own suite measured it at roughly 1.5 seconds per test on MySQL 8.0.13, because every drop and create is a schema change the server commits. Do that once per test class at most, or once per run.

**A fresh tenant for every test is fast and needs no cleanup.** Every query StarDust builds carries the tenant id, so one tenant's data cannot be seen by another. Give each test its own tenant, define its models inside the test, and nothing needs deleting:

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
            // ... the clock, logger and pidFileDir from the sections below
        ));
    }
}
```

Because the test database is reset at the start of each run, starting the counter at 1 is safe. Two limits to know about:

- **Slots and pages are shared.** A tenant's data is isolated, but the pool of free slots is not. That is fine for behaviour tests. A test that asserts on page counts, spread or capacity should run against a database of its own.
- **Background work is global.** A `tick()` (below) processes every tenant's pending work, not just the current test's. With tests running one after another that is harmless. Tests running in parallel need separate databases.

## Freezing the clock

StarDust reads the time from an injected PSR-20 clock. Provide one you control:

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

A frozen clock makes the timestamps the engine records and the `ts` on its log records deterministic. **It does not control everything time-related.** Some decisions are made by the database against its own clock rather than PHP's, notably whether a claimed job's heartbeat has lapsed and whether a finished export has outlived its TTL. Advancing `FrozenClock` will not trigger those. To test them, arrange the stored timestamps directly, or use short lease and TTL settings.

## Draining background work on demand

Many behaviours only finish once a daemon has run: a field becomes filterable, a rename completes, an import job is ingested. In a test you do not want to wait for a real daemon. Call `tick()` to run the Watcher, Liberator and Reconciler in-process until they have nothing left to do:

```php
use StarDust\Daemon\TickStopReason;

$this->engine->write(new EntryPayload($this->tenantId, $modelId, ['name' => 'Acme']));

// The field had no slot yet, so the write queued it. Drain that.
$report = $this->engine->tick(budgetSeconds: 10);

$this->assertSame(TickStopReason::IDLE, $report->stopReason); // fully drained

// Now the field is indexed and can be filtered.
$page = $this->engine->read(new EntryQuery(
    tenantId: $this->tenantId,
    modelId:  $modelId,
    filter:   LeafNode::local('name', 'eq', 'Acme'),
));
```

`tick()` returns a `TickReport` with the number of `rounds` it ran and a `stopReason`:

| `stopReason` | Meaning in a test |
| :-- | :-- |
| `IDLE` | A round found nothing to do: everything is drained. This is the result you want. |
| `BUDGET_SPENT` | Time ran out first. Raise the budget or look for work that never finishes. |
| `SHUTDOWN` | A shutdown was requested. |
| `LOCK_CONTENDED` | Another process holds the Watcher's pid file, so **no work ran**. |

Always assert `IDLE`, so a test can never pass because nothing was actually drained.

**Give each test process its own `pidFileDir`.** `tick()` takes the Watcher's pid-file lock, and by default that lives in a directory shared by every process on the machine. Two test processes running together would collide, and the loser would silently do nothing. Create a private directory per process:

```php
$dir = sys_get_temp_dir() . '/stardust-test-' . getmypid();
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$config = new Config(pdo: $pdo, pidFileDir: $dir);
```

Two more options for finer control:

- `tick(exports: true)` also runs the Chronicler, so an export submitted in the test is written before you assert on it. Give the test its own `artifactDir` as well.
- To stop a drain halfway and assert on the in-between state, tick one daemon at a time with `$engine->watcher()->tick()`, `$engine->reconciler()->tick()`, `$engine->liberator()->tick()` and `$engine->chronicler()->tick()`. Each runs a single tick.

## Asserting on log events

Pass a PSR-3 logger that records what it receives. Every StarDust event carries an `event` name in its context, so a recorder can filter on it:

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

Use it to assert on behaviour that has no return value, such as the capacity fallback or a rejected query:

```php
$events = new EventRecorder();
$engine = new StarDust(new Config(pdo: $pdo, logger: $events));

$result = $engine->write($payloadForAFieldWithNoSlot);

$this->assertTrue($result->enqueuedForBackfill);
$this->assertCount(1, $events->named('exhaustion_fallback'));
```

To check that events belong to one operation, supply your own `correlationId` on the call and assert that the same value appears on every event the operation produces. Asserting only that a `correlation_id` exists proves little: it is the shared value that shows the events were joined. See [Observability](/operations/observability). Events and their fields are catalogued in [Log events](/reference/log-events).
