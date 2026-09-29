# Chronicler

## What it does

The Chronicler turns submitted export jobs into CSV or JSON files. It claims a pending job, pages through the model's entries using the same bounded read the synchronous API uses, streams rows to disk as it goes, and marks the job completed with an artifact path you can serve to whoever asked for the export. See [Exports](/usage/exports) for submitting a job and polling its status.

## Claiming and resuming jobs

Each tick claims one job — pending jobs first, round-robin across tenants so a single tenant with many exports queued can't starve everyone else, then jobs abandoned by a worker whose heartbeat has lapsed. On a re-claim, the Chronicler doesn't necessarily start over: it tries to resume the previous worker's partial artifact in place, re-opening the file and verifying it genuinely holds the bytes the job's stored progress claims before continuing to write from there.

That verification is what makes resumption safe rather than a gamble. If the file is missing, shorter than expected, its header no longer matches the current field set, or another process still has it open, the Chronicler abandons it and starts a brand-new artifact from scratch instead of risking corrupted or skipped rows. Either way — resumed or restarted — the artifact you eventually download is always complete and correct.

A `SIGTERM` to a running Chronicler process doesn't wait for the current job to finish: the worker yields at the next chunk boundary, the job returns to `pending` with its resume point intact, and whichever worker claims it next — this process restarting, or another already running — picks up from that exact byte offset.

Failures are bounded rather than left to retry forever: a chunk that keeps deadlocking gives up after a small retry budget and is skipped (the job keeps going, with the skip counted); a job that accumulates too many skips fails outright; a database connection that drops is retried on a short fixed backoff before the job fails; running out of disk mid-write, or an artifact that would exceed the size cap, each fail the job with a specific reason you can read back from its status. A job that fails outright has its partial artifact deleted immediately rather than waiting for cleanup.

## The disk-space gate

Before claiming any new job, the Chronicler checks two things: the free-space ratio on the artifact volume, and — because a per-account disk quota can leave a filesystem reporting itself mostly free while every write still fails — a small probe file it writes into the artifact directory and deletes again on the spot. If either check fails, new claims are declined and a warning is logged each tick; jobs already in progress are left to continue rather than being interrupted.

Two things the gate does **not** cover. It proves that its own small probe can be written, not that a multi-gigabyte export will actually fit — an export that outruns the remaining space during the write still ends up failing with a disk-full reason. And the gate only stops *new* claims; it doesn't pause a job already streaming to disk. See [Deployment](/operations/deployment#including-exports-in-a-tick) for the shared-hosting angle on this.

## Cleaning up old artifacts

A completed export's file isn't kept forever — the Chronicler deletes it once its time-to-live expires (24 hours by default), so treat the artifact path you got back as temporary and serve or move it promptly. Cleanup runs during idle ticks: a Chronicler that's continuously busy claiming and streaming jobs doesn't pause to garbage-collect, so if you run exports back-to-back around the clock, keep an eye on the artifact directory's size directly rather than assuming the TTL sweep has run recently.

Besides completed artifacts past their TTL, idle-tick cleanup also removes partial files left behind by jobs that failed outright and any leftover disk-space probe file from a worker that crashed mid-check.

## Running multiple workers

The Chronicler has no singleton lock. Run as many processes as you want export throughput:

```bash
bin/stardust chronicler
```

`SELECT … FOR UPDATE SKIP LOCKED` is the only coordination primitive — each worker claims a different job, so more workers means more exports processed in parallel and faster recovery of anything abandoned by a crashed one. There's no shared state between workers beyond the job rows themselves.
