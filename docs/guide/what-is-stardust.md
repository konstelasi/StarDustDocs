# What is StarDust?

StarDust is a PHP library that gives every tenant of your application their own fields, and lets you filter on those fields through native SQL indexes. It runs on the MySQL or MariaDB database you already have, with no separate search cluster to operate.

```php
// "industry" and "employees" are user-defined fields, not table columns,
// yet this compiles to an indexed range scan rather than a table scan.
$page = $engine->read(new EntryQuery(
    tenantId: 1,
    modelId:  $companyModelId,
    filter:   new AndNode([
        LeafNode::local('industry',  'eq', 'software'),
        LeafNode::local('employees', 'gt', 100),
    ]),
    selectFields: ['name', 'employees'],
));
```

It is a framework-neutral Composer package. Its only runtime dependencies are the `psr/log` and `psr/clock` interfaces: no framework, ORM or query builder.

## The problem: dynamic fields that stay filterable

Many applications let each customer define their own data: custom fields on a contact, a form builder, per-workspace record types. Storing that data is easy. Querying it is where the usual designs fall over:

- **One column per field** needs a schema change every time a customer adds a field, which does not scale to thousands of tenants with different shapes.
- **An entity-attribute-value table** (one row per field value) stores anything, but filtering on two fields needs two self-joins, three fields need three, and the database slows sharply as the table grows.
- **A JSON column** is flexible and cheap to write, but a filter on a value inside it cannot use a normal index, so every query scans.
- **A separate search engine** solves the query problem and adds a second system to run, secure, back up and keep in sync.

## How StarDust solves it

StarDust keeps each entry in two forms. The complete record is stored as JSON, which is always the authoritative copy. Any field you mark filterable is *also* mirrored into a typed column with a real B-tree index, on a side table joined one-to-one to the entry. Storage stays schemaless and cheap, and a filter reads an index. The design is called <Term id="vertical-schema-partitioning">vertical schema partitioning</Term>.

Around that idea, StarDust adds the parts that make it workable in production:

- **Writes never fail for lack of an index slot.** If capacity runs out, the value still lands in the JSON and is mirrored later.
- **Schema changes happen online.** Retyping, renaming, deleting or making a field filterable does not require downtime. Reads keep working from the JSON while the index catches up.
- **Four small background processes** provision capacity, finish deferred work, reclaim unused columns and write exports. They coordinate only through the database.
- **Bounded reads.** Every read is two queries whose size is capped by your page size, however large the tenant.

[Architecture at a glance](/concepts/architecture) shows how the pieces fit, and the [glossary](/reference/glossary) defines every term.

## What works today

- **Schema bootstrap.** Idempotent, non-destructive creation of every table the engine needs.
- **Models and fields.** A get-or-create helper to register them, and `listModels()` and `describeModel()` to read them back, including whether each field is declared filterable and whether it can be filtered right now.
- **Writes.** Single entries, synchronous bulk writes of up to 1 000 entries per call, and background submission for larger batches, with idempotency keys. Payloads can be built from typed objects, arrays or JSON.
- **Updates and deletes.** `updateEntry()` replaces an entry's fields wholesale and `deleteEntry()` soft-deletes.
- **Reads and search.** Cursor-paginated reads, point reads, and a unified `search()` with twelve operators and full AND/OR/NOT nesting, available as PHP objects or a JSON wire format with strict validation. Sorting by entry id, creation time or one indexed field.
- **Pluggable search.** The built-in driver queries MySQL or MariaDB. Implement one interface to serve reads from another backend.
- **Online schema changes.** Retype a field, promote or demote its filterability, rename a field or model, and delete a field or a model, all while the application keeps running.
- **Exports.** CSV and JSON exports of a model, produced in the background, with a per-tenant limit on concurrent jobs and resume after a crash.
- **Operations.** Slot spread and index cardinality reports, model compaction, structured logging with correlation ids, and a bounded `tick` command for hosts that can run cron but not persistent processes.

## Not yet available

- **Sorting accepts one key.** You can order by entry id, creation time or a single indexed field. Ordering by two fields at once is not supported.
- **Exports cannot be filtered.** An export always covers every non-deleted entry in the model. A request with a filter is rejected rather than quietly ignored.
- **Keeping an external search index in sync is up to you.** A custom driver can serve reads from a search service, but drivers are read-only and StarDust does not yet notify you when entries change. A rename, a type change or a deletion is applied in the background rather than by a write you made, so mirroring your own write calls is not enough. Rebuild the external index from a full export instead.

## Release status

The current release is **`0.3.0-alpha.1`**, published on 2026-09-23. Everything listed above is implemented and covered by the test suite, but this is an alpha, and **the public API may still change before 0.3.0**. It is a ground-up rewrite of the 0.2.x line and shares no API with it. See [The 0.2.x line](/project/legacy-0-2).

Composer installs only stable versions by default, so installing needs an explicit `@alpha` flag. See [Installation](/guide/installation). To decide whether StarDust suits your project, read [Is StarDust a fit?](/guide/is-it-a-fit) next.
