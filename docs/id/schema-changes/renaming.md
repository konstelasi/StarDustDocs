# Mengganti nama field dan model

Mengganti nama model dan mengganti nama field terlihat serupa dari signature pemanggilannya, tetapi keduanya sama sekali berbeda di baliknya: nama model hanyalah label yang tidak dipakai sebagai kunci oleh apa pun, sementara nama field adalah key literal tempat payload JSON setiap entry menyimpan nilainya. Lihat [Nama hanyalah label, id adalah identitas](/id/concepts/tenants-models-fields#nama-hanyalah-label-id-adalah-identitas) untuk alasan perbedaan ini ada.

## Mengganti nama model

```php
$engine->renameModel(tenantId: 42, modelId: $modelId, newName: 'organization');
```

Seketika dan selesai begitu method-nya kembali. Entry, slot, filter, dan ekspor semuanya berpatokan pada id model, bukan namanya, sehingga tidak satu pun dari mereka yang terpengaruh. `ModelNameConflictException` dimunculkan bila model lain di tenant yang sama sudah memakai nama tujuannya.

### Sesuaikan skrip setup Anda

`createModel()` dan `defineModel()` mencari model yang sudah ada lewat namanya. Setelah rename, skrip setup atau seed yang masih memakai nama lama tidak akan menemukan model yang sudah diganti namanya — ia akan mendaftarkan model *kedua* dengan nama lama itu, bukan mengembalikan id model yang Anda ganti namanya. Perbarui skrip semacam itu dalam perubahan yang sama dengan rename-nya. Lihat [Skrip setup aman dijalankan ulang](/id/usage/defining-schema#skrip-setup-aman-dijalankan-ulang).

## Mengganti nama field

```php
$engine->renameField(tenantId: 42, fieldId: $fieldId, newName: 'company_size');
```

Kembali begitu registry diperbarui; data yang tersimpan menyusul secara asinkron dan **membutuhkan Reconciler yang berjalan**. Karena payload setiap entry memakai nama field sebagai key, ini adalah penulisan ulang seluruh entry dalam model itu, bukan sekadar perubahan registry — bentuknya lebih dekat ke retype dibanding ke rename model.

### Yang tetap berfungsi selama penulisan ulang

- **Pembacaan** mengembalikan nilainya dengan nama baru untuk setiap entry, baik yang sudah dimigrasikan maupun belum.
- **Penulisan** yang masih memakai nama field lama tetap berfungsi: engine menulis ulang key-nya ke nama baru sebelum disimpan.
- **Filter dengan nama baru** langsung berfungsi begitu method-nya kembali — rename tidak pernah mengganggu index, jadi tidak ada yang perlu ditunggu di sisi itu.

### Yang ditolak

- **Filter dengan nama lama** ditolak sepenuhnya dengan `UnknownFieldException`, bukan diam-diam tidak mencocokkan apa pun. Filter membutuhkan kegagalan yang jelas dan bisa di-catch; penulisan tidak, itulah sebabnya kedua sisi ini berbeda perlakuannya.
- **Nama baru tidak tersedia di tempat lain** sampai penulisan ulangnya selesai: mendaftarkan field lain dengan nama itu akan memunculkan `FieldNameConflictException`.
- **Field itu sendiri terkunci selama proses berlangsung.** Ia tidak bisa di-retype, dipromosikan, didemosikan, dihapus, atau ikut direlokasi oleh [compaction](/id/operations/slot-maintenance) sampai penulisan ulangnya selesai — lihat [Operasi yang saling menghalangi](/id/schema-changes/#operasi-yang-saling-menghalangi).

Satu format ekspor menjembatani rename ini, satu lagi tidak: ekspor CSV menentukan header-nya saat job berjalan, sehingga selalu memakai nama yang berlaku saat itu, sementara ekspor JSON adalah payload mentah yang tersimpan dan masih bisa menunjukkan key lama untuk baris yang belum sempat ditulis ulang. Lihat [Format CSV dan JSON](/id/usage/exports#format-csv-dan-json).
