# Tuning

Most of StarDust runs well on its defaults. This page covers the settings worth revisiting once you have a real workload to tune against — see [Configuration reference](/reference/configuration) for the complete field list and [Deployment](/operations/deployment) for the modes these settings apply to.

## Worker counts

The Watcher is a strict singleton and isn't part of this conversation — see [Watcher](/operations/watcher#one-instance-only). The other three daemons scale by process count, not by a `Config` setting:

- <Term id="reconciler">Reconciler</Term> — add workers when the sync queue, an import backlog, or a backfill window is taking longer to drain than you'd like. `SELECT … FOR UPDATE SKIP LOCKED` keeps them disjoint, so there's no coordination cost to adding more beyond the ordinary lock waits any concurrent writer sees.
- <Term id="liberator">Liberator</Term> — add workers when tombstoned slots are aging past a cycle or two. Throughput is capped by the number of distinct pages currently holding tombstones, not the worker count, so beyond that point extra workers cost nothing but buy nothing either.
- <Term id="chronicler">Chronicler</Term> — add workers when exports are queuing up rather than draining, or when you want faster recovery of a job abandoned by a crashed worker.

Start with one of each beyond the Watcher and watch the signals in [Observability](/operations/observability) before scaling up.

## Chunk sizes

Every daemon works in bounded chunks so no single transaction holds a lock long enough to affect a live request. Each chunk size is independently tunable:

| Setting | Default | Governs |
| :-- | :-- | :-- |
| `reconcilerChunkSize` | 500 | Rows per `SKIP LOCKED` claim across the Reconciler's work sources. |
| `liberatorChunkSize` | 500 | Rows nullified per Liberator sweep transaction. |
| `liberatorBatchSize` | 50 | Tombstoned slots considered per Liberator tick. |
| `chroniclerPageSize` | 500 | `entry_data` rows paginated per export chunk. |
| `modelPurgeChunkSize` | 200 | `entry_data` deletes per model-deletion purge transaction. |

`modelPurgeChunkSize` has its own, smaller default deliberately: a model-purge chunk deletes entries **and** cascades into every extension page they occupy **and** the sync queue, all in one transaction, so it does more work per row than any other chunk. Tuning the shared `reconcilerChunkSize` down to make a large purge gentler would slow every other kind of Reconciler work at the same time — use `modelPurgeChunkSize` instead when a purge specifically needs a smaller footprint.

A smaller chunk size means shorter individual locks and more total round-trips; a larger one means fewer round-trips at the cost of holding each lock longer. The defaults are a reasonable middle ground — change them only after you've seen a specific problem (long lock waits from a small chunk elsewhere, or too many round-trips at very high volume) rather than pre-emptively.

`reconcilerInterChunkDelayMicros`, `liberatorInterChunkDelayMicros`, and `chroniclerInterChunkDelayMicros` (all `0` by default) pace a daemon's throughput by pausing between chunks — useful if a daemon draining at full speed is itself the thing putting pressure on a shared database.

## Index headroom

`pageIndexHeadroom` (default **4**) controls how many spare indexed columns of each type a newly provisioned page carries beyond what current demand justifies. Because a page's set of indexed columns is fixed forever once created, headroom is what stops a sequence of promotions from each triggering their own page: with headroom, several fields promoted one after another land together on the page that already has room, instead of scattering across as many pages as there were promotions.

Raising this only affects pages created from that point forward — it never widens an existing page. If you're seeing [high spread](/operations/slot-maintenance#the-spread-report) on models that grow fields incrementally, raising `pageIndexHeadroom` before the growth happens is cheaper than compacting after the fact.

## Lock waits and retries

Every daemon retries a bounded number of times when InnoDB refuses a chunk over lock contention or deadlock, rather than crashing or giving up immediately:

| Setting | Default | Governs |
| :-- | :-- | :-- |
| `reconcilerLockRetryBudget` | 3 | Consecutive lock-failure retries on five of the Reconciler's six work sources. |
| `reconcilerLockRetryDelayMicros` | 0 | Pause between those retries. |
| `modelPurgeLockRetryBudget` | 3 | Consecutive lock-failure retries before the model-purge source gives up and re-raises (it's the one source that doesn't quietly retry on the next tick instead). |
| `liberatorDeadlockRetryBudget` | 3 | Consecutive deadlock retries on one chunk before the Liberator takes a sweep gap. See [Liberator](/operations/liberator#sweep-gaps). |
| `chroniclerDeadlockRetryBudget` | 3 | Consecutive deadlock retries on one export chunk before it's skipped. |
| `watcherProvisionLockTimeoutSeconds` | 10 | How long the Watcher waits for its database-level advisory lock around provisioning. |
| `reconcilerCapacityWaitMillis` | 5,000 | Sleep after a tick reports it's waiting on capacity from the Watcher, before retrying. |

Raising a retry budget makes a daemon more patient under contention at the cost of holding a chunk's work in limbo longer before falling back (a sweep gap, a skipped export chunk, or a re-raised exception, depending on the source). The defaults hold up well under normal load; consider raising one only if you're seeing gaps or skips caused by contention you expect to be transient — a burst of other writes to the same pages, say — rather than a persistent bottleneck no retry budget will fix.

## Tick budgets

These only matter if you're running `bin/stardust tick` rather than persistent daemons — see [Deployment](/operations/deployment#time-budgets).

`tickBudgetSeconds` (default 50) is how long one `tick` invocation runs before stopping, passed as `--budget` or left at its `Config` default. `tickBudgetMarginSeconds` (default 5) is subtracted from PHP's own `max_execution_time` when the SAPI reports a nonzero ceiling, so the effective budget never exceeds what the host would kill the process for anyway — you don't need to coordinate the two by hand, just make sure `tickBudgetSeconds` comfortably fits inside your cron interval.
