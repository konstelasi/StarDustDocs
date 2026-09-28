# Is StarDust a fit?

StarDust makes deliberate trade-offs. This page lists who they suit and who they do not, so you find out before you build on it rather than after.

## A good fit if you…

- Need **user-defined or per-tenant dynamic fields** that are still filterable through native SQL indexes, without standing up a separate search cluster.
- Already run **MySQL 8.0.13+ (or Percona)**, or **MariaDB 10.11+**, either with persistent background processes (systemd, supervisor or containers) or with a scheduled `bin/stardust tick` on a host that cannot keep processes alive.
- Want a **framework-neutral** engine you can drop into any PHP application through Composer, with no ORM, query builder or framework pulled in.
- Can accept a newly defined or retyped filterable field becoming queryable **shortly after** the change rather than instantly.

## Probably not a fit if you…

- Are tied to **MariaDB older than 10.11 or MySQL older than 8.0.13**. Both are actively rejected. See [Requirements](/guide/requirements).
- Need **strong read-after-write consistency on filters immediately after a retype or a filterability promotion.** The field is served from the JSON payload, and cannot be filtered, until its backfill completes.
- Need **full-text, fuzzy or substring search** out of the box. The default driver offers exact match, comparison, range, set membership and *anchored* prefix matching, but no substring or suffix matching, no fuzzy matching and no relevance ranking. Those are a capability you would supply through a custom driver.
- Need **page numbers, jump-to-page navigation or a total result count.** Reads are cursor-paginated and forward-sequential. A driver backed by an external search service can maintain its own index and supply totals.
- Cannot run **any** scheduled or persistent process at all. StarDust's background work needs to run one way or another. See [Deployment](/operations/deployment).

## Trade-offs you accept

### Eventual consistency after schema changes

Promoting a field to filterable, retyping it, renaming it or deleting it returns immediately and finishes in the background. During that window reads keep working from the JSON payload, and writes keep being accepted, but a filter on the field in flight is rejected until the background pass is done. Plan your interface around it: gate filter controls on `isIndexed`, not `isFilterable`. See [Background work and eventual consistency](/concepts/background-work).

### No substring or fuzzy search by default

The built-in driver keeps every operator on an index, which is why the set is deliberately small: equality, comparison, ranges, `in` and `nin`, null checks and anchored prefix. `LIKE '%text%'`-style matching would force a scan, so it is not offered. If you need it, a custom [search driver](/extending/custom-search-drivers) can serve those queries from a search service, at the cost of keeping that index in sync yourself.

### Cursor pagination only

Every page hands you an opaque cursor for the next one, and no cursor means you have reached the end. There is deliberately no offset and no total count, because both require the database to read the entire matching set, and a query that is quick today would slow down purely because the tenant grew. Infinite scroll and a Next button work naturally. A Back button means holding on to the cursors you already used. "Page 7 of 214" and deep links to an arbitrary page cannot be served. See [Reading entries](/usage/reading-entries#cursor-pagination).

## Also worth knowing

- **This is an alpha.** The public API may change before 0.3.0. See [What is StarDust?](/guide/what-is-stardust#release-status).
- **One documented difference on MariaDB.** Range filters and field sorts order supplementary-plane Unicode characters, mostly emoji, at the opposite end from MySQL. Ordinary text in any language is unaffected.
