# Memperbarui dan menghapus entry

Dua pemanggilan mengubah entry yang sudah ada: `updateEntry()` mengganti field-nya dan `deleteEntry()` melakukan soft delete. Keduanya tampak berpasangan tetapi sengaja berbeda dalam cara melaporkan "tidak ada yang perlu dikerjakan".

## Penggantian penuh dengan updateEntry()

`updateEntry()` adalah **penggantian penuh, bukan patch**. `$fields` yang Anda kirim menjadi payload lengkap milik entry:

```php
$engine->updateEntry(tenantId: 42, entryId: $entryId, fields: [
    'name'      => 'Acme Holdings',
    'employees' => 141,
]);
```

Method ini mengembalikan `EntryWriteResult`, sama seperti `write()`. Sisa perilakunya mengikuti dari "penggantian penuh":

- **Model tidak pernah berubah.** Model sebuah entry ditetapkan saat pembuatan. Anda tidak mengirim id model, dan update tidak pernah bisa memindahkan entry antar model.
- **Koersi, isolasi tenant, dan fallback kapasitas semuanya bekerja persis seperti pada `write()`.** Update yang memperkenalkan field filterable tanpa slot bebas tetap berhasil: nilainya disimpan di payload JSON dan diantrekan untuk backfill.
- **Kirim seluruh entry.** Kalau Anda hanya punya field yang berubah, baca dulu entry-nya dengan `get()` dan gabungkan sebelum update. Mengirim hanya perubahannya akan menghapus semua yang lain.

### Field yang tidak disertakan akan dikosongkan

Field yang Anda tinggalkan dihapus dari JSON **dan** kolom slot terindeksnya dikosongkan. Inilah yang menjaga filter tetap jujur: filter tidak akan pernah cocok dengan nilai yang sudah tidak dimiliki entry.

```php
// Entry saat ini punya name, employees, dan city.
$engine->updateEntry(42, $entryId, ['name' => 'Acme']);
// Sekarang hanya tersisa name. employees dan city hilang dari JSON,
// dan slot employees bernilai null, jadi filter pada employees tidak lagi cocok.
```

Mengisi field secara eksplisit dengan `null` berbeda dari tidak menyertakannya: `null` eksplisit berarti Anda mengisi field itu, sedangkan key yang tidak ada berarti Anda menghapusnya.

## Soft delete dengan deleteEntry()

`deleteEntry()` hanya mengisi timestamp penghapusan, tidak lebih:

```php
$deleted = $engine->deleteEntry(tenantId: 42, entryId: $entryId);
// true saat transisi terjadi; false bila sudah dihapus atau bukan milik Anda
```

Satu penulisan itu adalah seluruh mekanismenya. Sejak saat itu entry lenyap dari `read()`, `get()`, `search()`, dan ekspor sekaligus.

- **Ia idempotent.** Menghapus entry yang sudah terhapus tidak cocok dengan apa pun, mengembalikan `false`, dan tidak menyentuh timestamp aslinya.
- **Tidak ada hard delete dan tidak ada restore** untuk satu entry. Jika Anda mungkin perlu mengembalikan sebuah entry, simpan catatan Anda sendiri. Satu-satunya pemanggilan yang benar-benar membuang baris entry adalah [menghapus model](/id/schema-changes/deleting-models).
- **Nilai di slot dibiarkan.** Tidak ada yang bisa menjangkaunya setelah baris entry disembunyikan, jadi mengosongkannya akan memakan satu penulisan per page tanpa perbedaan yang terlihat.

## Mengapa yang satu melempar exception dan yang lain mengembalikan false

Kedua pemanggilan memperlakukan "tidak ada yang perlu dikerjakan" secara berlawanan, dan itu disengaja:

| | Entry tidak ada, milik tenant lain, atau sudah dihapus |
| :-- | :-- |
| `updateEntry()` | Melempar `EntryNotFoundException`. |
| `deleteEntry()` | Mengembalikan `false`. |

**Update yang tidak berbuat apa-apa menghilangkan data.** Kalau `updateEntry()` diam-diam kembali saat entry-nya sudah tidak ada, pemanggil akan mengira sudah menyimpan sesuatu yang sebenarnya dibuang. Karena itu ia gagal dengan lantang.

**Delete yang tidak berbuat apa-apa sebenarnya sudah berhasil.** Menghapus berulang sudah mencapai persis yang diminta pemanggil: entry itu terhapus. Jadi `false` adalah jawaban yang akurat dan tidak berbahaya, dan mengulang delete setelah timeout selalu aman.

Dalam praktiknya, bungkus `updateEntry()` dengan `try`/`catch` untuk `EntryNotFoundException` (biasanya diubah menjadi 404), dan perlakukan nilai boolean dari `deleteEntry()` sebagai informasi, bukan error. Karena entry milik tenant lain terlihat sama dengan yang tidak ada, kedua pemanggilan tidak pernah membocorkan apakah sebuah id ada di bawah tenant lain.

Kedua pemanggilan menerima `correlationId` opsional di akhir agar event lognya menyatu dengan request id Anda. Lihat [Observabilitas](/id/operations/observability).
