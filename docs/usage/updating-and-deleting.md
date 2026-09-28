# Updating and deleting entries

Two calls change an existing entry: `updateEntry()` replaces its fields and `deleteEntry()` soft-deletes it. They look like a pair but deliberately differ in how they report "there is nothing to do".

## Full replace with updateEntry()

`updateEntry()` is a **full replace, not a patch**. The `$fields` you pass become the entry's complete payload:

```php
$engine->updateEntry(tenantId: 42, entryId: $entryId, fields: [
    'name'      => 'Acme Holdings',
    'employees' => 141,
]);
```

It returns an `EntryWriteResult`, just like `write()`. The rest of the behaviour follows from "full replace":

- **The model never changes.** An entry's model is fixed at creation. You do not pass a model id, and an update can never move an entry between models.
- **Coercion, tenant isolation and the capacity fallback all work exactly as they do on `write()`.** An update that introduces a filterable field with no free slot still succeeds: the value is stored in the JSON payload and queued for backfill.
- **Send the whole entry.** If you have only the changed fields, read the entry first with `get()` and merge before you update. Sending only the changes removes everything else.

### Omitted fields are cleared

A field you leave out is removed from the JSON **and** its indexed slot column is cleared. That is what keeps a filter honest: it can never match a value the entry no longer carries.

```php
// The entry currently has name, employees and city.
$engine->updateEntry(42, $entryId, ['name' => 'Acme']);
// Now it has only name. employees and city are gone from the JSON,
// and the employees slot is null, so filters on employees no longer match it.
```

Setting a field explicitly to `null` is different from omitting it: an explicit `null` is you setting the field, while an omitted key is you removing it.

## Soft delete with deleteEntry()

`deleteEntry()` stamps a deletion timestamp and nothing else:

```php
$deleted = $engine->deleteEntry(tenantId: 42, entryId: $entryId);
// true on the transition; false if it was already deleted or is not yours
```

That single write is the whole mechanism. From that moment the entry is gone from `read()`, `get()`, `search()` and exports alike.

- **It is idempotent.** Deleting an already-deleted entry matches nothing, returns `false` and leaves the original timestamp alone.
- **There is no hard delete and no restore** for an individual entry. If you might need to bring an entry back, keep your own record. The one call that physically removes entry rows is [deleting a model](/schema-changes/deleting-models).
- **Slot values are left in place.** Nothing can reach them once the entry row is hidden, so clearing them would cost a write per page for no visible difference.

## Why one throws and the other returns false

The two calls treat "nothing to do" oppositely, on purpose:

| | Entry missing, another tenant's, or already deleted |
| :-- | :-- |
| `updateEntry()` | Throws `EntryNotFoundException`. |
| `deleteEntry()` | Returns `false`. |

**An update that does nothing loses data.** If `updateEntry()` quietly returned when the entry was gone, your caller would believe it had saved something that was in fact discarded. So it fails loudly.

**A delete that does nothing has already succeeded.** A repeated delete has achieved exactly what the caller asked for: the entry is deleted. So `false` is an accurate, harmless answer, and retrying a delete after a timeout is always safe.

In practice, wrap `updateEntry()` in a `try`/`catch` for `EntryNotFoundException` (typically turning it into a 404), and treat the boolean from `deleteEntry()` as information rather than an error. Because other tenants' entries look the same as missing ones, neither call ever reveals whether an id exists under another tenant.

Both calls accept an optional trailing `correlationId` so their log events join your request id. See [Observability](/operations/observability).
