# Ekspor

Ekspor membuang setiap entry milik sebuah model ke file CSV atau JSON. Prosesnya berjalan asinkron, sehingga ekstraksi besar tidak menahan web request: Anda mengirimnya, mendapat id, lalu memantau sampai file siap. Pekerjaan sesungguhnya dikerjakan oleh [Chronicler](/id/operations/chronicler), jadi minimal satu harus berjalan. Di host yang hanya punya cron, artinya `bin/stardust tick --exports`. Lihat [Deployment](/id/operations/deployment#menyertakan-ekspor-dalam-tick).

## Mengajukan ekspor

```php
use StarDust\Export\ExportJobRequest;

$jobId = $engine->submitExport(new ExportJobRequest(
    tenantId: 42,
    modelId:  $modelId,
    format:   ExportJobRequest::FORMAT_CSV, // atau FORMAT_JSON
));

$jobId->jobId; // oper ke getExportJob() untuk memantau
```

`submitExport()` mencatat job dan langsung mengembalikan `ExportJobId`. Belum ada yang ditulis sampai sebuah Chronicler mengklaim job itu.

**Ekspor selalu mencakup setiap entry yang belum dihapus dalam model.** Request punya argumen `filter`, tetapi pemfilteran belum diimplementasikan, sehingga filter yang tidak kosong ditolak dengan `ExportFilterNotSupportedException`, bukan diterima lalu diam-diam diabaikan. Anda tahu sejak pengiriman, bukan baru sadar setelah menemukan ekstrak penuh di dalam file. Biarkan `filter` pada nilai bawaannya. Argumen itu dipertahankan di request agar pemfilteran bisa ditambahkan nanti tanpa mengubah signature.

Untuk mengekspor sebagian data saat ini, baca dengan `read()` atau `search()` dan tulis file-nya sendiri. Berikan `correlationId` pada request agar event log job itu menyatu dengan request id Anda. Lihat [Observabilitas](/id/operations/observability).

## Format CSV dan JSON

| | CSV | JSON |
| :-- | :-- | :-- |
| Bentuk | Satu baris header, lalu satu baris per entry. | Satu array JSON dengan satu elemen per entry. |
| Kolom atau key | Nama field terdaftar milik model, diurutkan menurut abjad. | Payload tersimpan setiap entry, apa adanya. |
| Nilai yang tidak ada | Sel kosong. | Tidak ada di elemen. |
| Nilai bersarang | Dikodekan sebagai teks JSON di dalam sel. | JSON native. |
| Encoding | Kutipan RFC 4180, akhir baris `\r\n`. | JSON UTF-8. |

Dari situ muncul dua perbedaan yang perlu diketahui sebelum Anda membangun sesuatu di atas salah satunya:

- **CSV mengikuti skema Anda saat ini.** Header-nya ditentukan saat ekspor berjalan, sehingga mencerminkan field yang ada sekarang. Field yang dihapus sebelum ekspor berjalan tidak punya kolom, dan field yang sedang di-rename muncul dengan nama barunya dengan nilai yang tetap utuh.
- **JSON adalah payload mentah.** Ia tidak diproyeksikan terhadap skema, jadi selama rename ia bisa menampilkan key lama untuk entry yang belum ditulis ulang, dan selama penghapusan field ia masih bisa memuat nilai yang sedang dibersihkan. Jika salah satunya penting bagi Anda, tunggu perubahan skemanya selesai sebelum mengekspor. Lihat [Pekerjaan latar belakang](/id/concepts/background-work#apa-yang-terlihat-oleh-pembacaan-selama-window).

Entry yang nilainya tidak bisa dikodekan dilewati, bukan menggagalkan job, dan dihitung di `skipCount` milik job.

## Memantau status ekspor

`getExportJob()` mengembalikan job, atau `null` bila job tidak ada untuk tenant ini. Job milik tenant lain terlihat sama dengan job yang tidak ada:

```php
$job = $engine->getExportJob(tenantId: 42, jobId: $jobId->jobId);

switch ($job?->status) {
    case 'completed':
        // artifactPath adalah path absolut ke file di bawah Config::$artifactDir.
        serveDownload($job->artifactPath);
        break;

    case 'failed':
        error_log("ekspor gagal: {$job->failedReason}");
        break;

    default: // 'pending' atau 'processing'
        // Belum siap. Cek lagi sebentar lagi.
}
```

Job berpindah dari `pending` ke `processing` ketika sebuah Chronicler mengklaimnya, lalu berakhir sebagai `completed` atau `failed`. Ekspor besar juga bisa kembali dari `processing` ke `pending` lalu dilanjutkan, dan itu wajar: di host yang hanya punya cron, setiap tick berhenti sementara pada batas waktunya, dan worker yang dimatikan berhenti di batas chunk. Chronicler berikutnya melanjutkan dari titik berhenti, sehingga file akhirnya tetap lengkap.

`failedReason` memberi tahu mengapa sebuah job gagal. Yang umum: `disk_full`, `artifact_size_exceeded` (file melewati batas 5 GB), `excessive_skips` (terlalu banyak entry yang tidak bisa dikodekan), dan `query_failure` (koneksi database putus dan tidak bisa disambungkan kembali). Job yang gagal langsung dihapus file parsialnya, dan Anda bisa mengirim yang baru.

Kalau sebuah job tetap `pending`, berarti tidak ada Chronicler yang mengklaimnya. Lihat [Pemecahan masalah](/id/operations/troubleshooting#ekspor-tertahan-di-status-pending).

## Batas job aktif per tenant

Setiap tenant boleh punya sejumlah terbatas ekspor yang berjalan bersamaan, tiga secara bawaan, dihitung dari job yang `pending` atau `processing`. Pemeriksaannya atomik bersama insert, sehingga pengiriman yang bersamaan tidak bisa lolos. Pengiriman keempat yang bersamaan memunculkan `ExportJobActiveCapExceededException`, yang membawa `tenantId`, `activeCount`, dan `cap`:

```php
use StarDust\Exception\ExportJobActiveCapExceededException;

try {
    $jobId = $engine->submitExport($request);
} catch (ExportJobActiveCapExceededException $e) {
    // Beri tahu pengguna bahwa sebuah ekspor sedang berjalan, dan minta menunggu.
}
```

Naikkan batasnya dengan `Config::$chroniclerPerTenantActiveCap`. Chronicler mengklaim job pending secara bergiliran antar tenant, sehingga satu tenant dengan banyak job tidak bisa membuat tenant lain kelaparan.

## Artifact dan pembersihannya

File yang dihasilkan ekspor yang selesai disebut **artifact**. Ia berada di bawah `Config::$artifactDir`, jadi direktori itu harus bisa ditulis oleh Chronicler dan bisa dibaca oleh apa pun yang melayani unduhan. Artinya aplikasi Anda dan Chronicler harus sepakat soal direktori itu: `bin/stardust chronicler` selalu memakai direktori bawaan, jadi biarkan aplikasi Anda memakai direktori bawaan juga dan pastikan keduanya melihat direktori fisik yang sama, atau jalankan Chronicler dari skrip Anda sendiri. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#menjalankan-daemon-berdampingan-dengan-aplikasi). Direktori itu juga harus **berada di luar apa pun yang bisa diakses lewat web**: sajikan file lewat aplikasi Anda, setelah memeriksa bahwa pengguna yang meminta memang memiliki tenant dari job itu.

**Artifact bersifat sementara.** Chronicler menghapus artifact yang sudah selesai begitu TTL-nya habis, secara bawaan 24 jam setelah selesai (`chroniclerArtifactTtlSeconds`), jadi serahkan file kepada pengguna atau salin ke tempat permanen sebelum itu. Pembersihan berjalan saat Chronicler tidak punya pekerjaan lain, artinya sistem yang tidak pernah menganggur tidak akan membersihkan. Lihat [Chronicler](/id/operations/chronicler#membersihkan-artifact-lama).

## Keterbatasan saat ini

- **Tanpa pemfilteran.** Ekspor mencakup seluruh model. Filter yang tidak kosong ditolak.
- **Tanpa ekspor inkremental.** Setiap ekspor adalah ekstrak penuh pada saat ia berjalan.
- **Ekspor bukan backup.** Isinya nilai field sebagaimana saat ekspor berjalan, dan bukan salinan database Anda yang bisa dipulihkan. Lihat [Backup dan pemulihan](/id/operations/backup-and-restore#ekspor-bukan-pengganti-backup).
- **Batas 5 GB per file.** Ekspor yang akan melewati `chroniclerArtifactSizeCapBytes` gagal dengan `artifact_size_exceeded`.
- **Ekspor sebelum menghapus model.** [Menghapus model](/id/schema-changes/deleting-models) bersifat permanen, jadi bila Anda mungkin menginginkan datanya kelak, ekspor dulu dan tunggu file-nya selesai.
