# Catatan perubahan

Semua perubahan penting pada proyek ini didokumentasikan di sini. Formatnya berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), dan penomoran versinya mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Lihat [Versi dan stabilitas](/id/project/versioning) untuk artinya selama seri alpha.

## [0.3.0-alpha.2] - 2026-10-31

Rilis ini membuat pembacaan dan penulisan massal lebih murah, mengindeks field teks lewat key yang dihitung dari seluruh nilainya, dan membiarkan pengurutan field memilih ke mana entry tanpa nilai ditempatkan. Rilis ini juga memperbaiki kasus ketika field yang sedang dipromosikan bisa difilter sebelum entry lamanya selesai disalin. Ini masih alpha, jadi API publik mungkin berubah sebelum 0.3.0. Instal dengan `composer require damarbob/stardust:^0.3@alpha`.

**Upgrade dari 0.3.0-alpha.1.** Ganti semua proses rilis lama sebelum Watcher rilis baru membangun page pertamanya, yaitu keempat daemon pada mode acuan atau `tick` terjadwal pada mode cron. Proses dari alpha.1 tidak bisa mengklaim slot teks di page yang dibangun dengan key, sehingga Watcher-nya membuat page baru di setiap poll sampai prosesnya diganti. Page yang sudah ada tidak pernah diubah, tidak ada tabel yang berubah, dan `bootstrap()` tetap aman dijalankan ulang. Langkahnya ada di [Memperbarui deployment yang sedang berjalan](/id/operations/deployment#memperbarui-deployment-yang-sedang-berjalan).

### Ditambahkan

- **Penempatan null pada pengurutan field**: `SortSpec::byField()` menerima `NullPlacement` opsional (`First` atau `Last`) yang menentukan ke mana entry tanpa nilai untuk field pengurut ditempatkan. Bila dihilangkan, penempatannya mengikuti bawaan database, yaitu paling awal pada urutan menaik dan paling akhir pada urutan menurun, sehingga pemanggil, SQL, dan cursor yang sudah ada tidak berubah. Cursor mencatat penempatan hanya bila bukan bawaan, dan cursor yang diterbitkan dengan satu penempatan ditolak dengan `InvalidCursorException` bila dipakai dengan penempatan lain. `EntrySearchInterface` tidak mendapat method baru, jadi driver kustom yang mengabaikan penempatan akan mengurutkan menurut default-nya sendiri tanpa error, seperti dijelaskan di [Driver pencarian kustom](/id/extending/custom-search-drivers).

### Diubah

- **Field teks di page baru**:
  - Page yang dibangun rilis ini mengindeks setiap field teks lewat key yang dihitung dari seluruh nilainya, menggantikan 766 karakter pertama. Filter teks cocok secara persis pada panjang berapa pun, dan baris dengan beberapa nilai panjang bisa di-update dan dihapus.
  - `eq` pada field teks memulai pembacaan terfilter dari key itu di page baru, sehingga database memeriksa kira-kira sebanyak isi satu halaman, berapa pun jumlah entry yang cocok.
  - Baris di page baru lebih lebar, karena setiap nilai teks membawa key sekitar 50 byte. [Deployment](/id/operations/deployment#field-teks-di-page-lama-dan-baru) memuat biaya yang terukur dan apa yang perlu diharapkan.
  - Page yang sudah ada tidak diubah, dan tidak ada perintah yang memindahkan field antar jenis page. Field tetap berada di jenis page tempat ia mulai, dan field teks baru mengambil slot kosong di page lama lebih dulu.
  - Membangun page dengan slot teks membutuhkan fungsi SHA-256 milik server. Pada server yang tidak mengembalikan apa pun untuknya, pembangunan page memunculkan `UnsupportedServerException`.
- **Pembacaan terfilter**: Di MySQL, pembacaan terfilter dengan urutan bawaan yang memuat `eq` pada field integer, numeric, atau datetime kini dimulai dari index field itu, sehingga database memeriksa kira-kira sebanyak isi satu halaman, berapa pun jumlah entry yang cocok. Bila sebuah `and` memuat beberapa `eq` seperti itu, yang pertama menggerakkan pembacaan, jadi tulis yang paling selektif lebih dulu. Filter lain, dan pengurutan berdasarkan field atau waktu pembuatan, tetap memakai SQL sebelumnya. Peningkatannya diukur di MySQL, dan MariaDB sudah merencanakan pembacaan ini dengan baik.
- **Lebih sedikit statement per pembacaan**:
  - Pembacaan dengan filter, pengurutan, atau cursor kini memeriksa schema version satu kali, bukan dua, dan menjawab apakah sebuah field filterable dari snapshot yang baru saja diperiksa.
  - Pembacaan satu entry mengirim version bersama entry-nya, sehingga `get()` dengan cache hangat hanya satu statement.
  - Pembacaan pertama sebuah model dalam satu proses memuat lookup index dan key hanya bila pembacaan itu membutuhkannya.
- **Penulisan massal**: Satu chunk entry ditulis dengan sejumlah statement multi-row yang tetap, sedangkan kode sebelumnya mengirim beberapa statement per entry. Langkah penyalinan pada retype atau promosi juga menulis setiap chunk dengan satu statement.
- **Bootstrap**: `bootstrap()` melempar `UnsupportedServerException` pada server yang page InnoDB-nya lebih kecil dari 8 KB (bawaannya 16 KB), sebelum membuat tabel apa pun. Kode sebelumnya lolos bootstrap lalu gagal belakangan, saat Watcher mencoba membangun page.
- **Filter pada field yang belum terindeks**: Pesan `FieldNotFilterableException` kini menyebutkannya bila sebuah field dideklarasikan filterable tetapi belum punya index. Dokumentasi dan docblock tidak lagi menyebut `FieldNotIndexedException` untuk kasus ini, karena engine bawaan tidak pernah memunculkannya.
- **Isi package**: Deskripsi, kata kunci, dan tautan dukungan Composer diperbarui. Arsip rilis tidak lagi membawa test, contoh, file CI, aturan agen, dan file Docker, dan `bin/stardust --help` tidak lagi menyebut dokumen desain.

### Diperbaiki

- **Promosi atau retype yang menunggu slot**: Field yang promosi atau retype-nya menunggu slot kosong bisa diberi slot yang sudah menjawab filter sebelum entry lamanya selesai disalin, sehingga filter melewatkan entry itu. Salinan latar belakang lalu bisa gagal di setiap lintasan berikutnya. Slot kini dicadangkan dalam status sedang menyalin, dan filter pada field itu ditolak sampai salinan selesai.
- **Emulated prepared statements**: Pembacaan tidak lagi gagal dengan syntax error MySQL ketika koneksi `PDO` membiarkan `PDO::ATTR_EMULATE_PREPARES` pada bawaan PHP. Kedua pengaturan kini berfungsi, dan seluruh test suite dijalankan dengan keduanya.

### Keterbatasan yang diketahui

- Batasan yang tercantum pada 0.3.0-alpha.1 tetap berlaku, kecuali yang tentang emulated prepared statements.
- Di page lama, baris yang memuat beberapa nilai panjang pada field teks filterable bisa ditulis tetapi kemudian tidak bisa di-update, dan MySQL memunculkan error 1713. Simpan teks bebas yang panjang di field yang tidak filterable. [Field teks di page lama dan baru](/id/operations/deployment#field-teks-di-page-lama-dan-baru) menjelaskan batasnya.
- Di page baru, batas awalan atau rentang teks hanya mempersempit index untuk 16 huruf Latin pertamanya, atau sekitar 8 karakter CJK. Pada kolom yang semua nilainya diawali teks panjang yang sama, seperti URL satu situs, pembacaan bisa memeriksa setiap entry milik tenant.

## [0.3.0-alpha.1] - 2026-09-23

Rilis pertama dari seri 0.3: sebuah penulisan ulang dari nol, bukan upgrade dari 0.2. Tidak ada jalur upgrade dari 0.2.x. Lihat [Seri 0.2.x](/id/project/legacy-0-2). Ini adalah alpha: API publik masih mungkin berubah sebelum 0.3.0. Instal dengan `composer require damarbob/stardust:^0.3@alpha`.

### Ditambahkan

- Package Composer yang tidak terikat framework, tanpa dependensi runtime selain `psr/log` dan `psr/clock`. Membutuhkan PHP 8.1+ dan MySQL 8.0.13+, Percona Server 8.0.13+, atau MariaDB 10.11+, terdeteksi dari koneksi saat boot.
- Kelas engine `StarDust`, dikonfigurasi lewat satu objek `Config` dengan satu field wajib (`pdo`) dan nilai bawaan untuk sisanya. `bootstrap()` dan `bin/stardust bootstrap` secara idempoten menyediakan setiap tabel yang dibutuhkan engine.
- `schemaBuilder()` untuk mendaftarkan model dan field tanpa SQL yang ditulis tangan, serta `listModels()` / `describeModel()` untuk membaca kembali skema sebuah tenant, termasuk apakah setiap field dideklarasikan filterable dan apakah ia indexed sekarang juga.
- `write()` untuk entry tunggal, `bulkWrite()` untuk hingga 1 000 entry per pemanggilan, dan `submitBulkWrite()` untuk batch lebih besar yang diproses di latar belakang dengan idempotency key opsional. Penulisan tetap tersedia bahkan saat kapasitas terindeks habis, karena nilainya selalu tersimpan dan disalin ke index begitu satu tersedia. `updateEntry()` mengganti field sebuah entry secara menyeluruh, dan `deleteEntry()` melakukan soft delete.
- `read()` untuk pembacaan terbatas berpaginasi cursor, dan `get()` untuk pembacaan satu entry. `search()` menerima filter dalam format wire JSON (dua belas operator, nesting AND/OR/NOT penuh, tiga belas kode error tertutup, dan JSON Schema normatif) atau sebagai filter node PHP bertipe. Pengurutan berdasarkan id entry, waktu pembuatan, atau satu field terindeks. Search driver kustom bisa melayani pembacaan dari backend lain sama sekali.
- Perubahan skema online: me-retype field, mempromosi atau mendemosi filterability-nya, mengganti nama field atau model, dan menghapus field atau model, semuanya sambil aplikasi tetap berjalan, dengan field atau model dilayani dari payload JSON sampai salinan latar belakangnya (bila ada) selesai.
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
- Paginasi hanya lewat cursor, tanpa nomor halaman, offset, atau jumlah total.
- Search driver bersifat read-only, dan belum ada change feed untuk menjaga index eksternal tetap sinkron. Lihat [Menjaga indeks eksternal tetap sinkron](/id/extending/custom-search-drivers#menjaga-indeks-eksternal-tetap-sinkron).
- Di MariaDB, filter rentang dan pengurutan field menempatkan karakter supplementary-plane (kebanyakan emoji) di ujung yang berlawanan dari MySQL.

[0.3.0-alpha.2]: https://github.com/damarbob/StarDust/compare/v0.3.0-alpha.1...v0.3.0-alpha.2
[0.3.0-alpha.1]: https://github.com/damarbob/StarDust/compare/v0.2.0-alpha.3...v0.3.0-alpha.1
