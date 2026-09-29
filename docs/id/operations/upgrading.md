# Upgrade

## Sebelum upgrade

Baca entri [catatan perubahan](/id/project/changelog) untuk versi yang akan Anda tuju sebelum men-deploy-nya — perubahan yang merusak kompatibilitas pada antarmuka publik, jika ada di suatu rilis, disebutkan di sana alih-alih tersembunyi dalam diff. Karena StarDust masih pra-1.0, lihat [Versi dan stabilitas](/id/project/versioning) untuk memahami apa arti "merusak kompatibilitas" di tahap ini dan seberapa banyak yang masih bisa berubah antar-rilis.

Dua hal yang aman diasumsikan terlepas dari versi mana pun: `bootstrap()` tidak pernah menghapus atau menulis ulang apa pun, sehingga menjalankannya ulang sebagai bagian dari deploy selalu aman (lihat di bawah), dan extension page yang sudah ada tidak pernah diubah setelah dibuat, sehingga tidak ada apa pun dalam proses upgrade yang menulis ulang data yang sudah ada di disk.

## Menjalankan ulang bootstrap

Jalankan `bootstrap()` (atau `bin/stardust bootstrap`) sebagai langkah normal di setiap deploy, upgrade atau bukan. Sifatnya idempoten: pada database yang sudah pernah di-bootstrap, ia memeriksa apa yang sudah ada dan hanya menambahkan yang belum ada, tanpa mengubah apa pun pada tabel, kolom, atau data yang sudah ada. Versi yang memperkenalkan tabel baru atau kolom baru pada tabel yang sudah ada mengirimkan penambahan itu sebagai langkah migrasi yang bersifat aditif — tidak pernah menulis ulang yang sudah ada — sehingga menjalankan bootstrap setelah meng-upgrade kode Anda itulah cara struktur baru itu terbentuk.

## Menghentikan daemon selama deploy

Kebanyakan upgrade tidak membutuhkan downtime sama sekali: tidak perlu menghentikan apa pun, deploy, jalankan bootstrap, lalu biarkan daemon mengambil kode baru saat restart berikutnya. Satu pengecualian adalah versi yang catatan perubahannya secara eksplisit menyebutkan perubahan skema koordinasi — advisory lock StarDust diberi nama per instalasi, dan versi yang mengubah cara nama itu diturunkan berarti lock yang dicetak di bawah skema lama dan skema baru tidak saling mengenali. Men-deploy jenis perubahan itu saat daemon sedang berjalan berisiko membuat dua proses yang seharusnya saling eksklusif berjalan bersamaan, sesaat, sampai setiap proses berada di kode yang baru.

Saat entri catatan perubahan menyebutkan hal ini secara eksplisit, hentikan daemon persisten Anda (atau jeda baris cron `tick` Anda) sebelum men-deploy, lalu jalankan ulang begitu kode baru sudah aktif — pada jadwal cron, ini hanya berbiaya satu kali run yang terlewat. Kebanyakan versi tidak membawa catatan semacam ini, dan untuk itu, men-deploy dengan daemon tetap berjalan adalah jalur normal.

## Page yang sudah ada tidak pernah diubah

Sebuah extension page mempertahankan bentuknya sejak dibuat selama ia ada — kumpulan kolom terindeksnya, collation-nya, semua tentang DDL-nya tetap sejak dibuat dan tidak pernah disentuh lagi, oleh versi mana pun setelahnya. Inilah yang membuat provisioning aman dijalankan terhadap database yang hidup sejak awal: versi StarDust yang lebih baru mungkin menyediakan page dengan cara berbeda ke depannya, tetapi tidak pernah kembali dan menulis ulang page dari kemarin.

Konsekuensi praktisnya adalah database yang sudah berumur panjang bisa benar-benar menyimpan page dengan lebih dari satu bentuk sekaligus, dibuat di bawah versi yang berbeda-beda — dan itu memang diharapkan, bukan tanda ada yang salah. Tidak ada apa pun dalam pembacaan, penulisan, atau filter yang peduli bentuk apa yang dimiliki sebuah page; engine membaca apa yang sebenarnya ditawarkan sebuah page alih-alih mengasumsikan tata letak yang tetap.

## Catatan per versi

**0.3.0-alpha.1** adalah rilis pertama dari seri 0.3 dan versi yang sedang berjalan saat ini — tidak ada jalur upgrade dari 0.2.x. Kedua seri tidak berbagi apa pun: skema berbeda, API publik berbeda, ditulis ulang dari awal alih-alih perubahan bertahap. Jika Anda masih memakai rilis 0.2.x, lihat [Seri 0.2.x](/id/project/legacy-0-2) — 0.2.x tetap bisa diinstal dari tag-nya sendiri selama Anda membutuhkannya, tetapi pindah ke 0.3 berarti mulai dari awal, bukan memigrasikan data di tempat.

Bagian ini akan membawa catatan untuk setiap rilis yang membutuhkannya, secara berurutan, seiring seri 0.3 bertumbuh melewati versi pertamanya.
