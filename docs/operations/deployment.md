# Deployment

StarDust keeps its slot capacity ahead of demand and catches up on deferred work through four background daemons — Watcher, Reconciler, Liberator, Chronicler — or, on a host that cannot run persistent processes, one bounded `bin/stardust tick` command run on a schedule instead. This page covers both modes, and the requirements that apply regardless of which one you pick.

## Choosing a deployment mode

Pick **one** mode per installation and don't mix them: run the four persistent daemons, or run `tick` on a schedule, never both against the same database at once. `tick` takes the Watcher's own singleton lock, so a persistent `watcher` already running makes every `tick` invocation report a harmless no-op skip rather than doing its job — the two modes substitute for each other, they don't complement each other. (The Liberator and Chronicler are the exception: both are multi-worker with no singleton lock, so a `tick --exports` run and a standalone `liberator` or `chronicler` process can coexist safely, just redundantly.)

The choice usually comes down to whether your hosting gives you persistent processes at all:

| Tier | Verdict |
| :-- | :-- |
| VPS with systemd / supervisor | Persistent processes — the reference deployment. |
| Containerized (Docker Compose, Kubernetes, ECS) | Persistent processes — recommended for production at scale. |
| Paid shared hosting with a crontab | `tick` on a schedule. |
| Shared hosting with only a scheduled URL fetch, no shell | `tick` driven from that URL fetch. |
| Free shared hosting (no shell, no cron, no URL fetch) | Not viable at any level. |

Both modes need the same database: MySQL or Percona 8.0.13+, or MariaDB 10.11+. See [Requirements](/guide/requirements) — an older server is rejected at boot regardless of which deployment mode you run.

## Persistent processes (the reference mode)

Run the four daemons as long-lived processes:

```bash
bin/stardust watcher
bin/stardust reconciler
bin/stardust liberator
bin/stardust chronicler
```

The Watcher is a strict singleton — a second instance exits immediately rather than running alongside the first. The other three are safe to run as several processes; see [How many processes to run](#how-many-processes-to-run) below and each daemon's own page for what multiple workers buy you.

### systemd, supervisor and containers

Any supervisor that restarts a crashed process works: systemd units, `supervisord`, or a container orchestrator's own restart policy (Docker Compose's `restart: unless-stopped`, a Kubernetes Deployment, an ECS service). Each daemon is a single long-running foreign process with no special startup ordering requirement beyond `bootstrap()` having run once — the daemons tolerate a database that briefly disconnects and reconnects, and a fresh process simply resumes whatever it finds still queued.

Daemons honour `SIGTERM`/`SIGINT` for graceful shutdown when `ext-pcntl` is loaded, and `touch <pidFileDir>/<daemon-name>.shutdown` as a signal-free alternative on hosts without it. A `SIGTERM` to a running `chronicler` mid-export does not wait for the job to finish: the worker yields at the next chunk boundary, the job returns to `pending` with its resume anchor intact, and the next worker to claim it — this one restarting, or another already running — continues from that exact point. Exit codes: `0` for a clean shutdown, `1` for a fatal error, `2` for a singleton violation or user error.

### How many processes to run

The Watcher runs as exactly one process — that's enforced, not a suggestion. The other three scale by running more copies:

- <Term id="reconciler">Reconciler</Term> — `SELECT … FOR UPDATE SKIP LOCKED` keeps workers disjoint, so run as many as your drain backlog needs. There's no coordination cost between them beyond the usual lock waits on shared tables.
- <Term id="liberator">Liberator</Term> — since reclamation exclusion is per extension page rather than a process-wide lock, two workers never contend on the same page table; the real throughput ceiling is the number of distinct pages currently holding tombstoned slots, not the worker count.
- <Term id="chronicler">Chronicler</Term> — claims one job per tick via `SELECT … FOR UPDATE SKIP LOCKED`, so more workers means more exports in flight and faster abandoned-job recovery.

Start with one of each and watch the signals in [Observability](/operations/observability) — a growing sync queue, a widening backfill window, or tombstoned slots aging past a cycle or two — before adding more.

## Cron-only and shared hosting

**The real exclusion is shell-less, cron-less hosting — not "shared hosting" as a category.** A cPanel-style account with a real MySQL 8 (or MariaDB 10.11+) database and a crontab is a fully supported target, including async exports; the only hosting genuinely excluded is one with no shell, no cron, and no scheduled URL fetch. Shared hosting commonly runs MariaDB — check the version with your host, since anything older than 10.11 is rejected at boot regardless of deployment mode.

### The tick command

`bin/stardust tick` runs the Watcher, Liberator and Reconciler as one bounded pass over a single database connection, stopping when it runs out of work, runs out of its time budget, or is asked to shut down. One cron line replaces the four persistent daemons — which matters beyond convenience: four permanently-resident processes hold four database connections continuously, and shared hosts commonly cap an account's total connections in the low tens, shared with the site itself.

A minimal crontab entry:

```cron
* * * * * flock -n /home/youraccount/stardust.lock /usr/bin/php /home/youraccount/bin/stardust tick --budget=50 >> /home/youraccount/logs/stardust-tick.log 2>&1
```

- `flock -n` stops an overlapping firing from starting a second run while the previous one is still finishing, alongside `tick`'s own lock check — which only guards the Watcher, not the whole run. This example's lock file sits under the account home directory, which is unreliable for `flock` on some hosts mounted over NFS — check with your host, or route the lock file to local storage if one is available.
- Redirect output somewhere the account can actually write. Cron's default is to email every line to the account owner, which floods an inbox fast on a per-minute schedule.
- **The cardinality and spread advisories need no crontab line of their own.** Their schedule lives in the database rather than in any one process's memory, so it survives a process that exits after every run, and the roughly-daily sample fires from whichever `tick` invocation first finds it due — one sample per interval across the whole deployment, not one per host. `--advisories` forces a sample immediately regardless of the schedule:

```cron
0 3 * * * flock -n /home/youraccount/stardust.lock /usr/bin/php /home/youraccount/bin/stardust tick --budget=50 --advisories >> /home/youraccount/logs/stardust-tick.log 2>&1
```

- **No shell access at all, but a scheduled URL fetch is available** (a common paid-tier alternative to cron): drive `StarDust::tick()` from a small script behind a web-accessible URL instead of the CLI. Gate it with a shared secret checked via `hash_equals()` — a public, unauthenticated URL that triggers real database work is a free amplification handle for anyone who finds it — and keep the same budget and single-schedule discipline as the crontab line above.

### Time budgets

`--budget=50` keeps the run comfortably inside a one-minute cron period. StarDust also clamps this against PHP's own `max_execution_time` when the SAPI reports a nonzero ceiling, so a smaller host-imposed limit is respected automatically — you don't have to coordinate the two by hand.

`tick` checks the budget between rounds of work, never in the middle of one, so a budget at or under zero still completes one round rather than erroring. It stops on whichever comes first: the budget is spent, a round finds nothing left to do, or it's asked to shut down. A round that swept no tombstoned slots, found the Reconciler fully idle, and found the Chronicler idle (or wasn't running it) is what "nothing left to do" means — without that exit, a quiet minute would otherwise mean roughly fifty seconds of continuous idle polling, which is exactly the cost this mode exists to avoid on a shared host.

### Including exports in a tick

Exports need an explicit `--exports` flag and are off by default. Without it, `bin/stardust tick` never runs the Chronicler at all. With it, `tick` composes the Chronicler last in each round — after Watcher provisioning and the Reconciler's drain — so a large export never starves registry maintenance:

```cron
* * * * * flock -n /home/youraccount/stardust.lock /usr/bin/php /home/youraccount/bin/stardust tick --budget=50 --exports >> /home/youraccount/logs/stardust-tick.log 2>&1
```

A large export cooperatively yields back to `pending` — with its resume anchor intact — once the run's own budget deadline is reached, rather than running to completion regardless of size. It therefore completes over several cron firings, each one picking up wherever the last one's budget ran out, the same way `tick` already resumes any other in-progress work.

Two things worth knowing before you turn this on: the pre-claim disk gate proves that *its own* small write probe can be written, not that a multi-gigabyte export will fit — an export that outruns the remaining space still ends `failed:disk_full` mid-write. And garbage collection for expired artifacts only runs on idle ticks, so a `tick --exports` schedule that is always busy with in-progress exports never reclaims timed-out files; if you run exports continuously, watch your artifact directory's size directly rather than assuming the 24-hour cleanup has happened.

## Which hosting tiers qualify

| Tier | Verdict |
| :-- | :-- |
| Free shared hosting (no shell, no cron, no persistent processes, no scheduled URL fetch) | Not supported at any level. |
| Free shared hosting with a scheduled URL fetch | Supported — drive `StarDust::tick()` from the URL fetch. |
| Paid shared hosting, cron-only, MySQL 8 or MariaDB 10.11+ | Supported — cron-only mode above. |
| Paid shared hosting, cron-only, MariaDB older than 10.11 | Not supported — rejected at boot regardless of deployment mode. |
| VPS with systemd / supervisor | Supported — reference deployment. |
| Containerized (Docker Compose, Kubernetes, ECS) | Supported — recommended for production at scale. |

## Artifact storage

Two directories need to be real, writable, and — this is the part worth double-checking before going live — **outside anything web-servable**. `artifactDir` holds async bulk-ingest payloads and export files; `pidFileDir` holds the Watcher's lock file and the daemons' shutdown-flag files. The default for both resolves under `sys_get_temp_dir()`, which is usually fine, but some shared-hosting layouts put the obvious writable path inside `public_html` — confirm yours doesn't before you rely on it in production. See [Configuration](/usage/configuration) for how to point either one somewhere else.

If your application shares one filesystem across several processes — the CLI daemons and your web app, say — make sure they all resolve `artifactDir` to the same real directory. `bin/stardust` always uses the configured default; a custom bootstrapping script that changes it needs to agree with whatever submitted the job. See [Integrating with your application](/usage/integrating#running-the-daemons-next-to-your-app).
