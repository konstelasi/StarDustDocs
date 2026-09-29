# Versioning and stability

## Pre-release status

The current release is `0.3.0-alpha.1` — the first published version of a ground-up rewrite, and an alpha in the sense that actually matters: the public API may still change before `0.3.0` ships as a stable release. Install it with the `@alpha` flag —

```bash
composer require damarbob/stardust:^0.3@alpha
```

— since Composer only resolves stable versions by default and a bare `composer require damarbob/stardust` won't find anything to install yet. The flag applies to this one package; the rest of your dependencies stay on whatever stability you already require.

Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once the project reaches `1.0.0`. Before then, treat each alpha release on its own merits rather than assuming an alpha-to-alpha bump is automatically safe — check [the Changelog](/project/changelog) for what changed.

## What counts as public API

Covered by semantic versioning, once StarDust reaches `1.0`:

- Every method on `StarDust` — see [StarDust API](/reference/api).
- The DTOs, value objects and enums those methods accept and return — see [Types](/reference/types).
- The JSON QueryFilter wire format and its JSON Schema — see [The QueryFilter wire format](/usage/query-filter).
- The `bin/stardust` CLI commands and their flags — see [CLI reference](/reference/cli).

Everything else is an implementation detail, even where it's visible from outside the engine. That includes the exact tables and columns StarDust creates in your database (see [Tables in your database](/reference/database-tables)), the internal classes behind any of the factories above, and any structure inside a stored payload beyond the field values you put there yourself. Any of these can change between releases without it counting as a breaking change to the public API.

## How breaking changes are announced

Every release's changes are recorded in [the Changelog](/project/changelog) under Keep a Changelog headings — Added, Changed, Removed, Known limitations. A change to the public API as defined above that breaks existing code is called out under Changed, and, before `1.0`, is published as its own version bump even between two alpha releases rather than folded silently into the next one.

One interface gained a new required method during the `0.3.0` development cycle: a custom search driver written against an earlier snapshot of `EntrySearchInterface` would need to add `supportsSortOn()` to keep implementing it. That's the one breaking change made anywhere in the `0.3.0-alpha.1` build, and it was made deliberately while no tagged release yet existed — so no third-party driver could actually be broken by it. It's also the shape of change you shouldn't expect again inside an already-tagged release: once a version is tagged, a change like that ships as a new release, with the addition called out in the Changelog rather than landing invisibly underneath you.
