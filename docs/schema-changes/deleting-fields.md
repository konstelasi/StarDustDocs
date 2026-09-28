# Deleting a field

```php
$deleted = $engine->deleteField(tenantId: 42, fieldId: $fieldId);
```

Returns as soon as the registry is updated; clearing the values out of already-stored entries happens in the background and **needs a running Reconciler**. It returns `false` rather than throwing when there's nothing to do — the field doesn't exist for this tenant, or a deletion for it is already in flight — the same idempotent shape as [`deleteEntry()`](/usage/updating-and-deleting).

## What disappears immediately

The field is gone from everything you can observe the moment the call returns: `read()`, `search()`, `get()` and `describeModel()` stop reporting it, filters against it raise `UnknownFieldException`, and any indexed slot it held is released for the [Liberator](/operations/liberator) to reclaim. New CSV exports drop its column, and a write that still sends its name simply has that value dropped rather than rejected — the rest of the entry is still worth storing.

## The background purge

What lags behind is the stored data. Each entry's JSON payload is keyed by field name, so removing the field means rewriting every entry in the model, and the [Reconciler](/operations/reconciler) does that in bounded chunks. Until it finishes, the values are still physically in storage — unreachable through any of the surfaces above, but a JSON export that happens to run during the window is the one place they can still surface, since a JSON artifact is the raw payload rather than something projected against the current schema. See [JSON is the raw payload](/usage/exports#csv-and-json-formats).

The field's registry entry is removed last, as the purge's final step — that's the signal the deletion is actually complete, not just accepted.

## Reusing the name

The name is not available again until the purge lands. Registering a new field with the same name on the same model raises `FieldDeletionInProgressException` rather than quietly handing you the field that's being erased.

## Restrictions

A field can't be deleted while it has a rename or a retype running — `RenameInProgressException` or `RetypeInProgressException` — and the reverse holds too: once a deletion starts, that field can't be renamed, retyped, promoted, demoted, or picked up by a [compaction](/operations/slot-maintenance) relocation. Compaction is the one exception that doesn't throw: a deleting field has already lost its slot and its filterable flag, so the planner simply can't see it to plan around it. See [Operations that block each other](/schema-changes/#operations-that-block-each-other).

There is no undelete. If you might want the values back, [export the model](/usage/exports) before you delete the field.
