# Menulis entry

`write()` menyimpan satu entry dan kembali setelah datanya ter-commit. Halaman ini membahas cara menyusun payload, apa yang dikembalikan, bagaimana nilai dikonversi, dan apa yang terjadi ketika kapasitas slot habis. Untuk menulis banyak entry sekaligus, lihat [Impor massal dan asinkron](/id/usage/bulk-imports). Untuk mengubah atau menghapus entry yang sudah ada, lihat [Memperbarui dan menghapus entry](/id/usage/updating-and-deleting).

## Menyusun EntryPayload

`EntryPayload` membawa tenant, model, dan nilai-nilai field:

```php
use StarDust\Write\EntryPayload;

$payload = new EntryPayload(
    tenantId: 42,
    modelId:  $modelId,
    fields:   ['name' => 'Acme', 'employees' => 120],
);
```

Kalau entry datang dari luar (CMS, body HTTP, antrean), susun payload dari array atau string JSON. Envelope-nya adalah `{tenantId, modelId, fields}`, dengan penulisan camelCase:

```php
// Dari array hasil decode:
$payload = EntryPayload::fromArray([
    'tenantId' => 42,
    'modelId'  => $modelId,
    'fields'   => ['name' => 'Acme', 'employees' => 120],
]);

// Dari objek JSON mentah:
$payload = EntryPayload::fromJson($rawJsonObjectBody);

// Untuk pemanggilan bulk, array JSON (atau list PHP) berisi envelope:
$payloads = EntryPayload::listFromJson($rawJsonArrayBody);
$payloads = EntryPayload::listFromArray($decodedEnvelopes);
```

Factory ini hanya memvalidasi bentuk envelope dan mengembalikan `EntryPayload` biasa, sehingga payload buatan factory melewati jalur tulis yang persis sama dengan yang dibuat memakai `new`. Envelope yang cacat memunculkan `MalformedEntryPayloadException`, yang `$key`-nya menunjuk bagian yang bermasalah, misalnya `'tenantId'` atau `'[3].modelId'`. Aturan tenant id dan koersi per field ditegakkan di jalur tulis, bukan oleh factory.

Anda juga bisa memberikan `correlationId` sendiri pada payload mana pun agar event lognya menyatu dengan request id Anda. Lihat [Observabilitas](/id/operations/observability).

## Penulisan tunggal

```php
$result = $engine->write($payload);
```

Penulisan berjalan dalam satu transaksi:

1. Payload lengkap dimasukkan sebagai JSON milik entry.
2. Untuk setiap field filterable yang punya slot aktif, nilainya juga ditulis ke kolom slot terindeks, satu statement per page.
3. Jika ada field filterable yang belum punya slot aktif, entry diantrekan agar diisi kemudian oleh Reconciler, dalam transaksi yang sama.

Field non-filterable hanya berada di JSON. Ia tidak pernah menempati slot dan tidak pernah masuk antrean.

Dua hal lagi berlaku untuk setiap penulisan. Tenant id harus 1 atau lebih, dan dicek sebelum SQL apa pun dijalankan. Dan key di `fields` yang bukan field terdaftar tidak dibuang: ia tetap disimpan di JSON, meski tidak akan pernah bisa difilter.

## Hasil penulisan

`write()` mengembalikan `EntryWriteResult`:

| Properti | Artinya |
| :-- | :-- |
| `entryId` | Id entry yang baru. |
| `enqueuedForBackfill` | `true` jika ada field filterable yang belum punya slot, sehingga entry diantrekan untuk Reconciler. |
| `slotsWritten` | Slot tempat nilai ditulis. |

`enqueuedForBackfill: true` bukan error. Penulisan berhasil dan entry bisa dibaca sepenuhnya. Yang untuk sementara belum ada adalah kehadirannya di filter pada field yang terdampak. Lihat [Saat kapasitas slot habis](#saat-kapasitas-slot-habis).

## Koersi tipe

Setiap nilai dikonversi ke declared type field-nya sebelum disimpan di slot. Nilai yang tidak bisa dikonversi memunculkan `UncoercibleSlotValueException`, dan tidak ada yang ditulis.

- **String.** String yang ditujukan ke slot maksimal 4 096 karakter. Nilai yang lebih panjang ditolak sebelum SQL apa pun dijalankan.
- **Datetime.** Nilai `datetime` harus berupa `DateTimeInterface`, string `Y-m-d H:i:s` tanpa zona (dianggap UTC), atau string RFC 3339 dengan offset UTC eksplisit (`Z` atau `±HH:MM`) yang dikonversi ke UTC saat ditulis. Bentuk string lain ditolak, bukan ditebak. Termasuk tanggal berformat lokal seperti `05/01/2026`: tanggal dengan garis miring dibaca bulan-dulu apa pun maksud Anda, sehingga nilai hari-dulu hanya *tampak* berhasil padahal mendarat di tanggal yang salah, diam-diam, untuk setiap tanggal hingga hari ke-12.

Aturan offset yang sama berlaku untuk batas filter. Lihat [Format wire QueryFilter](/id/usage/query-filter#datetime-wajib-menyertakan-offset).

## Saat kapasitas slot habis

Penulisan tidak pernah gagal atau terblokir karena tidak ada slot untuk field filterable. Bila tidak ada slot yang bisa diklaim:

- nilai tetap masuk ke payload JSON;
- entry diantrekan untuk disalin kemudian;
- pemanggilan berhasil, dengan `enqueuedForBackfill` bernilai `true`.

Sampai Watcher menyediakan page dan Reconciler menyusul, entry itu tidak terlihat oleh filter pada field tersebut, tetapi setiap pembacaan tetap mengembalikannya. Penulisan yang masuk antrean memancarkan event `exhaustion_fallback`, yang layak dipasangi alert bila berlangsung terus. Sync queue yang terus membesar berarti Reconciler tidak berjalan atau Watcher tidak mengejar. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed#penulisan-tidak-pernah-gagal-karena-kehabisan-slot) dan [Pemecahan masalah](/id/operations/troubleshooting).

Setiap penulisan juga memancarkan `entry_written`, dan event jalur tulis lainnya (`entry_updated`, `entry_deleted`, `bulk_chunk_committed`, `bulk_chunk_rolled_back`, `bulk_accepted`, `payload_too_large`) tercatat di [Event log](/id/reference/log-events).
