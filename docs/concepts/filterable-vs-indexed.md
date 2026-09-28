# Filterable vs. indexed

Two words that sound like synonyms describe two different moments. Getting them straight explains the most common surprise in StarDust: a field you just marked filterable is not filterable *yet*.

## Filterable is intent

**Filterable** is a flag on a field. It records that you *want* the field to be usable in filters and sorts, and it is the flag that decides whether the field gets a [slot](/concepts/slots-and-pages) at all.

- A filterable field is mirrored into an indexed slot column and can be used in filters and sorts.
- A non-filterable field lives in the JSON payload only. It is still written and still returned by reads, but it cannot be queried. That is the cheaper default: it costs no slot and no index maintenance.

Setting the flag changes what the registry says. It does not, by itself, put a value in any index.

## Indexed is reality

A field is **indexed** when its slot is live *right now*, meaning a filter on it would actually work. This is the property your code should check before it offers a filter.

Every field described by `describeModel()` reports both:

| Property | Means |
| :-- | :-- |
| `isFilterable` | The declared intent recorded in the registry. |
| `isIndexed` | Whether a filter against the field will work right now. |

## When the two diverge

`isFilterable` and `isIndexed` disagree for the whole of a [backfill window](/concepts/background-work#backfill-windows), and also while a newly registered filterable field is still waiting for capacity. Typical cases:

- You [promote](/schema-changes/filterability) an existing field to filterable. It is `isFilterable: true` at once, and `isIndexed: false` until the Reconciler has copied every stored value into the new slot.
- You [retype](/schema-changes/retype) a filterable field. Its old slot is tombstoned and a new one is filled, so it is not indexed until that finishes.
- You register a filterable field on a system that has no free slot for it yet. It becomes indexed once the Watcher has provisioned a page and the Reconciler has claimed a slot.

The engine enforces the difference with **pre-flight rejection**: filtering or sorting on a field that is unknown, not filterable, or not yet indexed raises a typed exception at the API boundary, before the database is touched. You get a loud, fast, catchable error rather than a query that appears to work and then table-scans as the tenant grows.

| Situation | Exception |
| :-- | :-- |
| The field name is not registered on the model | `UnknownFieldException` |
| The field is not filterable (never was, or was demoted) | `FieldNotFilterableException` |
| The field is filterable but its slot is not live yet | `FieldNotIndexedException` |
| Sorting on a field that has no live slot | `FieldNotSortableException` |

These are the exceptions to catch when you build filters from user input. [Errors](/reference/errors) lists them all.

## Writes never fail for lack of a slot

Writes stay available even when there is no slot capacity. If you write a filterable field and no slot can be claimed for it, the engine:

1. stores the value in the JSON payload as usual;
2. adds the entry to a small sync queue, in the same transaction;
3. returns success, with `EntryWriteResult::$enqueuedForBackfill` set to `true`.

This is the **exhaustion fallback**. It exists so that a full page never turns into a failed request. The Watcher later provisions a page with room and the Reconciler drains the sync queue, mirroring the value into its slot.

The cost is that the affected entries are temporarily invisible to filters on that field. They are still returned by reads and by `get()`, since those come from the payload. A sync queue that keeps growing means the Reconciler is not running, or the Watcher is not keeping up with capacity. See [Troubleshooting](/operations/troubleshooting).

## Checking queryability before offering a filter

Gate your filter UI or API on `isIndexed`, not on `isFilterable`, and it can never offer a filter the engine would reject:

```php
$model = $engine->describeModel(tenantId: 42, modelId: $modelId);

// Only the fields a filter will accept right now:
foreach ($model?->indexedFields() ?? [] as $field) {
    echo "{$field->name} ({$field->declaredType})\n";
}

// Or inspect a single field:
$field = $model?->field('employees');
if ($field !== null && $field->isFilterable && !$field->isIndexed) {
    // Declared filterable, but a backfill or a slot is still pending.
    // Show it as "indexing…" rather than offering a filter that will be rejected.
}
```

`describeModel()` returns `null` when the model does not exist or belongs to another tenant. [Defining models and fields](/usage/defining-schema#describing-a-model) covers the introspection API in full.
