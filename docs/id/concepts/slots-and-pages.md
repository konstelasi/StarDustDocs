# Slot dan page

Slot adalah sumber daya terbatas milik engine, dan sebagian besar perencanaan kapasitas di StarDust sebenarnya adalah perencanaan slot. Halaman ini menjelaskan apa itu slot, bagaimana ia bergerak melewati siklus hidupnya, dan mengapa slot milik satu model bisa tersebar.

## Extension page

<Term id="extension-page">Extension page</Term> adalah tabel samping bernama `entry_slots_page_1`, `entry_slots_page_2`, dan seterusnya. Isinya kolom-kolom slot terindeks yang menyalin nilai field filterable, dan setiap barisnya berelasi satu-satu dengan satu baris di `entry_data`.

Sebuah page dibuat dengan sekumpulan kolom terindeks yang tetap dan **tidak pernah bisa diubah sesudahnya**. Sifat inilah yang membuat provisioning aman di database yang sedang berjalan: menambah page tidak pernah mengunci atau membangun ulang tabel yang sudah ada. Ini juga alasan kapasitas direncanakan lebih dulu, bukan disediakan pas saat dibutuhkan, seperti dijelaskan di [Kapasitas page dan index headroom](#kapasitas-page-dan-index-headroom).

Page baru disediakan oleh [Watcher](/id/operations/watcher). Setiap kolom di sebuah page diberi composite index sendiri yang diawali tenant id, sehingga query untuk satu tenant hanya membaca irisan index milik tenant itu.

## Kolom slot dan keluarganya

<Term id="slot">Slot</Term> adalah satu kolom bertipe yang terindeks di sebuah extension page, yang menyalin nilai satu field filterable. Slot terbagi menjadi empat keluarga yang sesuai dengan [declared type](/id/concepts/tenants-models-fields#empat-keluarga-slot): string, integer, numeric, dan datetime. Sebuah field hanya bisa menempati slot dari keluarganya sendiri.

Anda jarang perlu menyebut nama kolom slot. Namanya dibentuk dari keluarga dan urutan, misalnya `i_str_01` atau `i_int_02`, dan penetapannya dilakukan engine. Anda baru bertemu nama itu ketika menyediakan page secara manual di skrip seed atau test.

## Siklus hidup slot

Setiap slot selalu berada di tepat satu dari lima state:

| State | Artinya |
| :-- | :-- |
| `free` | Kosong dan siap diklaim oleh sebuah field. Selalu terverifikasi kosong. |
| `assigned` | Sudah diklaim sebuah field dan aktif. |
| `backfilling` | Sudah diklaim, dan sedang diisi dari nilai yang sudah tersimpan di payload. Belum bisa dipakai untuk filter. |
| `ready` | Backfill selesai. Bisa dipakai untuk filter dan pengurutan. |
| `tombstoned` | Field-nya sudah tidak ada, tetapi nilai lamanya masih secara fisik berada di kolom. |

### Free, assigned, backfilling, ready

Field yang menjadi filterable mengklaim satu slot `free` dari keluarganya. Jika field itu sudah punya entry, slot melewati state `backfilling` selagi [Reconciler](/id/operations/reconciler) menyalin nilai-nilai yang sudah ada, lalu berubah menjadi `ready`. Penulisan baru masuk ke slot itu sepanjang proses, sehingga tidak ada yang terlewat selama backfill.

Reservasi bersifat atomik, dan setiap field paling banyak memegang satu slot aktif pada satu waktu. Engine berusaha menjaga field-field filterable milik satu model tetap berada di sesedikit mungkin page.

### Tombstoned lalu direklamasi

Ketika sebuah field [didemosikan](/id/schema-changes/filterability), [dihapus](/id/schema-changes/deleting-fields), atau [di-retype](/id/schema-changes/retype), slot lamanya di-**tombstone**. Slot itu tidak langsung diberikan ke field berikutnya, karena menyerahkan kolom yang masih berisi nilai penghuni sebelumnya akan membuat filter field baru cocok dengan data yang tidak pernah ditulis untuknya.

[Liberator](/id/operations/liberator) mengosongkan kolom itu per chunk yang terbatas dan baru setelahnya menandai slot sebagai free. Slot berstatus `free` dengan demikian selalu terverifikasi kosong.

## Kapasitas page dan index headroom

Sebuah page hanya memuat kolom yang memang diindeksnya, dan kapasitasnya adalah sebesar yang ditetapkan saat ia dibuat. Karena page tidak bisa dilebarkan, page yang dibuat hanya dengan kolom secukupnya untuk kebutuhan hari ini akan langsung penuh. Tiga field yang dipromosikan berturut-turut bisa masing-masing memicu page baru dan akhirnya tersebar di tiga page.

<Term id="index-headroom">Index headroom</Term> mencegah hal itu. Setiap page baru dibuat dengan kolom terindeks cadangan di tiap keluarga. Pengaturannya adalah `Config::$pageIndexHeadroom` dengan nilai bawaan empat per keluarga, sehingga page baru memuat hingga enam belas kolom terindeks. Pengaturan ini berlaku di proses mana pun yang menjalankan Watcher (lihat [Pengaturan dan daemon bawaan](/id/usage/configuration#pengaturan-dan-daemon-bawaan)). Beberapa promosi berikutnya pun jatuh ke page yang sama.

- Headroom ditetapkan saat sebuah page dibuat. Menaikkan pengaturannya hanya berpengaruh pada page yang dibuat sesudahnya.
- Watcher menyediakan page baru ketika kapasitas bebas turun di bawah ambangnya (20% secara bawaan) atau ketika ada field filterable yang menunggu slot yang belum ada.

Kalau kapasitas habis sebelum Watcher sempat menyusul, penulisan tetap berhasil. Lihat [Penulisan tidak pernah gagal karena kehabisan slot](/id/concepts/filterable-vs-indexed#penulisan-tidak-pernah-gagal-karena-kehabisan-slot). Untuk menyetel headroom, lihat [Penyetelan](/id/operations/tuning#index-headroom).

## Spread: lebih sedikit page, lebih sedikit join

<Term id="spread">Spread</Term> adalah jumlah extension page tempat slot filterable milik satu model tersebar. Ini penting karena setiap page tambahan yang disentuh sebuah query terfilter menambah satu join.

Spread bukan bug. Ia konsekuensi wajar dari page yang tidak bisa diubah dan slot yang dibagikan dari page mana pun yang masih punya ruang, dan model yang tumbuh field demi field selama setahun sangat mungkin akhirnya tersebar di beberapa page.

Engine mengukurnya sebagai **excess pages**: jumlah page yang benar-benar ditempati model, dikurangi jumlah paling sedikit yang bisa memuatnya. Pengukuran ini hanya bersifat saran dan tidak pernah mengubah apa pun dengan sendirinya. Untuk menindaklanjutinya Anda menjalankan <Term id="compaction">compaction</Term>, yang memindahkan field filterable milik sebuah model ke jumlah page paling sedikit yang bisa memuatnya, satu field per satu waktu. Prosesnya disengaja dan dimulai oleh operator, karena membutuhkan Reconciler yang berjalan dan sesaat membuat satu field tidak bisa difilter selama dipindahkan.

Laporan dan perintah compaction dibahas di [Perawatan slot](/id/operations/slot-maintenance).
