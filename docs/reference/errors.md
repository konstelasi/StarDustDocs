# Errors

Every typed error extends `RuntimeException`. They live under `StarDust\Exception\`, except `QueryFilterValidationException`, which lives under `StarDust\Filter\`.

## Environment and setup

| Exception | Thrown when |
| :-- | :-- |
| `UnsupportedServerException` | The connected server is below the supported floor — MySQL/Percona older than 8.0.13, or MariaDB older than 10.11. Raised the first time the engine needs to know the dialect: `bootstrap()`, or any call to `serverEngine()`. See [Troubleshooting](/operations/troubleshooting#the-server-is-rejected-at-boot). |
| `InvalidTenantIdException` | `tenantId` is `<= 0`. Checked at every entry point before any SQL runs. |

## Writes

| Exception | Thrown when |
| :-- | :-- |
| `PayloadTooLargeException` | A synchronous `bulkWrite()` call exceeds 1 000 entities. Use `submitBulkWrite()` instead. |
| `UncoercibleSlotValueException` | A value in a first-write payload can't be coerced to its slot's declared type. |
| `MalformedEntryPayloadException` | An array or JSON envelope passed to `EntryPayload::fromArray()` / `fromJson()` / `listFrom*()` is structurally invalid. Carries the offending key. |
| `EntryNotFoundException` | `updateEntry()` targets an entry that doesn't exist, belongs to another tenant, or is already deleted. |
| `NonFilterableFieldSlotException` | A slot reservation is attempted for a non-filterable field. A caller-side bug rather than a capacity problem — see [Filterable vs. indexed](/concepts/filterable-vs-indexed). |

## Reads, filters and sorts

| Exception | Thrown when |
| :-- | :-- |
| `UnknownFieldException` | A filter or sort references a field not registered on the model. |
| `FieldNotFilterableException` | A filter targets a field the active driver reports as non-filterable. |
| `FieldNotIndexedException` | A filter targets a field whose slot is backfilling, tombstoned, or unmapped — the field is filterable in intent but not yet indexed in fact. See [Filterable vs. indexed](/concepts/filterable-vs-indexed). |
| `FieldNotSortableException` | A sort names a field that isn't currently indexed — the same requirement filtering has. `describeModel()`'s indexed-fields list reports which fields qualify right now. |
| `PageSizeOutOfRangeException` | `pageSize` is outside `[1, 1000]`. |
| `InvalidCursorException` | An opaque cursor fails its structural decode, or is reused after its sort key or direction changed. |
| `QueryFilterValidationException` | A JSON QueryFilter fails decode or pre-flight. See [Handling wire-format rejections](#handling-wire-format-rejections) below. |

## Schema changes

| Exception | Thrown when |
| :-- | :-- |
| `IncompatibleRetypeException` | A retype crosses a categorically rejected pair (`int` ↔ `datetime`, `numeric` ↔ `datetime`). |
| `RetypeInProgressException` | A retype is initiated for a field that already has one running, or a model is compacted while any of its fields is mid-retype, mid-promotion, mid-demotion or mid-relocation. |
| `FieldNotFoundException` | `retypeField()`, `promoteFieldToFilterable()`, `demoteFieldFromFilterable()` or `renameField()` names a field id that doesn't exist for the tenant. `deleteField()` returns `false` instead of throwing. |
| `RenameInProgressException` | Something targets a field whose rename has started but not finished — a retype, a deletion, or (for the model it belongs to) a model deletion. |
| `FieldNameConflictException` | `renameField()` would collide with another field's name on the same model. |
| `CompactionCapacityException` | `compactModel()` can't find enough free capacity on the target page set to complete a relocation. |
| `ModelNotFoundException` | A model-level call names a `modelId` that doesn't exist for the caller's tenant. |
| `ModelNameConflictException` | `renameModel()` would collide with another model's name in the same tenant. |
| `ModelDeletionInProgressException` | Something targets a model whose deletion has started but not finished — a write, an update, a bulk submission, a compaction or an export submission against it. |
| `FieldDeletionInProgressException` | Something targets a field whose deletion has started but not finished — a rename, retype, promotion, demotion or compaction of it. |

`deleteField()` and `deleteModel()` return `false`, rather than throwing, when there's nothing to do — the field or model doesn't exist, belongs to another tenant, or is already being deleted.

## Exports

| Exception | Thrown when |
| :-- | :-- |
| `ExportJobActiveCapExceededException` | A tenant is already at its active-export cap. Carries `$tenantId`, `$activeCount`, `$cap`. |
| `ExportFilterNotSupportedException` | `submitExport()` was given a non-empty `filter`; an export always covers the whole model. Carries `$tenantId`, `$modelId`, `$filterKeys`. |

## Handling wire-format rejections

`QueryFilterValidationException` is deliberately discriminator-style: one `catch` handles every wire-format and pre-flight failure, because all of them share one caller response — fix the filter JSON and retry. It carries enough to render a precise HTTP 4xx without a per-code handler:

- `$errorCode` — one of the [thirteen closed error codes](/usage/query-filter#error-codes).
- `$jsonPointer` — an RFC 6901 pointer to the offending node (e.g. `/filter/args/1/value`).
- `$details` — discriminator-specific context (e.g. `['expected' => 'int', 'received' => 'string']`).

```php
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Filter\QueryFilterValidationException;
use StarDust\Exception\UnknownFieldException;
use StarDust\Exception\FieldNotFilterableException;
use StarDust\Search\SearchRequest;

try {
    $filter = (new JsonFilterDecoder($engine->config()->queryFilterLimits))->decode($body);
    $result = $engine->search(new SearchRequest(
        tenantId: 42,
        modelId:  $modelId,
        filter:   $filter,
    ));
} catch (QueryFilterValidationException $e) {
    http_response_code(400);
    echo json_encode([
        'error'   => $e->errorCode,    // e.g. 'value_type_mismatch'
        'pointer' => $e->jsonPointer,  // e.g. '/filter/args/1/value'
        'details' => $e->details,
    ]);
} catch (UnknownFieldException | FieldNotFilterableException $e) {
    // field_unknown and field_not_filterable reuse these pre-existing
    // exceptions rather than QueryFilterValidationException.
    http_response_code(400);
}
```

See [Searching](/usage/searching#returning-rejections-to-your-api-clients) for turning any of these into an API response, and [Troubleshooting](/operations/troubleshooting) for diagnosing a specific one in the field.
