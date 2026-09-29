# Referensi CLI

`bin/stardust` adalah entry point CLI yang tidak terikat framework. Setiap perintah membaca pengaturan koneksi dari environment; tidak ada bagian lain dari `Config` yang bisa dijangkau dari CLI — lihat [Pengaturan dan daemon bawaan](/id/usage/configuration#pengaturan-dan-daemon-bawaan) bila deployment Anda butuh `artifactDir`, `pidFileDir`, atau penyetelan daemon selain nilai bawaannya.

```bash
bin/stardust --version
bin/stardust --help
```

## Variabel lingkungan untuk koneksi

| Variabel | Artinya |
| :-- | :-- |
| `STARDUST_DSN` | DSN PDO, misalnya `mysql:host=127.0.0.1;dbname=app`. |
| `STARDUST_USER` | User database. |
| `STARDUST_PASS` | Password database. |

Setiap perintah di bawah membaca ketiganya dan tidak ada yang lain.

## bootstrap

```bash
bin/stardust bootstrap
```

Secara idempoten membuat setiap tabel yang dibutuhkan engine. Aman dijalankan ulang terhadap database yang sudah di-bootstrap. Lihat [Instalasi](/id/guide/installation#bootstrap-skema).

## watcher

```bash
bin/stardust watcher
```

Menjalankan daemon page-provisioning. Singleton ketat: memegang file lock di bawah `pidFileDir`, dan instance kedua terhadap direktori yang sama langsung keluar dengan kode `2`. Lihat [Watcher](/id/operations/watcher).

## reconciler

```bash
bin/stardust reconciler
```

Menjalankan daemon reconciliation. Tanpa lock singleton — jalankan sebanyak apa pun proses yang dibutuhkan backlog Anda. Lihat [Reconciler](/id/operations/reconciler).

## reconciler:dlq:replay

```bash
bin/stardust reconciler:dlq:replay --id=42
bin/stardust reconciler:dlq:replay --reason=missing_entry_data
```

Mengembalikan ke antrean satu baris dead-letter berdasarkan id, atau semua baris yang gagal dengan alasan yang sama, dalam satu transaksi per baris. Lihat [Dead-letter queue](/id/operations/reconciler#dead-letter-queue).

## liberator

```bash
bin/stardust liberator
```

Menjalankan daemon reklamasi slot. Tanpa lock singleton — eksklusi per extension page, jadi jalankan sebanyak apa pun proses yang Anda mau. Lihat [Liberator](/id/operations/liberator).

## chronicler

```bash
bin/stardust chronicler
```

Menjalankan daemon ekspor asinkron. Tanpa lock singleton — jalankan sebanyak apa pun proses yang dibutuhkan backlog ekspor Anda. Lihat [Chronicler](/id/operations/chronicler).

## tick

```bash
bin/stardust tick --budget=50
bin/stardust tick --budget=50 --advisories
bin/stardust tick --budget=50 --exports
```

Satu lintasan terbatas Watcher, Liberator, dan Reconciler lewat satu koneksi, untuk host tanpa kemampuan proses persisten. Berhenti ketika budget habis, satu putaran tidak menemukan apa pun untuk dikerjakan, atau diminta untuk berhenti.

| Flag | Artinya |
| :-- | :-- |
| `--budget=N` | Detik yang boleh dipakai jalannya ini. Kembali ke `Config::$tickBudgetSeconds` (50) bila dihilangkan. |
| `--advisories` | Memaksa advisory kardinalitas dan spread untuk sampling segera, terlepas dari jadwalnya (fleet-wide, tersimpan di database). |
| `--exports` | Menyertakan Chronicler ke dalam jalannya, terakhir di setiap putaran. Nonaktif secara bawaan. |

Jangan pernah menjalankan `tick` bersamaan dengan proses `watcher` yang persisten — jalan yang tumpang tindih hanya melaporkan skip dengan kode keluar `0`. `liberator` dan `chronicler` adalah pengecualian: keduanya multi-worker, sehingga jalan `tick` bisa hidup berdampingan dengan salah satunya. Lihat [Perintah tick](/id/operations/deployment#perintah-tick).

## spread:report

```bash
bin/stardust spread:report
bin/stardust spread:report --tenant=1 --model=7
```

Melaporkan berapa banyak extension page tempat field filterable setiap model tersebar, dibandingkan dengan yang paling sedikit yang bisa mereka tempati. Registry-only dan read-only — aman dijalankan terhadap produksi kapan saja. Lihat [Laporan spread](/id/operations/slot-maintenance#laporan-spread).

## cardinality:report

```bash
bin/stardust cardinality:report
bin/stardust cardinality:report --tenant=1 --model=7
```

Melaporkan jumlah baris, nilai distinct, dan selektivitas untuk setiap slot filterable yang aktif. Read-only, tetapi berbeda dari `spread:report`, ia memindai setiap extension page yang cocok, bukan hanya registry — sebaiknya jalankan di luar jam sibuk pada dataset besar. `--model` mempersempit slot mana yang diperiksa; jumlah setiap slot tetap mencakup seluruh page. Lihat [Laporan kardinalitas](/id/operations/slot-maintenance#laporan-kardinalitas).

## compact:model

```bash
bin/stardust compact:model --tenant=1 --model=7 --dry-run
bin/stardust compact:model --tenant=1 --model=7
```

Memindahkan field filterable sebuah model ke page paling sedikit yang bisa menampungnya. Berjalan lama dan diinisiasi operator — butuh Reconciler yang berjalan agar bisa maju, memindahkan satu field pada satu waktu, dan menolak (bahkan dengan `--dry-run`) selagi salah satu field model masih dalam proses retype, promosi, demosi, atau relokasi. Aman dijalankan ulang: field yang sudah di tempatnya dilewati. Lihat [Memadatkan model (compaction)](/id/operations/slot-maintenance#memadatkan-model-compaction).

## Kode keluar dan sinyal

Daemon menghormati `SIGTERM`/`SIGINT` (bila `ext-pcntl` dimuat) maupun `touch <pidFileDir>/<daemon-name>.shutdown` sebagai sinyal graceful-shutdown, untuk host tanpa `pcntl`. `SIGTERM` ke `chronicler` di tengah ekspor mengalah di batas chunk berikutnya alih-alih memblokir sampai job selesai — lihat [Ekspor](/id/usage/exports).

| Kode | Artinya |
| :-- | :-- |
| `0` | Shutdown bersih, termasuk yang dipicu sinyal. |
| `1` | Error fatal. |
| `2` | Pelanggaran singleton (instance `watcher` kedua terhadap lock yang sama) atau error pengguna (flag salah, database tidak terjangkau). |
