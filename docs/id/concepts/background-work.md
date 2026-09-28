# Pekerjaan latar belakang dan konsistensi eventual

Sebagian operasi tidak bisa selesai dalam satu request tanpa mengunci seluruh tabel Anda, sehingga StarDust membaginya. Pemanggilan meng-commit apa yang bisa di registry, lalu kembali. Sebuah **daemon** di latar belakang menyusul mengerjakan sisanya dalam chunk yang terbatas.

Jeda antara "pemanggilan sudah kembali" dan "proses latar belakang sudah selesai" adalah konsep yang paling layak Anda pahami betul. Halaman ini menyebutkan operasi mana saja yang punya jeda itu, apa yang bisa dan tidak bisa Anda lakukan selama jeda tersebut, dan mengapa Reconciler yang berjalan bukanlah hal opsional.

## Mana yang selesai saat method kembali, mana yang belum

| Operasi | Saat kembali | Yang tersisa di latar belakang |
| :-- | :-- | :-- |
| `write()`, `updateEntry()`, `deleteEntry()` | Selesai. | Hanya jika ada field filterable yang belum kebagian slot bebas: Reconciler menyalinnya kemudian. |
| `bulkWrite()` | Selesai, chunk demi chunk. | Tidak ada. |
| `submitBulkWrite()` | Batch diterima sebagai job. | Reconciler yang mengimpornya. |
| `renameModel()` | Selesai. | Tidak ada. |
| `demoteFieldFromFilterable()` | Langsung berlaku. | Liberator mereklamasi slotnya. |
| `promoteFieldToFilterable()` | Registry diperbarui. | Reconciler mengisi slot baru dari payload yang tersimpan. |
| `retypeField()` pada field filterable | Registry diperbarui. | Reconciler mengonversi nilai tersimpan ke slot baru. |
| `retypeField()` pada field non-filterable | Selesai. | Tidak ada. |
| `renameField()` | Registry diperbarui. | Reconciler menulis ulang setiap entry dalam model. |
| `deleteField()` | Field lenyap dari semua API. | Reconciler membersihkan nilai yang tersimpan. |
| `deleteModel()` | Model lenyap dari semua API. | Reconciler menghapus entry-nya. |
| `submitExport()` | Job diterima. | Chronicler menulis filenya. |
| `compactModel()` | Menunggu sampai selesai. | Membutuhkan Reconciler yang berjalan agar bisa maju. |

Operasi yang kembali sebelum selesai mencatat progresnya secara permanen, sehingga daemon yang crash melanjutkan dari titik terakhirnya, bukan mengulang dari awal.

## Backfill window

**Backfill window** adalah rentang antara saat sebuah operasi skema kembali dan saat proses latar belakangnya selesai: periode ketika perubahan sudah *dideklarasikan* tetapi belum sepenuhnya *diterapkan* ke data yang tersimpan. Setiap operasi asinkron pada tabel di atas punya window: promosi, retype, rename field, penghapusan field, dan penghapusan model.

**Backfill** adalah proses latar belakang yang mengisi slot dengan nilai yang dibaca dari payload yang sudah tersimpan, atau menulis ulang payload yang tersimpan. Prosesnya berjalan dalam chunk yang terbatas sehingga tidak pernah mengunci database Anda, dan inilah yang mengubah field yang baru filterable menjadi indexed.

## Apa yang terlihat oleh pembacaan selama window

Apa yang tetap berfungsi selama window itu disengaja:

| | Selama window |
| :-- | :-- |
| **Pembacaan** | Tetap mengembalikan field tersebut, dilayani dari payload JSON. |
| **Penulisan** | Tetap diterima, dan masuk ke slot baru maupun payload. |
| **Filter pada field yang sedang diproses** | Ditolak dengan exception bertipe, tidak pernah dijawab dengan hasil yang salah. |

Perbedaannya menurut operasi:

- **Promosi dan retype.** Field bisa dibaca dan ditulis, tetapi filter padanya memunculkan `FieldNotFilterableException` dan pengurutan memunculkan `FieldNotSortableException` sampai slotnya siap. Nilai hasil retype yang tidak bisa dikonversi menjadi null *hanya di slot*. Payload tetap menyimpan nilai aslinya.
- **Rename field.** Pembacaan mengembalikan nilai dengan nama baru untuk setiap entry, baik yang sudah dimigrasi maupun belum. Klien yang masih mengirim nama lama tetap berfungsi, karena penulisan masuk ditulis ulang ke nama baru. Filter dengan nama baru langsung bekerja begitu pemanggilan kembali. Filter dengan nama lama ditolak dengan `UnknownFieldException`.
- **Penghapusan field.** Field lenyap dari setiap pembacaan, penulisan, filter, dan ekspor CSV baru begitu pemanggilan kembali. Sampai proses pembersihan selesai, nilainya masih tersimpan secara fisik: tidak terjangkau lewat API tetapi terlihat di dump tabel mentah. Nama field itu belum bisa dipakai ulang sebelum pembersihan selesai.
- **Penghapusan model.** Pembacaan menjadi gelap (halaman kosong, `null` dari `get()`), dan penulisan ditolak dengan `ModelDeletionInProgressException`.

[Mengubah skema](/id/schema-changes/) membahas tiap operasi secara rinci, termasuk apa saja yang ia halangi.

## Mengapa Reconciler harus selalu berjalan

Hampir setiap window di bagian ini tertutup karena sebuah **Reconciler** yang menutupnya. Ia menguras semua jenis pekerjaan tertunda yang dihasilkan engine: sync queue, impor asinkron, backfill promosi dan retype, penulisan ulang akibat rename, dan kedua proses pembersihan akibat penghapusan. Tanpa Reconciler yang berjalan, tidak satu pun dari itu maju, dan window-nya tetap terbuka selamanya.

Gejala Reconciler yang tidak berjalan selalu serupa:

- field yang Anda promosikan tidak kunjung bisa difilter;
- `isIndexed` tetap `false` sementara `isFilterable` bernilai `true`;
- rename atau penghapusan tidak pernah selesai;
- import job tetap berstatus `pending`;
- sync queue terus membesar.

Jalankan minimal satu Reconciler, sebagai proses persisten atau lewat `bin/stardust tick` di baris cron. Lihat [Deployment](/id/operations/deployment) untuk kedua modenya dan [Reconciler](/id/operations/reconciler) untuk penjelasan tugasnya. Jika ada yang macet, mulailah dari [Pemecahan masalah](/id/operations/troubleshooting#rename-retype-atau-penghapusan-tidak-kunjung-selesai).
