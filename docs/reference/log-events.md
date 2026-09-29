# Log events

StarDust logs one NDJSON record per event to stdout by default (`StdoutNdjsonLogger`), or wherever your own injected PSR-3 logger sends it. See [Observability](/operations/observability) for correlation ids and tracing asynchronous work across processes; this page is the lookup table of event names.

## Record shape

Every record carries:

| Field | Meaning |
| :-- | :-- |
| `ts` | ISO 8601 timestamp. |
| `level` | The PSR-3 log level. |
| `event` | The name from the tables below. An event your own code logs through the same logger, with no `event` key, falls back to `generic_log`. |
| `message` | A short human-readable summary. |
| `correlation_id` | The id of the operation this event belongs to — yours if you supplied one, minted otherwise. Two events of the same operation always share a value. |

Beyond these, each event carries whatever fields are useful for it — a chunk's row count, a field id, a failure reason. Those payload keys aren't part of a closed contract the way event names are; treat the ones documented below as stable and anything else as informational.

## Writes and reads

| Event | Fires when |
| :-- | :-- |
| `entry_written` | A `write()` call commits. |
| `entry_updated` | An `updateEntry()` call commits. |
| `entry_deleted` | A `deleteEntry()` call commits. |
| `exhaustion_fallback` | A write's field lacked a live slot and was queued for backfill instead — pairs with `entry_written` or `entry_updated` under the same correlation id. |
| `bulk_chunk_committed` / `bulk_chunk_rolled_back` | One `bulkWrite()` chunk finishes, either way. |
| `bulk_accepted` | A `submitBulkWrite()` submission is recorded. |
| `payload_too_large` | A synchronous `bulkWrite()` call exceeds 1 000 entities. |
| `pre_flight_rejected` | A filter or sort is rejected before any SQL runs — an unknown field, a non-filterable or non-indexed one, a bad sort target, or a cursor issued under a different ordering. |
| `capability_unsupported` | The active search driver doesn't support the requested operator or field, kept distinct from `pre_flight_rejected` so it can be metered on its own. |
| `cache_miss` | The read path's in-process schema cache refreshes after `stardust_schema_version` changes. Expected right after any schema change. |
| `search_request` | Once per `search()` call (and so once per `read()`, which routes through it), carrying latency, row count and whether the compiled query used joins or `EXISTS`. |

## Watcher

| Event | Fires when |
| :-- | :-- |
| `poll_started` / `poll_complete` | One Watcher cycle begins and ends. |
| `provision_started` / `provision_complete` / `provision_failed` | A new extension page is provisioned, or the attempt fails. |
| `lock_contention` | The Watcher couldn't take its provisioning advisory lock within its timeout. |
| `cardinality_sampled` | The periodic or on-demand cardinality advisory runs. |
| `low_cardinality_index` | That sample finds an index with low selectivity over enough rows to matter. |
| `spread_sampled` | The periodic or on-demand spread advisory runs. |
| `high_spread_model` | That sample finds a model spread across more pages than its threshold allows. |
| `tick_started` / `tick_complete` / `tick_skipped` | A `tick()` run begins, ends, or is skipped outright because another process already held the Watcher's lock. See [A tick is its own trace](/operations/observability#a-tick-is-its-own-trace). |

See [Slot maintenance](/operations/slot-maintenance) for what the two advisories mean and how to act on them.

## Reconciler

| Event | Fires when |
| :-- | :-- |
| `chunk_claimed` | A work source claims one bounded chunk of work. |
| `chunk_complete` | That chunk finishes — carries per-source counters (rows backfilled, rewritten, purged, and so on). |
| `chunk_partial` | An import job's chunk loop stops partway through a batch, resumable from where it left off. |
| `capacity_wait` | A chunk needed a slot the Watcher hasn't provisioned yet. |
| `coercion_null` | A retype backfill couldn't coerce a stored value to the new type and wrote `NULL` instead. |
| `lease_lost` | A worker notices mid-chunk that its claim has been reassigned (an abandoned-claim sweep re-claimed the same job) and stops. |
| `lock_wait` | A chunk exhausted its lock-retry budget and was handed back untouched for the next tick to retry. Not an error — the chunk rolled back whole. |
| `deadlock_retry` | A chunk retries after InnoDB reports a deadlock or lock-wait timeout. |
| `dlq_inserted` | A row is moved to the dead-letter queue instead of being retried forever. |

`lock_wait`, `deadlock_retry` and `capacity_wait` describe three different situations and are worth telling apart — see [Reconciler](/operations/reconciler#what-stalls-when-it-is-not-running).

## Liberator

| Event | Fires when |
| :-- | :-- |
| `sweep_started` | A Liberator batch begins. |
| `sweep_chunk` | One bounded chunk of a slot's nullification commits. |
| `sweep_complete` | A slot finishes nullification and transitions back to `free`. |
| `deadlock_retry` | A sweep chunk retries after a deadlock. |
| `sweep_gap_flagged` | A chunk exhausted its deadlock-retry budget and the sweep advanced past it rather than retrying forever — see [Sweep gaps](/operations/liberator#sweep-gaps). |

## Chronicler and exports

| Event | Fires when |
| :-- | :-- |
| `export_accepted` | A `submitExport()` call is recorded. |
| `job_claimed` | A Chronicler claims a pending or abandoned export job. |
| `chunk_written` | One page of `entry_data` is written to the artifact. |
| `chunk_skipped` | A chunk exhausted its deadlock-retry budget and was skipped. |
| `row_skipped` | One entry couldn't be encoded and was omitted, counted in the job's `skipCount`. |
| `artifact_resumed` | A re-claimed job adopts a prior worker's partial artifact rather than restarting from zero. |
| `job_yielded` | A large export cooperatively hands control back at a chunk boundary — a time budget was reached or shutdown was requested — with its resume anchor intact. |
| `job_complete` / `job_failed` | An export finishes, either way. |
| `low_disk` | The pre-claim disk gate declines to claim new work. |
| `artifact_oversized` | An export's artifact would exceed the size cap. |
| `gc_swept` | An idle-cycle garbage-collection pass runs, cleaning up expired artifacts and orphaned partials. |

See [Exports](/usage/exports) and [Chronicler](/operations/chronicler).

## Schema changes

| Event | Fires when |
| :-- | :-- |
| `retype_started` | `retypeField()`, `promoteFieldToFilterable()` or `demoteFieldFromFilterable()` commits its registry transaction. |
| `promote_to_ready` | A retype or promotion's background backfill finishes and the new slot goes live. |
| `rename_started` / `rename_complete` | A field rename begins and finishes. |
| `model_renamed` | `renameModel()` commits — synchronous, so this is the only event in this table with no matching `_complete` pair. |
| `delete_started` / `delete_complete` | A field deletion begins and finishes. |
| `model_delete_started` / `model_delete_complete` | A model deletion begins and finishes. |
| `compaction_planned` / `compaction_complete` | `compactModel()` computes a plan and, unless it was a dry run, finishes executing it. |

Every asynchronous pair here shares one correlation id across the process boundary — the initiating call and the Reconciler chunk that eventually closes it out. See [Tracing asynchronous work](/operations/observability#tracing-asynchronous-work).
