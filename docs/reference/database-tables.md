# Tables in your database

`bootstrap()` creates every table StarDust uses in one idempotent pass. You never write DDL yourself, and the engine's public methods are the supported way to read and write this data — this page exists because a database administrator will see these tables in a schema dump regardless, and because knowing what each one is for makes an unfamiliar `SHOW TABLES` output legible rather than alarming.

Nothing here is part of the versioned public API. Column shapes can change between releases; the methods on `StarDust` are what's covered by [Versioning and stability](/project/versioning).

## Entry data

`entry_data` is the system of record. Every entry, in every model, for every tenant, lives here as one row with its full field set stored as JSON — `tenant_id`, `model_id`, `created_at`, `updated_at`, `deleted_at`, and a `fields` JSON column. Deletion is soft: `deleted_at` is stamped, the row stays. Nothing else in the engine can hold a value this table doesn't also have; every indexed slot is a materialization of a value that lives here first. See [Entries and payloads](/concepts/entries-and-payloads).

`stardust_sync_queue` is a small companion queue: entries whose indexed copy couldn't be written immediately because no slot was free, waiting for the Reconciler to backfill them. See [Background work](/concepts/background-work).

## Extension pages

Filterable field values are additionally copied into wide side tables named `entry_slots_page_1`, `entry_slots_page_2`, and so on — one row per entry, related 1:1 to `entry_data`, with a fixed set of typed, indexed columns (`i_str_01`, `i_int_01`, `i_num_01`, `i_dt_01`, and so on for however many of each type the page was provisioned with). These are what a filter actually queries. See [Slots and pages](/concepts/slots-and-pages).

You'll never need to query an extension page directly — `read()` and `search()` resolve which page holds which field for you. If you're inspecting one by hand, treat every value there as a copy: the corresponding `entry_data.fields` value is always the one that's authoritative.

## Schema registry

Four tables describe your tenants' schemas:

| Table | Holds |
| :-- | :-- |
| `stardust_models` | One row per model: `tenant_id`, `name`. |
| `stardust_fields` | One row per field: `model_id`, `name`, `declared_type`, `is_filterable`. |
| `stardust_pages` | One row per extension page, naming its physical table. |
| `stardust_slot_assignments` | One row per slot column on a page: which field (if any) currently owns it, and its lifecycle status (`free`, `assigned`, `tombstoned`, `backfilling`, `ready`). |

`stardust_schema_version` is a single-row counter, bumped whenever the registry changes. It's what the read path checks to know when its in-process schema cache is stale — see [The schema-version cache](/usage/reading-entries#the-schema-version-cache).

## Queues and jobs

| Table | Holds |
| :-- | :-- |
| `stardust_import_jobs` | Async bulk-write submissions from `submitBulkWrite()`, their status and per-chunk manifest. |
| `stardust_export_jobs` | Export submissions from `submitExport()`, their status and artifact path. |
| `stardust_reconciler_dlq` | Rows the Reconciler gave up on rather than retrying forever — see [The dead-letter queue](/operations/reconciler#the-dead-letter-queue). |
| `backfill_checkpoints` | Progress markers for every background schema change — a promotion, a retype, a rename, a field deletion or a model deletion. |
| `stardust_advisory_schedule` | A single-row timer for the cardinality and spread advisories, shared across your whole fleet of daemons. |

## What is safe to touch

Read any of these tables directly for reporting, monitoring or a one-off investigation — nothing about reading them can corrupt anything. **Never write to any of them directly.** The engine keeps several of these tables in step with each other inside single transactions (a slot's lifecycle status and its owning field, a job's status and its manifest, a model's deletion marker and every field it owns), and a hand-written `UPDATE` or `DELETE` can put them out of step in ways nothing detects until a later read or backfill behaves strangely.

This maps directly onto database privileges. Nothing in the engine's request-serving path — `write()`, `read()`, `search()`, `updateEntry()`, `deleteEntry()` and their relatives — ever issues DDL; it only needs `SELECT`, `INSERT`, `UPDATE` and `DELETE`. Only `bootstrap()` and the Watcher create or alter tables, so only the identity running those needs `CREATE`, `ALTER` and `INDEX` as well. Nothing anywhere in the engine ever drops a table or an index, so `DROP` is never required for any process. See [Database privileges](/operations/security#database-privileges) for the full split.
