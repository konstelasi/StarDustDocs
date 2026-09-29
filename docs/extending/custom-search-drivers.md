# Custom search drivers

Reads and searches always go through a driver. The built-in one runs the bounded read against MySQL or MariaDB; a custom driver lets you serve the same `read()` / `search()` / `get()` calls from an external search service instead — Meilisearch, Elasticsearch, or anything else — without changing any call site in your application.

## The EntrySearchInterface contract

`StarDust\Search\EntrySearchInterface` is the swappable seam. A driver implements seven methods:

```php
interface EntrySearchInterface
{
    public function list(SearchRequest $request): SearchResult;
    public function get(int $tenantId, int $entryId): ?Entry;
    public function supportedOperators(): array;
    public function supportsFilterOn(int $fieldId): bool;
    public function supportsSortOn(int $fieldId): bool;
    public function supportsFuzzySearch(): bool;
    public function consistencyModel(): string; // 'strong' | 'eventual'
}
```

`list()` and `get()` do the actual read work — the same job `read()` and `get()` do against the built-in driver, just against your backend instead. The other five are self-description: the pre-flight pipeline and your own code can inspect them before a request ever reaches `list()` or `get()`.

**Drivers are read-only.** Every write still goes through StarDust's own write path into `entry_data` and, for filterable fields, an indexed slot column — a driver never receives a write call. See [Keeping an external index in sync](#keeping-an-external-index-in-sync) for what that means for you.

## Declaring capabilities

`supportedOperators()` returns the operators your driver honours — the closed set of twelve, plus any extension operators specific to your backend. A filter using an operator outside that list is rejected before your driver is invoked, with `capability_unsupported` rather than a generic rejection, so it can be metered separately. See [Log events](/reference/log-events#writes-and-reads).

`supportsFilterOn(int $fieldId)` answers, per field, whether a filter against it will work *right now*. For the built-in MySQL driver this is the same question `isIndexed` answers on a `FieldDescription` — see [Filterable vs. indexed](/concepts/filterable-vs-indexed). Your driver might answer differently: an external index might cover some fields and not others, on a schedule that has nothing to do with StarDust's own slot lifecycle.

`consistencyModel()` reports `'strong'` or `'eventual'` and `supportsFuzzySearch()` reports whether your backend does substring, fuzzy or relevance-ranked matching — StarDust's own operators are exact-match, comparison, range, set-membership and anchored-prefix only. Neither is enforced by the pipeline; they exist so calling code can make an informed decision (whether to offer a "did you mean" feature, say) rather than guess.

## Supporting sorts

`supportsSortOn(int $fieldId)` is deliberately a separate question from `supportsFilterOn()`, even though the built-in driver answers both the same way. An external engine can easily index a field for matching without keeping it orderable — sorting usually costs more to maintain than matching does. A sort naming a field your driver reports as unsupported raises `FieldNotSortableException` before your driver ever runs. See [Sorting](/usage/reading-entries#sorting) for the `SortSpec` your `list()` implementation receives on `SearchRequest`, and note the same single-key-only rule applies regardless of which driver is serving the read.

## Registering your driver

Inject an instance through `Config::$searchDriver`:

```php
use StarDust\Config\Config;
use StarDust\Search\EntrySearchInterface;

final class MeilisearchDriver implements EntrySearchInterface
{
    // ...
}

$engine = new StarDust(new Config(
    pdo:          $pdo,
    searchDriver: new MeilisearchDriver(/* ... */),
));
```

`null` (the default) uses the bundled `MysqlNativeDriver`. Once injected, every call to `read()`, `get()` and `search()` routes through your driver after the same tenant-isolation and pre-flight validation every request already gets — an unknown field, a non-filterable one, or an operator your driver doesn't support is still rejected before your code is reached, exactly as it would be against the built-in driver. See [Errors](/reference/errors#reads-filters-and-sorts).

## Keeping an external index in sync

A driver only ever *reads*. Nothing about injecting one changes how StarDust writes, and mirroring your own `write()` calls into your external index is not enough on its own to keep it current: some changes StarDust makes are applied by a background daemon rather than by a write your application made directly. A field rename rewrites every entry in the model. A retype converts every stored value to its new type. A field or model deletion removes values outright. None of these correspond to a `write()` call you could hook.

There is currently no change feed that would let a driver observe these as they happen. Until one exists, rebuild your external index from a full [export](/usage/exports) rather than trying to mirror writes incrementally — an export always reflects the current, post-backfill state of the model, so it sidesteps the whole problem rather than working around it row by row.
