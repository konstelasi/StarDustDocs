# Runnable examples

The repository's `examples/` directory holds small, self-contained scripts that show StarDust behaviour a page of documentation cannot: things that happen **over time**, across more than one process. Each one seeds its own data, narrates what it is doing in the terminal, and deletes everything it created on the way out.

They are not a tutorial for the API. The [complete example](/guide/tutorial) is that, and [`docker/seed.php`](https://github.com/damarbob/StarDust/blob/main/docker/seed.php) is a copy-pasteable end-to-end script. The examples are for the parts that surprise people.

## Running an example

The scripts live in the repository, so clone it and install its dependencies:

```bash
git clone https://github.com/damarbob/StarDust.git
cd StarDust
composer install
```

They need a MySQL 8.0.13+ or MariaDB 10.11+ database. The quickest is the one from the repository's Compose file:

```bash
docker compose up mysql -d
```

Give the scripts the same three variables `bin/stardust` uses, either as exports:

```bash
export STARDUST_DSN='mysql:host=127.0.0.1;port=3307;dbname=stardust'
export STARDUST_USER=root
export STARDUST_PASS=root
```

or in a git-ignored `.env` file at the repository root, which the examples (but not StarDust itself) also read. Exports take precedence over the file. Then run one:

```bash
php examples/01-field-lifecycle.php
```

**Point them at a database of their own.** These scripts seed thousands of rows and call `deleteModel()`, which physically deletes entry rows with no undo. Do not aim them at a database you would miss.

The scripts run the daemons **in-process**, so you do not need to start any. That is a teaching device, not how you would deploy: in production the Watcher, Reconciler, Liberator and Chronicler are separate long-running processes. Pass `--observe` to tick nothing and watch your own daemons instead. That is the flag to reach for when something in your own application "didn't happen".

MariaDB 10.11+ works too, with the one documented difference in how supplementary-plane characters sort. See [Requirements](/guide/requirements#a-behavioural-difference-on-mariadb).

## Field lifecycle

```bash
php examples/01-field-lifecycle.php
```

**The question it answers:** you marked a field filterable, the call returned successfully, and filtering on it still throws. Why, and for how long?

This is comfortably the most common StarDust surprise. Marking a field filterable records an *intention* and commits in a few milliseconds. The work that makes filtering actually possible happens afterwards, in background processes, and until it finishes `describeModel()` reports `isFilterable: true` while every filter against the field is rejected. See [Filterable vs. indexed](/concepts/filterable-vs-indexed).

The script runs in two acts. In **Act 1** the promotion has been called and nothing is ticking, so the frame sits frozen. That is exactly what an installation with no daemons running looks like, indefinitely. In **Act 2** it starts ticking a Watcher and a Reconciler, and the same rows come alive: a page is provisioned, a slot is reserved, a cursor climbs through the existing rows, and the identical `read()` call stops throwing and starts returning.

```text
  1  YOUR CALL      $engine->promoteFieldToFilterable(1, 42);
                    returned 19s ago — and has been finished ever since.

  2  THE REGISTRY   describeModel() on 'sustainability' (int):
                      isFilterable  YES   <- the intent you recorded
                      isIndexed      no   <- whether a filter works NOW

  3  THE SLOT       entry_slots_page_1.i_int_01
                    free -> assigned -> backfilling -> ready
                                        ^^^^^^^^^^^

  4  THE BACKFILL   checkpoint retype_field_42 is running
                    [###############.........]  62%   cursor id 2,480
                    2,480 of 4,000 rows now carry a value in the slot

  5  CAN I FILTER?  read(filter: LeafNode::local('sustainability', 'gte', 80))
                    NO — FieldNotFilterableException
```

Two behaviours are worth knowing before you run it, because the script shows you one or the other and they look quite different:

- **If your database has no free indexed slot** of the right type, the promotion cannot reserve one either. The Watcher must provision a page first, and then the Reconciler reserves from it. Both daemons are needed.
- **If a free indexed slot already exists,** the promotion reserves it inside its own transaction and the Watcher is never involved. Only the row copy is deferred.

The first run against an empty database takes the first path, and a second run usually takes the second. The script says which one it took.

Note the exception in row 5. It is `FieldNotFilterableException` ("not filterable on the active driver"), even though row 2 reports the field as filterable. Row 2 is right: the field is filterable, and what it has not got yet is an indexed slot. The same exception covers both cases, so read `isIndexed` rather than the exception's message to know which one you are in.

### Flags

| Flag | Default | What it does |
| :-- | :-- | :-- |
| `--rows=N` | 4000 | Products to seed. |
| `--chunk=N` | 200 | Backfill rows per chunk. |
| `--stall=N` | 8 | Seconds to hold Act 1. |
| `--tick-ms=N` | 200 | Frame interval. |
| `--timeout=N` | 120 | Give up after N seconds. |
| `--tenant=N` | 1 | Tenant id. |
| `--observe` | off | Tick nothing and watch your own daemons. |
| `--keep` | off | Skip the cleanup that deletes the demo model. |
| `--no-colour` | off | Plain output. |

The backfill runs one chunk per frame, so `--rows` divided by `--chunk`, times `--tick-ms`, is roughly how long the middle states stay on screen. The chunk size is deliberately small so the copy is watchable. Production defaults would finish before the frame could redraw.

The live frame needs a terminal at least 38 rows tall. Anything shorter, or output that is piped or redirected, falls back to printing each state change as a line, with the same information. Set `NO_COLOR=1` or pass `--no-colour` to drop colour.

## Examples clean up after themselves

Every example creates its own uniquely named model, so re-running never collides with earlier runs and cleanup never touches your data. When a run finishes, the script deletes what it created: the demo model and its entries, and it ticks the Liberator until the slot it used has been reclaimed. Pass `--keep` to skip the cleanup and inspect the leftovers.

That makes them safe to re-run and safe to interrupt, on a database you do not mind writing to.
