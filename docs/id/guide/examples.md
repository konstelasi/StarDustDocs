# Contoh yang bisa dijalankan

Direktori `examples/` di repositori berisi skrip kecil yang berdiri sendiri, yang menunjukkan perilaku StarDust yang tidak bisa disampaikan halaman dokumentasi: hal-hal yang terjadi **seiring waktu**, melintasi lebih dari satu proses. Setiap skrip mengisi data sendiri, menarasikan apa yang dikerjakannya di terminal, dan menghapus semua yang dibuatnya saat selesai.

Skrip-skrip itu bukan tutorial API. [Contoh lengkap](/id/guide/tutorial) adalah tutorialnya, dan [`docker/seed.php`](https://github.com/damarbob/StarDust/blob/main/docker/seed.php) adalah skrip ujung ke ujung yang bisa disalin. Contoh-contoh ini untuk bagian-bagian yang sering mengejutkan orang.

## Menjalankan contoh

Skripnya ada di repositori, jadi clone dan pasang dependensinya:

```bash
git clone https://github.com/damarbob/StarDust.git
cd StarDust
composer install
```

Skrip membutuhkan database MySQL 8.0.13+ atau MariaDB 10.11+. Yang tercepat adalah database dari file Compose di repositori:

```bash
docker compose up mysql -d
```

Berikan skrip tiga variabel yang sama dengan yang dipakai `bin/stardust`, baik sebagai export:

```bash
export STARDUST_DSN='mysql:host=127.0.0.1;port=3307;dbname=stardust'
export STARDUST_USER=root
export STARDUST_PASS=root
```

atau di file `.env` yang diabaikan git di root repositori, yang juga dibaca oleh contoh-contoh ini (tetapi tidak oleh StarDust sendiri). Export lebih diutamakan daripada file. Lalu jalankan salah satunya:

```bash
php examples/01-field-lifecycle.php
```

**Arahkan ke database yang khusus untuk skrip ini.** Skrip mengisi ribuan baris dan memanggil `deleteModel()`, yang menghapus baris entry secara fisik tanpa bisa dibatalkan. Jangan arahkan ke database yang akan Anda sayangkan bila hilang.

Skrip menjalankan daemon **di dalam proses**, jadi Anda tidak perlu menyalakan satu pun. Itu alat bantu untuk belajar, bukan cara Anda men-deploy: di produksi, Watcher, Reconciler, Liberator, dan Chronicler adalah proses terpisah yang berjalan lama. Berikan `--observe` agar tidak menjalankan tick apa pun dan mengamati daemon Anda sendiri. Itulah flag yang tepat ketika sesuatu di aplikasi Anda "tidak terjadi".

MariaDB 10.11+ juga bisa dipakai, dengan satu perbedaan terdokumentasi pada urutan karakter supplementary-plane. Lihat [Persyaratan](/id/guide/requirements#perbedaan-perilaku-di-mariadb).

## Siklus hidup field

```bash
php examples/01-field-lifecycle.php
```

**Pertanyaan yang dijawabnya:** Anda menandai sebuah field filterable, pemanggilannya kembali dengan sukses, tetapi memfilter field itu tetap melempar error. Mengapa, dan sampai kapan?

Inilah kejutan StarDust yang paling umum. Menandai field filterable hanya mencatat *niat* dan ter-commit dalam beberapa milidetik. Pekerjaan yang benar-benar memungkinkan pemfilteran terjadi sesudahnya, di proses latar belakang, dan sampai selesai, `describeModel()` melaporkan `isFilterable: true` sementara setiap filter pada field itu ditolak. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).

Skrip berjalan dalam dua babak. Pada **Babak 1** promosi sudah dipanggil dan tidak ada yang menjalankan tick, sehingga tampilannya membeku. Persis seperti itulah instalasi tanpa daemon yang berjalan, tanpa batas waktu. Pada **Babak 2** skrip mulai menjalankan Watcher dan Reconciler di dalam proses, dan baris-baris yang sama menjadi hidup: sebuah page disediakan, sebuah slot dipesan, sebuah cursor merambat menelusuri baris yang sudah ada, dan pemanggilan `read()` yang identik berhenti melempar error dan mulai mengembalikan hasil.

```text
  1  YOUR CALL      $engine->promoteFieldToFilterable(1, 42);
                    returned 19s ago — and has been finished ever since.

  2  THE REGISTRY   describeModel() on 'sustainability' (int):
                      isFilterable  YES   <- the intent you recorded
                      isIndexed      no   <- whether a filter works NOW

  3  THE SLOT       entry_slots_page_1.i_int_01
                    free -> assigned -> backfilling -> ready
                                        ^^^^^^^^^^^

  4  THE BACKFILL   checkpoint retype_field_42 is running
                    [###############.........]  62%   cursor id 2,480
                    2,480 of 4,000 rows now carry a value in the slot

  5  CAN I FILTER?  read(filter: LeafNode::local('sustainability', 'gte', 80))
                    NO — FieldNotFilterableException
```

Dua perilaku perlu diketahui sebelum Anda menjalankannya, karena skrip akan menunjukkan salah satunya dan keduanya tampak sangat berbeda:

- **Jika database Anda tidak punya slot terindeks bebas** dengan tipe yang sesuai, promosi juga tidak bisa memesannya. Watcher harus menyediakan page lebih dulu, baru Reconciler memesan darinya. Kedua daemon dibutuhkan.
- **Jika slot terindeks bebas sudah ada,** promosi memesannya di dalam transaksinya sendiri dan Watcher tidak terlibat sama sekali. Hanya penyalinan baris yang ditunda.

Run pertama pada database kosong menempuh jalur pertama, dan run kedua biasanya menempuh jalur kedua. Skrip menyebutkan jalur mana yang diambil.

Perhatikan exception di baris 5. Yang muncul adalah `FieldNotFilterableException` ("not filterable on the active driver"), padahal baris 2 melaporkan field itu filterable. Baris 2 benar: field-nya filterable, dan yang belum dimilikinya adalah slot terindeks. Exception yang sama dipakai untuk kedua kasus, jadi bacalah `isIndexed`, bukan pesan exception-nya, untuk tahu Anda berada di kasus yang mana.

### Flag

| Flag | Bawaan | Fungsinya |
| :-- | :-- | :-- |
| `--rows=N` | 4000 | Jumlah produk yang diisi. |
| `--chunk=N` | 200 | Jumlah baris backfill per chunk. |
| `--stall=N` | 8 | Detik menahan Babak 1. |
| `--tick-ms=N` | 200 | Interval frame. |
| `--timeout=N` | 120 | Menyerah setelah N detik. |
| `--tenant=N` | 1 | Tenant id. |
| `--observe` | mati | Tidak menjalankan tick, mengamati daemon Anda sendiri. |
| `--keep` | mati | Lewati pembersihan yang menghapus model demo. |
| `--no-colour` | mati | Keluaran polos. |

Backfill berjalan satu chunk per frame, jadi `--rows` dibagi `--chunk`, dikali `--tick-ms`, kira-kira adalah berapa lama state di tengah tampil di layar. Ukuran chunk sengaja kecil agar penyalinan bisa disaksikan. Nilai bawaan produksi akan selesai sebelum frame sempat digambar ulang.

Tampilan langsung membutuhkan terminal setinggi minimal 38 baris. Terminal yang lebih pendek, atau keluaran yang di-pipe atau diarahkan ke file, beralih mencetak setiap perubahan state sebagai satu baris, dengan informasi yang sama. Atur `NO_COLOR=1` atau berikan `--no-colour` untuk menghilangkan warna.

## Contoh membersihkan datanya sendiri

Setiap contoh membuat model dengan nama unik miliknya sendiri, sehingga menjalankan ulang tidak pernah bertabrakan dengan run sebelumnya dan pembersihannya tidak pernah menyentuh data Anda. Ketika satu run selesai, skrip menghapus apa yang dibuatnya: model demo beserta entry-nya, dan ia menjalankan tick Liberator sampai slot yang dipakainya direklamasi. Berikan `--keep` untuk melewati pembersihan dan memeriksa sisanya.

Dengan begitu skrip aman dijalankan ulang dan aman diinterupsi, di database yang tidak Anda keberatan untuk ditulisi.
