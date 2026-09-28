# Bulk and async imports

Writing many entries one `write()` at a time works, but two purpose-built paths are faster and easier to recover. Up to 1 000 entries can be written synchronously in one call. Anything larger is submitted as an import job and processed in the background.

## Synchronous bulk writes

`bulkWrite()` takes a list of payloads and commits them in chunks:

```php
use StarDust\Write\BulkIngestOptions;

$bulk = $engine->bulkWrite(
    payloads: $listOfEntryPayloads,
    options:  new BulkIngestOptions(chunkSize: 500, interChunkDelayMicros: 0),
);

$bulk->entriesCommitted; // total entries committed
$bulk->chunks;           // one result per chunk, in order
```

- **At most 1 000 entries per call.** More raises `PayloadTooLargeException`, which tells you to use `submitBulkWrite()` instead.
- **Each chunk commits in its own transaction** (500 entries by default), so InnoDB lock duration stays bounded. A failure in one chunk leaves the chunks that already committed in place: you get a per-chunk report rather than all-or-nothing.
- **Every payload's tenant id is validated up front**, before the first chunk runs, so one bad record at index 47 does not commit 46 entries first.
- `interChunkDelayMicros` pauses between chunks (never before the first or after the last), for when you want to ease the load on a busy database.

Pass a `correlationId` in `BulkIngestOptions` to tie every chunk's log events to your request. The `EntryPayload::listFromJson()` and `listFromArray()` factories build the list from a wire format. See [Writing entries](/usage/writing-entries#building-an-entrypayload).

## Async submission for large batches

For more than 1 000 entries, or smaller batches you want processed off-thread, submit a job:

```php
$jobId = $engine->submitBulkWrite(
    tenantId:       42,
    payloads:       $largeBatch,
    idempotencyKey: 'monthly-import-2026-05',
);
```

`submitBulkWrite()` writes the batch to `Config::$artifactDir`, records an import job and returns an `ImportJobId` straight away. It does not write any entries itself: a running [Reconciler](/operations/reconciler) picks the job up and ingests it in chunks.

Two practical notes:

- **The whole batch is held in memory while it is submitted.** It is written out as a single JSON document, so a very large batch needs the PHP memory to match. Split an enormous import into several submissions.
- **`artifactDir` must be writable, persistent and not web-servable, and the Reconciler must read the same directory.** The submitting process writes the batch there and the Reconciler reads it back, so if the two resolve to different directories the job fails. `bin/stardust` always uses the default directory. See [Integrating with your application](/usage/integrating#running-the-daemons-next-to-your-app).

## Idempotency keys

The optional `idempotencyKey` makes a submission safe to retry. If you submit again with the same key, for example after a dropped connection, you get the original job back instead of ingesting everything twice.

- Keys are unique **per tenant**. Two tenants can use the same key.
- A submission with no key never collides with anything.
- Choose keys that identify the *logical* import, such as a batch label or a source file's name and date, not something random per attempt.

## Polling an import job

`getImportJob()` resolves the id `submitBulkWrite()` returned:

```php
$job = $engine->getImportJob(tenantId: 42, jobId: $jobId->jobId);
```

It returns `null` when the job does not exist for this tenant. Another tenant's job looks exactly like a missing one. Otherwise the job's `status` moves through `pending`, `processing` and then `completed` or `failed`:

```php
if ($job?->status === 'completed') {
    echo "{$job->entriesWritten} of {$job->entryCount} entries written";
}

if ($job?->status === 'failed') {
    // A failed job stops where it broke. Entries already written stay
    // written and later ones were never attempted. entriesWritten is the
    // durable boundary between the two, so a retry resubmits from there.
    // It is null when the job failed before writing anything.
    echo "failed ({$job->failedReason}); resume from " . ($job->entriesWritten ?? 0);
}
```

`entriesWritten` against `entryCount` is the progress fraction. Both `entriesWritten` and `chunks` are `null` until the first chunk commits. That `null` is deliberately different from `0`: `null` means nothing was committed at all, while `0` would mean the job ran and wrote nothing.

## Per-chunk records

`chunkManifest` lists the chunks the job has processed, in order. It is the same per-chunk detail a synchronous `bulkWrite()` returns, so crossing the 1 000-entry threshold does not cost you visibility:

```php
foreach ($job?->chunkManifest ?? [] as $chunk) {
    echo "chunk {$chunk->index}: {$chunk->outcome}, {$chunk->size} entries";
    if ($chunk->entryIdFirst !== null) {
        echo " (ids {$chunk->entryIdFirst}-{$chunk->entryIdLast})";
    }
}
```

Each record carries its `index`, `size`, `outcome` (`committed` or `failed`) and the range of entry ids it wrote. A failed job ends with one `failed` record naming the chunk that broke, with a `null` id range because that chunk was rolled back. Unlike a synchronous bulk write, the first failure is terminal for an async job.

## Recovery after a worker crash

If the worker processing a job dies, the job is not lost or duplicated. The job's heartbeat lapses, and after `Config::$reconcilerImportLeaseTimeoutSeconds` (30 seconds by default) another Reconciler re-claims it and resumes from the last committed chunk. The original worker, if it is somehow still alive, notices that it no longer owns the job and stops.

The consequence for you is simple: you do not need to resubmit a job that appears stalled. Make sure a Reconciler is running, and see [Troubleshooting](/operations/troubleshooting) if a job stays `pending`.
