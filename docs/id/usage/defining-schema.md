# Mendefinisikan model dan field

Model dan field didaftarkan saat runtime, tanpa migration. Halaman ini membahas cara mendaftarkannya, membuat field-nya bisa di-query, dan membaca kembali skemanya.

## Membuat model dengan SchemaBuilder

`schemaBuilder()` mendaftarkan sebuah model beserta field-nya dalam satu pemanggilan dan mengembalikan id-nya:

```php
use StarDust\Schema\FieldDefinition;

$company = $engine->schemaBuilder()->createModel(tenantId: 1, name: 'company', fields: [
    new FieldDefinition('name',      'string', isFilterable: true),
    new FieldDefinition('employees', 'int',    isFilterable: true),
    new FieldDefinition('notes',     'string'),
]);

$company->modelId;            // id model
$company->fieldId('name');    // id sebuah field, dicari lewat namanya
```

Setiap `FieldDefinition` menerima nama, declared type (`string`, `int`, `numeric`, atau `datetime`), dan flag `isFilterable` yang bawaannya `false`. Jadikan field filterable hanya bila Anda perlu memfilter atau mengurutkan berdasarkan field itu. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).

Untuk pendaftaran yang lebih terperinci ada dua method yang lebih kecil. `defineModel(int $tenantId, string $name)` mendaftarkan model tanpa field dan mengembalikan id-nya. `defineField(int $modelId, string $name, string $declaredType, bool $isFilterable = false)` menambahkan satu field ke model yang sudah ada dan mengembalikan id-nya.

`SchemaBuilder` hanya mendaftarkan baris di registry, tidak lebih. Ia tidak menyediakan page maupun memesan slot, yang dibahas di [Menyiapkan field filterable agar bisa di-query](#menyiapkan-field-filterable-agar-bisa-di-query).

## Skrip setup aman dijalankan ulang

`createModel()`, `defineModel()`, dan `defineField()` semuanya bersifat **get-or-create**. Nama yang sudah ada mengembalikan id yang sudah ada tanpa perubahan, dan tidak ada yang dimodifikasi. Setiap pemanggilan `createModel()` berjalan dalam satu transaksi. Dengan begitu skrip seed atau setup aman dijalankan di setiap deploy:

```php
// Jalankan dua kali, id-nya sama dan tidak ada duplikat.
$first  = $engine->schemaBuilder()->createModel(1, 'company', [
    new FieldDefinition('name', 'string', isFilterable: true),
]);
$second = $engine->schemaBuilder()->createModel(1, 'company', [
    new FieldDefinition('name', 'string', isFilterable: true),
]);
// $first->modelId === $second->modelId
```

Dua konsekuensi yang perlu diingat:

- **Get-or-create hanya mencari field lewat namanya.** Menjalankan ulang dengan declared type atau flag filterable yang berbeda untuk field yang sudah ada tidak mengubahnya. Untuk mengubah salah satunya, gunakan [retype](/id/schema-changes/retype) atau [promosi dan demosi](/id/schema-changes/filterability).
- **Nama adalah kuncinya, jadi rename berpengaruh.** Setelah Anda [mengganti nama model](/id/schema-changes/renaming), skrip setup yang masih memakai nama lama tidak akan menemukannya dan akan membuat model kedua. Perbarui skrip semacam itu bersamaan dengan rename. Model yang sedang dihapus tidak bisa didaftarkan ulang sampai penghapusan selesai: `createModel()` melempar `ModelDeletionInProgressException`, bukan mengembalikan id model yang sedang dihapus.

## Menyiapkan field filterable agar bisa di-query

Mendaftarkan field hanya mencatat *niat*. Field baru menjadi filterable setelah nilainya masuk ke kolom slot terindeks.

**Pada deployment yang berjalan, ini otomatis.** Watcher menyadari field yang menunggu slot dan menyediakan page yang diindeks untuknya, lalu Reconciler mengklaim slot bagi setiap field filterable yang ia temukan belum terpetakan. Tulis satu entry yang menyentuh field itu dan ia bisa di-query sesaat kemudian, tanpa Anda memesan apa pun.

Cara manual di bawah ini untuk setup sekali jalan: skrip seed, fixture test, atau deployment yang menghendaki slot sudah tersedia sebelum penulisan pertama. Sebuah page dibuat dengan persis kolom slot yang Anda sebutkan, dan semuanya diindeks, jadi sebutkan slot yang akan dipakai field filterable Anda, lalu pesan satu slot per field:

```php
use StarDust\Page\PageProvisioner;
use StarDust\Slot\SlotReserver;

// Sediakan satu page berisi dua slot yang akan dipakai field filterable.
// Daftarnya tidak boleh kosong.
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

Sebelum sebuah field punya slot, ia tetap tersimpan dan bisa dibaca dari payload JSON, hanya tidak berada di jalur filter terindeks. Lihat [Slot dan page](/id/concepts/slots-and-pages).

## Menampilkan daftar model milik tenant

`listModels()` membaca kembali registry, untuk layar pengaturan atau pemilih model. Pakai method ini, jangan meng-query tabel registry sendiri:

```php
foreach ($engine->listModels(tenantId: 1) as $model) {
    echo "{$model->modelId}: {$model->name}\n";
}
```

Hasilnya berupa daftar objek `ModelSummary`, masing-masing membawa `modelId` dan `name`. Model yang sedang dihapus tidak ikut ditampilkan.

## Melihat detail sebuah model

`describeModel()` mengembalikan satu model beserta seluruh field-nya:

```php
$company = $engine->describeModel(tenantId: 1, modelId: $modelId);

foreach ($company?->fields ?? [] as $field) {
    echo "{$field->name} ({$field->declaredType})"
       . ($field->isIndexed ? " — bisa difilter sekarang\n" : "\n");
}

// Cari satu field lewat namanya:
$employees = $company?->field('employees');

// Hanya field yang akan diterima filter saat ini:
$company?->indexedFields();
```

Hasilnya `null` bila model tidak ada, milik tenant lain, atau sedang dihapus. Dua yang pertama sengaja dibuat tidak bisa dibedakan. Setiap field berupa `FieldDescription` dengan `fieldId`, `name`, `declaredType`, `isFilterable`, dan `isIndexed`.

### isFilterable dan isIndexed

Setiap field melaporkan **dua** flag, dan perbedaannya penting:

- `isFilterable` adalah niat yang dideklarasikan dan tercatat di registry.
- `isIndexed` adalah apakah filter pada field itu akan berfungsi *saat ini juga*.

Keduanya berbeda selama seluruh backfill promosi atau retype, dan selama field filterable yang baru didaftarkan masih menunggu kapasitas. Bangun UI filter Anda di atas `isIndexed` dan Anda tidak akan pernah menawarkan filter yang ditolak engine. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed#mengecek-apakah-field-bisa-di-query-sebelum-menawarkan-filter).
