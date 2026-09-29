# Reconciler

## What it does

The Reconciler is the daemon that closes every backfill window StarDust opens. Making a field filterable, retyping it, renaming it, deleting it, deleting a model, and processing an entry that landed in the queue because no slot was free — all of these return immediately and finish in the background. Almost nothing in StarDust converges without a running Reconciler; see [Background work and eventual consistency](/concepts/background-work) for what stays open until it does.

Each tick generates one correlation id for the round and works through six kinds of deferred work in a fixed order, in bounded chunks, so it never holds a lock long enough to affect a live request.

## Its six kinds of work

In the order each tick visits them:

1. **The sync queue** — entries whose indexed mirroring was deferred because no slot was free when they were written (an [exhaustion fallback](/concepts/filterable-vs-indexed)). The Reconciler backfills the slot from the stored payload.
2. **Import jobs** — batches submitted through `submitBulkWrite()`. The Reconciler ingests them chunk by chunk and records per-chunk progress, so a crashed worker resumes from the last committed chunk rather than starting over.
3. **Retype backfills** — converting a field's existing values into a freshly reserved slot of its new type.
4. **Rename backfills** — rewriting every entry in a model after a field rename, moving stored values from the old key to the new one.
5. **Field deletion purges** — erasing a deleted field's values from stored payloads.
6. **Model deletion purges** — erasing every entry belonging to a deleted model.

The order is fixed and observable in the event stream: a tick always visits these six in the same sequence, and each visits at most one bounded chunk before moving to the next. A work source with nothing to do is skipped in a fraction of a millisecond; one with a full queue gets its turn again on the very next tick.

## Running multiple workers

The Reconciler has no singleton lock. Run as many processes as your backlog needs:

```bash
bin/stardust reconciler
```

Each worker claims its chunk with `SELECT … FOR UPDATE SKIP LOCKED`, so workers never claim the same rows — they simply divide whatever is claimable. There's no coordination cost beyond the ordinary lock waits any concurrent writer to the same tables would see. If a worker dies mid-chunk, the chunk's transaction rolls back and the rows it held stay claimable for whichever worker picks them up next; nothing is lost or double-processed.

## The dead-letter queue

Not every row can be reconciled. A row that references entry data that's gone missing, or whose stored value can no longer be coerced to its field's type, is parked in the dead-letter queue instead of being retried forever. This is deliberate: a genuinely bad row would otherwise wedge the whole queue behind it, blocking every entry that arrives after it.

Nothing in the dead-letter queue is retried automatically, and nothing expires on its own — it's a queue you're expected to look at. A row landing here usually means either the underlying data problem needs fixing by hand, or it's evidence of something worth investigating (a coercion rule that doesn't fit your data, for instance).

### Replaying failed rows

Once you've addressed the underlying cause, replay rows back into the work queue:

```bash
bin/stardust reconciler:dlq:replay --id=42
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

Replay by a single row's id, or by failure reason to clear every row that failed the same way at once. A replay re-enqueues the row and removes its dead-letter entry in one transaction — if the underlying cause wasn't actually fixed, the row lands back in the dead-letter queue on the next attempt rather than being lost.

## What stalls when it is not running

Without a Reconciler running, every backfill window in [Background work and eventual consistency](/concepts/background-work) stays open forever:

- a field you just made filterable never becomes indexed, so `isFilterable` stays `true` while `isIndexed` stays `false`;
- a rename, retype, or deletion never finishes, and other operations against the same field keep being rejected as still in progress;
- an import job submitted through `submitBulkWrite()` sits at `pending` indefinitely;
- the sync queue only grows, and entries written under exhaustion fallback never become filterable.

Run at least one Reconciler continuously — either as a persistent process or through `bin/stardust tick` on a schedule. See [Deployment](/operations/deployment) for both modes, and [Troubleshooting](/operations/troubleshooting#a-rename-retype-or-deletion-never-finishes) if something looks stuck.
