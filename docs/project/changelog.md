# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — see [Versioning and stability](/project/versioning) for what that means during the alpha series.

## 0.3.0-alpha.2

Released 2026-10-31. This release makes reads and bulk writes cheaper, indexes text fields through a key computed from the whole value, and lets a field sort choose where entries with no value go. It also fixes a case where a field being promoted could be filtered before its older entries were copied. It is still an alpha, so the public API may change before 0.3.0. Install it with `composer require damarbob/stardust:^0.3@alpha`.

**Upgrading from 0.3.0-alpha.1.** Replace every process of the old release before the new release's Watcher builds its first page. That means the four daemons in the reference mode, or the scheduled `tick` in the cron mode. A process from alpha.1 cannot claim a text slot on a page built with a key, so its Watcher provisions another page on every poll until it is replaced. Pages that already exist are never altered, no existing table changes, and `bootstrap()` stays safe to re-run. The steps are under [Upgrading a running deployment](/operations/deployment#upgrading-a-running-deployment).

### Added

- **Null placement in field sorts**: `SortSpec::byField()` takes an optional `NullPlacement` (`First` or `Last`) that says where entries with no value for the sort field go. Left out, the placement is the database's own, first when ascending and last when descending, so existing callers, SQL and cursors do not change. A cursor records the placement only when it is not the default, and a cursor issued under one placement is refused under the other with `InvalidCursorException`. `EntrySearchInterface` gains no method, so a custom driver that ignores the placement orders by its own default without an error, as [Custom search drivers](/extending/custom-search-drivers) explains.

### Changed

- **Text fields on new pages**:
  - A page built by this release indexes each text field through a key computed from the whole value, in place of the first 766 characters. A text filter matches exactly at any length, and a row with several long values can be updated and deleted.
  - An equality on a text field starts a filtered read from that key on a new page, so the read examines about a page of rows however many entries match.
  - A row on a new page is wider, because each text value carries a key of about 50 bytes. [Deployment](/operations/deployment#text-fields-on-older-and-newer-pages) gives measured costs and what to expect.
  - Existing pages are not altered, and no command moves a field between page kinds. A field stays on the kind of page it started on, and new text fields take free slots on older pages first.
  - Building a page with text slots needs the server's SHA-256 function. On a server that returns nothing for it, building the page raises `UnsupportedServerException`.
- **Filtered reads**: On MySQL, a filtered read in the default order that holds an equality on an integer, numeric or datetime field now starts from that field's index, so it examines about a page of rows however many entries match. When an `and` holds several such equalities, the first one drives the read, so write the most selective one first. Other filters, and any sort on a field or on creation time, keep their earlier SQL. The gain was measured on MySQL, and MariaDB already planned these reads well.
- **Fewer statements per read**:
  - A read with a filter, a sort or a cursor now checks the schema version once instead of twice, and answers whether a field is filterable from the snapshot it just checked.
  - A point read sends the version with the entry, so `get()` with a warm cache is one statement.
  - A first read of a model in a process loads its index and key lookups only when the read needs them.
- **Bulk writes**: A chunk of entries is written in a constant number of multi-row statements, where the earlier code sent several statements per entry. The copy step of a retype or promotion writes each chunk in one statement as well.
- **Bootstrap**: `bootstrap()` throws `UnsupportedServerException` on a server whose InnoDB pages are smaller than 8 KB (the default is 16 KB), before it creates any table. The earlier code passed bootstrap and failed later, when the Watcher tried to build a page.
- **Filter on a field that is not indexed yet**: The `FieldNotFilterableException` message now says so when a field is declared filterable but has no index yet. The docs and docblocks no longer name `FieldNotIndexedException` for this case, since the built-in engine never raised it.
- **Package contents**: The Composer description, keywords and support links are updated. The release archive no longer carries the tests, examples, CI files, agent rules and Docker files, and `bin/stardust --help` no longer mentions design records.

### Fixed

- **Promotion or retype waiting for a slot**: A field whose promotion or retype was waiting for a free slot could be given one that answered filters before its older entries were copied in, so a filter missed them. The background copy could then fail on every later pass. The slot is now reserved in its copying state, and filters on the field are refused until the copy finishes.
- **Emulated prepared statements**: Reads no longer fail with a MySQL syntax error when the `PDO` connection leaves `PDO::ATTR_EMULATE_PREPARES` at PHP's default. Either setting works now, and the full test suite runs both ways.

### Known limitations

- The limits listed under 0.3.0-alpha.1 still apply, except the one about emulated prepared statements.
- On an older page, a row that holds several long values in filterable text fields can be written but then not updated, and MySQL raises error 1713. Keep long free text in fields that are not filterable. [Text fields on older and newer pages](/operations/deployment#text-fields-on-older-and-newer-pages) describes the limit.
- On a new page, a text prefix or range bound narrows the index for only its first 16 Latin letters, or about 8 CJK characters. On a column where every value starts with the same longer text, such as the URLs of one site, the read may examine every entry of the tenant.

## 0.3.0-alpha.1

Released 2026-09-23. The first release of the 0.3 line: a ground-up rewrite, not an upgrade of 0.2. There is no upgrade path from 0.2.x — see [The 0.2.x line](/project/legacy-0-2). This is an alpha: the public API may still change before 0.3.0. Install it with `composer require damarbob/stardust:^0.3@alpha`.

### Added

- A framework-neutral Composer package with no runtime dependencies beyond `psr/log` and `psr/clock`. Requires PHP 8.1+ and MySQL 8.0.13+, Percona Server 8.0.13+, or MariaDB 10.11+, detected from the connection at boot.
- The `StarDust` engine class, configured through a single `Config` object with one required field (`pdo`) and defaults for everything else. `bootstrap()` and `bin/stardust bootstrap` idempotently provision every table the engine needs.
- `schemaBuilder()` to register models and fields without hand-written SQL, and `listModels()` / `describeModel()` to read a tenant's schema back, including whether each field is declared filterable and whether it's indexed right now.
- `write()` for single entries, `bulkWrite()` for up to 1 000 entries per call, and `submitBulkWrite()` for larger batches processed in the background with an optional idempotency key. Writes stay available even when indexed capacity runs out — the value is always stored and copied into an index once one is free. `updateEntry()` replaces an entry's fields wholesale; `deleteEntry()` soft-deletes.
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
