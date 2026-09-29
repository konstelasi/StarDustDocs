# Reading entries

There are two ways to read: `get()` fetches one entry by id, and `read()` returns a filtered, sorted, paginated page. Both are tenant-isolated on every query, and both read a field from its indexed slot when it has one and from the JSON payload otherwise, so a field without a slot still comes back.

## Reading one entry with get()

```php
$entry = $engine->get(tenantId: 42, entryId: $someEntryId);

$entry?->id;
$entry?->fields;     // field name => value
$entry?->createdAt;
```

`get()` returns `null` when the entry does not exist for this tenant, or has been soft-deleted. An entry that belongs to another tenant is indistinguishable from one that does not exist.

## Querying with read()

`read()` takes an `EntryQuery` and returns an `EntryPage`:

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Read\EntryQuery;

$page = $engine->read(new EntryQuery(
    tenantId:     42,
    modelId:      $modelId,
    filter:       LeafNode::local('name', 'eq', 'Acme'),
    selectFields: ['name', 'employees'],
    pageSize:     100,
));

$page->rows;        // list<Entry>
$page->nextCursor;  // Cursor|null; null means this was the last page
$page->pageSize;    // the requested page size
```

| `EntryQuery` argument | Meaning |
| :-- | :-- |
| `filter` | A filter tree, or omit it to match every entry in the model. |
| `selectFields` | The field names to populate on each row. Omit it for every registered field. |
| `pageSize` | Rows per page, from 1 to 1 000. The default is 100. |
| `cursor` | The `nextCursor` of the previous page. |
| `sort` | A `SortSpec`. See [Sorting](#sorting). |

Filters are trees. Leaves carry an operator, a field and a value, and `AndNode`, `OrNode` and `NotNode` compose them:

```php
use StarDust\Filter\Ast\AndNode;
use StarDust\Filter\Ast\NotNode;
use StarDust\Filter\Ast\OrNode;

$filter = new AndNode([
    new OrNode([
        LeafNode::local('region', 'eq', 'eu'),
        LeafNode::local('region', 'eq', 'us'),
    ]),
    new NotNode(LeafNode::local('status', 'eq', 'archived')),
]);
```

A tree made only of ANDs runs as indexed joins. A tree containing OR or NOT switches to a different execution shape automatically, with no change on your side. The operators are listed in [The QueryFilter wire format](/usage/query-filter#operators), and [Searching](/usage/searching) covers building filters from JSON.

**A filter on a field that is unknown, not filterable or not yet indexed is rejected before any SQL runs**, with a typed exception. See [Filterable vs. indexed](/concepts/filterable-vs-indexed).

## Cursor pagination

Pages are walked with an opaque <Term id="cursor">cursor</Term>. Pass each page's `nextCursor` back in to get the next page, and stop when it is `null`:

```php
$cursor = null;
do {
    $page = $engine->read(new EntryQuery(
        tenantId:     42,
        modelId:      $modelId,
        filter:       $filter,
        selectFields: ['name', 'employees'],
        pageSize:     100,
        cursor:       $cursor,
    ));

    foreach ($page->rows as $entry) {
        // ... use $entry
    }

    $cursor = $page->nextCursor;
} while ($cursor !== null);
```

Two rules matter here:

- **Treat the cursor as opaque.** Pass it back unchanged and never inspect or build one.
- **A cursor marks a position, not a query.** Send the same filter, `selectFields` and page size with every page. A changed sort is refused outright, but a missing or altered filter is *not*: the pages after the first silently come back unfiltered, or filtered differently. Keep the query object and vary only the cursor.

### Why there are no page numbers or totals

There is deliberately no offset and no total count. Both would force the database to read the entire matching set, so a query that is quick today would slow down purely because the tenant grew. Each read costs two bounded queries no matter how large the tenant is: one finds the ids for a single page, and one fetches the rows for just those ids.

The trade-offs for your UI:

- Infinite scroll and a Next button work naturally.
- A Back button means holding on to the cursors you have already used.
- "Page 7 of 214", jumping to an arbitrary page and "showing 1 to 20 of 4 310" cannot be served.

If you need totals or page numbers, a custom [search driver](/extending/custom-search-drivers) backed by an external index can supply them.

## Sorting

Reads come back in insertion order (entry id ascending) unless you say otherwise. Pass a `SortSpec` to change that:

```php
use StarDust\Read\EntryQuery;
use StarDust\Read\SortDirection;
use StarDust\Read\SortSpec;

// Newest first: the common case, and the cheapest.
$page = $engine->read(new EntryQuery(
    tenantId: 42,
    modelId:  $modelId,
    sort:     SortSpec::byId(SortDirection::Desc),
));

SortSpec::byCreatedAt(SortDirection::Desc);
SortSpec::byField('title');                        // ascending
SortSpec::byField('price', SortDirection::Desc);
```

Sorting composes with filters and with cursor pagination. Keep passing `nextCursor` back, together with the same filter and sort. You can sort by **one key only**. Sorting by two fields at once is not supported.

### Sort targets

You can sort by entry id, by creation time, or by one of your own fields. A field must be filterable **and** have a live slot, the same requirement filtering has. Sorting on anything else raises `FieldNotSortableException`, and on an unregistered name `UnknownFieldException`. `describeModel()` tells you which fields qualify right now through `ModelDescription::indexedFields()`.

Entries with no value for the sort field sort first ascending and last descending. They are not dropped from the page.

### What a field sort costs

Sorting by entry id or by creation time walks an existing index and costs nothing extra at any page depth. **Sorting by one of your own fields makes the database order the whole matching set on every page.** It is still bounded, and still two queries, but it is measurably more expensive on large models. Prefer the built-in orderings when either will do.

### Sorts and cursors

A cursor belongs to the ordering that produced it. Change the sort key or its direction and the old cursor is refused with `InvalidCursorException`, so start again from the first page. That is a guard, not a limitation to work around: reusing the cursor would silently walk a different sequence.

On MariaDB, a field sort orders supplementary-plane characters, mostly emoji and well outside everyday text, at the opposite end from MySQL. Every other comparison, and ordinary text in any language, sorts identically on both engines.

## The schema-version cache

Every read needs the model's schema: which fields exist and which have a live slot. To avoid loading it on every call, the read path keeps an in-process cache and checks a single schema-version counter to know whether it is still fresh. The check is cheap and designed to be sub-millisecond.

What that means for you:

- **Schema changes are picked up automatically.** When you or a daemon change the schema, the counter moves and the next read refreshes its cache. You never restart your application for it. A refresh is logged as a `cache_miss` event, which is expected after a schema change and no cause for alarm.
- **The cache is per process.** Each PHP-FPM worker or CLI process holds its own and refreshes independently.
- **A long-running process needs no special handling.** A daemon or a queue worker sees schema changes on its next read like any other process.
