# Liberator

## What it does

The Liberator reclaims slots after a field is demoted or deleted. A slot that's lost its field isn't handed straight to the next field waiting for one — its old values are still physically sitting in the column, and handing it over as-is would let the new field's filters match data nobody ever wrote to it. The Liberator clears those values out in bounded chunks and only then returns the slot to the free pool.

Between "the field is gone" and "the slot is reusable" the slot sits **tombstoned**. Reads, writes and filters already behave as if the field never existed the moment it's demoted or deleted; the Liberator's job is purely storage hygiene that happens after the fact.

## How a slot is reclaimed

Each cycle, the Liberator looks for tombstoned slots and walks each one's extension page in bounded chunks: select a range of entry ids, null out the slot column for those rows, advance a cursor, commit. This repeats until the whole page has been walked. Only on the final chunk — once the column is confirmed completely nullified — does the slot flip from `tombstoned` back to `free`, in the same transaction that advances the cursor one last time.

That ordering is the whole safety property: a slot never becomes reusable while it might still hold a previous occupant's values. A recycled slot handed to a new field is guaranteed empty, not just probably empty.

## Sweep gaps

Sustained lock contention on a chunk — another process repeatedly holding a conflicting lock on the same rows — is handled with a bounded number of retries. If a chunk keeps deadlocking past that budget, the Liberator takes a **gap**: it skips that chunk for this cycle rather than retrying forever, and increments a per-slot gap counter you can read back from the registry.

A slot that took a gap does **not** get reclaimed on this pass, even once the rest of its page has been walked — the sweep rewinds to the point of the earliest gap and leaves the slot tombstoned for a later cycle to re-walk. This is deliberate: reclaiming with an unswept chunk still populated would violate the guarantee above, so a contended slot stays squatted (unavailable for reuse) rather than risk leaking stale data into whatever field claims it next. Squatting is visible — a growing gap count, or a slot's tombstoned age climbing past a cycle or two — and self-heals once the contention that caused it clears, so watch those signals rather than treating a single gap as an emergency.

## Running multiple workers

The Liberator has no singleton lock. Run as many processes as you want reclamation throughput:

```bash
bin/stardust liberator
```

Exclusion happens per extension page rather than per process, so two workers never touch the same page's tombstoned slots concurrently — one worker's claim on a page leaves every other page free for the rest to sweep. The real throughput ceiling is therefore the number of distinct pages currently holding tombstoned slots, not the worker count: running more Liberators than you have contended pages buys you nothing extra that cycle, but costs nothing either.
