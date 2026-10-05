# Contoh lengkap

Panduan ujung ke ujung yang minimal: bootstrap skema, mendefinisikan model, menjadikan field-nya filterable, menulis beberapa entry, memfilternya, dan menelusuri hasilnya per halaman. Alurnya sama dengan skrip seed pada [quickstart](/id/guide/quickstart), hanya dijabarkan satu langkah demi satu langkah.

Anda membutuhkan database yang siap di-bootstrap dan package yang sudah terpasang. Lihat [Instalasi](/id/guide/installation).

## 1. Bootstrap

```php
use StarDust\Config\Config;
use StarDust\StarDust;

// ERRMODE_EXCEPTION wajib. Emulated prepares (bawaan PHP) juga bisa dipakai,
// dan tutorial ini memakai native prepares.
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
]);

$engine = new StarDust(new Config(pdo: $pdo));
$engine->bootstrap(); // idempotent: aman dipanggil di setiap deploy
```

## 2. Mendefinisikan model beserta field-nya

`schemaBuilder()` mendaftarkan model dan field-nya tanpa SQL tulisan tangan. Ia bersifat get-or-create, jadi menjalankannya lagi aman, dan ia mengembalikan id model beserta peta dari nama field ke id.

```php
use StarDust\Schema\FieldDefinition;

$company = $engine->schemaBuilder()->createModel(tenantId: 1, name: 'company', fields: [
    new FieldDefinition('name',      'string', isFilterable: true),
    new FieldDefinition('employees', 'int',    isFilterable: true),
]);

$modelId = $company->modelId;
```

## 3. Menyiapkan field filterable agar bisa di-query

Mendaftarkan field hanya mencatat *niat*. Field baru menjadi filterable setelah nilainya masuk ke kolom slot terindeks.

**Pada deployment yang berjalan, ini otomatis.** Watcher menyadari field yang menunggu slot dan menyediakan page yang diindeks untuknya, lalu Reconciler mengklaim slot bagi setiap field filterable yang ia temukan belum terpetakan. Tulis satu entry yang menyentuh field itu dan ia bisa di-query sesaat kemudian, tanpa Anda memesan apa pun.

Cara manual di bawah ini untuk setup sekali jalan: skrip seed, fixture test, atau deployment yang menghendaki slot sudah tersedia sebelum penulisan pertama. Sebuah page dibuat dengan persis kolom slot yang Anda sebutkan, dan semuanya diindeks, jadi sebutkan slot yang akan dipakai field filterable Anda, lalu pesan satu slot per field:

```php
use StarDust\Page\PageProvisioner;
use StarDust\Slot\SlotReserver;

// Sediakan satu page berisi dua slot yang akan dipakai field filterable.
(new PageProvisioner(
    $pdo,
    $engine->config()->clock,
    $engine->logger(),
    $engine->serverEngine(),
))->provision(filterableSlots: ['i_str_01', 'i_int_01']);

// Pesan satu slot per field. Reservasi mengambil slot bebas bernomor terkecil
// di tiap keluarga, jadi 'name' mendapat i_str_01 dan 'employees' mendapat i_int_01.
$reserver = new SlotReserver($pdo, $engine->config()->clock, $engine->logger());
$reserver->reserve($company->fieldId('name'));
$reserver->reserve($company->fieldId('employees'));
```

## 4. Menulis entry

Entry yang sama bisa disusun dengan dua cara, jadi pakai yang cocok untuk pemanggilnya. Envelope JSON atau array, `{tenantId, modelId, fields}` dengan penulisan camelCase, praktis ketika entry datang dari luar seperti CMS, body HTTP, atau antrean. Constructor bertipe memberi Anda validasi di IDE. Keduanya melewati jalur tulis yang persis sama, sehingga nilai dikonversi dengan cara yang sama dan tenant id divalidasi di batas masuk, apa pun caranya.

```php
use StarDust\Write\EntryPayload;

// Bertipe:
$engine->write(new EntryPayload(tenantId: 1, modelId: $modelId,
    fields: ['name' => 'Acme Corp', 'employees' => 340]));

// Dari array PHP, misalnya body request yang sudah Anda decode:
$engine->write(EntryPayload::fromArray([
    'tenantId' => 1,
    'modelId'  => $modelId,
    'fields'   => ['name' => 'Globex', 'employees' => 85],
]));

// Dari string JSON mentah:
$body = '{"tenantId": 1, "modelId": ' . $modelId . ',
          "fields": {"name": "Initech", "employees": 510}}';
$engine->write(EntryPayload::fromJson($body));
```

Setiap pemanggilan mengembalikan `EntryWriteResult` berisi `entryId` yang baru. Lihat [Menulis entry](/id/usage/writing-entries) untuk bulk write dan koersi tipe.

## 5. Memfilter dan paginasi

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Filter\Json\JsonFilterDecoder;
use StarDust\Read\EntryQuery;

// Susun filter dengan salah satu dari dua cara yang setara.
//
//   (a) Bertipe:
//       $filter = LeafNode::local('employees', 'gt', 100);
//
//   (b) Dari payload wire JSON, misalnya langsung dari request HTTP.
//       Hasilnya sama dengan filter bentuk bertipe, dan penolakannya
//       membawa kode error tertutup dan pointer RFC 6901.
$filter = (new JsonFilterDecoder($engine->config()->queryFilterLimits))->decode(
    '{"filter": {"op": "gt",
        "field": {"model": "company", "name": "employees"}, "value": 100}}'
);

// Perusahaan dengan lebih dari 100 karyawan, dua per halaman.
$page = $engine->read(new EntryQuery(
    tenantId:     1,
    modelId:      $modelId,
    filter:       $filter,
    selectFields: ['name', 'employees'],
    pageSize:     2,
));

foreach ($page->rows as $entry) {
    echo $entry->fields['name'] . ' — ' . $entry->fields['employees'] . "\n";
}
// Acme Corp — 340
// Initech — 510
```

Untuk menelusuri setiap halaman, teruslah mengoper cursor kembali. Dataset ini muat dalam satu halaman, jadi `nextCursor` bernilai `null` dan loop berhenti setelah halaman pertama:

```php
// Cursor hanya menandai posisi. Kirim filter, selectFields, dan ukuran
// halaman yang sama bersamanya, kalau tidak halaman berikutnya kembali
// tanpa filter.
$cursor = $page->nextCursor;
while ($cursor !== null) {
    $page = $engine->read(new EntryQuery(
        tenantId:     1,
        modelId:      $modelId,
        filter:       $filter,
        selectFields: ['name', 'employees'],
        pageSize:     2,
        cursor:       $cursor,
    ));

    foreach ($page->rows as $entry) {
        // ... pakai $entry
    }

    $cursor = $page->nextCursor;
}
```

Lihat [Membaca entry](/id/usage/reading-entries) untuk pengurutan dan alasan di balik cursor.

## 6. Membaca satu entry

```php
$firstId = $page->rows[0]->id;
$entry   = $engine->get(tenantId: 1, entryId: $firstId);

echo $entry?->fields['name']; // Acme Corp
```

`get()` mengembalikan `null` bila entry tidak ada untuk tenant itu.

## Selanjutnya ke mana

- [Memperbarui dan menghapus entry](/id/usage/updating-and-deleting) dan [Pencarian](/id/usage/searching) membahas sisa API yang dipakai sehari-hari.
- [Mengubah skema](/id/schema-changes/) menjelaskan cara me-retype, mengganti nama, dan menghapus field pada data yang sedang berjalan.
- [Deployment](/id/operations/deployment) membahas cara menjalankan proses latar belakang yang diandalkan langkah 3 di produksi.
- [Cara kerja](/id/concepts/architecture) menjelaskan mengapa semua ini cepat.
