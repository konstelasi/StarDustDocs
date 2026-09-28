# The QueryFilter wire format

QueryFilter is the JSON format for filters, so a filter can travel from a browser or an API client and be validated before it reaches your database. This page is the reference for the document shape, the operators, value types, limits and error codes. To use it in code, see [Searching](/usage/searching#accepting-filters-as-json).

## Document shape

A document is a JSON object with an optional `version` and an optional `filter`:

```json
{
  "version": "1",
  "filter": {
    "op": "and",
    "args": [
      { "op": "eq", "field": { "model": "invoice", "name": "status" }, "value": "paid" },
      { "op": "gt", "field": { "model": "invoice", "name": "amount" }, "value": 100 },
      { "op": "is_not_null", "field": { "model": "invoice", "name": "due_date" } }
    ]
  }
}
```

- **`version`** is the string `"1"`. It may be omitted, and any other value is rejected with `version_unsupported`.
- **`filter`** is a single node. **Omit the key entirely to match everything.** An explicit `"filter": null` is rejected, and so is a `filter` that is not an object.
- A **field reference** is `{ "model": ..., "name": ... }`. Both keys are required non-empty strings. The search runs against the model in the request, and the field is looked up on it.
- The JSON Schema rejects unknown keys on a node. The decoder ignores them, which is one of the two places the two differ. See [JSON Schema](#json-schema).

## Logical nodes: and, or, not

| Node | Shape | Meaning |
| :-- | :-- | :-- |
| `and` | `{ "op": "and", "args": [ ... ] }` | Every child must match. |
| `or` | `{ "op": "or", "args": [ ... ] }` | At least one child must match. |
| `not` | `{ "op": "not", "arg": { ... } }` | The child must not match. It takes a single `arg`, not `args`. |

`and` and `or` need at least one child and at most 64. Nodes nest to any depth within the [limits](#limits). A pure AND tree runs as indexed joins. A tree containing `or` or `not` switches execution shape automatically.

## Operators

Twelve operators make up the format. It is a closed set: an unknown `op` is rejected with `operator_unknown`.

### Equality and comparison

| Operator | Value | Meaning |
| :-- | :-- | :-- |
| `eq` | one scalar | Equal to. |
| `neq` | one scalar | Not equal to. |
| `lt` | one scalar | Less than. |
| `lte` | one scalar | Less than or equal to. |
| `gt` | one scalar | Greater than. |
| `gte` | one scalar | Greater than or equal to. |

A scalar is a string, a number or a boolean. Sending an array where a scalar is expected is a `node_malformed` error.

### Ranges and sets

| Operator | Value | Meaning |
| :-- | :-- | :-- |
| `between` | array of exactly two scalars | Within the range, inclusive at both ends. |
| `in` | non-empty array of scalars | Equal to any listed value. |
| `nin` | non-empty array of scalars | Equal to none of the listed values. |

`in` and `nin` accept up to 1 024 elements, and duplicates are removed when the document is decoded.

### Anchored prefix

| Operator | Value | Meaning |
| :-- | :-- | :-- |
| `prefix` | non-empty string | Starts with the given text. |

`prefix` is anchored at the start, so it can use the index. There is no substring, suffix or fuzzy operator. An empty prefix is rejected with `value_out_of_bounds`: to match everything, omit the filter instead.

### Null checks

| Operator | Value | Meaning |
| :-- | :-- | :-- |
| `is_null` | none | The field has no value. |
| `is_not_null` | none | The field has a value. |

These two must **not** carry a `value` key, or the node is rejected with `value_unexpected`. Every other operator requires one.

## Value types

A value must fit the declared type of the field it is compared with:

| Declared type | Accepts |
| :-- | :-- |
| `string` | A string of up to 4 096 characters. |
| `int` | A whole number within the signed 64-bit range. |
| `numeric` | A finite number. |
| `datetime` | An RFC 3339 string with an explicit UTC offset. |

A value that does not fit is rejected with `value_type_mismatch`, or `value_out_of_bounds` when it is the right type but outside a bound.

### Datetimes need an explicit offset

A `datetime` value must carry an explicit UTC offset, either a trailing `Z` or `±HH:MM`. A naive `2026-01-01T10:00:00` is rejected with `value_type_mismatch`, because a stored datetime is always UTC and guessing which zone the caller meant is not the engine's job.

The offset you send is then **applied**: the engine converts the bound to the instant it names before matching. Filtering `2026-01-01T10:00:00+07:00` finds an entry written as that same instant, whatever offset either was expressed in. Fractional seconds are accepted and honoured when comparing, though the stored value has whole-second precision.

## Limits

The decoder enforces these bounds, before anything touches the database. They are the defaults of `Config::$queryFilterLimits`, and you can tighten or relax each independently:

| Limit | Default |
| :-- | :-- |
| Maximum nesting depth | 8 |
| Maximum total nodes | 256 |
| Maximum children of one `and` / `or` | 64 |
| Maximum elements in an `in` / `nin` array | 1 024 |
| Maximum string length | 4 096 characters |
| Maximum document size | 64 KiB |

If you accept filters from untrusted clients, consider lowering them. See [Security](/operations/security#accepting-untrusted-filters).

## Error codes

The format has a closed set of thirteen error codes. The decoder produces the first nine, and the pre-flight checks that run afterwards produce the rest.

| Code | Raised when |
| :-- | :-- |
| `envelope_malformed` | The document is not valid JSON, or the root or `filter` is not a JSON object. |
| `node_malformed` | A node is missing a required key (`op`, `field`, `value`, `arg`, `args`) or a key has the wrong shape. |
| `operator_unknown` | `op` is not one of the operators above or `and` / `or` / `not`. |
| `value_count_mismatch` | An `and` / `or` has no children, an `in` / `nin` array is empty, or `between` does not have exactly two elements. |
| `value_unexpected` | `is_null` or `is_not_null` carries a `value`. |
| `value_out_of_bounds` | A size limit is exceeded (string length, array length, children count, document size), or a `prefix` is empty. |
| `nesting_too_deep` | The tree is deeper than the depth limit. |
| `node_count_exceeded` | The tree has more nodes than the node limit. |
| `version_unsupported` | `version` is not `"1"`. |
| `field_unknown` | A field is not registered on the model. |
| `field_not_filterable` | A field exists but is not filterable. |
| `capability_unsupported` | The active driver does not support an operator or a field. |
| `value_type_mismatch` | A value does not fit the field's declared type. |

Every rejection carries an RFC 6901 JSON Pointer to the offending node. Two of the pre-flight codes, `field_unknown` and `field_not_filterable`, surface as `UnknownFieldException` and `FieldNotFilterableException` rather than as `QueryFilterValidationException`. [Searching](/usage/searching#returning-rejections-to-your-api-clients) shows how to turn all of them into an HTTP 400.

## JSON Schema

The format also ships as a normative JSON Schema (draft 2020-12), for validating filters on the client or in any language. It is included in the package at `schemas/queryfilter.schema.json`.

The schema checks structure only. Whether a field exists or a value fits its type depends on your registry, so that is decided at run time. The schema and the decoder agree on what is and is not a valid document, apart from two documented asymmetries: the schema rejects unknown keys on a node where the decoder ignores them, and the decoder's array de-duplication and its depth, node-count and document-size limits have no schema equivalent.
