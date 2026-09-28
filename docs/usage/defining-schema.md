# Defining models and fields

Models and fields are registered at runtime, with no migration. This page covers registering them, making their fields queryable, and reading the schema back.

## Creating a model with SchemaBuilder

`schemaBuilder()` registers a model and its fields in one call and returns their ids:

```php
use StarDust\Schema\FieldDefinition;

$company = $engine->schemaBuilder()->createModel(tenantId: 1, name: 'company', fields: [
    new FieldDefinition('name',      'string', isFilterable: true),
    new FieldDefinition('employees', 'int',    isFilterable: true),
    new FieldDefinition('notes',     'string'),
]);

$company->modelId;            // the model's id
$company->fieldId('name');    // a field's id, looked up by name
```

Each `FieldDefinition` takes a name, a declared type (`string`, `int`, `numeric` or `datetime`) and an `isFilterable` flag that defaults to `false`. Only mark a field filterable when you need to filter or sort on it. See [Filterable vs. indexed](/concepts/filterable-vs-indexed).

For finer-grained registration there are two smaller methods. `defineModel(int $tenantId, string $name)` registers a model with no fields and returns its id. `defineField(int $modelId, string $name, string $declaredType, bool $isFilterable = false)` adds one field to an existing model and returns its id.

`SchemaBuilder` registers rows in the registry and nothing more. It does not provision pages or reserve slots, which is the subject of [Making filterable fields queryable](#making-filterable-fields-queryable).

## Setup scripts are safe to re-run

`createModel()`, `defineModel()` and `defineField()` are all **get-or-create**. A name that already exists returns its existing id unchanged, and nothing is modified. Each `createModel()` call runs in one transaction. That makes a seed or setup script safe to run on every deploy:

```php
// Run it twice and you get the same ids, with no duplicates.
$first  = $engine->schemaBuilder()->createModel(1, 'company', [
    new FieldDefinition('name', 'string', isFilterable: true),
]);
$second = $engine->schemaBuilder()->createModel(1, 'company', [
    new FieldDefinition('name', 'string', isFilterable: true),
]);
// $first->modelId === $second->modelId
```

Two consequences to keep in mind:

- **Get-or-create finds a field by name only.** Re-running with a different declared type or filterable flag for an existing field does not change it. To change either, use [retype](/schema-changes/retype) or [promote and demote](/schema-changes/filterability).
- **Names are the key, so a rename matters.** After you [rename a model](/schema-changes/renaming), a setup script that still uses the old name will not find it and will create a second model. Update such scripts in step with the rename. A model that is being deleted cannot be re-registered until the deletion completes: `createModel()` raises `ModelDeletionInProgressException` instead of handing back the id of a model being erased.

## Making filterable fields queryable

Registering a field records *intent*. The field becomes filterable once its value lands in an indexed slot column.

**In a running deployment this is automatic.** The Watcher notices fields waiting for a slot and provisions pages indexed for them, and the Reconciler then claims a slot for any filterable field it finds still unmapped. Write an entry that touches the field and it becomes queryable a moment later, without you reserving anything.

The manual route below is for one-off setup: a seed script, a test fixture, or a deployment where you want the slot in place before the first write. A page is created with exactly the slot columns you name, and every one of them is indexed, so name the slots your filterable fields will use, then reserve one per field:

```php
use StarDust\Page\PageProvisioner;
use StarDust\Slot\SlotReserver;

// Provision a page carrying the two slots the filterable fields will use.
// The list may not be empty.
(new PageProvisioner(
    $pdo,
    $engine->config()->clock,
    $engine->logger(),
    $engine->serverEngine(),
))->provision(filterableSlots: ['i_str_01', 'i_int_01']);

// Reserve one slot per field. Reservation takes the lowest-numbered free
// slot of each family, so 'name' lands on i_str_01 and 'employees' on i_int_01.
$reserver = new SlotReserver($pdo, $engine->config()->clock, $engine->logger());
$reserver->reserve($company->fieldId('name'));
$reserver->reserve($company->fieldId('employees'));
```

Until a field has a slot it is still stored and readable from the JSON payload, just not on the indexed filter path. See [Slots and pages](/concepts/slots-and-pages).

## Listing a tenant's models

`listModels()` reads the registry back, for a settings screen or a model picker. Use it instead of querying the registry tables yourself:

```php
foreach ($engine->listModels(tenantId: 1) as $model) {
    echo "{$model->modelId}: {$model->name}\n";
}
```

It returns a list of `ModelSummary` objects, each carrying `modelId` and `name`. Models that are being deleted are not listed.

## Describing a model

`describeModel()` returns one model with all its fields:

```php
$company = $engine->describeModel(tenantId: 1, modelId: $modelId);

foreach ($company?->fields ?? [] as $field) {
    echo "{$field->name} ({$field->declaredType})"
       . ($field->isIndexed ? " — filterable now\n" : "\n");
}

// Look up one field by name:
$employees = $company?->field('employees');

// Only the fields a filter will actually accept today:
$company?->indexedFields();
```

The result is `null` when the model does not exist, belongs to another tenant, or is being deleted. The first two are deliberately indistinguishable. Each field is a `FieldDescription` with `fieldId`, `name`, `declaredType`, `isFilterable` and `isIndexed`.

### isFilterable and isIndexed

Each field reports **two** flags, and the difference matters:

- `isFilterable` is the declared intent recorded in the registry.
- `isIndexed` is whether a filter against the field will work *right now*.

They diverge for the whole of a promotion or retype backfill, and while a newly registered filterable field is still waiting for capacity. Build your filter UI against `isIndexed` and you will never offer a filter the engine rejects. See [Filterable vs. indexed](/concepts/filterable-vs-indexed#checking-queryability-before-offering-a-filter).
