# Types

The DTOs, value objects and enums that make up the public surface, grouped by the part of the API they belong to. Every one is `final` and, unless noted, an immutable set of `readonly` properties passed positionally or by name.

## Write inputs and results

| Type | Carries | |
| :-- | :-- | :-- |
| `EntryPayload` | `tenantId`, `modelId`, `fields` (name → value map), `correlationId` | The single-entry write input. `fromArray()` / `fromJson()` / `listFromArray()` / `listFromJson()` build one or a batch from a `{tenantId, modelId, fields}` envelope — see [Building an EntryPayload](/usage/writing-entries#building-an-entrypayload). |
| `EntryWriteResult` | `entryId`, `enqueuedForBackfill`, `slotsWritten` | The result of `write()` and `updateEntry()`. `enqueuedForBackfill` is `true` iff a field in the payload lacked a live slot and the entry now waits on the sync queue. |
| `BulkIngestOptions` | `chunkSize` (default 500), `interChunkDelayMicros`, `correlationId` | Tuning for `bulkWrite()`. |
| `BulkIngestResult` | `chunks` (`list<BulkChunkResult>`), `entriesCommitted` | The result of `bulkWrite()`. |
| `BulkChunkResult` | `chunkIndex`, `chunkSize`, `outcome` (`committed` \| `rolled_back`), `entryIds`, `failureReason` | One chunk's outcome inside a `BulkIngestResult`. A chunk either fully commits or fully rolls back — there is no partial-chunk state. |

## Queries and results

| Type | Carries | |
| :-- | :-- | :-- |
| `EntryQuery` | `tenantId`, `modelId`, `filter` (`?FilterNode`), `selectFields`, `pageSize`, `cursor`, `sort`, `correlationId` | The input to `read()`. `filter === null` matches everything; `sort === null` means `entry_data.id` ascending. `fromFlatFilters()` builds one from a flat, implicitly-AND-composed list of leaves. |
| `EntryPage` | `rows` (`list<Entry>`), `nextCursor`, `pageSize` | The result of `read()`. `nextCursor === null` means this was the last page. |
| `Entry` | `id`, `tenantId`, `modelId`, `fields`, `createdAt`, `deletedAt` | One entry, returned by `get()` and inside an `EntryPage`. `fields` merges values from indexed slots and the JSON payload — callers should never need to know which a given value came from. |
| `SearchRequest` | Same shape as `EntryQuery`, plus a non-nullable `correlationId` (empty string means "mint one") | The input to `search()`. Convert an `EntryQuery` with `SearchRequest::fromEntryQuery()`. |
| `SearchResult` | Same shape as `EntryPage` | The result of `search()`. Convert to an `EntryPage` with `toEntryPage()`. |
| `Cursor` | `opaque` (string) | The opaque next-page token. **Treat it as opaque** — construct one only when round-tripping a token you already hold through your own storage; never build or inspect one by hand. |

## Filter nodes

`StarDust\Filter\Ast\FilterNode` is the marker interface every node implements. See [The QueryFilter wire format](/usage/query-filter) for the JSON shape these mirror, and [Building a filter tree in PHP](/usage/searching#building-a-filter-tree-in-php) for constructing them directly.

| Type | Carries | |
| :-- | :-- | :-- |
| `AndNode` | `args` (`non-empty-list<FilterNode>`) | Matches when every child matches. |
| `OrNode` | `args` (`non-empty-list<FilterNode>`) | Matches when at least one child matches. |
| `NotNode` | `arg` (`FilterNode`) | Matches when the child does not. |
| `LeafNode` | `operator`, `field` (`FieldRef`), `value` (`?TypedValue`) | A single predicate: field, operator, value. `value` is `null` only for `is_null` / `is_not_null`. `LeafNode::local($fieldName, $operator, $value)` is the convenience builder for code that already knows the model from the surrounding query. |
| `FieldRef` | `modelName`, `fieldName` | A field reference. `FieldRef::local($fieldName)` targets the field on the request's own model. |
| `TypedValue` | `value` (scalar or `list<scalar>`) | The right-hand side of a `LeafNode`. |

`Operator` is a class of string constants — `EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, `IN`, `NIN`, `PREFIX`, `BETWEEN`, `IS_NULL`, `IS_NOT_NULL` — rather than an enum, so a custom [search driver](/extending/custom-search-drivers) can declare extension operators at runtime. `ValidationErrorCode` is the closed set of thirteen wire-format error codes; see [Error codes](/usage/query-filter#error-codes) for what each one means and [Errors](/reference/errors#handling-wire-format-rejections) for handling them. `FilterLimits` carries the six tunable bounds (`maxDepth`, `maxNodes`, `maxArgs`, `maxInElements`, `maxStringLength`, `maxPayloadBytes`) — see [Limits](/usage/query-filter#limits).

## Sorting

| Type | Carries | |
| :-- | :-- | :-- |
| `SortSpec` | `target` (`SortTarget`), `fieldName` (only for `Field`), `direction` (`SortDirection`) | One sort key. Build with `SortSpec::byId()`, `byCreatedAt()` or `byField($name)`, each taking an optional `SortDirection`. |
| `SortTarget` | enum: `Id`, `CreatedAt`, `Field` | What a sort orders by. The two intrinsic targets stay index-ordered; `Field` forces a filesort over the whole matching set. See [What a field sort costs](/usage/reading-entries#what-a-field-sort-costs). |
| `SortDirection` | enum: `Asc`, `Desc` | The direction of a `SortSpec`. |

## Schema descriptions

| Type | Carries | |
| :-- | :-- | :-- |
| `ModelSummary` | `modelId`, `name` | One row of `listModels()` — identity only. |
| `ModelDescription` | `modelId`, `name`, `fields` (`list<FieldDescription>`) | The result of `describeModel()`. `field($name)` looks one up; `indexedFields()` returns only the fields a filter can target right now. |
| `FieldDescription` | `fieldId`, `name`, `declaredType`, `isFilterable`, `isIndexed` | One field, as reported by `describeModel()`. `isFilterable` is the registry's declared intent; `isIndexed` is whether a filter against it works *right now*. They diverge for the whole of a promotion or retype backfill — see [Filterable vs. indexed](/concepts/filterable-vs-indexed). |
| `FieldDefinition` | `name`, `declaredType`, `isFilterable` (default `false`) | Input DTO for `SchemaBuilder::createModel()` — one field to register. |
| `ModelDefinition` | `modelId`, `fieldIds` (name → id map) | The result of `SchemaBuilder::createModel()`. `fieldId($name)` looks one up. |

## Import and export jobs

| Type | Carries | |
| :-- | :-- | :-- |
| `ImportJobId` | `jobId` | Returned by `submitBulkWrite()`. |
| `ImportJob` | `id`, `tenantId`, `status`, `idempotencyKey`, `artifactPath`, `entryCount`, `chunks`, `entriesWritten`, `failedReason`, `workerIdentity`, `claimedAt`, `heartbeatAt`, `createdAt`, `completedAt`, `chunkManifest` (`list<ImportChunkRecord>`) | Returned by `getImportJob()`. `chunks` and `entriesWritten` are `null` — not `0` — until the first chunk commits. `artifactPath` is never `null`, unlike an export's, so it signals nothing about lifecycle stage. See [Polling an import job](/usage/bulk-imports#polling-an-import-job). |
| `ImportChunkRecord` | `index`, `size`, `outcome` (`committed` \| `failed`), `entryIdFirst`, `entryIdLast`, `failureReason` | One chunk inside an `ImportJob`'s `chunkManifest`. Unlike a synchronous bulk write, the first failing chunk is terminal for an async job, so `outcome` is never `rolled_back` here. |
| `ExportJobRequest` | `tenantId`, `modelId`, `format` (`csv` \| `json`), `filter` (must be empty), `correlationId` | Input to `submitExport()`. A non-empty `filter` is rejected — see [Submitting an export](/usage/exports#submitting-an-export). |
| `ExportJobId` | `jobId` | Returned by `submitExport()`. |
| `ExportJob` | `id`, `tenantId`, `modelId`, `status`, `filter`, `format`, `lastCursor`, `artifactPath`, `failedReason`, `skipCount`, `workerIdentity`, `claimedAt`, `heartbeatAt`, `createdAt`, `completedAt` | Returned by `getExportJob()`. `artifactPath !== null` iff `status === 'completed'`. See [Polling export status](/usage/exports#polling-export-status). |

## Maintenance results

| Type | Carries | |
| :-- | :-- | :-- |
| `CompactionPlan` | `tenantId`, `modelId`, `pagesBefore`, `theoreticalMinPages`, `targetPageIds`, `relocations` (`list<FieldRelocation>`), `noopCount` | The result of `compactModel()`, dry-run or not. `isNoop()`, `relocationCount()`, `pagesAfter()` and `excessPagesRemoved()` are convenience readers. |
| `FieldRelocation` | `fieldId`, `fieldName`, `slotType`, `fromPageId`, `toPageId` | One field's move inside a `CompactionPlan`. Only genuine moves appear here — a field already on a target page is a no-op and isn't listed. |
| `TickReport` | `rounds`, `elapsedSeconds`, `budgetSeconds`, `stopReason` (`TickStopReason`) | The result of `tick()`. |
| `TickStopReason` | enum: `IDLE`, `BUDGET_SPENT`, `SHUTDOWN`, `LOCK_CONTENDED` | Why a `tick()` run returned. `LOCK_CONTENDED` means another process already held the Watcher's lock and no round ran at all. |

## Enums

Every enum in the public surface, gathered in one place. `SortDirection`, `SortTarget` and `TickStopReason` are documented above, alongside the type they belong to.

| Enum | Cases | |
| :-- | :-- | :-- |
| `ServerEngine` | `MYSQL`, `MARIADB` | The detected database engine, returned by `StarDust::serverEngine()`. Percona reports as `MYSQL`. |
| `SortDirection` | `Asc`, `Desc` | See [Sorting](#sorting) above. |
| `SortTarget` | `Id`, `CreatedAt`, `Field` | See [Sorting](#sorting) above. |
| `TickStopReason` | `IDLE`, `BUDGET_SPENT`, `SHUTDOWN`, `LOCK_CONTENDED` | See [Maintenance results](#maintenance-results) above. |
