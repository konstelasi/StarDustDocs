# Error

Setiap error bertipe adalah turunan `RuntimeException`. Semuanya berada di `StarDust\Exception\`, kecuali `QueryFilterValidationException`, yang berada di `StarDust\Filter\`.

## Lingkungan dan persiapan

| Exception | Muncul ketika |
| :-- | :-- |
| `UnsupportedServerException` | Server yang tersambung di bawah batas minimum yang didukung — MySQL/Percona lebih lama dari 8.0.13, atau MariaDB lebih lama dari 10.11. Dilempar pertama kali engine butuh tahu dialeknya: `bootstrap()`, atau pemanggilan `serverEngine()` mana pun. Lihat [Pemecahan masalah](/id/operations/troubleshooting#server-ditolak-saat-boot). |
| `InvalidTenantIdException` | `tenantId` bernilai `<= 0`. Diperiksa di setiap entry point sebelum SQL apa pun berjalan. |

## Penulisan

| Exception | Muncul ketika |
| :-- | :-- |
| `PayloadTooLargeException` | Pemanggilan `bulkWrite()` sinkron melebihi 1 000 entitas. Pakai `submitBulkWrite()` sebagai gantinya. |
| `UncoercibleSlotValueException` | Sebuah nilai pada payload tulis pertama tidak bisa dikoersi ke declared type slot-nya. |
| `MalformedEntryPayloadException` | Envelope array atau JSON yang dioper ke `EntryPayload::fromArray()` / `fromJson()` / `listFrom*()` cacat secara struktural. Membawa key yang bermasalah. |
| `EntryNotFoundException` | `updateEntry()` menargetkan entry yang tidak ada, milik tenant lain, atau sudah dihapus. |
| `NonFilterableFieldSlotException` | Reservasi slot dicoba untuk field yang non-filterable. Ini bug di sisi pemanggil, bukan masalah kapasitas — lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed). |

## Pembacaan, filter, dan pengurutan

| Exception | Muncul ketika |
| :-- | :-- |
| `UnknownFieldException` | Filter atau sort merujuk field yang tidak terdaftar di model. |
| `FieldNotFilterableException` | Filter menargetkan field yang menurut driver aktif non-filterable. |
| `FieldNotIndexedException` | Filter menargetkan field yang slot-nya backfilling, tombstoned, atau belum dipetakan — field itu filterable dalam niat tetapi belum indexed dalam kenyataan. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed). |
| `FieldNotSortableException` | Sort menyebut field yang saat ini tidak indexed — persyaratan yang sama seperti memfilter. Daftar field terindeks pada `describeModel()` melaporkan field mana yang memenuhi syarat sekarang. |
| `PageSizeOutOfRangeException` | `pageSize` di luar rentang `[1, 1000]`. |
| `InvalidCursorException` | Cursor opaque gagal di-decode secara struktural, atau dipakai ulang setelah sort key atau arahnya berubah. |
| `QueryFilterValidationException` | QueryFilter JSON gagal decode atau pre-flight. Lihat [Menangani penolakan format wire](#menangani-penolakan-format-wire) di bawah. |

## Perubahan skema

| Exception | Muncul ketika |
| :-- | :-- |
| `IncompatibleRetypeException` | Sebuah retype melintasi pasangan yang ditolak secara kategoris (`int` ↔ `datetime`, `numeric` ↔ `datetime`). |
| `RetypeInProgressException` | Retype diinisiasi untuk field yang sudah punya satu yang berjalan, atau sebuah model di-compact selagi salah satu field-nya sedang retype, promosi, demosi, atau relokasi. |
| `FieldNotFoundException` | `retypeField()`, `promoteFieldToFilterable()`, `demoteFieldFromFilterable()`, atau `renameField()` menyebut id field yang tidak ada untuk tenant tersebut. `deleteField()` mengembalikan `false`, bukan melempar. |
| `RenameInProgressException` | Sesuatu menargetkan field yang rename-nya sudah dimulai tetapi belum selesai — sebuah retype, penghapusan, atau (untuk model yang memilikinya) penghapusan model. |
| `FieldNameConflictException` | `renameField()` akan bertabrakan dengan nama field lain di model yang sama. |
| `CompactionCapacityException` | `compactModel()` tidak bisa menemukan cukup kapasitas bebas di kumpulan page target untuk menyelesaikan sebuah relokasi. |
| `ModelNotFoundException` | Pemanggilan level model menyebut `modelId` yang tidak ada untuk tenant si pemanggil. |
| `ModelNameConflictException` | `renameModel()` akan bertabrakan dengan nama model lain di tenant yang sama. |
| `ModelDeletionInProgressException` | Sesuatu menargetkan model yang penghapusannya sudah dimulai tetapi belum selesai — sebuah penulisan, update, pengiriman bulk, compaction, atau pengiriman ekspor terhadapnya. |
| `FieldDeletionInProgressException` | Sesuatu menargetkan field yang penghapusannya sudah dimulai tetapi belum selesai — sebuah rename, retype, promosi, demosi, atau compaction terhadapnya. |

`deleteField()` dan `deleteModel()` mengembalikan `false`, bukan melempar, bila tidak ada yang perlu dilakukan — field atau model itu tidak ada, milik tenant lain, atau sedang dihapus.

## Ekspor

| Exception | Muncul ketika |
| :-- | :-- |
| `ExportJobActiveCapExceededException` | Sebuah tenant sudah berada di batas ekspor aktifnya. Membawa `$tenantId`, `$activeCount`, `$cap`. |
| `ExportFilterNotSupportedException` | `submitExport()` diberi `filter` yang tidak kosong; sebuah ekspor selalu mencakup seluruh model. Membawa `$tenantId`, `$modelId`, `$filterKeys`. |

## Menangani penolakan format wire

`QueryFilterValidationException` sengaja bergaya diskriminator: satu `catch` menangani semua kegagalan format wire dan pre-flight, karena semuanya berbagi satu respons pemanggil — perbaiki JSON filter-nya dan coba lagi. Ia membawa cukup konteks untuk merender HTTP 4xx yang presisi tanpa handler per kode:

- `$errorCode` — salah satu dari [tiga belas kode error tertutup](/id/usage/query-filter#kode-error).
- `$jsonPointer` — JSON Pointer RFC 6901 ke node yang bermasalah (misalnya `/filter/args/1/value`).
- `$details` — konteks khusus diskriminator (misalnya `['expected' => 'int', 'received' => 'string']`).

```php
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Filter\QueryFilterValidationException;
use StarDust\Exception\UnknownFieldException;
use StarDust\Exception\FieldNotFilterableException;
use StarDust\Search\SearchRequest;

try {
    $filter = (new JsonFilterDecoder($engine->config()->queryFilterLimits))->decode($body);
    $result = $engine->search(new SearchRequest(
        tenantId: 42,
        modelId:  $modelId,
        filter:   $filter,
    ));
} catch (QueryFilterValidationException $e) {
    http_response_code(400);
    echo json_encode([
        'error'   => $e->errorCode,    // misalnya 'value_type_mismatch'
        'pointer' => $e->jsonPointer,  // misalnya '/filter/args/1/value'
        'details' => $e->details,
    ]);
} catch (UnknownFieldException | FieldNotFilterableException $e) {
    // field_unknown dan field_not_filterable memakai ulang exception
    // yang sudah ada ini, bukan QueryFilterValidationException.
    http_response_code(400);
}
```

Lihat [Pencarian](/id/usage/searching#meneruskan-penolakan-ke-klien-api-anda) untuk mengubah salah satunya menjadi respons API, dan [Pemecahan masalah](/id/operations/troubleshooting) untuk mendiagnosis kasus tertentu di lapangan.
