# Impor massal dan asinkron

Menulis banyak entry dengan `write()` satu per satu memang bisa, tetapi ada dua jalur khusus yang lebih cepat dan lebih mudah dipulihkan. Hingga 1 000 entry bisa ditulis secara sinkron dalam satu pemanggilan. Yang lebih besar dikirim sebagai import job dan diproses di latar belakang.

## Bulk write sinkron

`bulkWrite()` menerima daftar payload dan meng-commit-nya per chunk:

```php
use StarDust\Write\BulkIngestOptions;

$bulk = $engine->bulkWrite(
    payloads: $listOfEntryPayloads,
    options:  new BulkIngestOptions(chunkSize: 500, interChunkDelayMicros: 0),
);

$bulk->entriesCommitted; // total entry yang ter-commit
$bulk->chunks;           // satu hasil per chunk, berurutan
```

- **Maksimal 1 000 entry per pemanggilan.** Lebih dari itu memunculkan `PayloadTooLargeException`, yang menyarankan Anda memakai `submitBulkWrite()`.
- **Setiap chunk di-commit dalam transaksinya sendiri** (500 entry secara bawaan), sehingga durasi lock InnoDB tetap terbatas. Kegagalan di satu chunk membiarkan chunk yang sudah ter-commit tetap ada: Anda mendapat laporan per chunk, bukan semua-atau-tidak-sama-sekali.
- **Tenant id setiap payload divalidasi di awal**, sebelum chunk pertama berjalan, sehingga satu record bermasalah di indeks 47 tidak membuat 46 entry ter-commit lebih dulu.
- `interChunkDelayMicros` memberi jeda antar chunk (tidak pernah sebelum yang pertama atau setelah yang terakhir), untuk saat Anda ingin meringankan beban database yang sibuk.

Berikan `correlationId` di `BulkIngestOptions` untuk mengikat event log setiap chunk ke request Anda. Factory `EntryPayload::listFromJson()` dan `listFromArray()` menyusun daftarnya dari format wire. Lihat [Menulis entry](/id/usage/writing-entries#menyusun-entrypayload).

## Pengiriman asinkron untuk batch besar

Untuk lebih dari 1 000 entry, atau batch lebih kecil yang ingin Anda proses di luar request, kirim sebuah job:

```php
$jobId = $engine->submitBulkWrite(
    tenantId:       42,
    payloads:       $largeBatch,
    idempotencyKey: 'monthly-import-2026-05',
);
```

`submitBulkWrite()` menulis batch ke `Config::$artifactDir`, mencatat sebuah import job, dan langsung mengembalikan `ImportJobId`. Ia sendiri tidak menulis satu entry pun: [Reconciler](/id/operations/reconciler) yang berjalan mengambil job itu dan mengimpornya per chunk.

Dua catatan praktis:

- **Seluruh batch ditampung di memori saat pengiriman.** Batch ditulis sebagai satu dokumen JSON, jadi batch yang sangat besar membutuhkan memori PHP yang sepadan. Pecah impor yang raksasa menjadi beberapa pengiriman.
- **`artifactDir` harus bisa ditulis, persisten, dan tidak bisa diakses lewat web, serta Reconciler harus membaca direktori yang sama.** Proses yang mengirim menulis batch di sana dan Reconciler membacanya kembali, jadi bila keduanya menunjuk direktori yang berbeda, job gagal. `bin/stardust` selalu memakai direktori bawaan. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#menjalankan-daemon-berdampingan-dengan-aplikasi).

## Idempotency key

`idempotencyKey` yang opsional membuat sebuah pengiriman aman untuk dicoba ulang. Jika Anda mengirim lagi dengan key yang sama, misalnya setelah koneksi terputus, Anda mendapat job aslinya kembali, bukan mengimpor semuanya dua kali.

- Key bersifat unik **per tenant**. Dua tenant boleh memakai key yang sama.
- Pengiriman tanpa key tidak pernah bertabrakan dengan apa pun.
- Pilih key yang mengidentifikasi impor *logis*-nya, seperti label batch atau nama dan tanggal file sumber, bukan sesuatu yang acak di setiap percobaan.

## Memantau status import job

`getImportJob()` menerjemahkan id yang dikembalikan `submitBulkWrite()`:

```php
$job = $engine->getImportJob(tenantId: 42, jobId: $jobId->jobId);
```

Hasilnya `null` bila job tidak ada untuk tenant ini. Job milik tenant lain terlihat persis seperti job yang tidak ada. Selain itu, `status` job berpindah dari `pending`, `processing`, lalu `completed` atau `failed`:

```php
if ($job?->status === 'completed') {
    echo "{$job->entriesWritten} dari {$job->entryCount} entry tertulis";
}

if ($job?->status === 'failed') {
    // Job yang gagal berhenti di titik ia patah. Entry yang sudah tertulis
    // tetap tertulis dan sisanya tidak pernah dicoba. entriesWritten adalah
    // batas permanen di antara keduanya, jadi percobaan ulang mengirim ulang
    // dari titik itu. Nilainya null jika job gagal sebelum menulis apa pun.
    echo "gagal ({$job->failedReason}); lanjutkan dari " . ($job->entriesWritten ?? 0);
}
```

`entriesWritten` dibandingkan dengan `entryCount` adalah pecahan progres. `entriesWritten` dan `chunks` sama-sama `null` sampai chunk pertama ter-commit. `null` itu sengaja dibedakan dari `0`: `null` berarti tidak ada yang ter-commit sama sekali, sedangkan `0` berarti job berjalan tetapi tidak menulis apa pun.

## Catatan per chunk

`chunkManifest` mendaftar chunk yang sudah diproses job, berurutan. Isinya sama dengan rincian per chunk yang dikembalikan `bulkWrite()` sinkron, sehingga melewati ambang 1 000 entry tidak membuat Anda kehilangan visibilitas:

```php
foreach ($job?->chunkManifest ?? [] as $chunk) {
    echo "chunk {$chunk->index}: {$chunk->outcome}, {$chunk->size} entry";
    if ($chunk->entryIdFirst !== null) {
        echo " (id {$chunk->entryIdFirst}-{$chunk->entryIdLast})";
    }
}
```

Setiap record membawa `index`, `size`, `outcome` (`committed` atau `failed`), dan rentang id entry yang ditulisnya. Job yang gagal diakhiri satu record `failed` yang menyebut chunk yang patah, dengan rentang id `null` karena chunk itu di-rollback. Berbeda dengan bulk write sinkron, kegagalan pertama pada job asinkron bersifat final.

## Pemulihan setelah worker crash

Jika worker yang memproses job mati, job tidak hilang dan tidak terduplikasi. Heartbeat job terhenti, dan setelah `Config::$reconcilerImportLeaseTimeoutSeconds` (30 detik secara bawaan) Reconciler lain mengklaim ulang job itu dan melanjutkan dari chunk terakhir yang ter-commit. Worker asli, bila entah bagaimana masih hidup, menyadari bahwa ia tidak lagi memiliki job itu dan berhenti.

Konsekuensinya bagi Anda sederhana: Anda tidak perlu mengirim ulang job yang tampak macet. Pastikan ada Reconciler yang berjalan, dan lihat [Pemecahan masalah](/id/operations/troubleshooting) jika job tetap berstatus `pending`.
