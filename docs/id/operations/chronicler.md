# Chronicler

## Tugasnya

Chronicler mengubah export job yang diajukan menjadi file CSV atau JSON. Ia mengklaim satu job yang pending, menyusuri entry model lewat bounded read yang sama seperti yang dipakai API sinkron, mengalirkan baris ke disk seiring berjalannya proses, lalu menandai job selesai dengan path artifact yang bisa Anda sajikan ke siapa pun yang meminta ekspor tersebut. Lihat [Ekspor](/id/usage/exports) untuk cara mengajukan job dan memantau statusnya.

## Mengambil dan melanjutkan job

Setiap tick mengklaim satu job — job yang pending lebih dulu, bergiliran antar-tenant sehingga satu tenant dengan banyak ekspor dalam antrean tidak bisa membuat tenant lain kelaparan, lalu job yang ditinggalkan oleh worker yang heartbeat-nya sudah lewat batas waktu. Saat mengambil alih job yang terbengkalai, Chronicler tidak selalu mulai dari nol: ia mencoba melanjutkan artifact parsial milik worker sebelumnya di tempat, membuka kembali filenya dan memverifikasi bahwa file itu memang benar-benar berisi byte sebanyak yang diklaim progres tersimpan job itu, baru kemudian melanjutkan penulisan dari sana.

Verifikasi itulah yang membuat proses melanjutkan menjadi aman, bukan sekadar untung-untungan. Jika filenya hilang, lebih pendek dari yang diharapkan, header-nya tidak lagi cocok dengan susunan field saat ini, atau proses lain masih membuka file itu, Chronicler meninggalkannya dan memulai artifact yang benar-benar baru alih-alih mengambil risiko baris yang rusak atau terlewat. Bagaimanapun caranya — dilanjutkan atau dimulai ulang — artifact yang akhirnya Anda unduh selalu lengkap dan benar.

`SIGTERM` ke proses Chronicler yang sedang berjalan tidak menunggu job saat ini selesai: worker berhenti tepat di batas chunk berikutnya, job kembali ke `pending` dengan titik lanjutannya tetap utuh, dan worker mana pun yang mengambilnya berikutnya — proses ini sendiri yang restart, atau proses lain yang sudah berjalan — melanjutkan dari offset byte persis itu.

Kegagalan dibatasi, tidak dibiarkan dicoba ulang selamanya: chunk yang terus mengalami deadlock menyerah setelah budget percobaan ulang yang kecil dan dilewati (job-nya tetap berlanjut, dengan skip-nya dihitung); job yang mengumpulkan terlalu banyak skip langsung gagal; koneksi database yang terputus dicoba ulang dengan backoff tetap yang singkat sebelum job dinyatakan gagal; kehabisan ruang disk di tengah penulisan, atau artifact yang akan melampaui batas ukurannya, masing-masing membuat job gagal dengan alasan spesifik yang bisa Anda baca kembali dari statusnya. Job yang langsung gagal artifact parsialnya segera dihapus, tidak menunggu pembersihan berikutnya.

## Pengaman ruang disk

Sebelum mengklaim job baru mana pun, Chronicler memeriksa dua hal: rasio ruang bebas pada volume artifact, dan — karena kuota disk per akun bisa membuat filesystem melaporkan dirinya sebagian besar bebas padahal setiap penulisan tetap gagal — sebuah file probe kecil yang ia tulis ke direktori artifact lalu langsung dihapus. Jika salah satu pemeriksaan gagal, klaim baru ditolak dan peringatan dicatat di setiap tick; job yang sudah berjalan dibiarkan berlanjut, tidak diinterupsi.

Dua hal yang **tidak** dicakup pengaman ini. Ia hanya membuktikan bahwa probe kecilnya sendiri bisa ditulis, bukan bahwa ekspor berukuran multi-gigabyte akan benar-benar muat — ekspor yang kehabisan ruang di tengah penulisan tetap berakhir gagal dengan alasan disk penuh. Dan pengaman ini hanya menghentikan klaim *baru*; ia tidak menjeda job yang sudah mengalir ke disk. Lihat [Deployment](/id/operations/deployment#menyertakan-ekspor-dalam-tick) untuk sudut pandang shared hosting soal ini.

## Membersihkan artifact lama

File dari ekspor yang selesai tidak disimpan selamanya — Chronicler menghapusnya begitu masa berlakunya habis (24 jam secara default), jadi perlakukan path artifact yang Anda terima sebagai sesuatu yang sementara dan segera sajikan atau pindahkan. Pembersihan berjalan pada tick yang idle: Chronicler yang terus-menerus sibuk mengklaim dan mengalirkan job tidak berhenti untuk garbage-collect, jadi jika Anda menjalankan ekspor tanpa henti sepanjang waktu, pantau ukuran direktori artifact secara langsung alih-alih mengasumsikan sapuan TTL sudah berjalan baru-baru ini.

Selain artifact selesai yang sudah lewat TTL, pembersihan pada tick idle juga menghapus file parsial yang ditinggalkan job yang langsung gagal dan file probe ruang disk yang tersisa dari worker yang crash di tengah pemeriksaan.

## Menjalankan beberapa worker

Chronicler tidak punya lock singleton. Jalankan sebanyak proses yang Anda inginkan untuk throughput ekspor:

```bash
bin/stardust chronicler
```

`SELECT … FOR UPDATE SKIP LOCKED` adalah satu-satunya primitif koordinasi — setiap worker mengklaim job yang berbeda, sehingga lebih banyak worker berarti lebih banyak ekspor diproses secara paralel dan pemulihan yang lebih cepat untuk job mana pun yang ditinggalkan worker yang crash. Tidak ada state bersama antar-worker selain baris-baris job itu sendiri.
