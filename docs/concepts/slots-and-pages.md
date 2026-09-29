# Slots and pages

Slots are the engine's finite resource, and most capacity planning in StarDust is really slot planning. This page explains what they are, how they move through their lifecycle, and why a model's slots can end up scattered.

## Extension pages

An <Term id="extension-page">extension page</Term> is a side table named `entry_slots_page_1`, `entry_slots_page_2` and so on. It holds the indexed slot columns that mirror filterable field values, and each row lines up one-to-one with a row in `entry_data`.

A page is created with a fixed set of indexed columns and **can never be altered afterwards**. That immutability is what makes provisioning safe on a live database: adding a page never locks or rebuilds an existing table. It is also why capacity is planned in advance rather than exactly on demand, as described under [Page capacity and index headroom](#page-capacity-and-index-headroom).

New pages are provisioned by the [Watcher](/operations/watcher). Every column on a page is indexed with its own composite index led by the tenant id, so a query for one tenant reads only that tenant's slice of the index.

## Slot columns and their families

A <Term id="slot">slot</Term> is one typed, indexed column on an extension page that mirrors one filterable field's value. Slots come in four families that match the [declared types](/concepts/tenants-models-fields#the-four-slot-families): string, integer, numeric and datetime. A field can only occupy a slot of its own family.

You rarely need to name a slot column. They are named by family and position, such as `i_str_01` or `i_int_02`, and the engine assigns them. You meet the names only when you provision a page by hand in a seed script or test.

## A slot's lifecycle

Every slot is in exactly one of five states:

| State | Meaning |
| :-- | :-- |
| `free` | Empty and available to be claimed by a field. Always verified empty. |
| `assigned` | Claimed by a field and live. |
| `backfilling` | Claimed, and being filled from values already stored in payloads. Not yet usable for filters. |
| `ready` | The backfill finished. Usable for filters and sorts. |
| `tombstoned` | Its field is gone, but the old values are still physically in the column. |

### Free, assigned, backfilling, ready

A field that becomes filterable claims a free slot of its family. If the field already has entries, the slot goes through `backfilling` while the [Reconciler](/operations/reconciler) copies the existing values across, then flips to `ready`. New writes go into the slot throughout, so nothing written during the backfill is missed.

Reservation is atomic, and each field holds at most one live slot at a time. The engine keeps a model's filterable fields together on as few pages as it can.

### Tombstoned and reclaimed

When a field is [demoted](/schema-changes/filterability), [deleted](/schema-changes/deleting-fields) or [retyped](/schema-changes/retype), its old slot is **tombstoned**. It is not handed straight to the next field, because handing over a column that still holds the previous occupant's values would let the new field's filters match data nobody ever wrote to it.

The [Liberator](/operations/liberator) clears the column in bounded chunks and only then marks the slot free again. A slot marked `free` is therefore always verified empty.

## Page capacity and index headroom

A page carries exactly the columns it indexes, and its capacity is whatever it was created with. Because pages cannot be widened, a page created with only enough columns for today's demand would fill straight away. Three fields promoted one after another could each trigger a fresh page and end up on three of them.

<Term id="index-headroom">Index headroom</Term> prevents that. Every new page is created with spare indexed columns in each family. The setting is `Config::$pageIndexHeadroom` and defaults to four per family, so a fresh page carries up to sixteen indexed columns. It takes effect in whichever process runs the Watcher (see [Settings and the bundled daemons](/usage/configuration#settings-and-the-bundled-daemons)). The next few promotions then land together on the same page.

- Headroom is fixed at the moment a page is created. Raising the setting affects only pages created afterwards.
- The Watcher provisions a new page when free capacity drops below its threshold (20% by default) or when a filterable field is waiting for a slot that does not exist yet.

If capacity runs out before the Watcher catches up, writes still succeed. See [Writes never fail for lack of a slot](/concepts/filterable-vs-indexed#writes-never-fail-for-lack-of-a-slot). To tune headroom, see [Tuning](/operations/tuning#index-headroom).

## Spread: why fewer pages means fewer joins

<Term id="spread">Spread</Term> is how many extension pages a single model's filterable slots are scattered across. It matters because every extra page a filtered query touches costs another join.

Spread is not a bug. It is the natural consequence of pages being immutable and slots being handed out from whichever page has room, and a model that grew field by field over a year can easily end up spread across several pages.

The engine measures it as **excess pages**: the pages a model actually occupies, minus the fewest it could fit on. The measurement is advisory and never changes anything on its own. To act on it you run <Term id="compaction">compaction</Term>, which relocates a model's filterable fields onto the fewest pages that can hold them, one field at a time. It is deliberate and operator-initiated, because it needs a running Reconciler and briefly makes one field unfilterable while it moves.

The reports and the compaction command are covered in [Slot maintenance](/operations/slot-maintenance).
