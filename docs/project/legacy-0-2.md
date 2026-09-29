# The 0.2.x line

Before `0.3.0`, StarDust was a CodeIgniter 4 library built on **Virtual Columns** — a different indexing approach, under a different name, with a different public API. It has been removed from the current repository and shares no code, schema or API with the engine documented on the rest of this site. If you're looking at StarDust for the first time, none of this page applies to you — skip it.

## What changed in 0.3

`0.3.0-alpha.1` is a ground-up rewrite, not an upgrade. The motivation was scalability limits and out-of-memory failures the old Virtual Column design ran into under real load, and fixing that meant an architecture change too fundamental to ship as a migration path. Concretely:

- **No framework dependency.** The 0.2.x line was a CodeIgniter 4 library. StarDust is now a framework-neutral Composer package with no runtime dependency beyond `psr/log` and `psr/clock` — CodeIgniter 4 support, if it returns, would be an opt-in companion package rather than a requirement.
- **A different storage model.** Entries, models and fields are stored in a different schema under different table names. Nothing in a 0.2.x database is compatible with 0.3's tables, and nothing in 0.3 reads a 0.2.x table.
- **A different public API.** Every class, method and configuration option in 0.3 is new. Code written against 0.2.x's manager and builder classes does not compile against 0.3, let alone run correctly.

There is no automated migration between the two, and none is planned — the storage models are different enough that a generic converter would need to make judgment calls specific to your own data.

## Staying on 0.2.x

The 0.2.x releases remain installable from their own tags on Packagist and aren't being pulled from anywhere:

```bash
composer require damarbob/stardust:^0.2.0-alpha
```

They receive no further development — no new features, and no bug fixes beyond what's already tagged. If you're currently on 0.2.x and evaluating whether to move, treat `0.3.0` as a new dependency you're adopting rather than a version bump: read [Is StarDust a fit?](/guide/is-it-a-fit) and [What is StarDust?](/guide/what-is-stardust) as if you'd never used the earlier line, because architecturally you haven't.
