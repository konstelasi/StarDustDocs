# Pencarian

`search()` adalah pintu masuk pencarian terpadu di StarDust. Method ini menjalankan sebuah request melalui pipeline validasi lalu menyerahkannya ke <Term id="search-driver">search driver</Term> yang aktif, yang secara bawaan adalah driver bawaan yang meng-query MySQL atau MariaDB lewat slot terindeks. Halaman ini membahas cara menyusun request, menerima filter dalam bentuk JSON, dan mengubah penolakan menjadi error API yang berguna.

## search() dan SearchRequest

`search()` menerima `SearchRequest` dan mengembalikan `SearchResult`:

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Search\SearchRequest;

$result = $engine->search(new SearchRequest(
    tenantId: 42,
    modelId:  $modelId,
    filter:   LeafNode::local('employees', 'gt', 100),
    pageSize: 100,
));

$result->rows;        // list<Entry>
$result->nextCursor;  // Cursor|null
$result->pageSize;
```

`SearchRequest` membawa hal yang sama seperti `EntryQuery`: tenant, model, filter opsional, `selectFields`, `pageSize` (1 sampai 1 000, bawaan 100), `cursor`, `sort`, dan `correlationId`. Filter `null` mencocokkan semua entry dalam model.

**`read()` dan `get()` berjalan lewat pipeline yang sama.** `read()` adalah `search()` dengan bentuk `EntryQuery` yang lebih lama, sehingga validasi, cursor, pengurutan, dan paginasi berperilaku identik. Pakai mana yang lebih enak dibaca di kode Anda. Gunakan `search()` langsung ketika Anda menyusun filter dari JSON atau menulis kode terhadap kontrak driver. Untuk paginasi dan pengurutan, lihat [Membaca entry](/id/usage/reading-entries).

## Menyusun filter tree di PHP

Filter berbentuk pohon. Leaf membandingkan sebuah field dengan sebuah nilai, dan node komposit menggabungkannya:

```php
use StarDust\Filter\Ast\AndNode;
use StarDust\Filter\Ast\LeafNode;
use StarDust\Filter\Ast\NotNode;
use StarDust\Filter\Ast\OrNode;

$filter = new AndNode([
    LeafNode::local('status', 'eq', 'active'),
    new OrNode([
        LeafNode::local('region', 'eq', 'eu'),
        LeafNode::local('region', 'eq', 'us'),
    ]),
    new NotNode(LeafNode::local('employees', 'lt', 10)),
]);
```

`LeafNode::local($fieldName, $operator, $value)` membuat leaf untuk field milik model yang dituju request. Berikan `null` sebagai nilai untuk `is_null` dan `is_not_null`, sebuah list untuk `in`, `nin`, dan `between`, dan nilai skalar untuk yang lain. Operatornya sama dengan yang dipakai format JSON, tercantum di [Format wire QueryFilter](/id/usage/query-filter#operator).

Himpunan operator bawaannya sengaja kecil: kesamaan, perbandingan, rentang, keanggotaan himpunan, pengecekan null, dan pencocokan awalan (prefix). Tidak ada pencocokan substring atau akhiran, tidak ada pencocokan fuzzy, dan tidak ada pemeringkatan relevansi. [Search driver](/id/extending/custom-search-drivers) kustom bisa menyediakannya.

## Menerima filter dalam bentuk JSON

Kalau filter datang dari browser atau layanan lain, decode dengan `JsonFilterDecoder` lalu oper hasilnya ke `search()`:

```php
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Search\SearchRequest;

$decoder = new JsonFilterDecoder($engine->config()->queryFilterLimits);
$filter  = $decoder->decode($requestBody);

$result = $engine->search(new SearchRequest(
    tenantId: 42,
    modelId:  $modelId,
    filter:   $filter,
    pageSize: 100,
));
```

`decode()` mengembalikan filter tree yang sama dengan yang dihasilkan builder bertipe, atau `null` bila dokumen tidak punya key `filter`, yang oleh `search()` diperlakukan sebagai match-all. Decoder-nya ketat, bekerja tanpa koneksi database, dan tidak pernah melihat skema Anda. Apakah sebuah field ada atau bisa di-query diputuskan sesudahnya, oleh pemeriksaan pre-flight. Format dokumennya didefinisikan di [Format wire QueryFilter](/id/usage/query-filter).

## Validasi pre-flight

Sebelum sebuah request mencapai database, ia melewati rangkaian pemeriksaan yang urutannya tetap. Request yang gagal di salah satunya ditolak dengan exception bertipe dan **tidak ada SQL yang dijalankan**.

| Tahap | Yang diperiksa | Penolakan |
| :-- | :-- | :-- |
| Resolusi field | Setiap field dalam filter ada di model. | `UnknownFieldException` |
| Kapabilitas | Driver aktif mendukung setiap operator dan bisa memfilter setiap field. Ini mencakup field yang tidak filterable dan slot yang belum aktif. | `FieldNotFilterableException`, atau `QueryFilterValidationException` dengan `capability_unsupported` |
| Tipe nilai | Setiap nilai sesuai declared type field-nya dan batasannya. | `QueryFilterValidationException` dengan `value_type_mismatch` atau `value_out_of_bounds` |
| Sort dan cursor | Key pengurut bisa diurutkan, dan cursor yang diberikan diterbitkan untuk urutan yang sama. | `UnknownFieldException`, `FieldNotSortableException`, `InvalidCursorException` |

Tahap tipe nilai juga melakukan **normalisasi**. Khususnya, batas datetime dikonversi ke instan UTC yang dimaksud sebelum sampai ke driver, sehingga filter `2026-01-01T10:00:00+07:00` menemukan entry yang Anda tulis pada instan yang sama, apa pun offset yang dipakai keduanya.

Menolak sejak awal adalah pertukaran yang disengaja. Anda mendapat error yang jelas, cepat, dan bisa di-catch, bukan query yang tampak berjalan lalu melakukan table scan seiring tenant membesar. Setiap penolakan juga memancarkan event `pre_flight_rejected` dengan `reason`, dan driver yang tidak sanggup melayani request memancarkan `capability_unsupported`, sehingga Anda bisa mengukur "klien meminta sesuatu yang tidak kami dukung" secara tersendiri. Lihat [Event log](/id/reference/log-events).

## Meneruskan penolakan ke klien API Anda

`QueryFilterValidationException` sengaja berbentuk diskriminator. Setiap kegagalan format wire dan pre-flight punya satu respons yang sama bagi pemanggil, "perbaiki filternya dan coba lagi", jadi satu `catch` menangani semuanya, dan ia membawa cukup informasi untuk menyusun HTTP 400 yang presisi:

- `$errorCode`: salah satu kode error yang tertutup, seperti `value_type_mismatch`.
- `$jsonPointer`: penunjuk RFC 6901 ke node yang bermasalah, seperti `/filter/args/1/value`.
- `$details`: konteks khusus untuk kode itu, seperti `['expected' => 'int', 'received' => 'string']`.

```php
use StarDust\Exception\FieldNotFilterableException;
use StarDust\Exception\UnknownFieldException;
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Filter\QueryFilterValidationException;
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
        'error'   => $e->errorCode,
        'pointer' => $e->jsonPointer,
        'details' => $e->details,
    ]);
} catch (UnknownFieldException | FieldNotFilterableException $e) {
    // Masalah field memakai exception ini, bukan exception format wire.
    http_response_code(400);
    echo json_encode(['error' => $e::class, 'message' => $e->getMessage()]);
}
```

Dua kode format wire, `field_unknown` dan `field_not_filterable`, dilaporkan lewat `UnknownFieldException` dan `FieldNotFilterableException`, jadi tangkap keduanya juga. Field yang filterable tetapi belum indexed juga memunculkan `FieldNotFilterableException`, jadi 400 untuk kasus itu wajar terjadi selama backfill window. Lebih baik lagi, hindari dengan menawarkan filter hanya pada field yang `isIndexed`-nya true. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed#mengecek-apakah-field-bisa-di-query-sebelum-menawarkan-filter).

Jangan menampilkan `getMessage()` begitu saja bila API Anda publik dan Anda tidak ingin menggambarkan skema Anda kepada orang asing. Kode error dan pointer sudah cukup bagi klien untuk memperbaiki request-nya. Lihat [Keamanan](/id/operations/security#menerima-filter-dari-sumber-yang-tidak-tepercaya).
