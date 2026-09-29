# Watcher

## Tugasnya

Watcher menjaga kapasitas slot indexed tetap unggul dari permintaan. Setiap field filterable berada di kolom bertipe dan terindeks pada sebuah extension page, dan page bersifat permanen begitu dibuat — sehingga saat kapasitas bebas menipis, atau saat sebuah field menunggu slot dari keluarga yang sama sekali tidak punya slot bebas, sesuatu harus menyediakan page baru sebelum penulisan dan backfill bisa terus mengejar. Itulah tugas Watcher.

Setiap polling mengambil snapshot kapasitas di seluruh extension page dan membandingkannya dengan field-field yang sedang menunggu slot, lalu memutuskan apakah perlu menyediakan page baru, dan selebar apa, dalam satu langkah.

## Hanya satu instance

Watcher adalah singleton ketat, berbeda dari tiga daemon lainnya. `bin/stardust watcher` mengambil file lock di `pidFileDir` saat startup; instance kedua yang dijalankan terhadap direktori lock yang sama langsung keluar dengan kode bukan-nol alih-alih berjalan berdampingan dengan yang pertama. Sebuah advisory lock di level database menjadi pengaman tambahan di sekitar langkah provisioning itu sendiri, tetapi file lock-lah penegak utamanya — lihat [Pemecahan masalah](/id/operations/troubleshooting#watcher-menolak-berjalan) jika ia menolak untuk mulai.

Menskalakan throughput reklamasi atau backfill adalah tugas Reconciler, Liberator, dan Chronicler. Watcher sendiri tidak pernah butuh lebih dari satu proses, karena keputusan provisioning harus diambil terhadap satu pandangan kapasitas yang konsisten.

## Provisioning berdasarkan kapasitas dan permintaan

Satu polling menyediakan page baru karena salah satu dari dua alasan independen:

- **Kapasitas rendah.** Rasio slot bebas di seluruh page sudah turun di bawah ambang batas yang bisa dikonfigurasi (20% secara default).
- **Permintaan yang tak terpenuhi.** Sebuah field filterable sedang menunggu slot dari suatu keluarga — string, int, numeric, datetime — yang saat ini nol slot bebas terindeksnya di mana pun. Ini terpicu terlepas dari ambang batas kapasitas, karena satu keluarga yang persis berada di ambang batas tetap bisa membuat kelaparan field yang khusus menunggunya.

Saat sebuah page disediakan, ukurannya dilebihkan dari kebutuhan sesaat itu — kolom terindeks ekstra per keluarga, sehingga beberapa field berikutnya yang dipromosikan berturut-turut mendarat di page yang sama alih-alih masing-masing memicu page-nya sendiri. Kumpulan kolom terindeks sebuah page bersifat tetap selamanya begitu dibuat, jadi under-provisioning di sini adalah kesalahan yang tidak bisa Anda perbaiki tanpa compaction yang dijalankan operator nanti — lihat [Perawatan slot](/id/operations/slot-maintenance) dan [Penyetelan](/id/operations/tuning#index-headroom).

## Advisory terjadwal

Selain kapasitas, Watcher juga memegang jadwal untuk dua advisory read-only: laporan spread (berapa banyak page tempat slot sebuah model tersebar) dan laporan kardinalitas (apakah nilai sebuah indeks yang hidup terlalu repetitif untuk membantu query planner). Keduanya berjalan pada kadensi bersama yang kira-kira harian dengan jitter acak, dan jadwalnya sendiri tersimpan di database alih-alih di memori satu proses tertentu — sehingga bertahan melewati restart daemon dan terpicu tepat satu kali per interval di seluruh deployment Anda, bukan satu kali per host.

Anda tidak perlu menjadwalkan keduanya secara terpisah. Watcher mana pun yang sedang berjalan, atau pemanggilan `bin/stardust tick` mana pun, memeriksa apakah jadwal sudah jatuh tempo lalu mengambil sampel jika ya; `tick --advisories` memaksa sampel diambil segera terlepas dari jadwalnya. Lihat [Perawatan slot](/id/operations/slot-maintenance) untuk penjelasan masing-masing laporan.

## Cara menjalankannya

```bash
bin/stardust watcher
```

Interval polling, ambang batas kapasitas, dan kadensi advisory semuanya bisa dikonfigurasi — lihat [Referensi konfigurasi](/id/reference/configuration#watcher). Di hosting yang tidak bisa menjaga proses persisten tetap hidup, `bin/stardust tick` menjalankan logika provisioning yang sama sebagai satu pass yang terbatas; lihat [Deployment](/id/operations/deployment#hosting-yang-hanya-punya-cron-dan-shared-hosting).
