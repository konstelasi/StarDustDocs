# Upgrading

## Before you upgrade

Read the [changelog](/project/changelog) entry for the version you're moving to before you deploy it — a breaking change to a public interface, when one ships, is called out there rather than buried in a diff. Because StarDust is still pre-1.0, see [Versioning and stability](/project/versioning) for what "breaking" means at this stage and how much can still move between releases.

Two things are safe to assume regardless of version: `bootstrap()` never drops or rewrites anything, so re-running it as part of a deploy is always safe (see below), and an existing extension page is never altered once created, so nothing about upgrading rewrites data already on disk.

## Re-running bootstrap

Run `bootstrap()` (or `bin/stardust bootstrap`) as a normal step in every deploy, upgrade or not. It's idempotent: on an already-bootstrapped database it checks what exists and adds only what's missing, changing nothing about existing tables, columns or data. A version that introduces a new table or a new column on an existing one ships that addition as a new, additive migration step — never a rewrite of an existing one — so running bootstrap after upgrading your code is how that new structure gets created.

## Stopping daemons during a deploy

Most upgrades need no downtime at all: stop nothing, deploy, run bootstrap, and let the daemons pick up the new code on their next restart. The one exception is a version whose changelog calls out a coordination-scheme change — StarDust's advisory locks are named per installation, and a version that changes how that name is derived means locks minted under the old scheme and the new one don't recognize each other. Deploying that kind of change while daemons are running risks two processes that should be mutually exclusive running at once, briefly, until every process is on the new code.

When a changelog entry calls this out, stop your persistent daemons (or pause your `tick` cron line) before deploying, then restart them once the new code is live — on a cron schedule, that costs one skipped run. Most versions carry no such note, and for those, deploying with daemons running is the normal path.

## Existing pages are never rewritten

An extension page keeps the shape it was created with for as long as it exists — its set of indexed columns, its collation, everything about its DDL is fixed at creation and never touched again, by any later version. This is what makes provisioning safe to run against a live database in the first place: a newer version of StarDust may provision pages differently going forward, but it never reaches back and rewrites yesterday's.

The practical consequence is that a long-lived database can genuinely hold pages of more than one shape at once, created under different versions — and that's expected, not a sign anything went wrong. Nothing about reading, writing, or filtering cares which shape a given page has; the engine reads what a page actually offers rather than assuming a fixed layout.

## Version-specific notes

**0.3.0-alpha.1** is the first release of the 0.3 line and the current version — there's no upgrade path from 0.2.x. The two lines share nothing: different schema, different public API, a ground-up rewrite rather than an incremental change. If you're still on a 0.2.x release, see [The 0.2.x line](/project/legacy-0-2) — 0.2.x remains installable from its own tags for as long as you need it, but moving to 0.3 means starting fresh rather than migrating data in place.

This section will carry a note for each release that needs one, in order, as the 0.3 line grows past its first version.
