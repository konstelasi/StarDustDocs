# StarDust API

Every public method on `StarDust`, grouped by what it does. Signatures only — each row links to the page that covers the behaviour in depth. `StarDust::VERSION` holds the package version as a string.

Every method that takes a `tenantId` validates it before touching the database — an out-of-range value throws `InvalidTenantIdException` immediately, and a method returning `?T` or `bool` reports another tenant's row exactly the way it reports a missing one. See [Errors](/reference/errors) and [Security](/operations/security#tenant-isolation-guarantees).

## Setup

| Method | What it does |
| :-- | :-- |
| `pdo(): PDO` | The injected connection. |
| `logger(): LoggerInterface` | The configured logger. |
| `config(): Config` | The `Config` this instance was built with. |
| `bootstrap(): void` | Idempotently creates every table the engine needs. See [Installation](/guide/installation#bootstrap-the-schema). |
| `serverEngine(): ServerEngine` | The detected database engine, resolved from the live connection the first time it's needed. Throws `UnsupportedServerException` below the supported floor. See [Requirements](/guide/requirements#supported-databases). |
| `schemaBuilder(): SchemaBuilder` | Registers models and fields. See [Defining models and fields](/usage/defining-schema). |

## Writes

| Method | What it does |
| :-- | :-- |
| `write(EntryPayload $payload): EntryWriteResult` | Writes one entry. See [Writing entries](/usage/writing-entries). |
| `bulkWrite(list<EntryPayload> $payloads, ?BulkIngestOptions $options = null): BulkIngestResult` | Writes up to 1 000 entries synchronously, in chunked transactions. See [Bulk and async imports](/usage/bulk-imports#synchronous-bulk-writes). |
| `updateEntry(int $tenantId, int $entryId, array $fields, ?string $correlationId = null): EntryWriteResult` | Full replace of an existing entry. Throws `EntryNotFoundException` when it doesn't exist, belongs to another tenant, or is already deleted. See [Updating and deleting entries](/usage/updating-and-deleting#full-replace-with-updateentry). |
| `deleteEntry(int $tenantId, int $entryId, ?string $correlationId = null): bool` | Soft-deletes an entry. Returns `false` rather than throwing when there's nothing to do. See [Updating and deleting entries](/usage/updating-and-deleting#soft-delete-with-deleteentry). |

## Import jobs

| Method | What it does |
| :-- | :-- |
| `submitBulkWrite(int $tenantId, list<EntryPayload> $payloads, ?string $idempotencyKey = null, ?string $correlationId = null): ImportJobId` | Submits a batch of any size for background ingestion. See [Async submission for large batches](/usage/bulk-imports#async-submission-for-large-batches). |
| `getImportJob(int $tenantId, int $jobId): ?ImportJob` | Polls a submitted job. `null` for not-found or another tenant's. See [Polling an import job](/usage/bulk-imports#polling-an-import-job). |

## Reads and search

| Method | What it does |
| :-- | :-- |
| `read(EntryQuery $query): EntryPage` | A filtered, sorted, cursor-paginated page. See [Reading entries](/usage/reading-entries#querying-with-read). |
| `get(int $tenantId, int $entryId): ?Entry` | One entry by id. `null` for not-found, another tenant's, or soft-deleted. See [Reading one entry with get()](/usage/reading-entries#reading-one-entry-with-get). |
| `search(SearchRequest $request): SearchResult` | The driver-backed equivalent of `read()`, for filters built from JSON. See [Searching](/usage/searching). |

## Schema introspection

| Method | What it does |
| :-- | :-- |
| `listModels(int $tenantId): list<ModelSummary>` | Every model registered for the tenant. |
| `describeModel(int $tenantId, int $modelId): ?ModelDescription` | One model and its fields, or `null` when it doesn't exist for this tenant. See [Defining models and fields](/usage/defining-schema#describing-a-model). |

## Schema changes

| Method | What it does |
| :-- | :-- |
| `retypeField(int $tenantId, int $fieldId, string $newDeclaredType): void` | See [Changing a field's type](/schema-changes/retype). |
| `promoteFieldToFilterable(int $tenantId, int $fieldId): void` | See [Promoting a field](/schema-changes/filterability#promoting-a-field). |
| `demoteFieldFromFilterable(int $tenantId, int $fieldId): void` | See [Demoting a field](/schema-changes/filterability#demoting-a-field). |
| `renameField(int $tenantId, int $fieldId, string $newName): void` | See [Renaming a field](/schema-changes/renaming#renaming-a-field). |
| `renameModel(int $tenantId, int $modelId, string $newName): void` | Synchronous — the one schema change that needs no Reconciler. See [Renaming a model](/schema-changes/renaming#renaming-a-model). |
| `deleteField(int $tenantId, int $fieldId): bool` | See [Deleting a field](/schema-changes/deleting-fields). |
| `deleteModel(int $tenantId, int $modelId): bool` | See [Deleting a model](/schema-changes/deleting-models). |

All seven return as soon as the registry is updated. Every one except `renameModel()` then finishes in the background and needs a running Reconciler to converge — see [Background work and eventual consistency](/concepts/background-work). `deleteField()` and `deleteModel()` return `false`, rather than throwing, when there's nothing to do.

## Exports

| Method | What it does |
| :-- | :-- |
| `submitExport(ExportJobRequest $request): ExportJobId` | See [Submitting an export](/usage/exports#submitting-an-export). |
| `getExportJob(int $tenantId, int $jobId): ?ExportJob` | See [Polling export status](/usage/exports#polling-export-status). |

## Maintenance

| Method | What it does |
| :-- | :-- |
| `compactModel(int $tenantId, int $modelId, bool $dryRun = false): CompactionPlan` | Relocates a model's filterable fields onto fewer pages. See [Compacting a model](/operations/slot-maintenance#compacting-a-model). |
| `cardinalitySampler(): CardinalitySampler` | The collaborator behind `cardinality:report`. See [The cardinality report](/operations/slot-maintenance#the-cardinality-report). |
| `spreadSampler(): SpreadSampler` | The collaborator behind `spread:report`. See [The spread report](/operations/slot-maintenance#the-spread-report). |

Most deployments reach these two through the CLI rather than calling them directly.

## Daemons and ticks

| Method | What it does |
| :-- | :-- |
| `watcher(): Watcher` | See [Watcher](/operations/watcher). |
| `reconciler(): Reconciler` | See [Reconciler](/operations/reconciler). |
| `liberator(): Liberator` | See [Liberator](/operations/liberator). |
| `chronicler(?ShutdownSignal $shutdown = null): Chronicler` | See [Chronicler](/operations/chronicler). |
| `tick(?int $budgetSeconds = null, bool $advisories = false, bool $exports = false): TickReport` | One bounded pass of the Watcher, Liberator and Reconciler — and, with `$exports`, the Chronicler. See [The tick command](/operations/deployment#the-tick-command). |
| `combinedTick(): CombinedTick` | The factory behind `tick()`, for a caller that wants to drive the run loop itself, such as a `fastcgi_finish_request()` post-response driver. |
| `dlqReplayer(): DlqReplayer` | The collaborator behind `reconciler:dlq:replay`. See [The dead-letter queue](/operations/reconciler#the-dead-letter-queue). |
| `pollLoop(): PollLoop` | Scaffolding shared by every persistent daemon's poll loop. |
| `shutdownSignal(string $daemonName): ShutdownSignal` | Composite SIGTERM/SIGINT + shutdown-flag-file signal for one daemon. |
| `lockNamespace(): LockNamespace` | The per-installation qualifier on the engine's two database advisory locks. See [Shared hosting and the lock namespace](/usage/configuration#shared-hosting-and-the-lock-namespace). |

Most deployments run daemons through `bin/stardust` rather than calling these factories directly — see [Deployment](/operations/deployment). They exist for embedding a daemon in your own process supervisor.
