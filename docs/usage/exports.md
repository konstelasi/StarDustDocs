# Exports

An export dumps every entry of a model to a CSV or JSON file. It runs asynchronously, so a large extract never ties up a web request: you submit it, get an id back and poll until the file is ready. A [Chronicler](/operations/chronicler) does the actual work, so at least one must be running. On a cron-only host, that means `bin/stardust tick --exports`. See [Deployment](/operations/deployment#including-exports-in-a-tick).

## Submitting an export

```php
use StarDust\Export\ExportJobRequest;

$jobId = $engine->submitExport(new ExportJobRequest(
    tenantId: 42,
    modelId:  $modelId,
    format:   ExportJobRequest::FORMAT_CSV, // or FORMAT_JSON
));

$jobId->jobId; // pass this to getExportJob() to poll
```

`submitExport()` records the job and returns an `ExportJobId` immediately. Nothing is written until a Chronicler claims the job.

**An export always covers every non-deleted entry in the model.** The request has a `filter` argument, but filtering is not implemented, so a non-empty filter is rejected with `ExportFilterNotSupportedException` rather than accepted and quietly ignored. You find out at submission instead of discovering a full extract in the file. Leave `filter` at its default. The argument is kept on the request so filtering can be added later without changing the signature.

To export a subset today, read it with `read()` or `search()` and write the file yourself. Pass a `correlationId` on the request to make the job's log events join your request id. See [Observability](/operations/observability).

## CSV and JSON formats

| | CSV | JSON |
| :-- | :-- | :-- |
| Shape | One header row, then one row per entry. | A single JSON array with one element per entry. |
| Columns or keys | The model's registered field names, sorted alphabetically. | Each entry's stored payload, verbatim. |
| Missing values | An empty cell. | Absent from the element. |
| Nested values | Encoded as JSON text inside the cell. | Native JSON. |
| Encoding | RFC 4180 quoting, `\r\n` line endings. | UTF-8 JSON. |

Two differences follow from that, and are worth knowing before you build on either:

- **CSV follows your current schema.** Its header is resolved when the export runs, so it reflects fields that exist now. A field deleted before the export runs has no column, and a field being renamed appears under its new name with its values intact.
- **JSON is the raw payload.** It is not projected against the schema, so during a rename it can show the old key for entries not yet rewritten, and during a field deletion it can still contain the values being purged. If either matters to you, wait for the schema change to finish before exporting. See [Background work](/concepts/background-work#what-reads-see-during-a-window).

An entry whose value cannot be encoded is skipped rather than failing the job, and is counted in the job's `skipCount`.

## Polling export status

`getExportJob()` returns the job, or `null` when it does not exist for this tenant. Another tenant's job looks the same as a missing one:

```php
$job = $engine->getExportJob(tenantId: 42, jobId: $jobId->jobId);

switch ($job?->status) {
    case 'completed':
        // artifactPath is the absolute path to the file under Config::$artifactDir.
        serveDownload($job->artifactPath);
        break;

    case 'failed':
        error_log("export failed: {$job->failedReason}");
        break;

    default: // 'pending' or 'processing'
        // Not ready yet. Check again shortly.
}
```

A job moves from `pending` to `processing` when a Chronicler claims it, then ends as `completed` or `failed`. A large export can also return from `processing` to `pending` and resume, which is normal: on a cron-only host each tick yields at its time budget, and a worker that is shut down yields at a chunk boundary. The next Chronicler continues from where it stopped, so the finished file is complete.

`failedReason` tells you why a job failed. The common ones are `disk_full`, `artifact_size_exceeded` (the file passed the 5 GB cap), `excessive_skips` (too many entries could not be encoded) and `query_failure` (the database connection dropped and could not be re-established). A failed job has its partial file deleted straight away, and you can submit a new one.

If a job stays `pending`, no Chronicler is claiming it. See [Troubleshooting](/operations/troubleshooting#an-export-stays-pending).

## The per-tenant active-job cap

Each tenant may have a limited number of exports in flight at once, three by default, counting jobs that are `pending` or `processing`. The check is atomic with the insert, so concurrent submissions cannot slip past it. A fourth concurrent submission raises `ExportJobActiveCapExceededException`, which carries `tenantId`, `activeCount` and `cap`:

```php
use StarDust\Exception\ExportJobActiveCapExceededException;

try {
    $jobId = $engine->submitExport($request);
} catch (ExportJobActiveCapExceededException $e) {
    // Tell the user an export is already running, and to wait.
}
```

Raise the cap with `Config::$chroniclerPerTenantActiveCap`. Chroniclers claim pending jobs round-robin across tenants, so one tenant with many jobs cannot starve the others.

## Artifacts and cleanup

The file a completed export produces is called an <Term id="artifact">artifact</Term>. It lives under `Config::$artifactDir`, so that directory must be writable by the Chronicler and readable by whatever serves the download. That means your application and the Chronicler have to agree on it: `bin/stardust chronicler` always uses the default directory, so either keep your application on the default too and make sure both see the same physical directory, or run the Chronicler from your own script. See [Integrating with your application](/usage/integrating#running-the-daemons-next-to-your-app). The directory must also be **outside anything web-servable**: serve the file through your application, after checking that the requesting user owns the job's tenant.

**Artifacts are temporary.** The Chronicler deletes a completed artifact once its TTL expires, 24 hours after completion by default (`chroniclerArtifactTtlSeconds`), so hand the file to the user or copy it somewhere permanent before then. Cleanup runs when a Chronicler has nothing else to do, which means a system that is never idle does not clean up. See [Chronicler](/operations/chronicler#cleaning-up-old-artifacts).

## Current limitations

- **No filtering.** Exports cover the whole model. A non-empty filter is rejected.
- **No incremental exports.** Every export is a full extract at the time it runs.
- **Exports are not backups.** They contain field values as they were when the export ran, and are not a restorable copy of your database. See [Backup and restore](/operations/backup-and-restore#exports-are-not-backups).
- **A 5 GB cap per file.** An export that would exceed `chroniclerArtifactSizeCapBytes` fails with `artifact_size_exceeded`.
- **Export before deleting a model.** [Deleting a model](/schema-changes/deleting-models) is permanent, so if you might want the data afterwards, export it first and wait for the file to complete.
