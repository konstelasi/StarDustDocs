# Mengubah tipe field

`retypeField()` mengubah declared type sebuah field, yaitu salah satu dari `string`, `int`, `numeric`, atau `datetime`. Karena setiap tipe punya [keluarga slot](/id/concepts/tenants-models-fields#empat-keluarga-slot) sendiri, field filterable tidak bisa mengonversi slotnya di tempat. Ia mendapat slot baru di keluarga tujuan, dan nilai-nilai lama dikonversi ke sana selama sebuah backfill.

## Memulai retype

```php
$engine->retypeField(
    tenantId:        42,
    fieldId:         $fieldId,
    newDeclaredType: 'int',
);
```

Yang terjadi bergantung pada apakah field itu filterable saat ini:

- **Tidak filterable.** Registry-only dan selesai begitu method-nya kembali. Tidak ada slot yang perlu diganti, dan payload JSON memang sudah menjadi satu-satunya salinan, jadi tidak ada yang perlu di-backfill.
- <Term id="filterable">Filterable</Term>. Slot aktif yang sekarang di-[tombstone](/id/concepts/slots-and-pages#tombstoned-lalu-direklamasi) untuk direklamasi [Liberator](/id/operations/liberator), dan slot baru di keluarga tujuan masuk ke state `backfilling`. Bila belum ada slot terindeks yang bebas dan cocok, reservasinya ditunda. [Reconciler](/id/operations/reconciler) kemudian mengonversi nilai tersimpan field itu ke slot baru per chunk, dan mengubahnya menjadi `ready` pada chunk terakhir.

Retype kedua yang dimulai pada field yang sudah punya retype berjalan akan memunculkan `RetypeInProgressException`. Field yang sedang di-rename menolak dengan `RenameInProgressException`, karena me-retype berdasarkan nama akan membaca setiap baris yang belum dimigrasikan seolah field itu tidak ada. Field yang sedang dihapus menolak lewat kedua jalan itu juga, dengan `FieldDeletionInProgressException`. Lihat [Operasi yang saling menghalangi](/id/schema-changes/#operasi-yang-saling-menghalangi) untuk tabel lengkap penjagaannya.

## Aturan koersi

Mengonversi ke tipe yang sama hanya lewat begitu saja (nilai `datetime` dinormalisasi ke format tersimpan slotnya). Antar tipe yang berbeda, masing-masing dari delapan pasangan yang didukung punya aturan konversinya sendiri:

| Dari → ke | Aturan |
| :-- | :-- |
| `string` → `int` | Hanya literal integer basis-10, tanpa desimal, tanpa pemisah ribuan, dan tanpa `+` di depan. Harus masuk dalam integer 64-bit bertanda. |
| `string` → `numeric` | Literal angka JSON, yang terdiri dari tanda opsional, digit, pecahan opsional, dan eksponen opsional. Tidak menerima `NaN` atau `Infinity`. |
| `string` → `datetime` | RFC 3339 ketat dengan offset UTC eksplisit (`Z` atau `±HH:MM`) dan pecahan detik paling banyak enam digit. Nilai tanpa offset, dengan pecahan lebih panjang, atau dengan tanggal yang tidak ada seperti `2026-02-31`, tidak akan terkonversi. |
| `int` → `string` | Digit desimal, dengan `-` di depan untuk nilai negatif. |
| `int` → `numeric` | Tanpa kehilangan apa pun, karena setiap nilai `int` bisa direpresentasikan sebagai `numeric`. |
| `numeric` → `string` | Bentuk desimal paling singkat yang bisa dibalik lagi, tanpa notasi ilmiah. |
| `numeric` → `int` | Hanya bila nilainya sudah bernilai bulat dan masuk rentang integer 64-bit bertanda. Tidak dibulatkan dan tidak dipotong bila punya pecahan. |
| `datetime` → `string` | RFC 3339, dinormalisasi ke UTC dengan akhiran `Z`. |

## Pasangan tipe yang ditolak

`int ↔ datetime` dan `numeric ↔ datetime` ditolak sepenuhnya, sebelum apa pun di registry berubah, dengan `IncompatibleRetypeException`. Menafsirkan sebuah angka sebagai epoch timestamp (atau sebaliknya) adalah keputusan tentang makna data Anda yang tidak akan diambil engine secara diam-diam. Konversikan lewat field perantara bertipe `string` bila Anda memang membutuhkan migrasi semacam itu.

## Nilai yang gagal dikonversi

Nilai yang tidak cocok dengan aturannya menjadi `null` **hanya di slot**. Payload tetap menyimpan nilai aslinya, sehingga pembacaan tidak terpengaruh. Hanya filter atau pengurutan pada field itu yang akan melihat kekosongannya, dan itu tidak pernah memunculkan error. Setiap kegagalan memicu event audit `coercion_null` yang membawa satu dari sejumlah alasan tertutup: `out_of_range`, `non_integer` (nilai `numeric` yang tidak bulat menuju `int`), `malformed_datetime`, `malformed_number`, atau `unparseable`.

Nilai sumber yang tidak ada atau bernilai JSON `null` bukan kegagalan koersi sama sekali. Ia dibiarkan kosong, tanpa event, dan slot barunya memang tidak menyimpan apa-apa di sana.

## Selama backfill window

Pembacaan dan penulisan pada field itu tetap berfungsi sepanjang window ini. Pembacaan berasal dari payload, dan penulisan masuk ke slot baru selagi terisi. Yang tidak tersedia adalah memfilter dan mengurutkan: keduanya memunculkan exception bertipe (`FieldNotFilterableException` untuk filter, `FieldNotSortableException` untuk pengurutan) sampai slot barunya mencapai `ready`. Lihat [Apa yang terlihat oleh pembacaan selama window](/id/concepts/background-work#apa-yang-terlihat-oleh-pembacaan-selama-window) dan [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).

Anda juga tidak bisa memulai retype kedua, promosi, demosi, atau relokasi [compaction](/id/operations/slot-maintenance) pada field itu sampai yang ini selesai. Compaction untuk seluruh *model*-nya pun ikut ditolak, termasuk dry run, selama salah satu field-nya masih punya retype yang berjalan. Lihat [Saat compaction menolak berjalan](/id/operations/slot-maintenance#saat-compaction-menolak-berjalan).

Begitu backfill-nya selesai, dua advisory sekali-jalan otomatis terpicu: sampel cardinality untuk slot baru, dan sampel spread untuk model itu, karena retype bisa menempatkan sebuah field di page yang sebelumnya belum ditempati modelnya. Keduanya dibahas di [Perawatan slot](/id/operations/slot-maintenance).
