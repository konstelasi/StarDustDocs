# Seri 0.2.x

Sebelum `0.3.0`, StarDust adalah library CodeIgniter 4 yang dibangun di atas **Virtual Columns** — pendekatan pengindeksan yang berbeda, dengan nama yang berbeda, dan API publik yang berbeda. Ia sudah dihapus dari repository saat ini dan tidak berbagi kode, skema, maupun API dengan engine yang didokumentasikan di seluruh situs ini. Jika Anda baru pertama kali melihat StarDust, halaman ini tidak berlaku untuk Anda — lewati saja.

## Apa yang berubah di 0.3

`0.3.0-alpha.1` adalah penulisan ulang dari nol, bukan upgrade. Motivasinya adalah batas skalabilitas dan kegagalan out-of-memory yang dialami desain Virtual Column lama di bawah beban nyata, dan memperbaikinya berarti perubahan arsitektur yang terlalu mendasar untuk dikirim sebagai jalur migrasi. Secara konkret:

- **Tanpa dependensi framework.** Seri 0.2.x adalah library CodeIgniter 4. StarDust sekarang adalah package Composer yang tidak terikat framework, tanpa dependensi runtime selain `psr/log` dan `psr/clock` — dukungan CodeIgniter 4, bila kembali suatu saat, akan berupa package pendamping opsional, bukan kebutuhan.
- **Model penyimpanan yang berbeda.** Entry, model, dan field disimpan dalam skema yang berbeda dengan nama tabel yang berbeda. Tidak ada apa pun di database 0.2.x yang kompatibel dengan tabel 0.3, dan tidak ada apa pun di 0.3 yang membaca tabel 0.2.x.
- **API publik yang berbeda.** Setiap kelas, method, dan opsi konfigurasi di 0.3 adalah baru. Kode yang ditulis terhadap kelas manager dan builder milik 0.2.x tidak bisa dikompilasi terhadap 0.3, apalagi berjalan dengan benar.

Tidak ada migrasi otomatis di antara keduanya, dan tidak ada rencana untuk itu — model penyimpanannya cukup berbeda sehingga konverter generik perlu membuat keputusan yang spesifik untuk data Anda sendiri.

## Tetap memakai 0.2.x

Rilis 0.2.x tetap bisa diinstal dari tag-nya sendiri di Packagist dan tidak sedang ditarik dari mana pun:

```bash
composer require damarbob/stardust:^0.2.0-alpha
```

Rilis ini tidak lagi menerima pengembangan lebih lanjut — tidak ada fitur baru, dan tidak ada perbaikan bug di luar yang sudah di-tag. Bila Anda saat ini memakai 0.2.x dan mempertimbangkan untuk pindah, perlakukan `0.3.0` sebagai dependensi baru yang Anda adopsi, bukan lompatan versi biasa: baca [Apakah StarDust cocok untuk Anda?](/id/guide/is-it-a-fit) dan [Apa itu StarDust?](/id/guide/what-is-stardust) seolah-olah Anda belum pernah memakai seri sebelumnya, karena secara arsitektur memang belum.
