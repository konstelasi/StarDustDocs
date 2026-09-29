# Security

## Tenant isolation guarantees

Every query StarDust builds carries the tenant id on every `WHERE` and `JOIN` clause it generates — reads, writes, filters, exports, schema introspection, all of it. One tenant's data isn't merely filtered out of another's results at the application layer; it's unreachable at the SQL level, because no query the engine constructs can select across the tenant boundary even by accident. This holds across every entry point, including the ones that look up a record by id: `get()`, `getExportJob()`, `getImportJob()` and friends all return `null` for another tenant's row rather than the row itself, and deliberately make that indistinguishable from the id simply not existing.

That guarantee is what StarDust builds; it isn't a substitute for resolving the right tenant id in the first place. The engine trusts the `tenantId` you pass it completely — nothing here authenticates a caller or checks that the request actually belongs to that tenant. Resolving the correct tenant id from an authenticated session, and never accepting one directly from client input, is entirely your application's responsibility. See [Integrating with your application](/usage/integrating#resolving-the-tenant-id).

## Accepting untrusted filters

If your application accepts QueryFilter JSON from a browser or an external API client — the common case for a search endpoint — that JSON is decoded and validated before any SQL runs, and the decoder enforces fixed structural limits regardless of what your own code does:

| Limit | Default |
| :-- | :-- |
| Nesting depth | 8 |
| Total nodes in the tree | 256 |
| Arguments per logical node (`and` / `or`) | 64 |
| Elements in an `in` / `not_in` set | 1,024 |
| String value length | 4,096 characters |
| Total payload size | 64 KiB |

A filter exceeding any of these is rejected before it reaches the database, with a machine-readable error code and a pointer to the offending part of the request — not run as a degraded or partial query. This is what makes it safe to hand a filter straight from an HTTP request body to `search()`: a client can't construct a payload that forces a pathologically deep or wide query, and a client can't reference a field it isn't allowed to filter on, since an unknown or non-filterable field is rejected at the same pre-flight step. See [The QueryFilter wire format](/usage/query-filter#limits) for the full limit set and how to tune it, and [Errors](/reference/errors#handling-wire-format-rejections) for handling the rejection.

None of this is a substitute for checking that the tenant id and model id in the request belong to the authenticated caller — the filter limits protect the database from a malformed or oversized query, not from a caller reading data they shouldn't see.

## Database privileges

The application process serving requests and the daemon processes running maintenance don't need the same grants, and giving the request-serving process only what it needs is worth doing deliberately rather than by accident.

### Application user

The process handling `write()`, `read()`, `search()`, `updateEntry()`, `deleteEntry()` and friends never creates or alters a table — reserving a slot picks from ones the Watcher has already provisioned, it never provisions one itself. This process needs only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the database StarDust manages. It's the process most likely to be driven by untrusted input (a search filter from a client, say), so keeping its grants to data manipulation only limits what a bug or an injection in surrounding application code could do even in the worst case.

### Daemon user

`bootstrap()` and the Watcher both issue DDL — creating the initial schema and later extension pages — so whichever identity runs `bin/stardust bootstrap` and `bin/stardust watcher` needs `CREATE`, `ALTER`, and `INDEX` in addition to the DML privileges above. The Reconciler, Liberator, and Chronicler never create or alter a table, only read and write rows, so they can run under a narrower identity if you want to split it further. Nothing in the schema runner ever drops a table or an index — bootstrapping is non-destructive by design — so **`DROP` is never required for any of these processes**, and withholding it costs you nothing.

## Artifact file permissions

Async bulk-ingest payloads and export files live on the local filesystem under `Config::$artifactDir`, outside any web-servable path — see [Deployment](/operations/deployment#artifact-storage). The daemon processes that write there (the Chronicler for exports, the process submitting an async import) need read-write access to that directory; the process serving a completed export's download to a caller needs at least read access to it. Beyond directory placement and filesystem permissions, StarDust does nothing to gate access to an artifact once its path is known — the export job's status API is the only thing standing between a tenant id and a completed file's path, so treat `getExportJob()`'s tenant check as the actual access boundary and never let a client supply an artifact path directly.
