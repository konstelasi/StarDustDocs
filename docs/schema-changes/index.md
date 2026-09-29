# Changing your schema

Five operations change a model's shape after entries already exist: [changing a field's type](/schema-changes/retype), [promoting or demoting filterability](/schema-changes/filterability), [renaming a field or model](/schema-changes/renaming), [deleting a field](/schema-changes/deleting-fields), and [deleting a model](/schema-changes/deleting-models). Each page covers one operation in full. This page covers what they have in common: which finish on return and which don't, which ones refuse to run at the same time, and why you should export before the irreversible ones.

## Instant changes and background changes

A model rename and a field demotion take effect the moment the call returns. Everything else opens a <Term id="backfill-window">backfill window</Term> — the registry is updated immediately, but the stored data catches up afterwards, and that catch-up **needs a running Reconciler**. See [Background work and eventual consistency](/concepts/background-work) for the full table of what completes on return versus what is left to a daemon, and for what reads, writes and filters see during the window.

The short version, specific to schema changes:

| Operation | On return | Left to the Reconciler |
| :-- | :-- | :-- |
| Retyping a non-filterable field | Complete. | Nothing. |
| Retyping a filterable field | Registry updated; old slot tombstoned. | Fill the new slot from stored payloads. |
| Promoting a field to filterable | Registry updated. | Fill the new slot from stored payloads. |
| Demoting a field | Complete. | Nothing — the [Liberator](/operations/liberator) reclaims the tombstoned slot, which needs no Reconciler. |
| Renaming a model | Complete. | Nothing. |
| Renaming a field | Registry updated. | Rewrite every entry in the model. |
| Deleting a field | Gone from every API. | Purge the values out of stored payloads. |
| Deleting a model | Gone from every API. | Delete its entries. |

## Operations that block each other

A field can only be mid-lifecycle in one of these ways at a time, and the engine checks in a fixed order — **rename, then retype, then deletion** — so two operations racing against the same field never both believe they have a clear run:

| Starting this… | …is refused while the field has | with |
| :-- | :-- | :-- |
| A rename | a rename or a retype already running | `RenameInProgressException` / `RetypeInProgressException` |
| A retype, a promotion, a demotion, or a [compaction](/operations/slot-maintenance) relocation | a rename already running, or a retype already running (which includes a relocation still in flight) | `RenameInProgressException` / `RetypeInProgressException` |
| A field deletion | a rename or a retype already running | `RenameInProgressException` / `RetypeInProgressException` |

None of the three can be started on a field that is already being deleted either — the deletion's own `deleted_at` marker makes rename and retype refuse it directly, with `FieldDeletionInProgressException`. A field being renamed additionally cannot be deleted, promoted, demoted, or compacted until the rewrite finishes.

Model deletion widens the same check to every field the model owns:

| Starting this… | …is refused while any field of the model has | with |
| :-- | :-- | :-- |
| A model deletion | a rename running | `RenameInProgressException` |
| | a retype running | `RetypeInProgressException` |
| | a deletion running | `FieldDeletionInProgressException` |

Compaction is the one asymmetric case worth knowing: a field mid-deletion doesn't make compaction throw. It simply can never be *planned*, because a deleting field has already lost its slot and its filterable flag — compaction just relocates whatever is left. See [When compaction declines to run](/operations/slot-maintenance#when-compaction-declines-to-run).

## Export before you destroy

Two of these operations remove data with no way back: deleting a field permanently discards its values once the purge finishes, and [deleting a model](/schema-changes/deleting-models) permanently discards its entries — **the only operation in the engine that physically deletes rows**. Neither has an undelete.

If you might want the data again, [export it](/usage/exports) and wait for the job to complete before you delete. An export already claimed when a model deletion starts will simply produce an empty artifact rather than failing, so the order matters: submit and finish the export first.
