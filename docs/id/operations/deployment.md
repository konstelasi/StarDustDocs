# Deployment

StarDust menjaga kapasitas slot tetap unggul dari permintaan dan menuntaskan pekerjaan tertunda lewat empat daemon latar belakang — Watcher, Reconciler, Liberator, Chronicler — atau, di hosting yang tidak bisa menjalankan proses persisten, lewat satu perintah `bin/stardust tick` yang dijadwalkan sebagai gantinya. Halaman ini membahas kedua mode tersebut, plus persyaratan yang berlaku terlepas dari mode mana yang Anda pilih.

## Memilih mode deployment

Pilih **satu** mode per instalasi dan jangan mencampurnya: jalankan empat daemon persisten, atau jalankan `tick` terjadwal, jangan keduanya sekaligus terhadap database yang sama. `tick` mengambil lock singleton milik Watcher sendiri, sehingga proses `watcher` persisten yang sudah berjalan membuat setiap pemanggilan `tick` hanya melaporkan skip tanpa efek, bukan benar-benar bekerja — kedua mode ini saling menggantikan, bukan saling melengkapi. (Liberator dan Chronicler adalah pengecualian: keduanya multi-worker tanpa lock singleton, sehingga proses `tick --exports` dan proses `liberator` atau `chronicler` mandiri bisa berjalan bersamaan dengan aman, hanya saja redundan.)

Pilihannya biasanya bergantung pada apakah hosting Anda menyediakan proses persisten sama sekali:

| Tingkatan | Vonis |
| :-- | :-- |
| VPS dengan systemd / supervisor | Proses persisten — mode deployment acuan. |
| Container (Docker Compose, Kubernetes, ECS) | Proses persisten — direkomendasikan untuk produksi berskala besar. |
| Shared hosting berbayar dengan crontab | `tick` terjadwal. |
| Shared hosting yang hanya punya scheduled URL fetch, tanpa shell | `tick` dijalankan dari URL fetch tersebut. |
| Shared hosting gratis (tanpa shell, tanpa cron, tanpa URL fetch) | Tidak layak di tingkat manapun. |

Kedua mode membutuhkan database yang sama: MySQL atau Percona 8.0.13+, atau MariaDB 10.11+. Lihat [Persyaratan](/id/guide/requirements) — server yang lebih lama ditolak saat boot terlepas dari mode deployment mana yang Anda jalankan.

## Proses persisten (mode acuan)

Jalankan keempat daemon sebagai proses yang hidup lama:

```bash
bin/stardust watcher
bin/stardust reconciler
bin/stardust liberator
bin/stardust chronicler
```

Watcher adalah singleton ketat — instance kedua langsung keluar alih-alih berjalan berdampingan dengan yang pertama. Tiga lainnya aman dijalankan sebagai beberapa proses sekaligus; lihat [Berapa banyak proses yang perlu dijalankan](#berapa-banyak-proses-yang-perlu-dijalankan) di bawah dan halaman masing-masing daemon untuk penjelasan manfaat menjalankan beberapa worker.

### systemd, supervisor, dan container

Supervisor apa pun yang me-restart proses yang crash bisa dipakai: unit systemd, `supervisord`, atau kebijakan restart bawaan orchestrator container (`restart: unless-stopped` di Docker Compose, Deployment Kubernetes, service ECS). Setiap daemon adalah satu proses asing yang berjalan lama tanpa urutan startup khusus selain `bootstrap()` yang sudah pernah dijalankan sekali — daemon-daemon ini toleran terhadap database yang sesekali terputus lalu tersambung kembali, dan proses baru cukup melanjutkan apa pun yang masih tertunda di antrean.

Daemon menghormati `SIGTERM`/`SIGINT` untuk shutdown yang rapi saat `ext-pcntl` dimuat, dan `touch <pidFileDir>/<nama-daemon>.shutdown` sebagai alternatif tanpa sinyal di hosting yang tidak memilikinya. `SIGTERM` ke proses `chronicler` yang sedang berjalan di tengah ekspor tidak menunggu job itu selesai: worker berhenti tepat di batas chunk berikutnya, job kembali ke status `pending` dengan resume anchor-nya tetap utuh, dan worker berikutnya yang mengambilnya — proses ini sendiri yang restart, atau proses lain yang sudah berjalan — melanjutkan dari titik persis itu. Kode keluar: `0` untuk shutdown yang bersih, `1` untuk error fatal, `2` untuk pelanggaran singleton atau kesalahan pengguna.

### Berapa banyak proses yang perlu dijalankan

Watcher berjalan sebagai tepat satu proses — itu dipaksakan, bukan sekadar saran. Tiga lainnya diskalakan dengan menjalankan lebih banyak salinan:

- <Term id="reconciler">Reconciler</Term> — `SELECT … FOR UPDATE SKIP LOCKED` menjaga worker tetap tidak saling tumpang tindih, jadi jalankan sebanyak yang dibutuhkan backlog drain Anda. Tidak ada biaya koordinasi antar-worker selain lock wait biasa pada tabel bersama.
- <Term id="liberator">Liberator</Term> — karena eksklusi reklamasi berbasis per extension page dan bukan lock seluruh proses, dua worker tidak pernah bertabrakan di tabel page yang sama; batas throughput sesungguhnya adalah jumlah page berbeda yang sedang menampung slot tombstoned, bukan jumlah worker.
- <Term id="chronicler">Chronicler</Term> — mengambil satu job per tick lewat `SELECT … FOR UPDATE SKIP LOCKED`, sehingga lebih banyak worker berarti lebih banyak ekspor berjalan bersamaan dan pemulihan job terbengkalai yang lebih cepat.

Mulai dengan satu untuk masing-masing dan amati sinyal-sinyal di [Observabilitas](/id/operations/observability) — sync queue yang terus membesar, backfill window yang melebar, atau slot tombstoned yang usianya melewati satu-dua siklus — sebelum menambah jumlahnya.

## Hosting yang hanya punya cron dan shared hosting

**Pengecualian sesungguhnya adalah hosting tanpa shell dan tanpa cron, bukan "shared hosting" sebagai kategori.** Akun bergaya cPanel dengan MySQL 8 (atau MariaDB 10.11+) sungguhan dan crontab adalah target yang didukung penuh, termasuk ekspor asinkron; satu-satunya hosting yang benar-benar dikecualikan adalah yang tidak punya shell, cron, maupun scheduled URL fetch. Shared hosting umumnya menjalankan MariaDB — periksa versinya ke penyedia hosting Anda, karena versi di bawah 10.11 ditolak saat boot terlepas dari mode deployment.

### Perintah tick

`bin/stardust tick` menjalankan Watcher, Liberator, dan Reconciler sebagai satu pass yang terbatas melalui satu koneksi database, berhenti saat kehabisan pekerjaan, kehabisan budget waktu, atau diminta shutdown. Satu baris cron menggantikan keempat daemon persisten — dan ini lebih dari sekadar kepraktisan: empat proses yang menetap permanen memegang empat koneksi database secara terus-menerus, sementara shared hosting umumnya membatasi total koneksi akun di puluhan kecil, dipakai bersama dengan situs itu sendiri.

Contoh entri crontab minimal:

```cron
* * * * * flock -n /home/akunanda/stardust.lock /usr/bin/php /home/akunanda/bin/stardust tick --budget=50 >> /home/akunanda/logs/stardust-tick.log 2>&1
```

- `flock -n` mencegah pemanggilan yang tumpang tindih memulai run kedua saat run sebelumnya masih berjalan, selain pengecekan lock milik `tick` sendiri — yang hanya menjaga Watcher, bukan seluruh run. Contoh ini menaruh file lock di bawah direktori home akun, yang tidak bisa diandalkan untuk `flock` di sebagian hosting yang di-mount lewat NFS — periksa ke penyedia hosting Anda, atau arahkan file lock ke penyimpanan lokal jika tersedia.
- Arahkan output ke tempat yang benar-benar bisa ditulis akun Anda. Default cron adalah mengirim setiap baris lewat email ke pemilik akun, yang cepat membanjiri inbox pada jadwal per menit.
- **Advisory kardinalitas dan spread tidak butuh baris crontab sendiri.** Jadwalnya tersimpan di database, bukan di memori satu proses tertentu, sehingga tetap bertahan meski prosesnya keluar setiap kali selesai run, dan sampel yang kira-kira harian itu dipicu oleh pemanggilan `tick` mana pun yang pertama kali mendapatinya jatuh tempo — satu sampel per interval di seluruh deployment, bukan satu per host. `--advisories` memaksa sampel diambil segera terlepas dari jadwalnya:

```cron
0 3 * * * flock -n /home/akunanda/stardust.lock /usr/bin/php /home/akunanda/bin/stardust tick --budget=50 --advisories >> /home/akunanda/logs/stardust-tick.log 2>&1
```

- **Tanpa akses shell sama sekali, tetapi scheduled URL fetch tersedia** (alternatif umum di hosting berbayar untuk cron): jalankan `StarDust::tick()` dari skrip kecil di balik URL yang bisa diakses web, bukan lewat CLI. Lindungi dengan shared secret yang diperiksa lewat `hash_equals()` — URL publik tanpa autentikasi yang memicu kerja database sungguhan adalah pegangan amplifikasi gratis bagi siapa pun yang menemukannya — dan pertahankan disiplin budget serta jadwal tunggal yang sama seperti baris crontab di atas.

### Batas waktu (budget)

`--budget=50` menjaga run tetap nyaman di dalam periode cron semenit. StarDust juga meng-clamp angka ini terhadap `max_execution_time` milik PHP sendiri saat SAPI melaporkan batas yang bukan nol, sehingga batas yang lebih kecil dari hosting dihormati secara otomatis — Anda tidak perlu menyelaraskan keduanya secara manual.

`tick` memeriksa budget di antara ronde pekerjaan, tidak pernah di tengah satu ronde, sehingga budget yang sudah habis atau minus tetap menyelesaikan satu ronde alih-alih error. Ia berhenti pada mana pun yang lebih dulu terjadi: budget habis, satu ronde tidak menemukan pekerjaan tersisa, atau diminta shutdown. Ronde yang tidak menyapu slot tombstoned mana pun, mendapati Reconciler sepenuhnya idle, dan mendapati Chronicler idle (atau memang tidak menjalankannya) — itulah makna "tidak ada pekerjaan tersisa". Tanpa jalan keluar itu, satu menit yang sepi berarti sekitar lima puluh detik polling idle terus-menerus, yang justru menjadi biaya yang ingin dihindari mode ini di shared hosting.

### Menyertakan ekspor dalam tick

Ekspor membutuhkan flag `--exports` secara eksplisit dan tidak aktif secara default. Tanpanya, `bin/stardust tick` tidak pernah menjalankan Chronicler sama sekali. Dengan flag ini, `tick` menyusun Chronicler paling terakhir dalam setiap ronde — setelah provisioning Watcher dan drain Reconciler — sehingga ekspor besar tidak pernah membuat kelaparan perawatan registry:

```cron
* * * * * flock -n /home/akunanda/stardust.lock /usr/bin/php /home/akunanda/bin/stardust tick --budget=50 --exports >> /home/akunanda/logs/stardust-tick.log 2>&1
```

Ekspor besar secara kooperatif kembali ke `pending` — dengan resume anchor-nya tetap utuh — begitu batas waktu budget run tersebut tercapai, alih-alih berjalan sampai selesai berapa pun ukurannya. Ia pun selesai melewati beberapa kali pemanggilan cron, masing-masing melanjutkan dari titik terakhir budget sebelumnya habis, dengan cara yang sama seperti `tick` sudah melanjutkan pekerjaan lain yang sedang berjalan.

Dua hal yang perlu Anda ketahui sebelum mengaktifkan ini: pengaman ruang disk pra-klaim hanya membuktikan bahwa probe tulis kecilnya sendiri bisa ditulis, bukan bahwa ekspor berukuran multi-gigabyte akan muat — ekspor yang kehabisan ruang tetap berakhir `failed:disk_full` di tengah penulisan. Dan pembersihan artifact kedaluwarsa hanya berjalan pada tick yang idle, sehingga jadwal `tick --exports` yang selalu sibuk dengan ekspor yang sedang berjalan tidak pernah membersihkan file yang timeout; jika Anda menjalankan ekspor terus-menerus, pantau ukuran direktori artifact Anda secara langsung, jangan mengasumsikan pembersihan 24 jam sudah terjadi.

## Tingkatan hosting yang memenuhi syarat

| Tingkatan | Vonis |
| :-- | :-- |
| Shared hosting gratis (tanpa shell, tanpa cron, tanpa proses persisten, tanpa scheduled URL fetch) | Tidak didukung di tingkat manapun. |
| Shared hosting gratis dengan scheduled URL fetch | Didukung — jalankan `StarDust::tick()` dari URL fetch tersebut. |
| Shared hosting berbayar, cron-only, MySQL 8 atau MariaDB 10.11+ | Didukung — mode cron-only di atas. |
| Shared hosting berbayar, cron-only, MariaDB di bawah 10.11 | Tidak didukung — ditolak saat boot terlepas dari mode deployment. |
| VPS dengan systemd / supervisor | Didukung — deployment acuan. |
| Container (Docker Compose, Kubernetes, ECS) | Didukung — direkomendasikan untuk produksi berskala besar. |

## Penyimpanan artifact

Dua direktori perlu benar-benar ada, bisa ditulis, dan — ini bagian yang layak dicek dua kali sebelum go-live — **berada di luar apa pun yang bisa diakses lewat web**. `artifactDir` menampung payload bulk-ingest asinkron dan file ekspor; `pidFileDir` menampung file lock Watcher dan file penanda shutdown untuk para daemon. Default keduanya berada di bawah `sys_get_temp_dir()`, yang biasanya sudah cukup, tetapi sebagian tata letak shared hosting menaruh jalur yang jelas-jelas bisa ditulis itu di dalam `public_html` — pastikan milik Anda tidak begitu sebelum mengandalkannya di produksi. Lihat [Konfigurasi](/id/usage/configuration) untuk cara mengarahkan salah satunya ke tempat lain.

Jika aplikasi Anda berbagi satu filesystem di antara beberapa proses — daemon CLI dan aplikasi web Anda, misalnya — pastikan semuanya me-resolve `artifactDir` ke direktori nyata yang sama. `bin/stardust` selalu memakai direktori default yang dikonfigurasi; skrip bootstrap kustom yang mengubahnya harus sepakat dengan apa pun yang mengirimkan job tersebut. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#menjalankan-daemon-berdampingan-dengan-aplikasi).
