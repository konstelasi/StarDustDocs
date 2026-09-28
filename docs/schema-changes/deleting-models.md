# Deleting a model

```php
$deleted = $engine->deleteModel(tenantId: 42, modelId: $modelId);
```

**This is the only operation in the engine that physically deletes entry rows, and there is no undelete.** Entries, their indexed slot values and their queued writes are all destroyed, along with the field definitions and the model itself. Returns `false` rather than throwing when there's nothing to do — the model doesn't exist for this tenant, or its deletion is already in flight.

## What disappears immediately

The model is gone from everything you can observe the moment the call returns. `listModels()` and `describeModel()` stop reporting it, and `read()`, `search()` and `get()` go **dark** — an empty page, `null` from `get()`, exactly as if the model had never been registered. That's a deliberate difference from field deletion, where the surrounding entry survives with one field missing: here there is no surrounding entry left to serve.

## Writes are refused

Where a field deletion quietly drops the deleted key and keeps the rest of the entry, a model deletion can't do that — there's no valid entry left for an incoming write to join. `write()`, `updateEntry()`, `bulkWrite()` and `submitBulkWrite()` all raise `ModelDeletionInProgressException` instead; `deleteEntry()` returns `false`, matching its usual idempotent shape. [`compactModel()`](/operations/slot-maintenance) and [`submitExport()`](/usage/exports) are refused for the same reason — there is nothing left worth compacting or exporting.

## The background purge

What lags behind is the data itself. The [Reconciler](/operations/reconciler) deletes the model's entries in bounded chunks and drops the model's registry row — cascading its field rows away with it — as the final step. Until then the rows are still physically stored: unreachable through the API, visible in a raw table dump, and an export that a [Chronicler](/operations/chronicler) had already claimed before you called this produces an empty artifact rather than failing.

## There is no undelete

The model's name is not available again until the purge finishes: `createModel()` and `defineModel()` raise `ModelDeletionInProgressException` rather than handing you back the id of a model being erased, worth knowing if a seed script might re-run during the window.

A model can't be deleted while any of its fields has a rename, a retype, or a field deletion running — `RenameInProgressException`, `RetypeInProgressException`, or `FieldDeletionInProgressException` respectively — and conversely, once a model deletion starts, none of those three can be started on any of its fields. See [Operations that block each other](/schema-changes/#operations-that-block-each-other).

If you might want the data afterwards, [export it](/usage/exports) and wait for the job to finish first — this is the same irreversibility that [entry-level soft deletion](/concepts/entries-and-payloads#soft-deletion) deliberately avoids by never actually removing a row.
