# Reconciler

## Tugasnya

Reconciler adalah daemon yang menutup setiap backfill window yang dibuka StarDust. Membuat field menjadi filterable, me-retype-nya, mengganti namanya, menghapusnya, menghapus sebuah model, dan memproses entry yang masuk antrean karena tidak ada slot bebas saat ditulis — semuanya langsung kembali dan diselesaikan di latar belakang. Hampir tidak ada yang konvergen di StarDust tanpa Reconciler yang berjalan; lihat [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work) untuk penjelasan apa saja yang tetap terbuka sampai ia menutupnya.

Setiap tick menghasilkan satu correlation id untuk ronde tersebut dan mengerjakan enam jenis pekerjaan tertunda dalam urutan tetap, dalam chunk yang terbatas, sehingga tidak pernah memegang lock cukup lama untuk memengaruhi request yang sedang berjalan.

## Enam jenis pekerjaannya

Dalam urutan yang dikunjungi setiap tick:

1. **Sync queue** — entry yang mirroring terindeksnya ditunda karena tidak ada slot bebas saat ditulis (exhaustion fallback; lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed)). Reconciler mem-backfill slotnya dari payload yang tersimpan.
2. **Import job** — batch yang diajukan lewat `submitBulkWrite()`. Reconciler mengimpornya chunk demi chunk dan mencatat progres per chunk, sehingga worker yang crash melanjutkan dari chunk terakhir yang ter-commit alih-alih mengulang dari awal.
3. **Backfill retype** — mengonversi nilai field yang sudah ada ke slot baru yang dipesan untuk tipe barunya.
4. **Backfill rename** — menulis ulang setiap entry dalam sebuah model setelah field-nya diganti nama, memindahkan nilai tersimpan dari kunci lama ke kunci baru.
5. **Pembersihan penghapusan field** — menghapus nilai field yang sudah dihapus dari payload yang tersimpan.
6. **Pembersihan penghapusan model** — menghapus setiap entry milik model yang sudah dihapus.

Urutannya tetap dan terlihat di aliran event: satu tick selalu mengunjungi keenamnya dengan urutan yang sama, dan masing-masing paling banyak mengerjakan satu chunk terbatas sebelum beralih ke berikutnya. Sumber pekerjaan yang tidak punya apa-apa untuk dikerjakan dilewati dalam sepersekian milidetik; yang antreannya penuh mendapat giliran lagi pada tick berikutnya.

## Menjalankan beberapa worker

Reconciler tidak punya lock singleton. Jalankan sebanyak proses yang dibutuhkan backlog Anda:

```bash
bin/stardust reconciler
```

Setiap worker mengambil chunk-nya lewat `SELECT … FOR UPDATE SKIP LOCKED`, sehingga worker tidak pernah mengambil baris yang sama — mereka hanya membagi apa pun yang bisa diklaim. Tidak ada biaya koordinasi selain lock wait biasa yang akan dialami penulis konkuren mana pun terhadap tabel yang sama. Jika sebuah worker mati di tengah chunk, transaksi chunk itu di-rollback dan baris-baris yang dipegangnya tetap bisa diklaim oleh worker mana pun yang mengambilnya berikutnya; tidak ada yang hilang atau diproses dua kali.

## Dead-letter queue

Tidak semua baris bisa direkonsiliasi. Baris yang merujuk pada data entry yang sudah lenyap, atau yang nilai tersimpannya tidak bisa lagi dikonversi ke tipe field-nya, diparkir di dead-letter queue alih-alih dicoba ulang selamanya. Ini disengaja: baris yang memang bermasalah kalau tidak begitu akan menyumbat seluruh antrean di belakangnya, memblokir setiap entry yang datang setelahnya.

Tidak ada yang di dalam dead-letter queue dicoba ulang secara otomatis, dan tidak ada yang kedaluwarsa dengan sendirinya — ini adalah antrean yang memang harus Anda periksa sendiri. Sebuah baris mendarat di sini biasanya berarti masalah data yang mendasarinya perlu diperbaiki secara manual, atau ini bukti adanya sesuatu yang layak diselidiki (aturan konversi yang tidak cocok dengan data Anda, misalnya).

### Memproses ulang baris yang gagal

Setelah Anda mengatasi penyebab yang mendasarinya, proses ulang baris kembali ke antrean kerja:

```bash
bin/stardust reconciler:dlq:replay --id=42
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

Proses ulang berdasarkan id satu baris, atau berdasarkan alasan kegagalan untuk membersihkan sekaligus semua baris yang gagal dengan cara yang sama. Satu proses ulang mendaftarkan baris itu kembali ke antrean dan menghapus entri dead-letter-nya dalam satu transaksi — jika penyebab yang mendasarinya ternyata belum benar-benar diperbaiki, baris itu mendarat kembali di dead-letter queue pada percobaan berikutnya, bukan hilang begitu saja.

## Apa yang tertahan jika Reconciler tidak berjalan

Tanpa Reconciler yang berjalan, setiap backfill window di [Pekerjaan latar belakang dan konsistensi eventual](/id/concepts/background-work) tetap terbuka selamanya:

- field yang baru saja Anda jadikan filterable tidak pernah menjadi indexed, sehingga `isFilterable` tetap `true` sementara `isIndexed` tetap `false`;
- rename, retype, atau penghapusan tidak pernah selesai, dan operasi lain terhadap field yang sama terus ditolak karena masih dianggap berjalan;
- import job yang diajukan lewat `submitBulkWrite()` tetap berstatus `pending` tanpa batas waktu;
- sync queue terus membesar, dan entry yang ditulis lewat exhaustion fallback tidak pernah menjadi filterable.

Jalankan minimal satu Reconciler secara terus-menerus — baik sebagai proses persisten atau lewat `bin/stardust tick` yang terjadwal. Lihat [Deployment](/id/operations/deployment) untuk kedua modenya, dan [Pemecahan masalah](/id/operations/troubleshooting#rename-retype-atau-penghapusan-tidak-kunjung-selesai) jika ada yang tampak macet.
