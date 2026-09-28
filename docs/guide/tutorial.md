# Complete example

A minimal end-to-end walkthrough: bootstrap the schema, define a model, make its fields filterable, write a few entries, filter them and page through the results. It is the same flow as the [quickstart](/guide/quickstart)'s seed script, one step at a time.

You need a bootstrap-ready database and the package installed. See [Installation](/guide/installation).

## 1. Bootstrap

```php
use StarDust\Config\Config;
use StarDust\StarDust;

// Both attributes are required. With emulated prepares (PHP's default)
// the first read fails with a MySQL syntax error.
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

$engine = new StarDust(new Config(pdo: $pdo));
$engine->bootstrap(); // idempotent: safe to call on every deploy
```

## 2. Define the model and its fields

`schemaBuilder()` registers the model and its fields with no hand-written SQL. It is get-or-create, so running it again is safe, and it returns the model id plus a map from field name to id.

```php
use StarDust\Schema\FieldDefinition;

$company = $engine->schemaBuilder()->createModel(tenantId: 1, name: 'company', fields: [
    new FieldDefinition('name',      'string', isFilterable: true),
    new FieldDefinition('employees', 'int',    isFilterable: true),
]);

$modelId = $company->modelId;
```

## 3. Make the filterable fields queryable

Registering a field records *intent*. The field becomes filterable once its value lands in an indexed slot column.

**In a running deployment this is automatic.** The Watcher notices fields waiting for a slot and provisions pages indexed for them, and the Reconciler then claims a slot for any filterable field it finds unmapped. Write an entry that touches the field and it becomes queryable a moment later, without you reserving anything.

The manual route below is for one-off setup: a seed script, a test fixture, or a deployment where you want the slot in place before the first write. A page is created with exactly the slot columns you name, and every one of them is indexed, so name the slots your filterable fields will use, then reserve one per field:

```php
use StarDust\Page\PageProvisioner;
use StarDust\Slot\SlotReserver;

// Provision a page carrying the two slots the filterable fields will use.
(new PageProvisioner(
    $pdo,
    $engine->config()->clock,
    $engine->logger(),
    $engine->serverEngine(),
))->provision(filterableSlots: ['i_str_01', 'i_int_01']);

// Reserve one slot per field. Reservation takes the lowest-numbered free slot
// of each family, so 'name' lands on i_str_01 and 'employees' on i_int_01.
$reserver = new SlotReserver($pdo, $engine->config()->clock, $engine->logger());
$reserver->reserve($company->fieldId('name'));
$reserver->reserve($company->fieldId('employees'));
```

## 4. Write entries

The same entry can be built two ways, so use whichever suits the caller. A JSON or array envelope, `{tenantId, modelId, fields}` in camelCase, is handy when entries arrive off a wire such as a CMS, an HTTP body or a queue. The typed constructor gives you IDE validation. Both go through the identical write path, so values are coerced the same way and the tenant id is validated at the boundary either way.

```php
use StarDust\Write\EntryPayload;

// Typed:
$engine->write(new EntryPayload(tenantId: 1, modelId: $modelId,
    fields: ['name' => 'Acme Corp', 'employees' => 340]));

// From a PHP array, for example a request body you already decoded:
$engine->write(EntryPayload::fromArray([
    'tenantId' => 1,
    'modelId'  => $modelId,
    'fields'   => ['name' => 'Globex', 'employees' => 85],
]));

// From a raw JSON string:
$body = '{"tenantId": 1, "modelId": ' . $modelId . ',
          "fields": {"name": "Initech", "employees": 510}}';
$engine->write(EntryPayload::fromJson($body));
```

Each call returns an `EntryWriteResult` with the new `entryId`. See [Writing entries](/usage/writing-entries) for bulk writes and type coercion.

## 5. Filter and paginate

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Read\EntryQuery;

// Build the filter in one of two equivalent ways.
//
//   (a) Typed:
//       $filter = LeafNode::local('employees', 'gt', 100);
//
//   (b) From a JSON wire payload, for example straight from an HTTP request.
//       It returns the same filter the typed form produces, and a rejection
//       carries a closed error code and an RFC 6901 pointer.
$filter = (new JsonFilterDecoder($engine->config()->queryFilterLimits))->decode(
    '{"filter": {"op": "gt",
        "field": {"model": "company", "name": "employees"}, "value": 100}}'
);

// Companies with more than 100 employees, two per page.
$page = $engine->read(new EntryQuery(
    tenantId:     1,
    modelId:      $modelId,
    filter:       $filter,
    selectFields: ['name', 'employees'],
    pageSize:     2,
));

foreach ($page->rows as $entry) {
    echo $entry->fields['name'] . ' — ' . $entry->fields['employees'] . "\n";
}
// Acme Corp — 340
// Initech — 510
```

To walk through every page, keep passing the cursor back. This dataset fits in one page, so `nextCursor` is `null` and the loop exits after the first page:

```php
// A cursor marks only a position. Send the same filter, selectFields and
// page size with it, or later pages come back unfiltered.
$cursor = $page->nextCursor;
while ($cursor !== null) {
    $page = $engine->read(new EntryQuery(
        tenantId:     1,
        modelId:      $modelId,
        filter:       $filter,
        selectFields: ['name', 'employees'],
        pageSize:     2,
        cursor:       $cursor,
    ));

    foreach ($page->rows as $entry) {
        // ... use $entry
    }

    $cursor = $page->nextCursor;
}
```

See [Reading entries](/usage/reading-entries) for sorting and the reasoning behind cursors.

## 6. Read a single entry

```php
$firstId = $page->rows[0]->id;
$entry   = $engine->get(tenantId: 1, entryId: $firstId);

echo $entry?->fields['name']; // Acme Corp
```

`get()` returns `null` if the entry does not exist for that tenant.

## Where to go next

- [Updating and deleting entries](/usage/updating-and-deleting) and [Searching](/usage/searching) cover the rest of the everyday API.
- [Changing your schema](/schema-changes/) explains how to retype, rename and delete fields on live data.
- [Deployment](/operations/deployment) covers running the background processes that step 3 relies on in production.
- [How it works](/concepts/architecture) explains why any of this is fast.
