# Background work and eventual consistency

Some operations cannot finish inside one request without holding locks on your whole table, so StarDust splits them. The call commits what it can, in the registry, and returns. A background <Term id="daemon">daemon</Term> catches up on the rest in bounded chunks.

The gap between "the call returned" and "the background pass finished" is the single concept most worth internalising. This page says which operations have that gap, what you can and cannot do during it, and why a running Reconciler is not optional.

## What completes on return and what does not

| Operation | On return | Left to do in the background |
| :-- | :-- | :-- |
| `write()`, `updateEntry()`, `deleteEntry()` | Complete. | Only if a filterable field had no free slot: the Reconciler mirrors it later. |
| `bulkWrite()` | Complete, chunk by chunk. | Nothing. |
| `submitBulkWrite()` | The batch is accepted as a job. | The Reconciler ingests it. |
| `renameModel()` | Complete. | Nothing. |
| `demoteFieldFromFilterable()` | Takes effect immediately. | The Liberator reclaims the slot. |
| `promoteFieldToFilterable()` | The registry is updated. | The Reconciler fills the new slot from stored payloads. |
| `retypeField()` on a filterable field | The registry is updated. | The Reconciler converts the stored values into a new slot. |
| `retypeField()` on a non-filterable field | Complete. | Nothing. |
| `renameField()` | The registry is updated. | The Reconciler rewrites every entry in the model. |
| `deleteField()` | The field is gone from every API. | The Reconciler purges the stored values. |
| `deleteModel()` | The model is gone from every API. | The Reconciler deletes its entries. |
| `submitExport()` | The job is accepted. | The Chronicler writes the file. |
| `compactModel()` | Blocks until done. | Needs a running Reconciler to make progress. |

Operations that return before they finish record their progress durably, so a daemon that crashes resumes where it stopped instead of starting over.

## Backfill windows

A <Term id="backfill-window">backfill window</Term> is the interval between a schema operation returning and its background pass finishing: the period during which the change is *declared* but not yet fully *applied* to stored data. Every asynchronous operation in the table above has one: promotion, retype, field rename, field deletion and model deletion.

A <Term id="backfill">backfill</Term> is the background pass that fills a slot with values read out of already-stored payloads, or rewrites the stored payloads. It runs in bounded chunks so it never locks up your database, and it is what turns a newly filterable field into an indexed one.

## What reads see during a window

What still works during a window is deliberate:

| | During the window |
| :-- | :-- |
| **Reads** | Keep returning the field, served from the JSON payload. |
| **Writes** | Keep being accepted, and land in the new slot as well as the payload. |
| **Filters on the field in flight** | Rejected with a typed exception, never answered with a wrong result. |

What differs by operation:

- **Promotion and retype.** The field is readable and writable, but filters on it raise `FieldNotFilterableException` and sorts raise `FieldNotSortableException` until the slot is ready. A retyped value that cannot be converted becomes null *in the slot only*. The payload keeps the original.
- **Field rename.** Reads return the value under the new name for every entry, migrated or not. A client still sending the old name keeps working, because inbound writes are rewritten to the new name. Filters on the new name work from the moment the call returns. Filters on the old name are rejected with `UnknownFieldException`.
- **Field deletion.** The field disappears from every read, write, filter and new CSV export the moment the call returns. Until the purge finishes the values are still physically stored, unreachable through the API but visible in a raw table dump. The field's name cannot be reused until the purge is done.
- **Model deletion.** Reads go dark (an empty page, `null` from `get()`), and writes are refused with `ModelDeletionInProgressException`.

[Changing your schema](/schema-changes/) covers each operation in detail, including what it blocks.

## Why a running Reconciler matters

Nearly every window in this section closes because a <Term id="reconciler">Reconciler</Term> closed it. It drains every kind of deferred work the engine produces: the sync queue, async imports, promotion and retype backfills, rename rewrites, and both deletion purges. Without one running, none of them progress, and the window stays open for ever.

The symptoms of a missing Reconciler are consistent:

- a field you promoted is never filterable;
- `isIndexed` stays `false` while `isFilterable` is `true`;
- a rename or deletion never completes;
- an import job stays `pending`;
- the sync queue only grows.

Run at least one Reconciler, either as a persistent process or through `bin/stardust tick` on a cron line. See [Deployment](/operations/deployment) for both modes and [Reconciler](/operations/reconciler) for what it does. If something is stuck, start with [Troubleshooting](/operations/troubleshooting#a-rename-retype-or-deletion-never-finishes).
