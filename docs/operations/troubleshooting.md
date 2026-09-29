# Troubleshooting

## A filterable field is rejected in filters

A filter against a field you're sure is filterable raises `FieldNotFilterableException` or `FieldNotSortableException` anyway. This is almost always the backfill window: `isFilterable` (what the registry declares) and `isIndexed` (whether a filter against it works *right now*) are different flags, and they disagree for the whole of a promotion or retype backfill. Check both:

```php
$field = $engine->describeModel($tenantId, $modelId)?->fields[...];
var_dump($field->isFilterable, $field->isIndexed);
```

If `isFilterable` is `true` and `isIndexed` is `false`, the field is still waiting on its background copy to finish — see [A rename, retype or deletion never finishes](#a-rename-retype-or-deletion-never-finishes) below, since the fix is the same: make sure a Reconciler is running. Build your filter UI against `isIndexed`, not `isFilterable`, and you'll never offer a filter the engine currently rejects.

## A rename, retype or deletion never finishes

You called `renameField()`, `retypeField()`, `promoteFieldToFilterable()`, `deleteField()`, or `deleteModel()`, the call returned, and the change never seems to complete — reads still show the old name, filters still reject the field, a deleted field's row is still visible in a raw table dump. All five of these return as soon as the registry is updated; a background pass does the rest, and **that pass is the Reconciler's job**. Without one running, none of these windows ever close.

The fix in every case is the same: make sure at least one Reconciler is running, either as a persistent process or through `bin/stardust tick` on a schedule. See [Reconciler](/operations/reconciler) for what it drains and [Deployment](/operations/deployment) for both modes.

If a Reconciler genuinely is running and a specific operation still isn't progressing, check whether it's blocked waiting on another one — a field mid-retype can't also be renamed or promoted until the retype's backfill finishes, and a model mid-deletion refuses new operations against any of its fields. That shows up as a typed exception (`RetypeInProgressException`, `RenameInProgressException`, `FieldDeletionInProgressException`, `ModelDeletionInProgressException`) rather than silence, so check your own error logs for one of those before assuming the Reconciler itself is the problem.

## An export stays pending

A job from `submitExport()` never moves past `pending`. Two independent things to check, in order:

1. **Is a Chronicler running?** Exports only progress when at least one `bin/stardust chronicler` process, or a `tick --exports` schedule, is active. Neither runs by default — `tick` in particular needs the `--exports` flag explicitly, since exports are off by default even under that mode. See [Chronicler](/operations/chronicler) and [Deployment](/operations/deployment#including-exports-in-a-tick).
2. **Is the pre-claim disk gate declining new work?** If the artifact directory's free space is low, or a small write-probe into it fails (a per-account quota can leave a filesystem reporting itself mostly free while every write still fails), the Chronicler logs a warning each tick and declines to claim new jobs — existing in-flight jobs keep running, but nothing new starts. See [Chronicler](/operations/chronicler#the-disk-space-gate).

If neither explains it, poll the job directly — `getExportJob()` reports `failed` with a specific reason once it's actually attempted and given up, which narrows things further than "still pending" does.

## The Watcher refuses to start

`bin/stardust watcher` exits immediately with a nonzero code instead of running. The Watcher is a strict singleton: it takes an exclusive lock file in `pidFileDir` at startup, and a second instance against the same lock directory refuses to start rather than run alongside the first. Check whether a Watcher is already running against that same `pidFileDir` — including one launched by `tick`, which takes the identical lock. If you intend to run `tick` and a persistent `watcher` at the same time, stop: that's the one combination that's never supported — see [Deployment](/operations/deployment#choosing-a-deployment-mode).

If nothing else is actually running, a stale lock file left behind by a process that died uncleanly is the other common cause — check that the pid it names is still alive before removing it by hand.

## A tick reports lock contention

`bin/stardust tick` reports it was skipped, or its stop reason names lock contention, rather than doing any work. This means another process already held the Watcher's lock file when this `tick` invocation started — most often an overlapping cron firing where the previous run hadn't finished yet, or a persistent `bin/stardust watcher` process running against the same `pidFileDir` (which, per the note above, you shouldn't be running alongside `tick` at all). A skip like this touches the database not at all, so it's routine rather than a failure — one skipped run on a per-minute cron schedule is a rounding error, not an incident.

If you're seeing this on nearly every invocation rather than occasionally, check that your crontab's own overlap guard (`flock -n` in the examples on the [deployment page](/operations/deployment#the-tick-command)) is actually working, and that your `--budget` comfortably fits inside your cron interval — a run that regularly takes longer than the interval between firings will contend with itself.

## Rows are piling up in the dead-letter queue

A growing dead-letter queue means rows that genuinely can't be reconciled, not a Reconciler that's fallen behind (a Reconciler that's merely slow shows up as a growing sync queue or a widening backfill window instead — see [Reconciler](/operations/reconciler#what-stalls-when-it-is-not-running)). Every row here failed for a specific, recorded reason — most commonly a reference to entry data that's gone missing, or a stored value that can no longer be coerced to its field's current type.

Look at the failure reasons before replaying anything:

```bash
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

A row whose underlying cause you haven't actually fixed yet will simply fail again and land back in the queue on replay — that's expected, not a bug, and a useful way to confirm whether your fix actually worked. See [Reconciler](/operations/reconciler#the-dead-letter-queue) for the full replay workflow.

## The server is rejected at boot

The engine raises `UnsupportedServerException` the first time it needs to know your database's dialect — during `bootstrap()`, or any call to `serverEngine()`. This means the connected server is below the supported floor: MySQL or Percona older than 8.0.13, or MariaDB older than 10.11. There's no configuration override for this floor — see [Requirements](/guide/requirements#supported-databases) for exactly which versions qualify, including why MariaDB specifically has a hard floor at 10.11 rather than an older version some MySQL-floor logic might suggest.

Check your actual server version and vendor (`SELECT VERSION();`) rather than assuming from your hosting plan's marketing name — "MySQL 8" hosting is sometimes actually MariaDB under the hood, and shared hosting in particular commonly defaults to an older MariaDB than 10.11.
