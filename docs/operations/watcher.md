# Watcher

## What it does

The Watcher keeps indexed slot capacity ahead of demand. Every filterable field lives in a typed, indexed column on an extension page, and pages are immutable once created — so when free capacity runs low, or a field is waiting on a slot family that has none free at all, something has to provision a new page before writes and backfills can keep up. That something is the Watcher.

Each poll takes a capacity snapshot across every extension page and checks it against the fields currently waiting for a slot, then decides whether to provision, and how wide, in one pass.

## One instance only

The Watcher is a strict singleton, unlike the other three daemons. `bin/stardust watcher` takes a lock file in `pidFileDir` at startup; a second instance started against the same lock directory exits immediately with a nonzero code rather than running alongside the first. A database-level advisory lock backs this up as a safety net around the provisioning step itself, but the pid file is the primary enforcement — see [Troubleshooting](/operations/troubleshooting#the-watcher-refuses-to-start) if it won't start.

Scaling reclamation or backfill throughput is what the Reconciler, Liberator and Chronicler are for. The Watcher itself never needs more than one process, because provisioning decisions have to be made against one consistent view of capacity.

## Provisioning on capacity and on demand

A poll provisions a new page for either of two independent reasons:

- **Low capacity.** The free-slot ratio across all pages has dropped below a configurable threshold (20% by default).
- **Unsatisfiable demand.** A filterable field is waiting for a slot in a family — string, int, numeric, datetime — that currently has zero free, indexed slots anywhere. This fires regardless of the capacity threshold, because a family sitting at exactly the threshold can still starve a field waiting on it specifically.

When a page is provisioned, it's sized with headroom rather than exactly what's needed at that instant: extra indexed columns per family so that the next several fields promoted in sequence land on the same page instead of each triggering its own. A page's set of indexed columns is fixed forever once created, so under-provisioning here is a mistake you can't correct without an operator-run compaction later — see [Slot maintenance](/operations/slot-maintenance) and [Tuning](/operations/tuning#index-headroom).

## Scheduled advisories

Alongside capacity, the Watcher owns the schedule for two read-only advisories: the spread report (how many pages a model's slots are scattered across) and the cardinality report (whether a live index's values are too repetitive to help the query planner). Both run on a shared, roughly-daily cadence with randomized jitter, and the schedule itself lives in the database rather than in any one process's memory — so it survives daemon restarts and fires exactly once per interval across your whole deployment, not once per host.

You don't need to schedule these separately. Any running Watcher, or any `bin/stardust tick` invocation, checks whether the schedule is due and samples if so; `tick --advisories` forces an immediate sample regardless of the schedule. See [Slot maintenance](/operations/slot-maintenance) for what each report tells you.

## Running it

```bash
bin/stardust watcher
```

Poll interval, the capacity threshold, and the advisory cadence are all configurable — see [Configuration reference](/reference/configuration#watcher). On a host that can't keep a persistent process alive, `bin/stardust tick` runs the same provisioning logic as one bounded pass; see [Deployment](/operations/deployment#cron-only-and-shared-hosting).
