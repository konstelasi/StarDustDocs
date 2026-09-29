# Mengubah skema

Ada lima operasi yang mengubah bentuk sebuah model setelah entry-nya sudah ada: [mengubah tipe field](/id/schema-changes/retype), [promosi atau demosi filterability](/id/schema-changes/filterability), [mengganti nama field atau model](/id/schema-changes/renaming), [menghapus field](/id/schema-changes/deleting-fields), dan [menghapus model](/id/schema-changes/deleting-models). Setiap halaman membahas satu operasi secara lengkap. Halaman ini membahas kesamaan di antara semuanya: mana yang selesai saat method-nya kembali dan mana yang belum, mana yang saling menghalangi bila dijalankan bersamaan, dan mengapa Anda perlu mengekspor dulu sebelum menjalankan yang tidak bisa dibatalkan.

## Perubahan instan dan perubahan di latar belakang

Mengganti nama model dan mendemosikan field langsung berlaku begitu method-nya kembali. Semua operasi lainnya membuka <Term id="backfill-window">backfill window</Term> — registry langsung diperbarui, tetapi data yang tersimpan baru menyusul, dan proses menyusul itu **membutuhkan Reconciler yang berjalan**. Lihat [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work) untuk tabel lengkap tentang apa yang selesai saat method kembali dan apa yang tersisa untuk daemon, serta apa yang terlihat oleh pembacaan, penulisan, dan filter selama window itu.

Versi singkatnya, khusus untuk perubahan skema:

| Operasi | Saat kembali | Yang tersisa untuk Reconciler |
| :-- | :-- | :-- |
| Retype pada field non-filterable | Selesai. | Tidak ada. |
| Retype pada field filterable | Registry diperbarui; slot lama di-tombstone. | Mengisi slot baru dari payload yang tersimpan. |
| Mempromosikan field jadi filterable | Registry diperbarui. | Mengisi slot baru dari payload yang tersimpan. |
| Mendemosikan field | Selesai. | Tidak ada — [Liberator](/id/operations/liberator) yang mereklamasi slot yang di-tombstone, dan itu tidak membutuhkan Reconciler. |
| Mengganti nama model | Selesai. | Tidak ada. |
| Mengganti nama field | Registry diperbarui. | Menulis ulang setiap entry dalam model. |
| Menghapus field | Lenyap dari semua API. | Membersihkan nilainya dari payload yang tersimpan. |
| Menghapus model | Lenyap dari semua API. | Menghapus entry-nya. |

## Operasi yang saling menghalangi

Sebuah field hanya bisa berada dalam satu jenis lifecycle pada satu waktu, dan engine mengeceknya dalam urutan yang tetap — **rename, lalu retype, lalu penghapusan** — sehingga dua operasi yang berebut field yang sama tidak pernah mengira keduanya punya jalan bebas:

| Memulai ini… | …ditolak bila field-nya sedang punya | dengan |
| :-- | :-- | :-- |
| Rename | rename atau retype yang sedang berjalan | `RenameInProgressException` / `RetypeInProgressException` |
| Retype, promosi, demosi, atau relokasi [compaction](/id/operations/slot-maintenance) | rename yang sedang berjalan, atau retype yang sedang berjalan (termasuk relokasi yang masih berlangsung) | `RenameInProgressException` / `RetypeInProgressException` |
| Penghapusan field | rename atau retype yang sedang berjalan | `RenameInProgressException` / `RetypeInProgressException` |

Tidak ada satu pun dari ketiganya yang bisa dimulai pada field yang sedang dihapus — penanda `deleted_at` milik penghapusan itu sendiri membuat rename dan retype langsung menolaknya, dengan `FieldDeletionInProgressException`. Field yang sedang di-rename juga tidak bisa dihapus, dipromosikan, didemosikan, atau ikut compaction sampai penulisan ulangnya selesai.

Penghapusan model melebarkan pengecekan yang sama ke setiap field yang dimiliki model itu:

| Memulai ini… | …ditolak bila ada field milik model yang sedang punya | dengan |
| :-- | :-- | :-- |
| Penghapusan model | rename yang berjalan | `RenameInProgressException` |
| | retype yang berjalan | `RetypeInProgressException` |
| | penghapusan yang berjalan | `FieldDeletionInProgressException` |

Compaction adalah satu-satunya kasus yang tidak simetris, dan ini layak diketahui: field yang sedang dihapus tidak membuat compaction melempar exception. Field itu hanya tidak akan pernah bisa *direncanakan*, karena field yang sedang dihapus sudah kehilangan slot dan flag filterable-nya lebih dulu — compaction cuma memindahkan apa yang tersisa. Lihat [Saat compaction menolak berjalan](/id/operations/slot-maintenance#saat-compaction-menolak-berjalan).

## Ekspor dulu sebelum menghapus

Dua dari operasi ini menghapus data tanpa jalan kembali: menghapus field membuang nilainya secara permanen begitu pembersihannya selesai, dan [menghapus model](/id/schema-changes/deleting-models) membuang entry-nya secara permanen — **satu-satunya operasi di engine yang benar-benar menghapus baris data secara fisik**. Tidak satu pun dari keduanya punya undelete.

Kalau Anda mungkin masih membutuhkan datanya nanti, [ekspor dulu](/id/usage/exports) dan tunggu job-nya selesai sebelum menghapus. Ekspor yang sudah diklaim saat penghapusan model dimulai hanya akan menghasilkan artifact kosong, bukan gagal — jadi urutannya penting: kirim dan selesaikan ekspornya dulu.
