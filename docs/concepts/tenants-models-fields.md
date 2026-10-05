# Tenants, models and fields

Three nouns describe the shape of your data. A <Term id="tenant">tenant</Term> is your isolation boundary, a <Term id="model">model</Term> is a named shape within a tenant, and a <Term id="field">field</Term> is one named attribute of a model. An <Term id="entry">entry</Term> is one record of a model. See [Entries and payloads](/concepts/entries-and-payloads) for what an entry physically is.

## Tenants and isolation

A tenant is whatever your application calls one customer, one workspace or one account. Every query the engine builds carries the tenant id on every `WHERE` and every `JOIN`, so one tenant's data is not merely filtered out of another tenant's results, it is unreachable at the SQL level.

What this means for you in practice:

- **Every API call takes a tenant id**, and it must be 1 or higher. It is validated at every entry point before any SQL runs.
- **Other tenants' data looks like nothing.** `get()` returns `null` for an entry that belongs to another tenant, and `describeModel()` returns `null` for another tenant's model. Both are deliberately indistinguishable from "does not exist".
- **The tenant id comes from you.** StarDust does not know who your users are. Resolve the tenant from your own authenticated session and never from client input. See [Integrating with your application](/usage/integrating#resolving-the-tenant-id).

## Models

A model is a named data shape within a tenant, roughly the equivalent of a table, except that you define it at runtime rather than in a migration. A model owns a set of fields, and every entry belongs to exactly one model.

- Model names are unique within a tenant.
- Registering a model is get-or-create: asking for a name that already exists returns its existing id. See [Defining models and fields](/usage/defining-schema).
- A model can be [renamed](/schema-changes/renaming) instantly and [deleted](/schema-changes/deleting-models) in the background. Deletion is irreversible.

## Fields and declared types

A field is one named attribute of a model. It has two properties that matter:

- a <Term id="declared-type">declared type</Term>, which decides how values are validated and which family of slot the field can occupy;
- a <Term id="filterable">filterable</Term> flag, which decides whether the field gets a slot at all. That flag is the entire difference between "stored and readable" and "stored, readable, and queryable through an index". See [Filterable vs. indexed](/concepts/filterable-vs-indexed).

Field names are unique within a model. Fields can be renamed, retyped, promoted, demoted and deleted while the system is live. See [Changing your schema](/schema-changes/).

### The four slot families

The declared type is one of four values, and each maps to a family of slot column:

| Declared type | Slot family | Notes |
| :-- | :-- | :-- |
| `string` | string | Values up to 4 096 characters. The index covers a prefix of each value, but matching is still exact. |
| `int` | integer | Signed 64-bit. |
| `numeric` | numeric | Finite numbers only. |
| `datetime` | datetime | Stored in UTC at whole-second precision. |

A field can only occupy a slot of its own family. That is why a [retype](/schema-changes/retype) needs a fresh slot in the new family rather than converting in place. Writing a value that cannot be coerced to the declared type raises `UncoercibleSlotValueException`. See [Writing entries](/usage/writing-entries#type-coercion).

## Names are labels, ids are identity

Everything inside the engine refers to a model or a field by its numeric id, not by its name. Entries, slots, filters and exports all key on the id. That has two consequences you will notice:

- **Renaming a model is instant**, because nothing resolves a model by its name. There is no background work and no window.
- **Renaming a field is not**, because each entry's JSON payload is keyed by the field's name. A field rename rewrites every entry in the model in the background, and the engine bridges the gap so reads, writes and filters on the new name keep working. See [Renaming fields and models](/schema-changes/renaming).

Keep the ids you get back from `createModel()` and `describeModel()` rather than looking things up by name each time. The one place names are used as a key is get-or-create registration, which is why a setup script still using an old model name creates a second model after a rename. [Defining models and fields](/usage/defining-schema#setup-scripts-are-safe-to-re-run) covers that.
