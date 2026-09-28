# Frequently asked questions

## Why is there no total count?

Because counting means reading everything that matches, and StarDust is built so that a query never does that. A total count or an offset forces the database to read the entire matching set, so a query that is fast today would slow down purely because the tenant grew. Instead, every read costs two bounded queries, however large the tenant, and you get an opaque cursor for the next page. No cursor means you have reached the end.

That works well for infinite scroll and a Next button. It cannot serve "Page 7 of 214". If you need a number, you have three options:

- **Keep your own counter.** If you need the size of a well-known set, such as a tenant's total number of entries in a model, maintain a count in your application as you write and delete.
- **Show a capped answer.** Read one page and show "more than 100" when a next cursor exists, rather than an exact figure.
- **Use a driver with its own index.** A custom [search driver](/extending/custom-search-drivers) backed by an external search service can supply totals and page numbers.

See [Reading entries](/usage/reading-entries#why-there-are-no-page-numbers-or-totals).

## Can I use PostgreSQL or SQLite?

No. StarDust supports MySQL and Percona 8.0.13+ and MariaDB 10.11+, and nothing else. Its schema and SQL are written for that family, and it detects the server at boot and refuses to run on anything below the floor. There is also no in-memory or SQLite stand-in for tests: run a MySQL or MariaDB container instead. See [Requirements](/guide/requirements) and [Testing code that uses StarDust](/usage/testing-your-app).

## Can I query the tables directly?

You can read them, but you should not build on them, and you must never write to them.

- **The payload is the source of truth, and the slot tables are a mirror.** The engine is free to rebuild, empty or relocate a slot at any time, so a slot column can legitimately be `NULL` or absent for an entry that has a value.
- **Bypassing the API bypasses its guarantees.** Every query the engine builds carries the tenant id, hides soft-deleted entries and bridges the gap while a rename or retype is running. A hand-written query does none of that unless you reproduce it.
- **Writing breaks the invariants.** The registry and the slot tables are kept consistent by the engine's own transactions and background passes. A manual change can leave a value in the payload that the index no longer agrees with.
- **Nothing in the documented API depends on you reading them.** Use `listModels()` and `describeModel()` for schema questions, and `read()`, `search()` and `get()` for data.

## Do I have to run the daemons?

Yes, in one form or another. StarDust's background work has to run somewhere: either as four persistent processes, or as a scheduled `bin/stardust tick` on a host that cannot keep processes alive. Which one to pick, not whether to run one, is the decision. See [Deployment](/operations/deployment).

What keeps working with nothing running: writes (the value always lands in the JSON payload), reads and point reads of every field, and filters and sorts on fields that already have a live indexed slot.

What stops:

- a newly filterable or retyped field never becomes filterable, because the Reconciler does the copy;
- once a page's indexed capacity is used up, nothing provisions another one, so new filterable fields and new writes to them stay unindexed;
- renames, field deletions and model deletions never finish;
- async imports stay `pending`;
- exports stay `pending`, because the Chronicler writes them;
- freed slots are never reclaimed.

See [Background work and eventual consistency](/concepts/background-work).

## How is this different from EAV or a plain JSON column?

| | EAV table | Plain JSON column | StarDust |
| :-- | :-- | :-- | :-- |
| Adding a field | No schema change. | No schema change. | No schema change. |
| Filtering on a field | A join per field, so cost grows with the number of fields in the filter and the size of the table. | A scan, because a value inside JSON cannot use an ordinary index. | An index lookup on a typed column, with at most one join per page the fields live on. |
| Value types | Usually everything stored as text. | Types live only in the JSON. | Each field has a declared type, and its slot is a typed column. |
| Source of truth | The attribute rows. | The JSON. | The JSON, with the indexes as a mirror that can be rebuilt. |
| Changing a field's type or name | Rewrite the rows. | Rewrite the JSON. | Online, in the background, with reads working throughout. |
| Cost | Slows as the table grows. | Slows as the table grows. | Filterable fields cost a slot and index maintenance. Other fields are free. |

In short, StarDust keeps the flexibility of a JSON column and adds real indexes for the fields you say you will filter on. The price is that a filterable field needs a slot, and that filtering on it becomes possible shortly after you declare it rather than instantly. See [Architecture at a glance](/concepts/architecture).

## How many fields can a model have?

StarDust does not set a fixed cap on the number of fields in a model, but the two kinds of field behave very differently:

- **Non-filterable fields** cost nothing beyond the space they take in each entry's JSON. A document is limited by your database's `max_allowed_packet` setting.
- **Filterable fields** each occupy an indexed slot. The Watcher keeps provisioning pages as capacity runs low, so there is no fixed ceiling, but every extra page that a model's filterable fields span adds a join to queries that touch fields on it. Make a field filterable only when you filter or sort on it. See [Slots and pages](/concepts/slots-and-pages#spread-why-fewer-pages-means-fewer-joins).

A string value written to an indexed slot may be at most 4 096 characters.
