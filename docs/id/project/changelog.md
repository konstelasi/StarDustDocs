# Catatan perubahan

Semua perubahan penting pada proyek ini didokumentasikan di sini. Formatnya berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), dan penomoran versinya mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — lihat [Versi dan stabilitas](/id/project/versioning) untuk artinya selama seri alpha.

## 0.3.0-alpha.1

Dirilis 2026-09-23. Rilis pertama dari seri 0.3: sebuah penulisan ulang dari nol, bukan upgrade dari 0.2. Tidak ada jalur upgrade dari 0.2.x — lihat [Seri 0.2.x](/id/project/legacy-0-2). Ini adalah alpha: API publik masih mungkin berubah sebelum 0.3.0. Instal dengan `composer require damarbob/stardust:^0.3@alpha`.

### Ditambahkan

- Package Composer yang tidak terikat framework, tanpa dependensi runtime selain `psr/log` dan `psr/clock`. Membutuhkan PHP 8.1+ dan MySQL 8.0.13+, Percona Server 8.0.13+, atau MariaDB 10.11+, terdeteksi dari koneksi saat boot.
- Kelas engine `StarDust`, dikonfigurasi lewat satu objek `Config` dengan satu field wajib (`pdo`) dan nilai bawaan untuk sisanya. `bootstrap()` dan `bin/stardust bootstrap` secara idempoten menyediakan setiap tabel yang dibutuhkan engine.
- `schemaBuilder()` untuk mendaftarkan model dan field tanpa SQL yang ditulis tangan, serta `listModels()` / `describeModel()` untuk membaca kembali skema sebuah tenant, termasuk apakah setiap field dideklarasikan filterable dan apakah ia indexed sekarang juga.
- `write()` untuk entry tunggal, `bulkWrite()` untuk hingga 1 000 entry per pemanggilan, dan `submitBulkWrite()` untuk batch lebih besar yang diproses di latar belakang dengan idempotency key opsional. Penulisan tetap tersedia bahkan saat kapasitas terindeks habis — nilainya selalu tersimpan dan disalin ke index begitu satu tersedia. `updateEntry()` mengganti field sebuah entry secara menyeluruh; `deleteEntry()` melakukan soft delete.
- `read()` untuk pembacaan terbatas berpaginasi cursor, dan `get()` untuk pembacaan satu entry. `search()` menerima filter dalam format wire JSON — dua belas operator, nesting AND/OR/NOT penuh, tiga belas kode error tertutup, dan JSON Schema normatif — atau sebagai filter node PHP bertipe. Pengurutan berdasarkan id entry, waktu pembuatan, atau satu field terindeks. Search driver kustom bisa melayani pembacaan dari backend lain sama sekali.
- Perubahan skema online: me-retype field, mempromosi atau mendemosi filterability-nya, mengganti nama field atau model, dan menghapus field atau model — semuanya sambil aplikasi tetap berjalan, dengan field atau model dilayani dari payload JSON sampai salinan latar belakangnya (bila ada) selesai.
- Empat daemon latar belakang, semuanya dijalankan lewat `bin/stardust`: `watcher` menyediakan kapasitas terindeks lebih dulu daripada permintaan, `reconciler` menuntaskan semua jenis pekerjaan tertunda (dengan dead-letter queue dan pemrosesan ulang oleh operator untuk baris yang tidak bisa direkonsiliasi), `liberator` mereklamasi kolom terindeks yang sudah dibebaskan, dan `chronicler` menghasilkan ekspor. `bin/stardust tick` menjalankan perawatan yang sama sebagai satu lintasan terbatas, untuk host yang bisa menjalankan cron job tetapi bukan proses persisten.
- `submitExport()` dan `getExportJob()` untuk ekspor CSV atau JSON sebuah model, dengan batas job bersamaan per tenant dan pemulihan otomatis setelah crash.
- `spread:report` dan `compact:model` untuk menemukan dan memperbaiki model yang field-nya tersebar di lebih banyak storage page daripada yang diperlukan; `cardinality:report` untuk menandai index yang nilainya terlalu repetitif untuk berguna.
- Logging NDJSON terstruktur secara bawaan, atau logger PSR-3 apa pun, dengan correlation id yang bisa Anda sediakan sendiri dan mengikuti satu operasi dari request Anda sampai ke pekerjaan latar belakang yang menuntaskannya.

### Diubah

- Package ini adalah engine baru, bukan versi baru dari library CodeIgniter 4 yang digantikannya. Model, field, dan entry disimpan dalam skema yang berbeda, dan API publiknya tidak berbagi apa pun dengan 0.2.x.

### Dihapus

- Seluruh codebase 0.2.x: integrasi CodeIgniter 4, pengindeksan Virtual Column yang menjadi dasarnya, serta kelas manager dan builder-nya. Rilis 0.2.x tetap bisa diinstal dari tag-nya sendiri.

### Keterbatasan yang diketahui

- Koneksi `PDO` harus memakai `PDO::ERRMODE_EXCEPTION` dan `PDO::ATTR_EMULATE_PREPARES => false`. Dengan emulated prepares bawaan PHP, pembacaan gagal dengan syntax error MySQL.
- Field yang baru filterable atau baru di-retype baru bisa difilter setelah salinan latar belakangnya ke kolom terindeks selesai.
- Pengurutan menerima satu key pada satu waktu.
- Ekspor selalu mencakup seluruh entry dalam model; request dengan filter ditolak mentah-mentah.
- Paginasi hanya lewat cursor — tanpa nomor halaman, offset, atau jumlah total.
- Search driver bersifat read-only, dan belum ada change feed untuk menjaga index eksternal tetap sinkron — lihat [Menjaga indeks eksternal tetap sinkron](/id/extending/custom-search-drivers#menjaga-indeks-eksternal-tetap-sinkron).
- Di MariaDB, filter rentang dan pengurutan field menempatkan karakter supplementary-plane (kebanyakan emoji) di ujung yang berlawanan dari MySQL.
