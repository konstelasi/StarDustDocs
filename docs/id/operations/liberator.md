# Liberator

## Tugasnya

Liberator mereklamasi slot setelah sebuah field didemosi atau dihapus. Slot yang kehilangan field-nya tidak langsung diserahkan ke field berikutnya yang menunggu slot — nilai lamanya masih secara fisik ada di kolom tersebut, dan menyerahkannya begitu saja akan membuat filter pada field baru itu cocok dengan data yang tidak pernah ditulis siapa pun ke sana. Liberator membersihkan nilai-nilai itu dalam chunk yang terbatas dan baru setelah itu mengembalikan slot ke pool bebas.

Di antara "field-nya sudah lenyap" dan "slot-nya bisa dipakai lagi", slot itu berstatus **tombstoned**. Pembacaan, penulisan, dan filter sudah berperilaku seolah field itu tidak pernah ada begitu ia didemosi atau dihapus; tugas Liberator murni kebersihan penyimpanan yang terjadi setelahnya.

## Cara sebuah slot direklamasi

Setiap siklus, Liberator mencari slot yang tombstoned dan menyusuri extension page masing-masing dalam chunk yang terbatas: pilih rentang entry id, kosongkan kolom slot untuk baris-baris itu, majukan cursor, commit. Ini berulang sampai seluruh page selesai disusuri. Hanya pada chunk terakhir — begitu kolomnya terkonfirmasi sudah sepenuhnya kosong — barulah slot itu berpindah dari `tombstoned` kembali ke `free`, dalam transaksi yang sama yang memajukan cursor untuk terakhir kalinya.

Urutan itulah seluruh jaminan keamanannya: sebuah slot tidak pernah menjadi bisa dipakai lagi selama ia masih mungkin menyimpan nilai penghuni sebelumnya. Slot yang didaur ulang dan diserahkan ke field baru dijamin kosong, bukan sekadar kemungkinan besar kosong.

## Sweep gap

Kontensi lock yang berkelanjutan pada sebuah chunk — proses lain yang berulang kali memegang lock yang bertabrakan pada baris yang sama — ditangani dengan jumlah percobaan ulang yang terbatas. Jika sebuah chunk terus mengalami deadlock melewati batas itu, Liberator mengambil **gap**: ia melewati chunk itu untuk siklus ini alih-alih mencoba ulang selamanya, dan menaikkan penghitung gap per-slot yang bisa Anda baca kembali dari registry.

Slot yang mengalami gap **tidak** direklamasi pada pass ini, bahkan setelah sisa page-nya selesai disusuri — sweep-nya mundur ke titik gap paling awal dan membiarkan slot itu tetap tombstoned untuk disusuri ulang pada siklus berikutnya. Ini disengaja: mereklamasi dengan chunk yang belum tersapu masih terisi akan melanggar jaminan di atas, sehingga slot yang berkontensi tetap "disquat" (tidak tersedia untuk dipakai ulang) alih-alih mengambil risiko membocorkan data basi ke field mana pun yang mengklaimnya berikutnya. Squatting ini terlihat — jumlah gap yang terus bertambah, atau usia tombstoned sebuah slot yang melewati satu-dua siklus — dan sembuh sendiri begitu kontensi yang menyebabkannya reda, jadi amati sinyal-sinyal itu alih-alih memperlakukan satu gap sebagai keadaan darurat.

## Menjalankan beberapa worker

Liberator tidak punya lock singleton. Jalankan sebanyak proses yang Anda inginkan untuk throughput reklamasi:

```bash
bin/stardust liberator
```

Eksklusi terjadi per extension page, bukan per proses, sehingga dua worker tidak pernah menyentuh slot tombstoned di page yang sama secara bersamaan — klaim satu worker atas sebuah page membiarkan setiap page lain bebas untuk disapu worker lain. Batas throughput sesungguhnya karena itu adalah jumlah page berbeda yang sedang menampung slot tombstoned, bukan jumlah worker: menjalankan lebih banyak Liberator daripada jumlah page yang berkontensi tidak memberi tambahan apa pun pada siklus itu, tetapi juga tidak merugikan.
