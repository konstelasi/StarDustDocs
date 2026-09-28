# Renaming fields and models

A model rename and a field rename look similar from the call signature, but they're nothing alike underneath: a model's name is a label nothing else keys on, while a field's name is the literal key each entry's JSON payload stores its value under. See [Names are labels, ids are identity](/concepts/tenants-models-fields#names-are-labels-ids-are-identity) for why that difference exists at all.

## Renaming a model

```php
$engine->renameModel(tenantId: 42, modelId: $modelId, newName: 'organization');
```

Immediate and complete when it returns. Entries, slots, filters and exports all key on the model's id, not its name, so none of them notice. `ModelNameConflictException` is thrown if another model in the same tenant already has the target name.

### Keep setup scripts in step

`createModel()` and `defineModel()` find an existing model by name. After a rename, a setup or seed script still using the old name won't find the renamed model — it will register a *second* one under the old name instead of returning the id of the one you renamed. Update any such script in the same change as the rename. See [Setup scripts are safe to re-run](/usage/defining-schema#setup-scripts-are-safe-to-re-run).

## Renaming a field

```php
$engine->renameField(tenantId: 42, fieldId: $fieldId, newName: 'company_size');
```

Returns as soon as the registry is updated; the stored data catches up asynchronously and **needs a running Reconciler**. Because each entry's payload is keyed by field name, this is a rewrite of every entry in the model, not a registry-only change — closer in shape to a retype than to a model rename.

### What keeps working during the rewrite

- **Reads** return the value under the new name for every entry, migrated or not.
- **Writes** that still use the old field name keep working: the engine rewrites the key to the new name before it's stored.
- **Filters on the new name** work from the moment the call returns — a rename never disturbs the index, so there's nothing to wait for there.

### What is rejected

- **Filters on the old name** are rejected outright with `UnknownFieldException`, rather than silently matching nothing. A filter needs a loud, catchable failure; a write does not, which is why the two surfaces diverge.
- **The new name is unavailable elsewhere** until the rewrite finishes: registering a different field with that name raises `FieldNameConflictException`.
- **The field itself is locked for the duration.** It cannot be retyped, promoted, demoted, deleted, or picked up by a [compaction](/operations/slot-maintenance) relocation until the rewrite completes — see [Operations that block each other](/schema-changes/#operations-that-block-each-other).

One export format bridges the rename and one doesn't: a CSV export resolves its header when the job runs, so it always uses the current name, while a JSON export is the raw stored payload and can still show the old key for rows the rewrite hasn't reached yet. See [CSV and JSON formats](/usage/exports#csv-and-json-formats).
