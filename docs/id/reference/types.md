# Tipe data

DTO, value object, dan enum yang membentuk permukaan publik, dikelompokkan menurut bagian API yang menjadi tempatnya. Semuanya `final` dan, kecuali disebutkan lain, sekumpulan properti `readonly` yang immutable, dioper secara posisional atau lewat nama.

## Input dan hasil penulisan

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `EntryPayload` | `tenantId`, `modelId`, `fields` (peta nama → nilai), `correlationId` | Input penulisan satu entry. `fromArray()` / `fromJson()` / `listFromArray()` / `listFromJson()` menyusun satu atau sekumpulan dari envelope `{tenantId, modelId, fields}` — lihat [Menyusun EntryPayload](/id/usage/writing-entries#menyusun-entrypayload). |
| `EntryWriteResult` | `entryId`, `enqueuedForBackfill`, `slotsWritten` | Hasil `write()` dan `updateEntry()`. `enqueuedForBackfill` bernilai `true` jika ada field pada payload yang tidak punya slot aktif dan entry-nya sekarang menunggu di sync queue. |
| `BulkIngestOptions` | `chunkSize` (bawaan 500), `interChunkDelayMicros`, `correlationId` | Penyetelan untuk `bulkWrite()`. |
| `BulkIngestResult` | `chunks` (`list<BulkChunkResult>`), `entriesCommitted` | Hasil `bulkWrite()`. |
| `BulkChunkResult` | `chunkIndex`, `chunkSize`, `outcome` (`committed` \| `rolled_back`), `entryIds`, `failureReason` | Hasil satu chunk di dalam `BulkIngestResult`. Sebuah chunk selalu ter-commit penuh atau rollback penuh — tidak ada state chunk sebagian. |

## Query dan hasilnya

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `EntryQuery` | `tenantId`, `modelId`, `filter` (`?FilterNode`), `selectFields`, `pageSize`, `cursor`, `sort`, `correlationId` | Input untuk `read()`. `filter === null` mencocokkan semuanya; `sort === null` berarti `entry_data.id` menaik. `fromFlatFilters()` menyusun satu dari daftar leaf datar yang digabung secara implisit dengan AND. |
| `EntryPage` | `rows` (`list<Entry>`), `nextCursor`, `pageSize` | Hasil `read()`. `nextCursor === null` berarti ini halaman terakhir. |
| `Entry` | `id`, `tenantId`, `modelId`, `fields`, `createdAt`, `deletedAt` | Satu entry, dikembalikan oleh `get()` dan di dalam `EntryPage`. `fields` menggabungkan nilai dari slot terindeks dan payload JSON — pemanggil tidak pernah perlu tahu sebuah nilai berasal dari yang mana. |
| `SearchRequest` | Bentuk sama seperti `EntryQuery`, ditambah `correlationId` yang tidak nullable (string kosong berarti "buatkan satu") | Input untuk `search()`. Konversi dari `EntryQuery` dengan `SearchRequest::fromEntryQuery()`. |
| `SearchResult` | Bentuk sama seperti `EntryPage` | Hasil `search()`. Konversi ke `EntryPage` dengan `toEntryPage()`. |
| `Cursor` | `opaque` (string) | Token halaman berikutnya yang opaque. **Perlakukan sebagai opaque** — buat satu hanya saat mengoper ulang token yang sudah Anda pegang lewat penyimpanan Anda sendiri; jangan pernah membuat atau memeriksanya sendiri. |

## Filter node

`StarDust\Filter\Ast\FilterNode` adalah marker interface yang diimplementasikan setiap node. Lihat [Format wire QueryFilter](/id/usage/query-filter) untuk bentuk JSON yang dicerminkan tipe-tipe ini, dan [Menyusun filter tree di PHP](/id/usage/searching#menyusun-filter-tree-di-php) untuk membuatnya langsung.

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `AndNode` | `args` (`non-empty-list<FilterNode>`) | Cocok bila semua anak cocok. |
| `OrNode` | `args` (`non-empty-list<FilterNode>`) | Cocok bila minimal satu anak cocok. |
| `NotNode` | `arg` (`FilterNode`) | Cocok bila anaknya tidak cocok. |
| `LeafNode` | `operator`, `field` (`FieldRef`), `value` (`?TypedValue`) | Satu predikat: field, operator, nilai. `value` bernilai `null` hanya untuk `is_null` / `is_not_null`. `LeafNode::local($fieldName, $operator, $value)` adalah builder praktis untuk kode yang sudah tahu model dari query di sekitarnya. |
| `FieldRef` | `modelName`, `fieldName` | Referensi field. `FieldRef::local($fieldName)` menargetkan field pada model request itu sendiri. |
| `TypedValue` | `value` (skalar atau `list<scalar>`) | Ruas kanan sebuah `LeafNode`. |

`Operator` adalah kelas konstanta string — `EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, `IN`, `NIN`, `PREFIX`, `BETWEEN`, `IS_NULL`, `IS_NOT_NULL` — bukan enum, agar [search driver](/id/extending/custom-search-drivers) kustom bisa mendeklarasikan operator tambahan saat runtime. `ValidationErrorCode` adalah himpunan tertutup dari tiga belas kode error format wire; lihat [Kode error](/id/usage/query-filter#kode-error) untuk artinya masing-masing dan [Error](/id/reference/errors#menangani-penolakan-format-wire) untuk menanganinya. `FilterLimits` membawa enam batasan yang bisa disetel (`maxDepth`, `maxNodes`, `maxArgs`, `maxInElements`, `maxStringLength`, `maxPayloadBytes`) — lihat [Batasan](/id/usage/query-filter#batasan).

## Pengurutan

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `SortSpec` | `target` (`SortTarget`), `fieldName` (hanya untuk `Field`), `direction` (`SortDirection`) | Satu sort key. Buat dengan `SortSpec::byId()`, `byCreatedAt()`, atau `byField($name)`, masing-masing menerima `SortDirection` opsional. |
| `SortTarget` | enum: `Id`, `CreatedAt`, `Field` | Yang menjadi dasar pengurutan. Kedua target intrinsik tetap terurut lewat index; `Field` memaksa filesort atas seluruh himpunan yang cocok. Lihat [Biaya pengurutan berdasarkan field](/id/usage/reading-entries#biaya-pengurutan-berdasarkan-field). |
| `SortDirection` | enum: `Asc`, `Desc` | Arah sebuah `SortSpec`. |

## Deskripsi skema

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `ModelSummary` | `modelId`, `name` | Satu baris dari `listModels()` — hanya identitas. |
| `ModelDescription` | `modelId`, `name`, `fields` (`list<FieldDescription>`) | Hasil `describeModel()`. `field($name)` mencari satu; `indexedFields()` mengembalikan hanya field yang bisa ditarget filter sekarang. |
| `FieldDescription` | `fieldId`, `name`, `declaredType`, `isFilterable`, `isIndexed` | Satu field, sebagaimana dilaporkan `describeModel()`. `isFilterable` adalah niat yang dideklarasikan registry; `isIndexed` adalah apakah filter terhadapnya berfungsi *sekarang juga*. Keduanya berbeda selama promosi atau backfill retype — lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed). |
| `FieldDefinition` | `name`, `declaredType`, `isFilterable` (bawaan `false`) | DTO input untuk `SchemaBuilder::createModel()` — satu field untuk didaftarkan. |
| `ModelDefinition` | `modelId`, `fieldIds` (peta nama → id) | Hasil `SchemaBuilder::createModel()`. `fieldId($name)` mencari satu. |

## Import job dan export job

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `ImportJobId` | `jobId` | Dikembalikan oleh `submitBulkWrite()`. |
| `ImportJob` | `id`, `tenantId`, `status`, `idempotencyKey`, `artifactPath`, `entryCount`, `chunks`, `entriesWritten`, `failedReason`, `workerIdentity`, `claimedAt`, `heartbeatAt`, `createdAt`, `completedAt`, `chunkManifest` (`list<ImportChunkRecord>`) | Dikembalikan oleh `getImportJob()`. `chunks` dan `entriesWritten` bernilai `null` — bukan `0` — sampai chunk pertama ter-commit. `artifactPath` tidak pernah `null`, berbeda dari milik ekspor, jadi tidak menandakan apa pun soal tahap siklus hidup. Lihat [Memantau status import job](/id/usage/bulk-imports#memantau-status-import-job). |
| `ImportChunkRecord` | `index`, `size`, `outcome` (`committed` \| `failed`), `entryIdFirst`, `entryIdLast`, `failureReason` | Satu chunk di dalam `chunkManifest` milik `ImportJob`. Berbeda dengan bulk write sinkron, chunk pertama yang gagal bersifat final untuk job asinkron, sehingga `outcome` di sini tidak pernah `rolled_back`. |
| `ExportJobRequest` | `tenantId`, `modelId`, `format` (`csv` \| `json`), `filter` (harus kosong), `correlationId` | Input untuk `submitExport()`. `filter` yang tidak kosong ditolak — lihat [Mengajukan ekspor](/id/usage/exports#mengajukan-ekspor). |
| `ExportJobId` | `jobId` | Dikembalikan oleh `submitExport()`. |
| `ExportJob` | `id`, `tenantId`, `modelId`, `status`, `filter`, `format`, `lastCursor`, `artifactPath`, `failedReason`, `skipCount`, `workerIdentity`, `claimedAt`, `heartbeatAt`, `createdAt`, `completedAt` | Dikembalikan oleh `getExportJob()`. `artifactPath !== null` jika dan hanya jika `status === 'completed'`. Lihat [Memantau status ekspor](/id/usage/exports#memantau-status-ekspor). |

## Hasil perawatan

| Tipe | Membawa | |
| :-- | :-- | :-- |
| `CompactionPlan` | `tenantId`, `modelId`, `pagesBefore`, `theoreticalMinPages`, `targetPageIds`, `relocations` (`list<FieldRelocation>`), `noopCount` | Hasil `compactModel()`, dry run maupun tidak. `isNoop()`, `relocationCount()`, `pagesAfter()`, dan `excessPagesRemoved()` adalah pembaca praktis. |
| `FieldRelocation` | `fieldId`, `fieldName`, `slotType`, `fromPageId`, `toPageId` | Satu perpindahan field di dalam `CompactionPlan`. Hanya perpindahan sungguhan yang muncul di sini — field yang sudah berada di page target dianggap no-op dan tidak didaftarkan. |
| `TickReport` | `rounds`, `elapsedSeconds`, `budgetSeconds`, `stopReason` (`TickStopReason`) | Hasil `tick()`. |
| `TickStopReason` | enum: `IDLE`, `BUDGET_SPENT`, `SHUTDOWN`, `LOCK_CONTENDED` | Mengapa sebuah run `tick()` kembali. `LOCK_CONTENDED` berarti proses lain sudah memegang lock Watcher dan tidak ada putaran yang berjalan sama sekali. |

## Enum

Semua enum di permukaan publik, dikumpulkan di satu tempat. `SortDirection`, `SortTarget`, dan `TickStopReason` sudah dijelaskan di atas, di sisi tipe yang menjadi miliknya.

| Enum | Case | |
| :-- | :-- | :-- |
| `ServerEngine` | `MYSQL`, `MARIADB` | Engine database yang terdeteksi, dikembalikan oleh `StarDust::serverEngine()`. Percona dilaporkan sebagai `MYSQL`. |
| `SortDirection` | `Asc`, `Desc` | Lihat [Pengurutan](#pengurutan) di atas. |
| `SortTarget` | `Id`, `CreatedAt`, `Field` | Lihat [Pengurutan](#pengurutan) di atas. |
| `TickStopReason` | `IDLE`, `BUDGET_SPENT`, `SHUTDOWN`, `LOCK_CONTENDED` | Lihat [Hasil perawatan](#hasil-perawatan) di atas. |
