# Promoting and demoting filterability

Promoting a field makes it filterable without changing its declared type; demoting one takes that back. Both go through the same lifecycle as [retyping](/schema-changes/retype) — in fact the same guards apply, and starting either one while the field has a rename or a retype already running refuses with `RenameInProgressException` or `RetypeInProgressException`, or with `FieldDeletionInProgressException` if the field is already being deleted. The difference from a retype is that neither operation converts a single value: the declared type stays exactly what it was, so there is nothing to coerce.

## Promoting a field

```php
$engine->promoteFieldToFilterable(
    tenantId: 42,
    fieldId:  $fieldId,
);
```

A fresh, indexed slot in the field's declared-type family is reserved and backfilled from the JSON payload already on file — or the reservation defers until the [Watcher](/operations/watcher) provisions capacity, if none is free right now. There is normally no old slot to tombstone, since a field only ever holds one while it's filterable.

The field is `isFilterable: true` the moment the call returns, but not yet `isIndexed: true` — that flips once the [Reconciler](/operations/reconciler) finishes the backfill. See [Filterable vs. indexed](/concepts/filterable-vs-indexed) for what you can and can't do with the field in between.

## Demoting a field

```php
$engine->demoteFieldFromFilterable(
    tenantId: 42,
    fieldId:  $fieldId,
);
```

Registry-only and complete when the call returns — there is no backfill window at all. The field's slot is [tombstoned](/concepts/slots-and-pages#tombstoned-and-reclaimed) immediately for the [Liberator](/operations/liberator) to reclaim, and from that instant a filter or a sort against the field raises `FieldNotFilterableException` or `FieldNotSortableException`. Reads are unaffected: the field keeps returning correctly, served from the JSON payload the way any non-filterable field always is.

## What happens to the slot

Promotion claims a free slot the same way any other filterable field would: from whichever page already carries a live slot for the same model, or the oldest page with room if the model has none yet. See [A slot's lifecycle](/concepts/slots-and-pages#a-slots-lifecycle) for the full `free → assigned → backfilling → ready` progression.

Demotion never leaves a slot in limbo. It tombstones on the same call that clears `isFilterable`, so there is exactly one instant after which the slot is guaranteed no longer live — the Liberator's reclaim is a cleanup step, not something a demoted field's correctness depends on.

Promoting and then demoting the same field, or the reverse, is not restricted beyond the usual in-flight guards: each operation completes (or opens its own window) independently, and a field can be promoted again later with no memory of its previous slot.
