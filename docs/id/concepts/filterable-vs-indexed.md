# Filterable vs. indexed

Dua kata yang terdengar bersinonim ini sebenarnya menggambarkan dua saat yang berbeda. Memahami bedanya menjelaskan kejutan yang paling sering terjadi di StarDust: field yang baru saja Anda tandai filterable ternyata belum bisa difilter *saat itu juga*.

## Filterable adalah niat

**Filterable** adalah flag pada sebuah field. Flag ini mencatat bahwa Anda *ingin* field tersebut bisa dipakai dalam filter dan pengurutan, dan flag inilah yang menentukan apakah field itu mendapat [slot](/id/concepts/slots-and-pages) atau tidak.

- Field filterable disalin ke kolom slot terindeks dan bisa dipakai di filter dan pengurutan.
- Field non-filterable hanya berada di payload JSON. Ia tetap ditulis dan tetap dikembalikan oleh pembacaan, tetapi tidak bisa di-query. Itulah pilihan bawaan yang lebih murah: tidak memakai slot dan tidak menambah beban pemeliharaan index.

Menyalakan flag hanya mengubah apa yang tercatat di registry. Flag itu sendiri tidak memasukkan nilai apa pun ke index.

## Indexed adalah kenyataan

Sebuah field berstatus **indexed** ketika slotnya aktif *saat ini juga*, artinya filter pada field itu benar-benar akan berfungsi. Inilah properti yang perlu dicek kode Anda sebelum menawarkan sebuah filter.

Setiap field yang dideskripsikan oleh `describeModel()` melaporkan keduanya:

| Properti | Artinya |
| :-- | :-- |
| `isFilterable` | Niat yang dideklarasikan dan tercatat di registry. |
| `isIndexed` | Apakah filter pada field ini akan berfungsi saat ini juga. |

## Saat keduanya tidak sama

`isFilterable` dan `isIndexed` berbeda selama seluruh [backfill window](/id/concepts/background-work#backfill-window), dan juga selama field filterable yang baru didaftarkan masih menunggu kapasitas. Contoh yang umum:

- Anda [mempromosikan](/id/schema-changes/filterability) field yang sudah ada menjadi filterable. Ia langsung `isFilterable: true`, dan `isIndexed: false` sampai Reconciler selesai menyalin semua nilai tersimpan ke slot baru.
- Anda me-[retype](/id/schema-changes/retype) field filterable. Slot lamanya di-tombstone dan slot baru diisi, jadi ia belum indexed sampai proses itu selesai.
- Anda mendaftarkan field filterable pada sistem yang belum punya slot bebas untuknya. Ia baru menjadi indexed setelah Watcher menyediakan page dan Reconciler mengklaim slot.

Engine menegakkan perbedaan ini lewat **pre-flight rejection**: memfilter atau mengurutkan berdasarkan field yang tidak dikenal, tidak filterable, atau belum indexed akan memunculkan exception bertipe di batas API, sebelum database disentuh sama sekali. Anda mendapat error yang jelas, cepat, dan bisa di-catch, bukan query yang tampak berjalan lalu melakukan table scan seiring tenant membesar.

| Situasi | Exception |
| :-- | :-- |
| Nama field tidak terdaftar di model | `UnknownFieldException` |
| Field tidak filterable (memang tidak pernah, atau sudah didemosikan) | `FieldNotFilterableException` |
| Field filterable tetapi slotnya belum aktif | `FieldNotFilterableException` |
| Mengurutkan berdasarkan field yang tidak punya slot aktif | `FieldNotSortableException` |

Inilah exception yang perlu Anda tangkap saat menyusun filter dari input pengguna. Daftar lengkapnya ada di [Error](/id/reference/errors).

**Dua baris di tengah memunculkan exception yang sama, dan pesannya bisa menyesatkan.** Selama backfill window, registry menyatakan field itu filterable, tetapi filter padanya ditolak dengan `FieldNotFilterableException` ("not filterable on the active driver"). Registry-nya benar dan pesan itu sebenarnya menggambarkan index yang belum ada. Jangan memakai exception untuk membedakan kedua kasus. Baca `isIndexed` dari `describeModel()`. Kelas `FieldNotIndexedException` memang ada, tetapi engine saat ini tidak memunculkannya.

## Penulisan tidak pernah gagal karena kehabisan slot

Penulisan tetap tersedia meskipun kapasitas slot habis. Bila Anda menulis field filterable dan tidak ada slot yang bisa diklaim untuknya, engine akan:

1. menyimpan nilainya di payload JSON seperti biasa;
2. memasukkan entry ke sync queue kecil, dalam transaksi yang sama;
3. mengembalikan sukses, dengan `EntryWriteResult::$enqueuedForBackfill` bernilai `true`.

Inilah **exhaustion fallback**. Ia ada supaya page yang penuh tidak pernah berubah menjadi request yang gagal. Watcher kemudian menyediakan page yang punya ruang dan Reconciler menguras sync queue, menyalin nilai ke slotnya.

Harganya, entry yang terdampak untuk sementara tidak terlihat oleh filter pada field itu. Mereka tetap dikembalikan oleh pembacaan dan oleh `get()`, karena keduanya berasal dari payload. Sync queue yang terus membesar berarti Reconciler tidak berjalan, atau Watcher tidak mengejar kebutuhan kapasitas. Lihat [Pemecahan masalah](/id/operations/troubleshooting).

## Mengecek apakah field bisa di-query sebelum menawarkan filter

Jadikan `isIndexed`, bukan `isFilterable`, sebagai syarat tampilnya UI atau API filter Anda, dan Anda tidak akan pernah menawarkan filter yang akan ditolak engine:

```php
$model = $engine->describeModel(tenantId: 42, modelId: $modelId);

// Hanya field yang akan diterima filter saat ini:
foreach ($model?->indexedFields() ?? [] as $field) {
    echo "{$field->name} ({$field->declaredType})\n";
}

// Atau periksa satu field:
$field = $model?->field('employees');
if ($field !== null && $field->isFilterable && !$field->isIndexed) {
    // Sudah dideklarasikan filterable, tetapi backfill atau slot masih tertunda.
    // Tampilkan sebagai "sedang diindeks…", jangan tawarkan filter yang akan ditolak.
}
```

`describeModel()` mengembalikan `null` bila model tidak ada atau milik tenant lain. API introspeksi dibahas lengkap di [Mendefinisikan model dan field](/id/usage/defining-schema#melihat-detail-sebuah-model).
