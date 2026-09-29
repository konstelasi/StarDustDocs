# API StarDust

Setiap method publik pada `StarDust`, dikelompokkan menurut fungsinya. Hanya signature — setiap baris menaut ke halaman yang membahas perilakunya lebih mendalam. `StarDust::VERSION` menyimpan versi package sebagai string.

Setiap method yang menerima `tenantId` memvalidasinya sebelum menyentuh database — nilai di luar jangkauan langsung melempar `InvalidTenantIdException`, dan method yang mengembalikan `?T` atau `bool` melaporkan baris milik tenant lain persis seperti melaporkan baris yang tidak ada. Lihat [Error](/id/reference/errors) dan [Keamanan](/id/operations/security#jaminan-isolasi-tenant).

## Persiapan

| Method | Fungsinya |
| :-- | :-- |
| `pdo(): PDO` | Koneksi yang disuntikkan. |
| `logger(): LoggerInterface` | Logger yang dikonfigurasi. |
| `config(): Config` | `Config` yang dipakai untuk membuat instance ini. |
| `bootstrap(): void` | Secara idempoten membuat setiap tabel yang dibutuhkan engine. Lihat [Instalasi](/id/guide/installation#bootstrap-skema). |
| `serverEngine(): ServerEngine` | Engine database yang terdeteksi, ditentukan dari koneksi aktif saat pertama kali dibutuhkan. Melempar `UnsupportedServerException` bila di bawah batas minimum yang didukung. Lihat [Persyaratan](/id/guide/requirements#database-yang-didukung). |
| `schemaBuilder(): SchemaBuilder` | Mendaftarkan model dan field. Lihat [Mendefinisikan model dan field](/id/usage/defining-schema). |

## Penulisan

| Method | Fungsinya |
| :-- | :-- |
| `write(EntryPayload $payload): EntryWriteResult` | Menulis satu entry. Lihat [Menulis entry](/id/usage/writing-entries). |
| `bulkWrite(list<EntryPayload> $payloads, ?BulkIngestOptions $options = null): BulkIngestResult` | Menulis hingga 1 000 entry secara sinkron, dalam transaksi per chunk. Lihat [Bulk write sinkron](/id/usage/bulk-imports#bulk-write-sinkron). |
| `updateEntry(int $tenantId, int $entryId, array $fields, ?string $correlationId = null): EntryWriteResult` | Penggantian penuh sebuah entry yang sudah ada. Melempar `EntryNotFoundException` bila tidak ada, milik tenant lain, atau sudah dihapus. Lihat [Penggantian penuh dengan updateEntry()](/id/usage/updating-and-deleting#penggantian-penuh-dengan-updateentry). |
| `deleteEntry(int $tenantId, int $entryId, ?string $correlationId = null): bool` | Soft delete sebuah entry. Mengembalikan `false`, bukan melempar, bila tidak ada yang perlu dilakukan. Lihat [Soft delete dengan deleteEntry()](/id/usage/updating-and-deleting#soft-delete-dengan-deleteentry). |

## Import job

| Method | Fungsinya |
| :-- | :-- |
| `submitBulkWrite(int $tenantId, list<EntryPayload> $payloads, ?string $idempotencyKey = null, ?string $correlationId = null): ImportJobId` | Mengirim batch berukuran berapa pun untuk diimpor di latar belakang. Lihat [Pengiriman asinkron untuk batch besar](/id/usage/bulk-imports#pengiriman-asinkron-untuk-batch-besar). |
| `getImportJob(int $tenantId, int $jobId): ?ImportJob` | Memantau job yang sudah dikirim. `null` bila tidak ada atau milik tenant lain. Lihat [Memantau status import job](/id/usage/bulk-imports#memantau-status-import-job). |

## Pembacaan dan pencarian

| Method | Fungsinya |
| :-- | :-- |
| `read(EntryQuery $query): EntryPage` | Satu halaman hasil yang difilter, diurutkan, dan dipaginasi cursor. Lihat [Query dengan read()](/id/usage/reading-entries#query-dengan-read). |
| `get(int $tenantId, int $entryId): ?Entry` | Satu entry berdasarkan id. `null` bila tidak ada, milik tenant lain, atau sudah di-soft-delete. Lihat [Membaca satu entry dengan get()](/id/usage/reading-entries#membaca-satu-entry-dengan-get). |
| `search(SearchRequest $request): SearchResult` | Padanan `read()` yang ditopang driver, untuk filter yang disusun dari JSON. Lihat [Pencarian](/id/usage/searching). |

## Introspeksi skema

| Method | Fungsinya |
| :-- | :-- |
| `listModels(int $tenantId): list<ModelSummary>` | Semua model yang terdaftar untuk tenant tersebut. |
| `describeModel(int $tenantId, int $modelId): ?ModelDescription` | Satu model beserta field-nya, atau `null` bila tidak ada untuk tenant ini. Lihat [Melihat detail sebuah model](/id/usage/defining-schema#melihat-detail-sebuah-model). |

## Perubahan skema

| Method | Fungsinya |
| :-- | :-- |
| `retypeField(int $tenantId, int $fieldId, string $newDeclaredType): void` | Lihat [Mengubah tipe field](/id/schema-changes/retype). |
| `promoteFieldToFilterable(int $tenantId, int $fieldId): void` | Lihat [Promosi field](/id/schema-changes/filterability#promosi-field). |
| `demoteFieldFromFilterable(int $tenantId, int $fieldId): void` | Lihat [Demosi field](/id/schema-changes/filterability#demosi-field). |
| `renameField(int $tenantId, int $fieldId, string $newName): void` | Lihat [Mengganti nama field](/id/schema-changes/renaming#mengganti-nama-field). |
| `renameModel(int $tenantId, int $modelId, string $newName): void` | Sinkron — satu-satunya perubahan skema yang tidak butuh Reconciler. Lihat [Mengganti nama model](/id/schema-changes/renaming#mengganti-nama-model). |
| `deleteField(int $tenantId, int $fieldId): bool` | Lihat [Menghapus field](/id/schema-changes/deleting-fields). |
| `deleteModel(int $tenantId, int $modelId): bool` | Lihat [Menghapus model](/id/schema-changes/deleting-models). |

Ketujuhnya kembali begitu registry diperbarui. Semuanya kecuali `renameModel()` lalu selesai di latar belakang dan butuh Reconciler yang berjalan agar konvergen — lihat [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work). `deleteField()` dan `deleteModel()` mengembalikan `false`, bukan melempar, bila tidak ada yang perlu dilakukan.

## Ekspor

| Method | Fungsinya |
| :-- | :-- |
| `submitExport(ExportJobRequest $request): ExportJobId` | Lihat [Mengajukan ekspor](/id/usage/exports#mengajukan-ekspor). |
| `getExportJob(int $tenantId, int $jobId): ?ExportJob` | Lihat [Memantau status ekspor](/id/usage/exports#memantau-status-ekspor). |

## Perawatan

| Method | Fungsinya |
| :-- | :-- |
| `compactModel(int $tenantId, int $modelId, bool $dryRun = false): CompactionPlan` | Memindahkan field filterable sebuah model ke lebih sedikit page. Lihat [Memadatkan model (compaction)](/id/operations/slot-maintenance#memadatkan-model-compaction). |
| `cardinalitySampler(): CardinalitySampler` | Kolaborator di balik `cardinality:report`. Lihat [Laporan kardinalitas](/id/operations/slot-maintenance#laporan-kardinalitas). |
| `spreadSampler(): SpreadSampler` | Kolaborator di balik `spread:report`. Lihat [Laporan spread](/id/operations/slot-maintenance#laporan-spread). |

Kebanyakan deployment memanggil keduanya lewat CLI, bukan langsung dari kode.

## Daemon dan tick

| Method | Fungsinya |
| :-- | :-- |
| `watcher(): Watcher` | Lihat [Watcher](/id/operations/watcher). |
| `reconciler(): Reconciler` | Lihat [Reconciler](/id/operations/reconciler). |
| `liberator(): Liberator` | Lihat [Liberator](/id/operations/liberator). |
| `chronicler(?ShutdownSignal $shutdown = null): Chronicler` | Lihat [Chronicler](/id/operations/chronicler). |
| `tick(?int $budgetSeconds = null, bool $advisories = false, bool $exports = false): TickReport` | Satu lintasan terbatas Watcher, Liberator, dan Reconciler — dan, dengan `$exports`, Chronicler. Lihat [Perintah tick](/id/operations/deployment#perintah-tick). |
| `combinedTick(): CombinedTick` | Factory di balik `tick()`, untuk pemanggil yang ingin menjalankan sendiri loop-nya, misalnya driver pasca-respons `fastcgi_finish_request()`. |
| `dlqReplayer(): DlqReplayer` | Kolaborator di balik `reconciler:dlq:replay`. Lihat [Dead-letter queue](/id/operations/reconciler#dead-letter-queue). |
| `pollLoop(): PollLoop` | Scaffolding yang dipakai bersama oleh poll loop setiap daemon persisten. |
| `shutdownSignal(string $daemonName): ShutdownSignal` | Sinyal gabungan SIGTERM/SIGINT + flag-file shutdown untuk satu daemon. |
| `lockNamespace(): LockNamespace` | Pengkualifikasi per instalasi pada dua advisory lock database milik engine. Lihat [Shared hosting dan lock namespace](/id/usage/configuration#shared-hosting-dan-lock-namespace). |

Kebanyakan deployment menjalankan daemon lewat `bin/stardust`, bukan memanggil factory ini secara langsung — lihat [Deployment](/id/operations/deployment). Method-method ini ada untuk menanamkan sebuah daemon ke dalam process supervisor Anda sendiri.
