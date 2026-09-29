# Slot maintenance

A model's filterable fields can end up scattered across more extension pages than they strictly need — <Term id="spread">spread</Term> — simply because pages fill up over time and a field's slot lands wherever there's room when it's reserved. Spread isn't a bug; it's the natural consequence of pages being immutable once created. It costs something real, though: every extra page a filtered query touches is another join.

Two read-only reports let you see this before it matters, and one operator-run command lets you fix it.

## The spread report

```bash
bin/stardust spread:report
bin/stardust spread:report --tenant=1 --model=7
```

For each model with a live filterable slot, this reports how many pages its slots actually occupy against the fewest it could occupy — the difference is the number of avoidable joins every fully-referencing filtered query on that model pays. This report is registry-only: it reads only the schema registry, touches no extension page data, and is safe to run against production at any time, including during business hours.

The same numbers are available directly from PHP if you're building a settings dashboard or an automated check:

```php
foreach ($engine->spreadSampler()->report(tenantId: 42) as $sample) {
    if ($sample->excessPages() > 0) {
        echo "model {$sample->modelId}: {$sample->excessPages()} avoidable page(s)\n";
    }
}
```

## The cardinality report

```bash
bin/stardust cardinality:report
bin/stardust cardinality:report --tenant=1 --model=7
```

This reports row count, distinct values, and selectivity for each live filterable slot — a low selectivity over many rows means an index the query optimizer can't use effectively, whatever the theory says it should do. Unlike the spread report, this one is **not** registry-only: it scans `COUNT(*)` / `COUNT(DISTINCT column)` off every matching extension page, so it costs real I/O and is worth preferring off-peak on a large dataset.

`--model` narrows which slots are examined, but not which rows are counted: the aggregate is per `(tenant, slot column)` across the tenant's whole partition on that page, because the index being measured is shared by every model that has a slot on the same page.

```php
foreach ($engine->cardinalitySampler()->report(tenantId: 42) as $sample) {
    if ($sample->selectivity < 0.01) {
        echo "slot {$sample->slotColumn} on page {$sample->pageId}: low selectivity\n";
    }
}
```

## Compacting a model

```bash
bin/stardust compact:model --tenant=1 --model=7 --dry-run
bin/stardust compact:model --tenant=1 --model=7
```

Compaction is what acts on a spread report: it relocates a model's filterable fields onto the fewest pages that can hold them, one field at a time, removing the avoidable joins the report showed. It's deliberately slow and operator-initiated — it moves one field, waits for a running Reconciler to drain that relocation, then moves the next — and it blocks until each move lands. Never call `compactModel()` from a request path; run it as a one-off maintenance task with a Reconciler already running.

It's safe to re-run: a field already in its target position is skipped, so a compaction interrupted partway through simply picks up the remaining relocations on the next run.

```php
$plan = $engine->compactModel(tenantId: 42, modelId: $modelId, dryRun: true);
```

### Dry runs

`--dry-run` (or `dryRun: true` from PHP) plans the relocation and reports what it would do — relocation count, page count after, excess pages removed — without moving anything or touching the Reconciler. Run this first on anything you're not already confident about; it's registry-only and as safe as the spread report itself.

### When compaction declines to run

Compaction refuses to run — dry run included — while any field of the model is mid-retype, mid-promotion, mid-demotion, or already being relocated by another compaction. A field in one of those states doesn't have a settled storage location yet, so any plan built during the window would report page counts that disagree with what the spread report shows a moment later. Wait for the Reconciler to finish that work and re-run; the spread report itself stays available the whole time, since it's read-only and registry-only regardless of what's in flight.
