# Integrating with your application

StarDust is a plain PHP library, so it fits into any application. This page covers the decisions that come up when you wire it in: how many instances to create, whether to share your PDO connection, how it interacts with your own transactions, where the tenant id comes from, how to register it in a container, and how to run the daemons next to your app.

## One instance per connection

A `StarDust` instance wraps one `Config` and therefore one PDO connection. Create it once per connection and reuse it for everything that connection does within a request or a worker.

- **Construction is cheap.** It does no I/O, and collaborators are built lazily on first use.
- **Reuse is worthwhile.** The instance holds the read path's schema cache, so reusing it avoids reloading the schema, and it avoids rebuilding collaborators on every call.
- **Do not share one instance across different connections.** Give each connection its own.
- **PDO does not reconnect by itself.** In a long-running worker, if the database drops the connection (for example after MySQL's `wait_timeout`), the next call throws. Recreate the PDO and the instance when that happens, the way you already do for the rest of your database access.

## Sharing your application's PDO

You have two options: hand StarDust the PDO your application already uses, or give it a dedicated connection. **A dedicated connection is usually the better choice.**

StarDust needs a PDO created with `PDO::ERRMODE_EXCEPTION`, as described in [Configuration](/usage/configuration#pdo-connection-settings). No other attribute is required, and prepared-statement emulation can stay at PHP's default. If you share your application's connection, that attribute applies to *all* the code using it, so code that relied on a failed statement quietly returning `false` would start to throw. Sharing is only safe if your application already runs with exceptions on.

A dedicated connection avoids that entirely:

- your attributes and StarDust's cannot collide;
- StarDust's transactions never interleave with yours (see the next section);
- it costs one extra database connection per process that uses StarDust. Create it lazily, so a request that never touches StarDust never opens it. The container recipes below do exactly that.

## Transactions: yours and StarDust's

**StarDust manages its own transactions.** Every call that changes data (`write()`, `updateEntry()`, `deleteEntry()`, each chunk of `bulkWrite()`, and the schema changes) opens a transaction on its connection, commits it, and rolls it back on failure. That has two consequences.

**You cannot call a StarDust mutation while your own transaction is open on the same connection.** PDO does not nest transactions, so the attempt fails with a `PDOException` ("There is already an active transaction"). If you share your application's PDO, keep StarDust calls outside any transaction you have open. Reads (`read()`, `search()`, `get()`, `listModels()`, `describeModel()`) do not open transactions and are unaffected.

**A StarDust write cannot join your transaction, even on a dedicated connection.** It commits on its own, independently of yours. There is no way to make "insert my row and write the entry" one atomic unit. Design for a partial failure instead:

```php
// 1. Write the entry first. This commits on its own.
$result = $engine->write($payload);

try {
    // 2. Then record it in your own transaction.
    $pdo->beginTransaction();
    $insertInvoice->execute([$tenantId, $result->entryId]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // 3. Undo the entry so nothing is orphaned. deleteEntry() is idempotent.
    $engine->deleteEntry($tenantId, $result->entryId);
    throw $e;
}
```

Writing StarDust first means a failure in your step leaves at worst an entry you can delete, rather than a row of yours pointing at nothing. If the compensating delete could itself fail, log the entry id so a cleanup job can find it. For bulk work, use an [idempotency key](/usage/bulk-imports#idempotency-keys) so a retry is safe.

## Resolving the tenant id

Every StarDust call takes a `tenantId`, and tenant isolation is exactly as strong as the value you pass. **Take it from your authenticated session, never from client input.** A request that can choose its own tenant id can read another tenant's data.

The most reliable way to enforce this is to make sure application code never passes a tenant id at all. Put one thin class of your own between your controllers and StarDust, and let it supply the tenant:

```php
final class Entries
{
    public function __construct(
        private readonly StarDust $engine,
        private readonly CurrentTenant $tenant, // resolves from your auth session
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

The tenant id must be an integer of 1 or higher, or the call raises `InvalidTenantIdException` before any SQL runs. Model ids are also tenant-scoped. A model id from another tenant behaves like one that does not exist, so it cannot be used to reach that tenant's data.

Look models up by id, not by name, on the hot path. Register them once, in setup or a deploy step, and keep the ids in configuration or your own database. [Defining models and fields](/usage/defining-schema) explains why get-or-create is for setup, not for every request.

## Registering in a container

Register one `StarDust` service, backed by a lazily created dedicated PDO.

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
        // A singleton closure runs on first resolution, so the connection
        // is only opened when something actually asks for StarDust.
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

Register the provider in your application's provider list, then type-hint `StarDust` wherever you need it.

### Symfony

A small factory keeps the wiring in PHP, where the PDO options are constants:

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

Symfony builds a service only when something asks for it, so the connection is opened on first use. Do not mark the service `lazy`: `StarDust` is a final class, which a lazy proxy cannot wrap.

### Plain PHP

Without a container, a small function that builds the instance on first use is enough:

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

In all three cases, call `bootstrap()` from your deploy step or a console command rather than on every request. See [Installation](/guide/installation#bootstrap-the-schema).

## Running the daemons next to your app

The daemons are separate processes that use the same database as your application. Run them from the same Composer install as your app, so they are always the same StarDust version:

```bash
STARDUST_DSN='mysql:host=db;dbname=app' STARDUST_USER=stardust STARDUST_PASS=secret \
  vendor/bin/stardust reconciler
```

[Deployment](/operations/deployment) covers supervising them and the cron-only alternative. Three things matter specifically for integration:

- **`bin/stardust` reads only the database connection from the environment.** It takes `STARDUST_DSN`, `STARDUST_USER` and `STARDUST_PASS`, and builds its `Config` with every other setting at its default. It cannot be given your application's `artifactDir`, `pidFileDir`, logger or any tuning value.
- **The application and the daemons must agree on `artifactDir`.** The application writes async import payloads there and serves finished exports from there, while the Reconciler reads the import payloads and the Chronicler writes the exports. The daemons always use the default, `sys_get_temp_dir()/stardust`. So either leave `artifactDir` at its default in your application as well and make sure both resolve to the same physical directory (the same host, or a volume mounted at the same path in each container), or run the daemons with your own runner script, below. Be careful with hosts that give each service a private temporary directory: two processes on one machine can still resolve `sys_get_temp_dir()` to different places.
- **Anything you tune through `Config` reaches only the process that builds that `Config`.** A change to `pageIndexHeadroom`, a chunk size or a lease timeout in your application does not change how `bin/stardust` daemons behave.

To run a daemon with your own settings, write a small runner that builds the `Config` you want and drives the daemon with the same public calls the CLI uses:

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

// A Reconciler polls continuously (interval 0). It is multi-worker safe.
$engine->pollLoop()->run(
    $engine->reconciler(),
    $engine->shutdownSignal('reconciler'),
    0,
);
```

The other daemons follow the same pattern, differing in the factory and the idle interval:

| Daemon | Factory | Interval | Extra |
| :-- | :-- | :-- | :-- |
| Reconciler | `reconciler()` | `0` | None. |
| Liberator | `liberator()` | `$engine->config()->liberatorIdleIntervalSeconds` | None. |
| Chronicler | `chronicler($shutdown)` | `$engine->config()->chroniclerIdleIntervalSeconds` | Build `$shutdown` once and pass the same one to both `chronicler()` and `run()`. Pass a `pdoConnector` in `Config` so a dropped connection mid-export can be re-established. |
| Watcher | `watcher()` | `$engine->config()->watcherPollIntervalSeconds` | Exactly one may run. Take the pid-file lock with `PidFileGuard::acquire($engine->config()->pidFileDir, 'watcher')` first, as the CLI does. |

On a host that cannot run persistent processes, call `$engine->tick()` from a scheduled task instead, never from a request path. See [Deployment](/operations/deployment#cron-only-and-shared-hosting).
