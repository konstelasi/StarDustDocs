# Architecture at a glance

StarDust is a PHP library plus four small background processes, all sitting on top of the MySQL or MariaDB database you already run. There is no search cluster, no message broker and no separate service to deploy. The design has a name, <Term id="vertical-schema-partitioning">vertical schema partitioning</Term>: each entry is split across a complete JSON payload used for storage and a set of typed, indexed columns used for querying.

If a term on this page is new, the [glossary](/reference/glossary) defines every one in plain language, and its opening section, [How the pieces fit](/reference/glossary#how-the-pieces-fit), threads the core terms together in one pass.

## The system of record

Every entry's full payload is stored as JSON in a table called `entry_data`. This is the <Term id="system-of-record">system of record</Term>: it always holds the complete entry, every field whether filterable or not, and nothing else in the engine is allowed to disagree with it.

That alone would give you a document store you cannot query efficiently, which is where the second half of the design comes in.

## Extension pages and slot columns

Any field you mark <Term id="filterable">filterable</Term> is also mirrored into a typed, indexed column, called a <Term id="slot">slot</Term>, on an <Term id="extension-page">extension page</Term>. An extension page is a side table (`entry_slots_page_1`, `entry_slots_page_2`, and so on) joined one-to-one to `entry_data`. A filter on that field reads a real B-tree index instead of scanning JSON.

```text
                       write(EntryPayload)
                                │
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  entry_data            (system of record — full payload)    │
   │  id │ tenant_id │ model_id │ fields (JSON)                  │
   │   7 │     1     │    42    │ {"name":"Acme","employees":340,│
   │     │           │          │  "city":"Berlin"}              │
   └─────────────────────────────────────────────────────────────┘
                                │  mirror the filterable fields
                                │  into typed slot columns
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  entry_slots_page_1    (indexed 1:1 extension page)         │
   │  entry_id │ i_str_01 │ i_int_01 │ …  (typed slot columns)   │
   │     7     │  "Acme"  │   340    │                           │
   │           │ (name)   │(employees)                           │
   └─────────────────────────────────────────────────────────────┘
        ▲ composite index (tenant_id, i_str_01), (tenant_id, i_int_01), …

   "city" was never made filterable, so it never occupies a slot
   column. It lives in JSON only: still readable, just not indexed.
```

Two consequences of this split are worth holding on to:

- **Non-filterable fields are free.** They cost no slot and no index maintenance. Make a field filterable only when you actually need to filter or sort on it.
- **A slot can be rebuilt at any time.** Because the payload is authoritative, the engine is free to null out, relocate or refill a slot without any risk to your data. A failed conversion or an empty slot changes what is *queryable*, never what is *stored*.

A page is created with a fixed set of indexed columns and is never altered afterwards. See [Slots and pages](/concepts/slots-and-pages) for how capacity is managed.

## The schema registry

The engine keeps its own bookkeeping in a set of `stardust_`-prefixed tables: which models and fields exist, which pages exist, and which field currently holds which slot. This is the <Term id="schema-registry">schema registry</Term>. You create it once with `bootstrap` and read it through the introspection API ([`listModels()` and `describeModel()`](/usage/defining-schema)), not by querying the tables.

The registry carries a single <Term id="schema-version">schema version</Term> counter that is bumped whenever coordination-relevant state changes. The read path caches schema lookups and uses the counter to know when its cache is stale, so a live schema change is picked up without restarting your application.

## Four background daemons

Four long-lived processes keep the slot machinery healthy. All of them launch through `bin/stardust`:

```text
        ┌──────────── MySQL — sole coordination point ──────────────┐
        │   entry_data · entry_slots_page_N · stardust_* registry   │
        └───────────────────────────────────────────────────────────┘
             ▲             ▲              ▲                ▲
   provisions│     drains  │    reclaims  │      streams   │
   capacity  │     queues  │    freed     │      exports   │
             │             │    slots     │                │
      ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
      │ Watcher  │  │ Reconciler │  │ Liberator  │  │ Chronicler │
      │ singleton│  │multi-worker│  │multi-worker│  │multi-worker│
      └──────────┘  └────────────┘  └────────────┘  └────────────┘
```

| Daemon | What it does | How many |
| :-- | :-- | :-- |
| [Watcher](/operations/watcher) | Adds indexed pages when capacity is low or when a filterable field is waiting for a slot. | Exactly one |
| [Reconciler](/operations/reconciler) | Does the catching up: drains the sync queue and async imports, and finishes retypes, renames and deletions. | As many as you like |
| [Liberator](/operations/liberator) | Clears the values out of slots that are no longer used, then returns them to the free pool. | As many as you like |
| [Chronicler](/operations/chronicler) | Turns export jobs into CSV or JSON files. | As many as you like |

If your host cannot keep long-lived processes running, `bin/stardust tick` runs one bounded pass of the Watcher, Liberator and Reconciler from a cron line instead. See [Deployment](/operations/deployment).

## The database is the only coordination point

The daemons never talk to each other, and there is no message bus. Everything they need to agree on lives in the database, so:

- any daemon can crash and restart without losing state;
- you can run several workers of the multi-worker daemons and they divide the work without stepping on each other;
- the only infrastructure StarDust needs beyond your application is the database you already have.

## Following one write through the system

Here is what happens when you call `write()` for an entry whose model has two filterable fields:

1. **Validation.** The tenant id is checked (it must be 1 or higher) and the model's fields are resolved from the registry.
2. **One transaction.** The complete payload is inserted into `entry_data`. For each filterable field that has a live slot, its value is upserted into the matching extension-page row, one statement per page. Non-filterable fields are not mirrored at all.
3. **If a filterable field has no slot yet,** its value still lands in the payload, the entry is added to a small <Term id="sync-queue">sync queue</Term> in the same transaction, and the call succeeds. `EntryWriteResult::$enqueuedForBackfill` tells you this happened. This is the [exhaustion fallback](/concepts/filterable-vs-indexed#writes-never-fail-for-lack-of-a-slot).
4. **The call returns.** The entry is immediately readable and, for fields with a slot, immediately filterable.

Later, in the background, the Watcher provisions a page with room for the missing slot and the Reconciler drains the sync queue, filling in the slot values. After that the entry is filterable on every field. Nothing you did in between needed to change.

The same shape repeats for every operation that cannot finish inside one request: the call commits what it can, returns, and a daemon finishes the rest. [Background work and eventual consistency](/concepts/background-work) lays out which operations work this way.
