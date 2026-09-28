# Promosi dan demosi filterability

Mempromosikan sebuah field membuatnya filterable tanpa mengubah declared type-nya; mendemosikannya membalikkan itu. Keduanya melewati lifecycle yang sama dengan [retype](/id/schema-changes/retype) — bahkan penjagaannya sama, dan memulai salah satu dari keduanya selagi field itu sedang punya rename atau retype yang berjalan akan ditolak dengan `RenameInProgressException` atau `RetypeInProgressException`, atau dengan `FieldDeletionInProgressException` bila field-nya sedang dihapus. Bedanya dari retype, tidak satu pun dari kedua operasi ini mengonversi nilai apa pun: declared type-nya tetap sama seperti semula, jadi tidak ada yang perlu dikoersi.

## Promosi field

```php
$engine->promoteFieldToFilterable(
    tenantId: 42,
    fieldId:  $fieldId,
);
```

Slot baru yang terindeks, di keluarga declared type field itu, direservasi dan di-backfill dari payload JSON yang sudah tersimpan — atau reservasinya ditunda sampai [Watcher](/id/operations/watcher) menyediakan kapasitas, bila belum ada yang bebas saat ini. Biasanya tidak ada slot lama yang perlu di-tombstone, karena field hanya memegang satu slot selama ia filterable.

Field itu langsung `isFilterable: true` begitu method-nya kembali, tetapi belum `isIndexed: true` — itu baru berubah setelah [Reconciler](/id/operations/reconciler) menyelesaikan backfill-nya. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed) untuk apa yang bisa dan tidak bisa Anda lakukan pada field itu selama jeda tersebut.

## Demosi field

```php
$engine->demoteFieldFromFilterable(
    tenantId: 42,
    fieldId:  $fieldId,
);
```

Registry-only dan selesai begitu method-nya kembali — tidak ada backfill window sama sekali. Slot field itu langsung di-[tombstone](/id/concepts/slots-and-pages#tombstoned-lalu-direklamasi) untuk direklamasi [Liberator](/id/operations/liberator), dan sejak saat itu filter atau pengurutan pada field itu memunculkan `FieldNotFilterableException` atau `FieldNotSortableException`. Pembacaan tidak terpengaruh: field-nya tetap dikembalikan dengan benar, dilayani dari payload JSON seperti field non-filterable pada umumnya.

## Apa yang terjadi pada slot-nya

Promosi mengklaim slot bebas seperti field filterable lainnya: dari page mana pun yang sudah punya slot aktif untuk model yang sama, atau page tertua yang masih punya ruang bila modelnya belum punya slot sama sekali. Lihat [Siklus hidup slot](/id/concepts/slots-and-pages#siklus-hidup-slot) untuk progresi lengkap `free → assigned → backfilling → ready`.

Demosi tidak pernah membiarkan slot menggantung. Ia men-tombstone pada pemanggilan yang sama yang membersihkan `isFilterable`, sehingga selalu ada satu titik pasti setelahnya di mana slot itu dijamin sudah tidak aktif — reklamasi oleh Liberator adalah langkah pembersihan, bukan sesuatu yang menjadi tumpuan kebenaran data field yang didemosikan.

Mempromosikan lalu mendemosikan field yang sama, atau sebaliknya, tidak dibatasi selain oleh penjagaan lifecycle biasa: setiap operasi selesai (atau membuka window-nya sendiri) secara independen, dan sebuah field bisa dipromosikan lagi nanti tanpa membawa jejak apa pun dari slot lamanya.
