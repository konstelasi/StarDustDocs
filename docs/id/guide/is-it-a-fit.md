# Apakah StarDust cocok untuk Anda?

StarDust membuat pertukaran (trade-off) yang disengaja. Halaman ini mendaftar siapa yang cocok dan siapa yang tidak, agar Anda tahu sebelum membangun di atasnya, bukan sesudahnya.

## Cocok jika Anda…

- Membutuhkan **field dinamis buatan pengguna atau per tenant** yang tetap bisa difilter lewat index SQL native, tanpa membangun search cluster terpisah.
- Sudah menjalankan **MySQL 8.0.13+ (atau Percona)**, atau **MariaDB 10.11+**, baik dengan proses latar belakang persisten (systemd, supervisor, atau container) maupun dengan `bin/stardust tick` terjadwal di host yang tidak bisa mempertahankan proses.
- Menginginkan engine yang **tidak terikat framework** dan bisa dipasang di aplikasi PHP mana pun lewat Composer, tanpa ORM, query builder, atau framework yang ikut terbawa.
- Bisa menerima field filterable yang baru didefinisikan atau di-retype baru bisa di-query **sesaat setelahnya**, bukan seketika.

## Kemungkinan kurang cocok jika Anda…

- Terikat pada **MariaDB di bawah 10.11 atau MySQL di bawah 8.0.13**. Keduanya ditolak secara aktif. Lihat [Persyaratan](/id/guide/requirements).
- Membutuhkan **read-after-write consistency yang kuat pada filter segera setelah retype atau promosi filterability.** Field itu dilayani dari payload JSON, dan belum bisa difilter, sampai backfill-nya selesai.
- Membutuhkan **pencarian full-text, fuzzy, atau substring** secara bawaan. Driver bawaan menyediakan pencocokan persis, perbandingan, rentang, keanggotaan himpunan, dan pencocokan awalan (prefix) *berjangkar*, tetapi tidak ada pencocokan substring atau akhiran, pencocokan fuzzy, maupun pemeringkatan relevansi. Kemampuan itu Anda sediakan lewat driver kustom.
- Membutuhkan **nomor halaman, navigasi lompat-ke-halaman, atau jumlah total hasil.** Pembacaan berbasis cursor dan berurutan maju. Driver yang ditopang layanan pencarian eksternal bisa menjaga index-nya sendiri dan menyediakan total.
- Sama sekali tidak bisa menjalankan proses terjadwal **atau** persisten. Pekerjaan latar belakang StarDust harus berjalan dengan satu cara atau lainnya. Lihat [Deployment](/id/operations/deployment).

## Kompromi yang perlu Anda terima

### Konsistensi eventual setelah perubahan skema

Mempromosikan field menjadi filterable, me-retype, mengganti nama, atau menghapusnya kembali seketika dan selesai di latar belakang. Selama window itu pembacaan tetap berjalan dari payload JSON, dan penulisan tetap diterima, tetapi filter pada field yang sedang diproses ditolak sampai proses latar belakang selesai. Rancang antarmuka Anda dengan mempertimbangkannya: jadikan `isIndexed`, bukan `isFilterable`, sebagai syarat tampilnya kontrol filter. Lihat [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work).

### Tanpa pencarian substring atau fuzzy secara bawaan

Driver bawaan menjaga setiap operator tetap memakai index, itulah sebabnya himpunan operatornya sengaja kecil: kesamaan, perbandingan, rentang, `in` dan `nin`, pengecekan null, dan prefix berjangkar. Pencocokan bergaya `LIKE '%teks%'` akan memaksa scan, sehingga tidak ditawarkan. Kalau Anda membutuhkannya, [search driver](/id/extending/custom-search-drivers) kustom bisa melayani query itu dari layanan pencarian, dengan konsekuensi Anda sendiri yang menjaga index tersebut tetap sinkron.

### Hanya paginasi cursor

Setiap halaman memberi Anda cursor opaque untuk halaman berikutnya, dan tidak adanya cursor berarti Anda sudah di akhir. Memang sengaja tidak ada offset dan tidak ada jumlah total, karena keduanya mengharuskan database membaca seluruh himpunan yang cocok, dan query yang cepat hari ini akan melambat hanya karena tenant-nya bertambah besar. Infinite scroll dan tombol Next bekerja dengan wajar. Tombol Back berarti Anda menyimpan cursor yang sudah dipakai. "Halaman 7 dari 214" dan deep link ke halaman sembarang tidak bisa dilayani. Lihat [Membaca entry](/id/usage/reading-entries#paginasi-cursor).

## Yang juga perlu diketahui

- **Ini masih alpha.** API publik mungkin berubah sebelum 0.3.0. Lihat [Apa itu StarDust?](/id/guide/what-is-stardust#status-rilis).
- **Satu perbedaan yang terdokumentasi di MariaDB.** Filter rentang dan pengurutan berdasarkan field menempatkan karakter Unicode supplementary-plane, kebanyakan emoji, di ujung yang berlawanan dari MySQL. Teks biasa dalam bahasa apa pun tidak terpengaruh.
