# Changing a field's type

`retypeField()` changes a field's declared type — one of `string`, `int`, `numeric` or `datetime`. Because each type maps to its own [slot family](/concepts/tenants-models-fields#the-four-slot-families), a filterable field can't convert its slot in place; it gets a fresh one in the new family and the old values are converted across during a backfill.

## Starting a retype

```php
$engine->retypeField(
    tenantId:        42,
    fieldId:         $fieldId,
    newDeclaredType: 'int',
);
```

What happens depends on whether the field is filterable right now:

- **Not filterable.** Registry-only and complete when the call returns. There is no slot to replace and the JSON payload was already the only copy, so there is nothing to backfill.
- **Filterable.** The current live slot is [tombstoned](/concepts/slots-and-pages#tombstoned-and-reclaimed) for the [Liberator](/operations/liberator) to reclaim, and a new slot in the target family goes to `backfilling` — or the reservation is deferred if no matching indexed slot is free yet. The [Reconciler](/operations/reconciler) then converts the field's stored values into the new slot, chunk by chunk, and flips it to `ready` on the last one.

A second retype started on a field that already has one running throws `RetypeInProgressException`. A field with a rename in flight refuses with `RenameInProgressException` instead — retyping by name would read every un-migrated row as if the field were absent. A field already being deleted refuses either way, with `FieldDeletionInProgressException`. See [Operations that block each other](/schema-changes/#operations-that-block-each-other) for the full guard table.

## Coercion rules

Converting to the same type is a pass-through (a `datetime` value is simply normalised to the slot's stored format). Between different types, each of the eight supported pairs has its own conversion rule:

| From → to | Rule |
| :-- | :-- |
| `string` → `int` | A base-10 integer literal only — no decimals, no thousands separators, no leading `+`. Must fit a signed 64-bit integer. |
| `string` → `numeric` | A JSON-number literal — optional sign, digits, optional fraction, optional exponent. No `NaN` or `Infinity`. |
| `string` → `datetime` | Strict RFC 3339 with an explicit UTC offset (`Z` or `±HH:MM`). A value with no offset does not convert. |
| `int` → `string` | Decimal digits, with a leading `-` for negatives. |
| `int` → `numeric` | Lossless — every `int` value is representable as `numeric`. |
| `numeric` → `string` | The shortest decimal form that round-trips, no scientific notation. |
| `numeric` → `int` | Only when the value is already integer-valued and in signed 64-bit range. No rounding and no truncation of a fractional value. |
| `datetime` → `string` | RFC 3339, normalised to UTC with a `Z` suffix. |

## Rejected type pairs

`int ↔ datetime` and `numeric ↔ datetime` are refused outright, before anything in the registry changes, with `IncompatibleRetypeException`. Interpreting a number as an epoch timestamp (or the reverse) is a decision about your data's meaning that the engine won't make silently — bridge through a `string` intermediate field if you need that migration.

## Values that fail to convert

A value that doesn't fit its rule converts to `null` — **in the slot only**. The payload keeps the original value, so reads are unaffected; only a filter or a sort on the field would ever see the gap, and it never raises an error. Each failure fires a `coercion_null` audit event carrying one of a closed set of reasons: `out_of_range`, `non_integer` (a non-integer `numeric` value going to `int`), `malformed_datetime`, `malformed_number`, or `unparseable`.

A missing or JSON-`null` source value is not a coercion failure at all — it is left absent, with no event, and the new slot simply has nothing to hold there.

## During the backfill window

Reads and writes on the field keep working throughout — reads come from the payload, and writes land in the new slot as it fills. What's unavailable is filtering and sorting: both raise a typed exception (`FieldNotFilterableException` for a filter, `FieldNotSortableException` for a sort) until the new slot reaches `ready`. See [What reads see during a window](/concepts/background-work#what-reads-see-during-a-window) and [Filterable vs. indexed](/concepts/filterable-vs-indexed).

You also can't start a second retype, a promotion, a demotion, or a [compaction](/operations/slot-maintenance) relocation on the field until this one finishes — and compaction of the whole *model* refuses too, dry runs included, while any one of its fields has a retype running. See [When compaction declines to run](/operations/slot-maintenance#when-compaction-declines-to-run).

Once the backfill finishes, two one-shot advisories fire automatically: a cardinality sample of the new slot, and a spread sample of the model, since a retype can land a field on a page its model didn't previously occupy. Both are covered in [Slot maintenance](/operations/slot-maintenance).
