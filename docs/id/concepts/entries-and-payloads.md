# Entry dan payload

<Term id="entry">Entry</Term> adalah satu record dari sebuah [model](/id/concepts/tenants-models-fields), milik satu tenant. Secara fisik, entry selalu berupa satu baris di `entry_data` yang menyimpan payload lengkapnya. Bila model itu punya field filterable yang sudah punya slot, ada juga satu baris salinan di setiap [extension page](/id/concepts/slots-and-pages) tempat slot-slot itu berada.

## Payload JSON menyimpan semuanya

<Term id="payload">Payload</Term> adalah objek JSON lengkap berisi nilai semua field milik sebuah entry. Semua field ada di dalamnya, filterable maupun tidak, dengan nama field sebagai key:

```json
{ "name": "Acme", "employees": 340, "city": "Berlin" }
```

Payload adalah <Term id="system-of-record">system of record</Term>. Ia selalu lengkap dan selalu menjadi sumber yang sah, sehingga ada tiga jaminan:

- field yang tidak punya slot tetap bisa dibaca sepenuhnya;
- backfill yang belum berjalan, atau yang gagal, tidak akan pernah menghilangkan data;
- slot yang direklamasi atau dipindahkan hanya memengaruhi apa yang bisa di-query, tidak pernah apa yang tersimpan.

Nilai dengan key yang tidak terdaftar sebagai field pun tetap disimpan. Hanya field terdaftar yang dipertimbangkan untuk mendapat slot, tetapi key tak dikenal dalam payload yang Anda tulis dipertahankan di JSON yang tersimpan, tidak dibuang.

## Kolom slot hanyalah cermin, bukan sumbernya

Untuk setiap field filterable yang punya slot aktif, engine juga menulis nilainya ke kolom slot bertipe yang terindeks, dalam transaksi yang sama dengan payload. Salinan ini ada demi satu tujuan: agar filter dan pengurutan bisa memakai index.

Karena slot hanyalah cermin:

- engine boleh membangun ulang, mengosongkan, atau memindahkan slot kapan saja tanpa menyentuh data Anda;
- update yang tidak menyertakan sebuah field akan menghapusnya dari JSON **dan** mengosongkan slotnya, sehingga filter tidak akan pernah cocok dengan nilai yang sudah tidak dimiliki entry itu (lihat [Memperbarui dan menghapus entry](/id/usage/updating-and-deleting));
- nilai yang tidak bisa dikonversi ke tipe slot saat [retype](/id/schema-changes/retype) menjadi null *hanya di slot*. Payload tetap menyimpan nilai aslinya, jadi pembacaan tetap menampilkannya.

## Soft deletion

Menghapus entry dengan `deleteEntry()` hanya mengisi sebuah timestamp. Barisnya tidak dibuang, dan setelah satu penulisan itu entry lenyap dari `read()`, `get()`, `search()`, dan ekspor sekaligus. Nilai di slot dibiarkan apa adanya, karena tidak ada yang bisa menjangkaunya tanpa melewati baris entry yang sudah disembunyikan.

- Tidak ada hard delete maupun restore untuk satu entry.
- Menghapus dua kali tidak berbahaya: hasilnya `false`.
- Satu-satunya operasi yang benar-benar menghancurkan baris entry adalah [menghapus model](/id/schema-changes/deleting-models), dan itu pun tidak bisa dibatalkan. Ekspor dulu jika Anda mungkin menginginkan datanya kembali.

## Membaca dari payload saat slot belum ada

Saat Anda membaca entry, setiap field diambil dari slot terindeks-nya bila ia punya slot aktif, dan dari payload JSON bila tidak. Dengan begitu ketersediaan di sisi baca terjaga: field yang belum punya slot tetap dikembalikan, hanya tanpa kemampuan untuk difilter atau diurutkan.

Inilah yang membuat pembacaan tetap berfungsi selama setiap [backfill window](/id/concepts/background-work#backfill-window). Di antara saat Anda mempromosikan sebuah field dan saat slotnya terisi, pembacaan tetap mengembalikan nilainya langsung dari payload. Yang tidak bisa dilakukan pada rentang itu adalah *memfilter* berdasarkan field tersebut. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).
