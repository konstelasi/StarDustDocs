# CLI reference

`bin/stardust` is the framework-neutral CLI entry point. Every command reads connection settings from the environment; nothing else in `Config` is reachable from the CLI — see [Settings and the bundled daemons](/usage/configuration#settings-and-the-bundled-daemons) if your deployment needs `artifactDir`, `pidFileDir` or daemon tuning set to anything other than their defaults.

```bash
bin/stardust --version
bin/stardust --help
```

## Connection environment variables

| Variable | Meaning |
| :-- | :-- |
| `STARDUST_DSN` | A PDO DSN, e.g. `mysql:host=127.0.0.1;dbname=app`. |
| `STARDUST_USER` | Database user. |
| `STARDUST_PASS` | Database password. |

Every command below reads these three and nothing else.

## bootstrap

```bash
bin/stardust bootstrap
```

Idempotently creates every table the engine needs. Safe to re-run against an already-bootstrapped database. See [Installation](/guide/installation#bootstrap-the-schema).

## watcher

```bash
bin/stardust watcher
```

Runs the page-provisioning daemon. Strict singleton: holds a lock file under `pidFileDir`, and a second instance against the same directory exits immediately with code `2`. See [Watcher](/operations/watcher).

## reconciler

```bash
bin/stardust reconciler
```

Runs the reconciliation daemon. No singleton lock — run as many processes as your backlog needs. See [Reconciler](/operations/reconciler).

## reconciler:dlq:replay

```bash
bin/stardust reconciler:dlq:replay --id=42
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

Re-enqueues one dead-lettered row by id, or every row that failed for the same reason, in one transaction per row. See [The dead-letter queue](/operations/reconciler#the-dead-letter-queue).

## liberator

```bash
bin/stardust liberator
```

Runs the slot-reclamation daemon. No singleton lock — exclusion is per extension page, so run as many processes as you want. See [Liberator](/operations/liberator).

## chronicler

```bash
bin/stardust chronicler
```

Runs the async export daemon. No singleton lock — run as many processes as your export backlog needs. See [Chronicler](/operations/chronicler).

## tick

```bash
bin/stardust tick --budget=50
bin/stardust tick --budget=50 --advisories
bin/stardust tick --budget=50 --exports
```

One bounded pass of the Watcher, Liberator and Reconciler over a single connection, for a host with no persistent-process capability. Stops when the budget is spent, a round finds nothing to do, or it's asked to shut down.

| Flag | Meaning |
| :-- | :-- |
| `--budget=N` | Seconds this run may take. Falls back to `Config::$tickBudgetSeconds` (50) when omitted. |
| `--advisories` | Forces the cardinality and spread advisories to sample immediately, regardless of their (fleet-wide, database-persisted) schedule. |
| `--exports` | Composes the Chronicler into the run, last in each round. Off by default. |

Never run `tick` alongside a persistent `watcher` process — an overlapping run just reports a skip with exit code `0`. `liberator` and `chronicler` are the exception: both are multi-worker, so a `tick` run can coexist with either. See [The tick command](/operations/deployment#the-tick-command).

## spread:report

```bash
bin/stardust spread:report
bin/stardust spread:report --tenant=1 --model=7
```

Reports how many extension pages each model's filterable fields are scattered across, versus the fewest they could occupy. Registry-only and read-only — safe against production at any time. See [The spread report](/operations/slot-maintenance#the-spread-report).

## cardinality:report

```bash
bin/stardust cardinality:report
bin/stardust cardinality:report --tenant=1 --model=7
```

Reports row count, distinct values and selectivity for each live filterable slot. Read-only, but unlike `spread:report` it scans every matching extension page rather than only the registry — prefer off-peak on a large dataset. `--model` narrows which slots are examined; each one's counts still cover the whole page. See [The cardinality report](/operations/slot-maintenance#the-cardinality-report).

## compact:model

```bash
bin/stardust compact:model --tenant=1 --model=7 --dry-run
bin/stardust compact:model --tenant=1 --model=7
```

Relocates a model's filterable fields onto the fewest pages that can hold them. Long-running and operator-initiated — needs a running Reconciler to make progress, moves one field at a time, and refuses (even with `--dry-run`) while one of the model's fields is mid-retype, mid-promotion, mid-demotion or mid-relocation already. Safe to re-run: fields already in place are skipped. See [Compacting a model](/operations/slot-maintenance#compacting-a-model).

## Exit codes and signals

Daemons honour both `SIGTERM`/`SIGINT` (when `ext-pcntl` is loaded) and `touch <pidFileDir>/<daemon-name>.shutdown` as a graceful-shutdown signal, for hosts without `pcntl`. A `SIGTERM` to `chronicler` mid-export yields at the next chunk boundary rather than blocking until the job finishes — see [Async exports](/usage/exports).

| Code | Meaning |
| :-- | :-- |
| `0` | Clean shutdown, including a signal-induced one. |
| `1` | Fatal error. |
| `2` | Singleton violation (a second `watcher` against the same lock) or a user error (bad flags, unreachable database). |
