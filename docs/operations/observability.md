# Observability

## The NDJSON log stream

StarDust logs structured NDJSON to stdout by default — one JSON object per line, no multi-line records to parse around. Every daemon, every write, every read, every schema change emits through the same stream, so a single `tail -f` or log aggregator picks up the whole engine. Inject your own PSR-3 logger through `Config` if you'd rather route this into an existing logging pipeline; the event shapes are identical either way.

Every record carries an `event` name from a closed vocabulary — you'll never see an undocumented event name in production, which makes building alerts against specific events safe rather than a moving target.

## Correlation IDs

Every event carries a `correlation_id` tying it to the operation that produced it. By default the engine mints one per operation, but you can supply your own — pass your HTTP request id and it flows through every event that operation produces, including ones a background daemon emits minutes later in a different process:

```php
$payload = new EntryPayload($tenantId, $modelId, $fields, correlationId: $requestId);
$engine->write($payload);

$query = new EntryQuery($tenantId, $modelId, correlationId: $requestId);
$engine->read($query);
```

Every entry point that takes one makes it optional and appended, so existing code keeps working and simply gets a generated id if you don't supply your own.

## Tracing asynchronous work

This is where correlation ids earn their keep. A write that outruns available index capacity logs its exhaustion fallback under your id, and if the background backfill later can't complete that entry, the dead-letter row records your id alongside the id of the worker cycle that failed it — so a support ticket quoting one request id is answerable end to end. Likewise, an export you submit and the `job_complete` a separate Chronicler process emits minutes later share the id you passed.

Two details worth knowing when you read the output:

- **A background worker processes many requests in one batch.** Where that happens, the batch's own correlation id describes the batch, and your id appears under a second key instead — `job_correlation_id` for bulk imports, `origin_correlation_id` on dead-letter rows.
- **Successful background backfills aren't logged per entry**, only per batch. The absence of a per-entry record is normal; watch queue depth as the signal instead.

## A tick is its own trace

`bin/stardust tick` is its own trace boundary, not a joining one. Each run mints one correlation id and emits its start and completion events under it — but the Watcher, Liberator, Reconciler, and (with `--exports`) the Chronicler it composes each mint their own per-job or per-tick ids as usual, the same as they would under persistent daemons. A single `tick` invocation's log doesn't join end-to-end under one id the way a request does; if you need to correlate everything one invocation did, group by timestamp proximity in that run's own output instead.

A `tick` run can also be the one that fires the periodic cardinality and spread advisories, since their schedule is shared across the whole deployment rather than tied to any one persistent process. See [Slot maintenance](/operations/slot-maintenance) for what those events mean.

## Events worth alerting on

A short list to start with, roughly in order of urgency:

- **Anything landing in the dead-letter queue.** Not itself an emergency, but nothing clears it automatically, and a growing count means a genuine data problem worth looking at. See [Reconciler](/operations/reconciler#the-dead-letter-queue).
- **A tick reporting lock contention repeatedly**, rather than as an occasional overlap between scheduled runs. See [Troubleshooting](/operations/troubleshooting#a-tick-reports-lock-contention).
- **A low-disk warning from the Chronicler's pre-claim gate.** New export jobs stop being claimed the moment this fires, silently from the caller's point of view until they check job status.
- **A high-spread advisory on a model you filter heavily.** Purely informational on its own — it never blocks anything — but it's the signal that tells you compaction is worth running. See [Slot maintenance](/operations/slot-maintenance).
- **A low-cardinality advisory on an index you rely on for selective filtering.** Tells you the index isn't doing the job the query planner needs it to.
- **A sweep-gap increment persisting across several Liberator cycles on the same slot.** A single gap self-heals; one that keeps recurring on the same slot means the contention isn't clearing on its own.

None of these are exceptions the engine throws at your application — they're operational signals meant for whoever watches the log stream, which is exactly why they're worth wiring into alerting rather than only checked by hand.
