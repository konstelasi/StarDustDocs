# Tabel di database Anda

`bootstrap()` membuat setiap tabel yang dipakai StarDust dalam satu lintasan idempoten. Anda tidak pernah menulis DDL sendiri, dan method publik engine adalah cara resmi untuk membaca dan menulis data ini — halaman ini ada karena seorang database administrator akan tetap melihat tabel-tabel ini di dump skema, dan karena mengetahui fungsi masing-masing membuat keluaran `SHOW TABLES` yang asing menjadi mudah dipahami, bukan mengkhawatirkan.

Tidak ada yang di sini termasuk API publik yang diversikan. Bentuk kolom bisa berubah antar rilis; method pada `StarDust`-lah yang dicakup oleh [Versi dan stabilitas](/id/project/versioning).

## Data entry

`entry_data` adalah system of record. Setiap entry, di setiap model, untuk setiap tenant, tersimpan di sini sebagai satu baris dengan seluruh set field-nya sebagai JSON — `tenant_id`, `model_id`, `created_at`, `updated_at`, `deleted_at`, dan kolom JSON `fields`. Penghapusan bersifat soft: `deleted_at` distempel, barisnya tetap ada. Tidak ada bagian lain dari engine yang bisa memegang nilai yang tidak dimiliki tabel ini juga; setiap slot terindeks adalah materialisasi dari nilai yang lebih dulu ada di sini. Lihat [Entry dan payload](/id/concepts/entries-and-payloads).

`stardust_sync_queue` adalah antrean pendamping kecil: entry yang salinan terindeksnya tidak bisa langsung ditulis karena tidak ada slot bebas, menunggu Reconciler untuk mem-backfill-nya. Lihat [Pekerjaan latar belakang](/id/concepts/background-work).

## Extension page

Nilai field filterable juga disalin ke tabel samping yang lebar bernama `entry_slots_page_1`, `entry_slots_page_2`, dan seterusnya — satu baris per entry, berelasi 1:1 dengan `entry_data`, dengan sekumpulan kolom bertipe dan terindeks yang tetap (`i_str_01`, `i_int_01`, `i_num_01`, `i_dt_01`, dan seterusnya sesuai berapa banyak dari setiap tipe yang di-provisioning untuk page itu). Inilah yang sesungguhnya di-query oleh sebuah filter. Lihat [Slot dan page](/id/concepts/slots-and-pages).

Anda tidak akan pernah perlu meng-query extension page secara langsung — `read()` dan `search()` menentukan sendiri page mana yang menyimpan field mana. Bila Anda memeriksa satu secara manual, perlakukan setiap nilai di sana sebagai salinan: nilai `entry_data.fields` yang bersangkutan selalu menjadi yang sah.

## Schema registry

Empat tabel mendeskripsikan skema tenant-tenant Anda:

| Tabel | Menyimpan |
| :-- | :-- |
| `stardust_models` | Satu baris per model: `tenant_id`, `name`. |
| `stardust_fields` | Satu baris per field: `model_id`, `name`, `declared_type`, `is_filterable`. |
| `stardust_pages` | Satu baris per extension page, menyebutkan tabel fisiknya. |
| `stardust_slot_assignments` | Satu baris per kolom slot pada sebuah page: field mana (bila ada) yang saat ini memilikinya, dan status siklus hidupnya (`free`, `assigned`, `tombstoned`, `backfilling`, `ready`). |

`stardust_schema_version` adalah penghitung satu baris, dinaikkan setiap kali registry berubah. Inilah yang diperiksa jalur baca untuk tahu kapan cache skema dalam prosesnya sudah basi — lihat [Cache versi skema](/id/usage/reading-entries#cache-versi-skema).

## Antrean dan job

| Tabel | Menyimpan |
| :-- | :-- |
| `stardust_import_jobs` | Pengiriman bulk write asinkron dari `submitBulkWrite()`, status, dan manifest per chunk-nya. |
| `stardust_export_jobs` | Pengiriman ekspor dari `submitExport()`, status, dan path artifact-nya. |
| `stardust_reconciler_dlq` | Baris yang tidak lagi dicoba ulang oleh Reconciler alih-alih dicoba selamanya — lihat [Dead-letter queue](/id/operations/reconciler#dead-letter-queue). |
| `backfill_checkpoints` | Penanda progres untuk setiap perubahan skema di latar belakang — promosi, retype, rename, penghapusan field, atau penghapusan model. |
| `stardust_advisory_schedule` | Timer satu baris untuk advisory kardinalitas dan spread, dibagikan ke seluruh fleet daemon Anda. |

## Mana yang aman disentuh

Baca tabel mana pun di sini secara langsung untuk pelaporan, monitoring, atau investigasi sesekali — membacanya tidak mungkin merusak apa pun. **Jangan pernah menulis ke salah satunya secara langsung.** Engine menjaga beberapa tabel ini tetap selaras satu sama lain di dalam transaksi tunggal (status siklus hidup sebuah slot dan field pemiliknya, status sebuah job dan manifest-nya, penanda penghapusan sebuah model dan setiap field yang dimilikinya), dan `UPDATE` atau `DELETE` yang ditulis tangan bisa membuatnya tidak selaras dengan cara yang tidak terdeteksi apa pun sampai pembacaan atau backfill berikutnya berperilaku aneh.

Ini berpadanan langsung dengan hak akses database. Tidak ada satu pun di jalur pelayanan request milik engine — `write()`, `read()`, `search()`, `updateEntry()`, `deleteEntry()`, dan sejenisnya — yang pernah menjalankan DDL; ia hanya butuh `SELECT`, `INSERT`, `UPDATE`, dan `DELETE`. Hanya `bootstrap()` dan Watcher yang membuat atau mengubah tabel, sehingga hanya identitas yang menjalankan keduanya yang butuh `CREATE`, `ALTER`, dan `INDEX` juga. Tidak ada apa pun di mana pun dalam engine yang pernah menghapus tabel atau index, sehingga `DROP` tidak pernah dibutuhkan untuk proses mana pun. Lihat [Hak akses database](/id/operations/security#hak-akses-database) untuk pembagian lengkapnya.
