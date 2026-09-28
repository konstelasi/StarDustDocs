# Writing entries

`write()` stores one entry and returns once it is committed. This page covers building the payload, what comes back, how values are coerced and what happens when slot capacity runs out. For many entries at once, see [Bulk and async imports](/usage/bulk-imports). To change or remove an existing entry, see [Updating and deleting entries](/usage/updating-and-deleting).

## Building an EntryPayload

An `EntryPayload` carries the tenant, the model and the field values:

```php
use StarDust\Write\EntryPayload;

$payload = new EntryPayload(
    tenantId: 42,
    modelId:  $modelId,
    fields:   ['name' => 'Acme', 'employees' => 120],
);
```

When entries arrive off a wire (a CMS, an HTTP body, a queue), build the payload from an array or a JSON string instead. The envelope is `{tenantId, modelId, fields}`, in camelCase:

```php
// From a decoded array:
$payload = EntryPayload::fromArray([
    'tenantId' => 42,
    'modelId'  => $modelId,
    'fields'   => ['name' => 'Acme', 'employees' => 120],
]);

// From a raw JSON object:
$payload = EntryPayload::fromJson($rawJsonObjectBody);

// For bulk calls, a JSON array (or PHP list) of envelopes:
$payloads = EntryPayload::listFromJson($rawJsonArrayBody);
$payloads = EntryPayload::listFromArray($decodedEnvelopes);
```

These factories only validate the envelope's shape and return an ordinary `EntryPayload`, so a factory-built payload goes through exactly the same write path as one built with `new`. A malformed envelope raises `MalformedEntryPayloadException`, whose `$key` names the offending part, such as `'tenantId'` or `'[3].modelId'`. The tenant-id rule and per-field coercion are enforced on the write path, not by the factory.

You can also pass your own `correlationId` to any payload so its log events join your request id. See [Observability](/operations/observability).

## A single write

```php
$result = $engine->write($payload);
```

The write runs in one transaction:

1. The complete payload is inserted as the entry's JSON.
2. For every filterable field that has a live slot, the value is written to its indexed slot column as well, one statement per page.
3. If a filterable field has no live slot, the entry is queued for the Reconciler to fill in later, in the same transaction.

Non-filterable fields live in the JSON only. They never occupy a slot and never queue.

Two more things are true of every write. The tenant id must be 1 or higher, and is checked before any SQL runs. And a key in `fields` that is not a registered field is not dropped: it is kept in the stored JSON, though it can never be filtered on.

## The write result

`write()` returns an `EntryWriteResult`:

| Property | Meaning |
| :-- | :-- |
| `entryId` | The new entry's id. |
| `enqueuedForBackfill` | `true` if a filterable field had no slot yet, so the entry was queued for the Reconciler. |
| `slotsWritten` | The slots the value was written to. |

`enqueuedForBackfill: true` is not an error. The write succeeded and the entry is fully readable. What is temporarily missing is its presence in filters on the affected field. See [When slot capacity runs out](#when-slot-capacity-runs-out).

## Type coercion

Each value is coerced to its field's declared type before it is stored in a slot. A value that cannot be coerced raises `UncoercibleSlotValueException`, and nothing is written.

- **Strings.** A string bound for a slot may be at most 4 096 characters. A longer value is rejected before any SQL runs.
- **Datetimes.** A `datetime` value must be a `DateTimeInterface`, a naive `Y-m-d H:i:s` string (assumed to be UTC), or an RFC 3339 string with an explicit UTC offset (`Z` or `±HH:MM`), which is converted to UTC on write. Any other string shape is rejected rather than guessed at. That includes a locale-formatted date such as `05/01/2026`: a slash-separated date is read month-first regardless of what you meant, so a day-first value would only *look* like it worked and would land on the wrong date, silently, for any day up to the 12th.

The same offset rule applies to filter bounds. See [The QueryFilter wire format](/usage/query-filter#datetimes-need-an-explicit-offset).

## When slot capacity runs out

A write never fails or blocks because there is no slot for a filterable field. If no slot can be claimed:

- the value still lands in the JSON payload;
- the entry is queued for later mirroring;
- the call succeeds, with `enqueuedForBackfill` set.

Until the Watcher has provisioned a page and the Reconciler has caught up, that entry is invisible to filters on the field, but every read still returns it. A write that queues emits an `exhaustion_fallback` event, which is a good signal to alert on if it persists. A sync queue that keeps growing means the Reconciler is not running or the Watcher is not keeping up. See [Filterable vs. indexed](/concepts/filterable-vs-indexed#writes-never-fail-for-lack-of-a-slot) and [Troubleshooting](/operations/troubleshooting).

Every write also emits `entry_written`, and the other write-path events (`entry_updated`, `entry_deleted`, `bulk_chunk_committed`, `bulk_chunk_rolled_back`, `bulk_accepted`, `payload_too_large`) are catalogued in [Log events](/reference/log-events).
