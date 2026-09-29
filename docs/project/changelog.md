# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — see [Versioning and stability](/project/versioning) for what that means during the alpha series.

## 0.3.0-alpha.1

Released 2026-09-23. The first release of the 0.3 line: a ground-up rewrite, not an upgrade of 0.2. There is no upgrade path from 0.2.x — see [The 0.2.x line](/project/legacy-0-2). This is an alpha: the public API may still change before 0.3.0. Install it with `composer require damarbob/stardust:^0.3@alpha`.

### Added

- A framework-neutral Composer package with no runtime dependencies beyond `psr/log` and `psr/clock`. Requires PHP 8.1+ and MySQL 8.0.13+, Percona Server 8.0.13+, or MariaDB 10.11+, detected from the connection at boot.
- The `StarDust` engine class, configured through a single `Config` object with one required field (`pdo`) and defaults for everything else. `bootstrap()` and `bin/stardust bootstrap` idempotently provision every table the engine needs.
- `schemaBuilder()` to register models and fields without hand-written SQL, and `listModels()` / `describeModel()` to read a tenant's schema back, including whether each field is declared filterable and whether it's indexed right now.
- `write()` for single entries, `bulkWrite()` for up to 1,000 entries per call, and `submitBulkWrite()` for larger batches processed in the background with an optional idempotency key. Writes stay available even when indexed capacity runs out — the value is always stored and copied into an index once one is free. `updateEntry()` replaces an entry's fields wholesale; `deleteEntry()` soft-deletes.
- `read()` for cursor-paginated, bounded reads and `get()` for a point read. `search()` accepts filters as a JSON wire format — twelve operators, full AND/OR/NOT nesting, thirteen closed error codes, and a normative JSON Schema — or as typed PHP filter nodes. Sorting by entry id, creation time, or one indexed field. Custom search drivers can serve reads from another backend entirely.
- Online schema changes: retyping a field, promoting or demoting its filterability, renaming a field or a model, and deleting a field or a model — all while the application keeps running, with the field or model served from the JSON payload until any background copy finishes.
- Four background daemons, all started through `bin/stardust`: `watcher` provisions indexed capacity ahead of demand, `reconciler` drains every kind of deferred work (with a dead-letter queue and operator replay for rows that can't be reconciled), `liberator` reclaims freed indexed columns, and `chronicler` produces exports. `bin/stardust tick` runs the same maintenance as one bounded pass, for hosts that can run a cron job but not a persistent process.
- `submitExport()` and `getExportJob()` for CSV or JSON exports of a model, with a per-tenant cap on concurrent jobs and automatic resume after a crash.
- `spread:report` and `compact:model` for spotting and fixing a model whose fields are scattered across more storage pages than necessary; `cardinality:report` for flagging indexes whose values are too repetitive to be useful.
- Structured NDJSON logging by default, or any PSR-3 logger, with a correlation id you can supply that follows one operation from your request into the background work that finishes it.

### Changed

- The package is a new engine, not a new version of the CodeIgniter 4 library it replaces. Models, fields and entries are stored in a different schema, and the public API shares nothing with 0.2.x.

### Removed

- The entire 0.2.x codebase: the CodeIgniter 4 integration, the Virtual Column indexing it was built on, and its manager and builder classes. The 0.2.x releases remain installable from their own tags.

### Known limitations

- The `PDO` connection must use `PDO::ERRMODE_EXCEPTION` and `PDO::ATTR_EMULATE_PREPARES => false`. With PHP's default emulated prepares, reads fail with a MySQL syntax error.
- A newly filterable or retyped field can be filtered only once its background copy into an indexed column finishes.
- Sorting accepts one key at a time.
- Exports always cover every entry in the model; a request with a filter is rejected outright.
- Pagination is cursor-only — no page numbers, offsets or total counts.
- Search drivers are read-only, and there's no change feed yet for keeping an external index in sync — see [Keeping an external index in sync](/extending/custom-search-drivers#keeping-an-external-index-in-sync).
- On MariaDB, range filters and field sorts place supplementary-plane characters (mostly emoji) at the opposite end from MySQL.
