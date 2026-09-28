# Pertanyaan yang sering diajukan

## Mengapa tidak ada jumlah total?

Karena menghitung berarti membaca semua yang cocok, dan StarDust dibangun agar query tidak pernah melakukan itu. Jumlah total atau offset memaksa database membaca seluruh himpunan yang cocok, sehingga query yang cepat hari ini akan melambat hanya karena tenant-nya bertambah besar. Sebagai gantinya, setiap pembacaan menghabiskan dua query terbatas, berapa pun besar tenant-nya, dan Anda mendapat cursor opaque untuk halaman berikutnya. Tidak ada cursor berarti Anda sudah sampai di akhir.

Itu cocok untuk infinite scroll dan tombol Next. Ia tidak bisa melayani "Halaman 7 dari 214". Kalau Anda membutuhkan angka, ada tiga pilihan:

- **Simpan penghitung sendiri.** Kalau Anda butuh ukuran himpunan yang sudah jelas, misalnya total entry seorang tenant dalam sebuah model, pertahankan hitungan di aplikasi Anda saat menulis dan menghapus.
- **Tampilkan jawaban yang dibatasi.** Baca satu halaman dan tampilkan "lebih dari 100" ketika cursor berikutnya ada, bukan angka pastinya.
- **Pakai driver dengan index sendiri.** [Search driver](/id/extending/custom-search-drivers) kustom yang ditopang layanan pencarian eksternal bisa menyediakan total dan nomor halaman.

Lihat [Membaca entry](/id/usage/reading-entries#mengapa-tidak-ada-nomor-halaman-atau-jumlah-total).

## Apakah bisa memakai PostgreSQL atau SQLite?

Tidak. StarDust mendukung MySQL dan Percona 8.0.13+ serta MariaDB 10.11+, dan tidak ada yang lain. Skema dan SQL-nya ditulis untuk keluarga itu, dan ia mendeteksi server saat boot lalu menolak berjalan pada apa pun di bawah batas bawah. Juga tidak ada pengganti in-memory atau SQLite untuk test: jalankan container MySQL atau MariaDB. Lihat [Persyaratan](/id/guide/requirements) dan [Menguji kode yang memakai StarDust](/id/usage/testing-your-app).

## Apakah tabelnya boleh di-query langsung?

Anda boleh membacanya, tetapi jangan membangun sesuatu di atasnya, dan jangan pernah menulis ke sana.

- **Payload adalah sumber kebenaran, dan tabel slot hanyalah cermin.** Engine bebas membangun ulang, mengosongkan, atau memindahkan slot kapan saja, sehingga kolom slot secara sah bisa `NULL` atau tidak ada untuk entry yang punya nilai.
- **Melewati API berarti melewati jaminannya.** Setiap query yang dibangun engine membawa tenant id, menyembunyikan entry yang sudah di-soft-delete, dan menjembatani jeda saat rename atau retype berlangsung. Query tulisan tangan tidak melakukan semua itu kecuali Anda menirunya.
- **Menulis merusak invarian.** Registry dan tabel slot dijaga tetap konsisten oleh transaksi dan proses latar belakang milik engine. Perubahan manual bisa meninggalkan nilai di payload yang tidak lagi sesuai dengan index.
- **Tidak ada di API terdokumentasi yang bergantung pada Anda membacanya.** Pakai `listModels()` dan `describeModel()` untuk pertanyaan seputar skema, dan `read()`, `search()`, serta `get()` untuk data.

## Apakah daemon wajib dijalankan?

Ya, dalam satu bentuk atau lainnya. Pekerjaan latar belakang StarDust harus berjalan di suatu tempat: sebagai empat proses persisten, atau sebagai `bin/stardust tick` terjadwal di host yang tidak bisa mempertahankan proses. Yang perlu dipilih adalah mana yang dipakai, bukan apakah akan dijalankan. Lihat [Deployment](/id/operations/deployment).

Yang tetap berfungsi tanpa apa pun berjalan: penulisan (nilai selalu masuk ke payload JSON), pembacaan dan point read semua field, serta filter dan pengurutan pada field yang sudah punya slot terindeks aktif.

Yang berhenti:

- field yang baru filterable atau di-retype tidak pernah menjadi filterable, karena Reconciler yang melakukan penyalinan;
- begitu kapasitas terindeks sebuah page habis, tidak ada yang menyediakan page lain, sehingga field filterable baru dan penulisan ke field itu tetap tanpa index;
- rename, penghapusan field, dan penghapusan model tidak pernah selesai;
- impor asinkron tetap `pending`;
- ekspor tetap `pending`, karena Chronicler yang menulisnya;
- slot yang sudah bebas tidak pernah direklamasi.

Lihat [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work).

## Apa bedanya dengan EAV atau kolom JSON biasa?

| | Tabel EAV | Kolom JSON biasa | StarDust |
| :-- | :-- | :-- | :-- |
| Menambah field | Tanpa perubahan skema. | Tanpa perubahan skema. | Tanpa perubahan skema. |
| Memfilter berdasarkan field | Satu join per field, sehingga biaya naik seiring jumlah field dalam filter dan ukuran tabel. | Scan, karena nilai di dalam JSON tidak bisa memakai index biasa. | Pencarian index pada kolom bertipe, dengan paling banyak satu join per page tempat field berada. |
| Tipe nilai | Biasanya semua disimpan sebagai teks. | Tipe hanya ada di dalam JSON. | Setiap field punya declared type, dan slotnya adalah kolom bertipe. |
| Sumber kebenaran | Baris atribut. | JSON. | JSON, dengan index sebagai cermin yang bisa dibangun ulang. |
| Mengubah tipe atau nama field | Tulis ulang baris. | Tulis ulang JSON. | Online, di latar belakang, dengan pembacaan tetap berfungsi. |
| Biaya | Melambat seiring tabel membesar. | Melambat seiring tabel membesar. | Field filterable memakai satu slot dan biaya pemeliharaan index. Field lain gratis. |

Singkatnya, StarDust mempertahankan fleksibilitas kolom JSON dan menambahkan index sungguhan untuk field yang Anda nyatakan akan difilter. Harganya, field filterable membutuhkan slot, dan memfilternya baru bisa dilakukan sesaat setelah Anda mendeklarasikannya, bukan seketika. Lihat [Sekilas arsitektur](/id/concepts/architecture).

## Berapa banyak field yang bisa dimiliki satu model?

StarDust tidak menetapkan batas tetap untuk jumlah field dalam sebuah model, tetapi kedua jenis field berperilaku sangat berbeda:

- **Field non-filterable** tidak menambah biaya selain ruang yang dipakainya di JSON setiap entry. Ukuran satu dokumen dibatasi oleh pengaturan `max_allowed_packet` di database Anda.
- **Field filterable** masing-masing menempati satu slot terindeks. Watcher terus menyediakan page saat kapasitas menipis, jadi tidak ada batas atas yang tetap, tetapi setiap page tambahan yang dijangkau field filterable milik satu model menambah satu join pada query yang menyentuh field di page itu. Jadikan field filterable hanya bila Anda memfilter atau mengurutkan berdasarkan field itu. Lihat [Slot dan page](/id/concepts/slots-and-pages#spread-lebih-sedikit-page-lebih-sedikit-join).

Nilai string yang ditulis ke slot terindeks maksimal 4 096 karakter.
