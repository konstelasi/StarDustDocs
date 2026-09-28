# Menghapus field

```php
$deleted = $engine->deleteField(tenantId: 42, fieldId: $fieldId);
```

Kembali begitu registry diperbarui; membersihkan nilainya dari entry yang sudah tersimpan berjalan di latar belakang dan **membutuhkan Reconciler yang berjalan**. Mengembalikan `false`, bukan melempar exception, saat memang tidak ada yang perlu dilakukan — field-nya tidak ada untuk tenant ini, atau penghapusannya sudah berjalan — bentuk idempoten yang sama dengan [`deleteEntry()`](/id/usage/updating-and-deleting).

## Yang langsung hilang

Field itu lenyap dari semua yang bisa Anda amati begitu method-nya kembali: `read()`, `search()`, `get()`, dan `describeModel()` berhenti melaporkannya, filter padanya memunculkan `UnknownFieldException`, dan slot terindeks yang dipegangnya dilepas untuk direklamasi [Liberator](/id/operations/liberator). Ekspor CSV baru akan membuang kolomnya, dan penulisan yang masih mengirim namanya cukup kehilangan nilai itu tanpa ditolak — sisa entry-nya tetap layak disimpan.

## Pembersihan di latar belakang

Yang tertinggal adalah data yang tersimpan. Payload JSON setiap entry memakai nama field sebagai key, jadi menghapus field berarti menulis ulang setiap entry dalam model itu, dan [Reconciler](/id/operations/reconciler) mengerjakannya per chunk yang terbatas. Sampai selesai, nilainya masih secara fisik tersimpan — tidak terjangkau lewat semua permukaan di atas, tetapi ekspor JSON yang kebetulan berjalan selama window itu adalah satu-satunya tempat nilainya masih bisa muncul, karena artifact JSON adalah payload mentah, bukan sesuatu yang diproyeksikan sesuai skema saat ini. Lihat [JSON adalah payload mentah](/id/usage/exports#format-csv-dan-json).

Baris registry field itu dihapus terakhir, sebagai langkah penutup dari pembersihannya — itulah tanda penghapusannya benar-benar selesai, bukan sekadar diterima.

## Memakai kembali nama field

Nama itu belum bisa dipakai lagi sebelum pembersihannya selesai. Mendaftarkan field baru dengan nama yang sama pada model yang sama akan memunculkan `FieldDeletionInProgressException`, bukan diam-diam mengembalikan field yang sedang dihapus.

## Batasan

Field tidak bisa dihapus selagi sedang punya rename atau retype yang berjalan — `RenameInProgressException` atau `RetypeInProgressException` — dan sebaliknya juga berlaku: begitu penghapusan dimulai, field itu tidak bisa di-rename, di-retype, dipromosikan, didemosikan, atau ikut direlokasi oleh [compaction](/id/operations/slot-maintenance). Compaction adalah satu-satunya pengecualian yang tidak melempar exception: field yang sedang dihapus sudah kehilangan slot dan flag filterable-nya lebih dulu, sehingga planner-nya memang tidak bisa melihatnya untuk direncanakan. Lihat [Operasi yang saling menghalangi](/id/schema-changes/#operasi-yang-saling-menghalangi).

Tidak ada undelete. Kalau Anda mungkin masih membutuhkan nilainya, [ekspor modelnya](/id/usage/exports) sebelum menghapus field-nya.
