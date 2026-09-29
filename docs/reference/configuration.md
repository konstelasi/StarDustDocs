# Configuration reference

Every `Config` field, grouped by the subsystem it tunes. See [Configuration](/usage/configuration) for the object itself, how to inject a logger, a clock or a search driver, and the shared-hosting lock namespace; see [Tuning](/operations/tuning) for guidance on when to change a default rather than just what it is.

## Connection and logging

| Field | Default | Governs |
| :-- | :-- | :-- |
| `pdo` | — (required) | The connection. Must be constructed with `ATTR_EMULATE_PREPARES => false` and `ATTR_ERRMODE => ERRMODE_EXCEPTION`. See [Prepare the PDO connection](/guide/installation#prepare-the-pdo-connection). |
| `logger` | `StdoutNdjsonLogger` | A PSR-3 logger. Inject your own to route events somewhere other than stdout NDJSON. |
| `clock` | `SystemClock` | A `psr/clock` implementation. Inject a frozen clock in tests. |

## Writes and imports

| Field | Default | Governs |
| :-- | :-- | :-- |
| `artifactDir` | `sys_get_temp_dir() . '/stardust'` | Where async bulk-ingest payloads are written. Shared with export artifacts — see [Chronicler and exports](#chronicler-and-exports) below. |
| `reconcilerImportLeaseTimeoutSeconds` | 30 | Seconds before an import job's heartbeat is considered lapsed and another Reconciler re-claims it. |

## Reads and search

| Field | Default | Governs |
| :-- | :-- | :-- |
| `queryFilterLimits` | `FilterLimits::defaults()` | The six QueryFilter bounds (depth, node count, args, `in` elements, string length, payload size). See [Limits](/usage/query-filter#limits). |
| `searchDriver` | `null` | Injects a custom `EntrySearchInterface`; `null` uses the bundled MySQL driver. See [Custom search drivers](/extending/custom-search-drivers). |

## Watcher

| Field | Default | Governs |
| :-- | :-- | :-- |
| `watcherPollIntervalSeconds` | 60 | Seconds between poll cycles in the persistent daemon. |
| `watcherCapacityThreshold` | 0.20 | Spare-capacity floor that triggers provisioning; a field waiting on an index provisions regardless of this. |
| `watcherProvisionLockTimeoutSeconds` | 10 | How long the Watcher waits for its database-level advisory lock around provisioning. |
| `cardinalityIntervalSeconds` | 86 400 (24 h) | Cadence of the cardinality advisory, shared fleet-wide through the database. |
| `cardinalityJitterSeconds` | ~10 % of the interval (8 640 by default) | Randomised window the Watcher draws a fresh offset from each cycle, so a fleet started in lockstep doesn't stampede on the same schedule. |
| `cardinalitySelectivityThreshold` | 0.01 | Distinct-to-row ratio below which an index is flagged low-cardinality. |
| `cardinalityRowFloor` | 10 000 | Minimum row count before an index is even considered for the cardinality check. |
| `cardinalityDistinctFloor` | 10 | Minimum distinct-value count before the same check applies. |
| `spreadExcessPageThreshold` | 2 | How many avoidable pages a model must occupy before the spread advisory flags it. |
| `pageIndexHeadroom` | 4 | Spare indexed columns of each family a newly provisioned page carries beyond current demand. Fixed per page at creation — raising it never widens an existing page. See [Index headroom](/operations/tuning#index-headroom). |

## Reconciler

| Field | Default | Governs |
| :-- | :-- | :-- |
| `reconcilerChunkSize` | 500 | Rows per `SKIP LOCKED` claim across the Reconciler's work sources. |
| `reconcilerInterChunkDelayMicros` | 0 | Pause between chunks, to pace throughput. |
| `reconcilerCapacityWaitMillis` | 5 000 | Sleep after a tick reports it's waiting on Watcher-provisioned capacity, before retrying. |
| `reconcilerLockRetryBudget` | 3 | Consecutive lock-failure retries on five of the Reconciler's six work sources before it defers to the next tick. |
| `reconcilerLockRetryDelayMicros` | 0 | Pause between those retries. |
| `modelPurgeChunkSize` | 200 | `entry_data` deletes per model-deletion purge transaction. Smaller than `reconcilerChunkSize` on purpose — see [Chunk sizes](/operations/tuning#chunk-sizes). |
| `modelPurgeLockRetryBudget` | 3 | Consecutive lock-failure retries before the model-purge source gives up and re-raises rather than deferring. |

## Liberator

| Field | Default | Governs |
| :-- | :-- | :-- |
| `liberatorIdleIntervalSeconds` | 10 | Poll interval when nothing is tombstoned. |
| `liberatorBatchSize` | 50 | Tombstoned slots considered per Liberator tick. |
| `liberatorChunkSize` | 500 | Rows nullified per sweep transaction. |
| `liberatorInterChunkDelayMicros` | 0 | Pause between chunks, to pace sweep throughput. |
| `liberatorDeadlockRetryBudget` | 3 | Consecutive deadlock retries on one chunk before the Liberator takes a sweep gap. See [Sweep gaps](/operations/liberator#sweep-gaps). |

## Chronicler and exports

| Field | Default | Governs |
| :-- | :-- | :-- |
| `chroniclerIdleIntervalSeconds` | 10 | Sleep when no export job is claimable. |
| `chroniclerLeaseTimeoutSeconds` | 30 | Heartbeat-lapse threshold for the abandoned-claim sweep. |
| `chroniclerPageSize` | 500 | `entry_data` rows paginated per export chunk. |
| `chroniclerInterChunkDelayMicros` | 0 | Pause between chunks. |
| `chroniclerDeadlockRetryBudget` | 3 | Consecutive deadlock retries on one export chunk before it's skipped. |
| `chroniclerSkipCountCap` | 1 000 | Combined per-row and per-chunk skip cap before a job fails as `excessive_skips`. |
| `chroniclerArtifactSizeCapBytes` | 5 GiB | Per-artifact size cap; an export that would exceed it fails as `artifact_size_exceeded`. |
| `chroniclerArtifactTtlSeconds` | 86 400 (24 h) | How long a completed artifact survives before garbage collection deletes it. |
| `chroniclerOrphanedPartialTtlSeconds` | 3 600 (1 h) | TTL for a failed job's partial artifact. |
| `chroniclerLowDiskThresholdPct` | 0.10 | Pre-claim disk gate: free-space ratio floor. |
| `chroniclerDiskProbeBytes` | 65 536 (64 KiB) | Pre-claim disk gate: write-probe size that catches a per-account quota the ratio can't see. `0` disables the probe. |
| `chroniclerPerTenantActiveCap` | 3 | Maximum `pending` + `processing` export jobs per tenant, enforced atomically at submission. |
| `chroniclerDbDisconnectBackoffSeconds` | `[1, 4, 16]` | Fixed reconnect backoff schedule after a dropped connection mid-export. |
| `pdoConnector` | `null` | Reconnect factory the Chronicler uses to rebuild a dropped connection mid-export. `bin/stardust chronicler` wires one automatically; `null` means a dropped connection ends the job as `failed:query_failure`. |

`artifactDir` (above, under [Writes and imports](#writes-and-imports)) is shared between async imports and exports — see [Artifact storage](/operations/deployment#artifact-storage).

## Combined tick

| Field | Default | Governs |
| :-- | :-- | :-- |
| `tickBudgetSeconds` | 50 | How long one `tick()` / `bin/stardust tick` run works before stopping. |
| `tickBudgetMarginSeconds` | 5 | Subtracted from PHP's own `max_execution_time` when the SAPI reports a nonzero ceiling, so the effective budget never exceeds what the host would kill the process for. |

See [Time budgets](/operations/deployment#time-budgets).

## Locks and process files

| Field | Default | Governs |
| :-- | :-- | :-- |
| `pidFileDir` | `sys_get_temp_dir() . '/stardust'` | Where the Watcher's lock file and every daemon's shutdown-flag file live. |
| `lockNamespace` | `null` | Qualifies the engine's two database advisory lock names so two installations sharing one database server don't collide. `null` derives it from the database name. See [Shared hosting and the lock namespace](/usage/configuration#shared-hosting-and-the-lock-namespace). |
