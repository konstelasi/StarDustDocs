# Searching

`search()` is StarDust's unified search entry point. It runs a request through a validation pipeline and hands it to the active **search driver**, which by default is the built-in one that queries MySQL or MariaDB through the indexed slots. This page covers building requests, accepting filters as JSON, and turning rejections into useful API errors.

## search() and SearchRequest

`search()` takes a `SearchRequest` and returns a `SearchResult`:

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Search\SearchRequest;

$result = $engine->search(new SearchRequest(
    tenantId: 42,
    modelId:  $modelId,
    filter:   LeafNode::local('employees', 'gt', 100),
    pageSize: 100,
));

$result->rows;        // list<Entry>
$result->nextCursor;  // Cursor|null
$result->pageSize;
```

`SearchRequest` carries the same things `EntryQuery` does: tenant, model, an optional filter, `selectFields`, `pageSize` (1 to 1 000, default 100), `cursor`, `sort` and `correlationId`. A `null` filter matches every entry in the model.

**`read()` and `get()` run through the same pipeline.** `read()` is `search()` with the older `EntryQuery` shape, so validation, cursors, sorting and pagination behave identically. Use whichever reads better in your code. Reach for `search()` directly when you are building filters from JSON or writing code against the driver contract. See [Reading entries](/usage/reading-entries) for pagination and sorting.

## Building a filter tree in PHP

A filter is a tree. Leaves compare a field to a value, and composites combine them:

```php
use StarDust\Filter\Ast\AndNode;
use StarDust\Filter\Ast\LeafNode;
use StarDust\Filter\Ast\NotNode;
use StarDust\Filter\Ast\OrNode;

$filter = new AndNode([
    LeafNode::local('status', 'eq', 'active'),
    new OrNode([
        LeafNode::local('region', 'eq', 'eu'),
        LeafNode::local('region', 'eq', 'us'),
    ]),
    new NotNode(LeafNode::local('employees', 'lt', 10)),
]);
```

`LeafNode::local($fieldName, $operator, $value)` builds a leaf for a field of the model the request targets. Pass `null` as the value for `is_null` and `is_not_null`, a list for `in`, `nin` and `between`, and a scalar for everything else. The operators are the same ones the JSON format uses, listed in [The QueryFilter wire format](/usage/query-filter#operators).

The built-in operator set is deliberately small: equality, comparison, range, set membership, null checks and anchored prefix matching. There is no substring or suffix matching, no fuzzy matching and no relevance ranking. A custom [search driver](/extending/custom-search-drivers) can supply those.

## Accepting filters as JSON

If filters arrive from a browser or another service, decode them with `JsonFilterDecoder` and pass the result to `search()`:

```php
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Search\SearchRequest;

$decoder = new JsonFilterDecoder($engine->config()->queryFilterLimits);
$filter  = $decoder->decode($requestBody);

$result = $engine->search(new SearchRequest(
    tenantId: 42,
    modelId:  $modelId,
    filter:   $filter,
    pageSize: 100,
));
```

`decode()` returns the same filter tree the typed builders produce, or `null` when the document has no `filter` key, which `search()` treats as match-all. The decoder is strict, works without a database connection, and never consults your schema. Whether a field exists or is queryable is decided afterwards, by the pre-flight checks. The document format is defined in [The QueryFilter wire format](/usage/query-filter).

## Pre-flight validation

Before a request reaches the database it goes through a fixed sequence of checks. A request that fails any of them is rejected with a typed exception and **no SQL is issued**.

| Stage | Checks | Rejection |
| :-- | :-- | :-- |
| Field resolution | Every field in the filter exists on the model. | `UnknownFieldException` |
| Capability | The active driver supports each operator and can filter on each field. That covers fields that are not filterable and slots that are not live yet. | `FieldNotFilterableException`, `FieldNotIndexedException`, or `QueryFilterValidationException` with `capability_unsupported` |
| Value type | Each value fits its field's declared type and the limits. | `QueryFilterValidationException` with `value_type_mismatch` or `value_out_of_bounds` |
| Sort and cursor | The sort key can be ordered, and a supplied cursor was issued for this same ordering. | `UnknownFieldException`, `FieldNotSortableException`, `InvalidCursorException` |

The value-type stage also **normalises** values. In particular, a datetime bound is converted to the UTC instant it names before it reaches the driver, so a filter of `2026-01-01T10:00:00+07:00` finds an entry you wrote as that same instant, whichever offset either was expressed in.

Rejecting early is a deliberate trade. You get a loud, fast, catchable error rather than a query that appears to work and then table-scans as the tenant grows. Each rejection also emits a `pre_flight_rejected` event with a `reason`, and a driver that cannot service a request emits `capability_unsupported`, so you can measure "the client asked for something we do not support" on its own. See [Log events](/reference/log-events).

## Returning rejections to your API clients

`QueryFilterValidationException` is discriminator-style on purpose. Every wire-format and pre-flight failure shares one caller response, "fix the filter and retry", so a single `catch` handles all of them, and it carries enough to build a precise HTTP 400:

- `$errorCode`: one of the closed error codes, such as `value_type_mismatch`.
- `$jsonPointer`: an RFC 6901 pointer to the offending node, such as `/filter/args/1/value`.
- `$details`: context specific to the code, such as `['expected' => 'int', 'received' => 'string']`.

```php
use StarDust\Exception\FieldNotFilterableException;
use StarDust\Exception\FieldNotIndexedException;
use StarDust\Exception\UnknownFieldException;
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Filter\QueryFilterValidationException;
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
        'error'   => $e->errorCode,
        'pointer' => $e->jsonPointer,
        'details' => $e->details,
    ]);
} catch (UnknownFieldException | FieldNotFilterableException | FieldNotIndexedException $e) {
    // Field problems reuse these exceptions rather than the wire-format one.
    http_response_code(400);
    echo json_encode(['error' => $e::class, 'message' => $e->getMessage()]);
}
```

Two of the wire-format codes, `field_unknown` and `field_not_filterable`, are reported through `UnknownFieldException` and `FieldNotFilterableException` instead, so catch those as well. A field that is filterable but not yet indexed raises `FieldNotIndexedException`. Return it as a client error too, or, better, avoid it by offering filters only on fields whose `isIndexed` is true. See [Filterable vs. indexed](/concepts/filterable-vs-indexed#checking-queryability-before-offering-a-filter).

Do not echo `getMessage()` blindly if your API is public and you would rather not describe your schema to strangers. The error code and pointer are enough for a client to fix its request. See [Security](/operations/security#accepting-untrusted-filters).
