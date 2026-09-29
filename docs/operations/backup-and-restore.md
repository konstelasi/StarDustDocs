# Backup and restore

StarDust keeps all of its durable state in the one database you point it at — there's no separate metadata store, no external search index to keep in sync, and no daemon state that lives anywhere but the tables `bootstrap()` created. That makes backup mostly a question of backing up your database properly, with a couple of StarDust-specific things worth knowing before you rely on a restore in production.

## What to back up

**The whole database, as one unit.** `entry_data` holds the system of record — the complete JSON payload of every entry, the thing every other table exists to serve — while the extension pages (`entry_slots_page_*`) hold the indexed mirror of filterable field values, and the `stardust_*` tables hold the schema registry plus every daemon's queues and checkpoints (the sync queue, import and export jobs, the dead-letter queue, backfill checkpoints, the advisory schedule). All of it is relational and all of it needs to come from the same point in time — a backup that captured `entry_data` a minute before the registry tables, say, could restore to a state a slot assignment doesn't actually match.

**What you don't need to back up:** the local filesystem directories. `artifactDir` holds transient output — export files you should already have served or downloaded, and staging payloads for in-flight async imports — none of it authoritative, all of it either already delivered or reconstructable by resubmitting the work. `pidFileDir` holds nothing but lock files and shutdown flags, which are meaningless outside the host that created them. Neither directory is part of your data.

## Taking a consistent snapshot

Ordinary MySQL/MariaDB backup practice applies unchanged — StarDust adds no requirements of its own to `mysqldump --single-transaction`, a filesystem or volume snapshot, or your managed database provider's own point-in-time backup feature.

The one thing worth planning around is that the Watcher issues DDL while it provisions new pages, and concurrent DDL is exactly the kind of activity backup tools are least comfortable running through. If you can, take your snapshot during a window where you've paused the Watcher (or your `tick` cron line, if you're running that mode) — a storage-level or managed-provider snapshot that isn't affected by concurrent DDL at all is the more robust choice if pausing anything isn't practical. The Reconciler, Liberator and Chronicler never run DDL, so they don't need to be paused for this reason.

## Restoring

Restore the database the normal way for whatever tool produced the snapshot, then verify the connection before pointing your application or daemons at it — the same check as after a fresh install:

```php
echo $engine->serverEngine()->name;
var_dump($engine->listModels(tenantId: 1));
```

A point-in-time restore loses whatever was written after the snapshot, the same as with any database — there's nothing StarDust-specific about that. Restoring to a database with a **different name** than the original is worth a second thought: `lockNamespace` derives its default from the database name, so a renamed restore target gets a different derived namespace than the original had. This only matters if you're deliberately running the restored copy alongside the original (a staging clone taken from a production snapshot, say) — set `lockNamespace` explicitly if you need the two to coordinate as the same installation, and leave it alone otherwise. See [Configuration](/usage/configuration#shared-hosting-and-the-lock-namespace).

## After a restore

Clear out `artifactDir` and `pidFileDir` on whatever host you're restoring onto before starting anything. Neither directory's contents were part of the backup, so anything left over from before — export files whose job ids no longer match the restored registry, a stale `watcher.pid` from a process that no longer exists — is leftover, not data, and safe to remove outright.

Beyond that, there's nothing special to do: every daemon's progress — sync queue depth, import and export job state, backfill checkpoints, sweep cursors — lives entirely in the database you just restored, not in any daemon's own memory. Start the daemons (or resume your `tick` schedule) and they pick up exactly where the restored registry says work is pending, the same way they'd resume after an ordinary restart.

## Exports are not backups

An export is a point-in-time, read-only CSV or JSON dump of one model's current (non-deleted) entries — useful for handing data to someone, or for a one-off analysis, but not a substitute for a database backup. It drops everything a restore needs that isn't inside that one model's payloads: the schema registry, slot assignments, every other model, in-flight daemon state, and any entry that was soft-deleted before the export ran. There's no import path that reconstructs a model from an exported file, so an export can get you *a* copy of *some* data out, never a point you could restore *to*.

If you're about to delete a model or a field — the one place StarDust itself recommends exporting first, since a model deletion is permanent and irreversible — treat that export as a one-way archive of what you're about to lose, not as a backup of your database. See [Deleting a model](/schema-changes/deleting-models) and [Deleting a field](/schema-changes/deleting-fields).
