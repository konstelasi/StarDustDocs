# Configuration

Everything about how StarDust behaves in your application is set once, at construction time, through a single `Config` object. This page covers the parts you will touch on day one. The full list of settings, with defaults, is in the [configuration reference](/reference/configuration).

## The Config object

`Config` takes one required argument, the PDO connection. Everything else is optional and has a default, so a working setup is two lines:

```php
use StarDust\Config\Config;
use StarDust\StarDust;

$engine = new StarDust(new Config(pdo: $pdo));
$engine->bootstrap(); // idempotent: safe to call on every deploy
```

A few things to know about it:

- **Use named arguments.** `Config` has dozens of optional parameters, and new ones are always appended, so named arguments keep your code readable and stay valid across upgrades.
- **It is immutable.** Every property is read-only once the object is built. To change a setting, build a new `Config` and a new `StarDust`.
- **Construction does no I/O.** Building a `Config` never touches the database or the filesystem. Directories such as `artifactDir` are created only when something first writes to them.
- **Read it back with `$engine->config()`.** Handy when you need the same settings elsewhere, for example `$engine->config()->queryFilterLimits` for the JSON filter decoder.

`bootstrap()` provisions every table the engine needs, and it is safe to re-run. It never drops or rewrites existing data, so calling it on every deploy is the normal pattern. See [Installation](/guide/installation#bootstrap-the-schema).

## PDO connection settings

The PDO you pass in needs one attribute, and a second is a choice:

```php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION, // required, see below
    PDO::ATTR_EMULATE_PREPARES => false, // optional, either setting works
]);
```

**`ERRMODE_EXCEPTION` is required, not decoration.** Several of the engine's guards need a failed statement to raise rather than quietly return `false`. If your application shares one connection with other code, create a separate PDO for StarDust rather than changing that attribute under that code. [Integrating with your application](/usage/integrating#sharing-your-applications-pdo) explains why a dedicated connection is usually the better choice anyway.

**Prepared-statement emulation can be on or off.** PHP's MySQL driver emulates prepared statements by default, and StarDust works either way. Every value that must reach the server unquoted, such as the page size in a paginated read's `LIMIT`, is bound with an explicit integer type, and values read back arrive with the same PHP types in both modes. Native prepares (`PDO::ATTR_EMULATE_PREPARES => false`, as above) are the tested default. The full test suite runs that way against every supported server, and it also runs once in full against MySQL with emulation on, so leaving PHP's default in place is supported too.

## Logging

StarDust writes structured log records for everything notable it does: writes, reads, rejections, and every step of the background daemons. By default they go to **standard output as one JSON object per line** (NDJSON), which is what you want from the CLI daemons under systemd or a container runtime.

To send them somewhere else, pass any PSR-3 logger:

```php
$engine = new StarDust(new Config(
    pdo:    $pdo,
    logger: $yourPsr3Logger, // Monolog, a framework logger, or your own
));
```

Each record is a PSR-3 call whose context carries an `event` name, a `source`, a `correlation_id` and event-specific fields. Two consequences:

- **Inject a logger in web requests.** The default is designed for the CLI daemons. In an application serving HTTP, pass your application's own PSR-3 logger so records go to your normal log pipeline.
- **A custom logger owns the record format.** The engine passes the fields as context. It is your logger that decides how they are serialised, so the one-JSON-object-per-line shape only holds for the default.

Every event carries a `correlation_id`, and you can supply your own so a single request id follows an operation into the background. See [Observability](/operations/observability). Events are catalogued in [Log events](/reference/log-events).

## Injecting a clock

StarDust never calls the system clock directly. It asks an injected PSR-20 clock (`Psr\Clock\ClockInterface`), which defaults to a UTC system clock:

```php
$engine = new StarDust(new Config(
    pdo:   $pdo,
    clock: $yourClock,
));
```

Wherever the engine needs the current time, such as the timestamps it records or the log record's own `ts`, it reads this clock. Injecting your own is mostly useful in tests, where a frozen or advanceable clock makes time-dependent behaviour deterministic. See [Testing code that uses StarDust](/usage/testing-your-app#freezing-the-clock).

## Settings you are most likely to change

The defaults suit most installations. These are the ones people reach for first:

| Setting | Default | When to change it |
| :-- | :-- | :-- |
| `logger` | NDJSON to stdout | In any web-facing process, so records reach your log pipeline. |
| `clock` | UTC system clock | In tests. |
| `artifactDir` | `sys_get_temp_dir()/stardust` | In production, to point at a persistent, writable directory that is **not web-servable**. Export files and async import payloads live here, so the daemons must use the same directory. See [the note below](#settings-and-the-bundled-daemons). |
| `pidFileDir` | `sys_get_temp_dir()/stardust` | Where the Watcher's pid file and the shutdown flag files live. Point it at a local, writable directory. |
| `queryFilterLimits` | Depth 8, 256 nodes, 4 096-character strings | If you accept filters from untrusted clients and want tighter bounds. See [Security](/operations/security#accepting-untrusted-filters). |
| `searchDriver` | Built-in MySQL driver | To delegate reads to an external search service. See [Custom search drivers](/extending/custom-search-drivers). |
| `pageIndexHeadroom` | 4 | To change how much spare index capacity each new page carries. See [Tuning](/operations/tuning#index-headroom). |
| `chroniclerPerTenantActiveCap` | 3 | To allow more concurrent exports per tenant. |
| `tickBudgetSeconds` | 50 | When you call `tick()` yourself, to match your schedule. The CLI takes `--budget` instead. See [Deployment](/operations/deployment#time-budgets). |

Tuning the daemons (chunk sizes, worker pacing, lock retries) is covered in [Tuning](/operations/tuning).

### Settings and the bundled daemons

A `Config` only affects the process that builds it. **`bin/stardust` builds its own `Config` from `STARDUST_DSN`, `STARDUST_USER` and `STARDUST_PASS` alone, and leaves every other setting at its default.** So a value you set in your application, such as `artifactDir`, `pidFileDir`, `pageIndexHeadroom` or a chunk size, does not reach the daemons started with `bin/stardust`.

For most settings that just means the defaults apply to the daemons. For `artifactDir` it matters more, because your application and the daemons have to use the same directory. [Integrating with your application](/usage/integrating#running-the-daemons-next-to-your-app) explains how to keep them in agreement, and how to run a daemon from your own script when you need custom settings.

## Shared hosting and the lock namespace

StarDust takes two MySQL advisory locks. MySQL scopes advisory lock names to the whole *server*, not to your database, so on a host where many accounts share one MySQL server, two StarDust installations would otherwise compete for the same lock names and each would periodically stall waiting for the other.

`Config::$lockNamespace` defaults to `null`, which derives a private namespace from your database name. That is correct automatically and needs no action from you.

Set it explicitly only in two situations:

- you are renaming the database and want the lock identity to stay put across the move;
- you are deliberately running two installations that should coordinate as one.

Any non-empty string works. It is only an identifier, never a secret, and the value never leaves your server.

**One upgrade note.** Locks named under an older, unqualified scheme and the current per-installation scheme do not recognise each other. When you deploy a version that changes the scheme, stop your daemons (or pause the cron line) first, rather than restarting them one at a time. On a cron schedule that costs one skipped run. See [Upgrading](/operations/upgrading).
