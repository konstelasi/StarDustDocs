# Keamanan

## Jaminan isolasi tenant

Setiap query yang dibangun StarDust membawa tenant id pada setiap klausa `WHERE` dan `JOIN` yang dihasilkannya — pembacaan, penulisan, filter, ekspor, introspeksi skema, semuanya. Data satu tenant tidak sekadar disaring dari hasil tenant lain di level aplikasi; ia tidak terjangkau di level SQL, karena tidak ada query yang dibangun engine yang bisa memilih lintas batas tenant bahkan secara tidak sengaja. Ini berlaku di semua entry point, termasuk yang mencari record berdasarkan id: `get()`, `getExportJob()`, `getImportJob()`, dan sejenisnya semuanya mengembalikan `null` untuk baris milik tenant lain alih-alih baris itu sendiri, dan sengaja dibuat tidak bisa dibedakan dari id yang memang tidak ada.

Jaminan itu adalah apa yang dibangun StarDust; bukan pengganti untuk menentukan tenant id yang benar sejak awal. Engine sepenuhnya mempercayai `tenantId` yang Anda kirimkan — tidak ada yang mengautentikasi pemanggil atau memeriksa bahwa request itu memang benar-benar milik tenant tersebut di sini. Menentukan tenant id yang benar dari sesi yang terautentikasi, dan tidak pernah menerimanya langsung dari input klien, sepenuhnya menjadi tanggung jawab aplikasi Anda. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#menentukan-tenant-id).

## Menerima filter dari sumber yang tidak tepercaya

Jika aplikasi Anda menerima JSON QueryFilter dari browser atau klien API eksternal — kasus umum untuk endpoint pencarian — JSON itu didekode dan divalidasi sebelum SQL apa pun berjalan, dan decoder-nya menegakkan batasan struktural tetap terlepas dari apa pun yang dilakukan kode Anda sendiri:

| Batasan | Default |
| :-- | :-- |
| Kedalaman nesting | 8 |
| Total node dalam tree | 256 |
| Argumen per node logika (`and` / `or`) | 64 |
| Elemen dalam himpunan `in` / `not_in` | 1.024 |
| Panjang nilai string | 4.096 karakter |
| Ukuran total payload | 64 KiB |

Filter yang melampaui salah satu batasan ini ditolak sebelum mencapai database, dengan kode error yang bisa dibaca mesin dan pointer ke bagian request yang bermasalah — bukan dijalankan sebagai query yang terdegradasi atau sebagian. Inilah yang membuat aman menyerahkan filter langsung dari body request HTTP ke `search()`: klien tidak bisa menyusun payload yang memaksa query yang secara patologis terlalu dalam atau terlalu lebar, dan klien tidak bisa merujuk field yang tidak diizinkan untuk difilter, karena field yang tidak dikenal atau non-filterable ditolak pada langkah pre-flight yang sama. Lihat [Format wire QueryFilter](/id/usage/query-filter#batasan) untuk daftar lengkap batasannya dan cara menyetelnya, dan [Error](/id/reference/errors#menangani-penolakan-format-wire) untuk menangani penolakannya.

Tidak satu pun dari ini menggantikan pemeriksaan bahwa tenant id dan model id dalam request memang milik pemanggil yang terautentikasi — batasan filter melindungi database dari query yang cacat atau terlalu besar, bukan dari pemanggil yang membaca data yang seharusnya tidak boleh ia lihat.

## Hak akses database

Proses aplikasi yang melayani request dan proses daemon yang menjalankan perawatan tidak membutuhkan hak akses yang sama, dan memberi proses yang melayani request hanya yang dibutuhkannya layak dilakukan dengan sengaja, bukan kebetulan.

### User aplikasi

Proses yang menangani `write()`, `read()`, `search()`, `updateEntry()`, `deleteEntry()`, dan sejenisnya tidak pernah membuat atau mengubah tabel — memesan slot cukup memilih dari yang sudah disediakan Watcher, ia tidak pernah menyediakan sendiri. Proses ini hanya butuh `SELECT`, `INSERT`, `UPDATE`, dan `DELETE` pada database yang dikelola StarDust. Inilah proses yang paling mungkin digerakkan oleh input yang tidak tepercaya (filter pencarian dari klien, misalnya), sehingga membatasi hak aksesnya hanya pada manipulasi data membatasi apa yang bisa dilakukan bug atau injeksi pada kode aplikasi di sekitarnya bahkan dalam skenario terburuk.

### User daemon

`bootstrap()` dan Watcher sama-sama menjalankan DDL — membuat skema awal dan extension page berikutnya — sehingga identitas mana pun yang menjalankan `bin/stardust bootstrap` dan `bin/stardust watcher` membutuhkan `CREATE`, `ALTER`, dan `INDEX` selain hak DML di atas. Reconciler, Liberator, dan Chronicler tidak pernah membuat atau mengubah tabel, hanya membaca dan menulis baris, sehingga bisa berjalan dengan identitas yang lebih sempit jika Anda ingin memisahkannya lebih jauh. Tidak ada apa pun dalam schema runner yang pernah menghapus tabel atau indeks — bootstrap memang dirancang tidak destruktif — sehingga **`DROP` tidak pernah dibutuhkan untuk proses mana pun dari ini**, dan tidak memberikannya sama sekali tidak merugikan.

## Hak akses file artifact

Payload bulk-ingest asinkron dan file ekspor berada di filesystem lokal di bawah `Config::$artifactDir`, di luar jalur mana pun yang bisa diakses lewat web — lihat [Deployment](/id/operations/deployment#penyimpanan-artifact). Proses daemon yang menulis ke sana (Chronicler untuk ekspor, proses yang mengajukan impor asinkron) butuh akses baca-tulis ke direktori itu; proses yang menyajikan unduhan ekspor yang selesai ke pemanggil butuh setidaknya akses baca ke sana. Di luar penempatan direktori dan hak akses filesystem, StarDust tidak melakukan apa pun untuk membatasi akses ke sebuah artifact begitu path-nya diketahui — API status export job adalah satu-satunya yang berdiri di antara tenant id dan path file yang sudah selesai, jadi perlakukan pemeriksaan tenant pada `getExportJob()` sebagai batas akses yang sesungguhnya dan jangan pernah membiarkan klien memasok path artifact secara langsung.
