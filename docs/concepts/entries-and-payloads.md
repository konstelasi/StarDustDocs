# Entries and payloads

An **entry** is one record of a [model](/concepts/tenants-models-fields), belonging to one tenant. Physically it is always one row in `entry_data` holding the complete payload, plus, if the model has filterable fields with slots, one mirrored row on each [extension page](/concepts/slots-and-pages) those slots live on.

## The JSON payload holds everything

The **payload** is the complete JSON object of an entry's field values. Every field is in it, filterable or not, keyed by field name:

```json
{ "name": "Acme", "employees": 340, "city": "Berlin" }
```

The payload is the **system of record**. It is always complete and always authoritative, which gives you three guarantees:

- a field with no slot is still fully readable;
- a backfill that has not run yet, or that fails, can never lose data;
- a slot being reclaimed or relocated affects what is queryable, never what is stored.

Values whose keys are not registered as fields are kept too. Only registered fields are ever considered for a slot, but an unknown key in the payload you write is preserved in the stored JSON rather than discarded.

## Slot columns are a mirror, not the source

For each filterable field that has a live slot, the engine also writes the value into a typed, indexed slot column, in the same transaction as the payload. That copy exists for one reason: so filters and sorts can use an index.

Because the slots are a mirror:

- the engine may rebuild, null out or move a slot at any time without touching your data;
- an update that omits a field removes it from the JSON **and** clears its slot, so a filter can never match a value the entry no longer carries (see [Updating and deleting entries](/usage/updating-and-deleting));
- a value that cannot be converted to a slot's type on a [retype](/schema-changes/retype) becomes null *in the slot only*. The payload keeps the original, so reads still show it.

## Soft deletion

Deleting an entry with `deleteEntry()` sets a timestamp. The row is not removed, and after that one write the entry is gone from `read()`, `get()`, `search()` and exports alike. Slot values are left in place, because nothing can reach them without going through the now-hidden entry row.

- There is no hard delete and no restore for an individual entry.
- A repeated delete is harmless: it returns `false`.
- The one operation that physically destroys entry rows is [deleting a model](/schema-changes/deleting-models), and it has no undelete either. Export first if you might want the data back.

## Reading from the payload when no slot exists

When you read an entry, each field is served from its indexed slot if it has a live one, and from the JSON payload otherwise. That preserves availability on the read side: a field that lacks a slot still comes back, just without the ability to filter or sort on it.

This is what keeps reads working through every [backfill window](/concepts/background-work#backfill-windows). Between the moment you promote a field and the moment its slot is filled, a read still returns the value, straight from the payload. What you cannot do in that interval is *filter* on the field. See [Filterable vs. indexed](/concepts/filterable-vs-indexed).
