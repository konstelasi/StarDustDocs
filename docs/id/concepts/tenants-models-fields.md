# Tenant, model, dan field

Tiga istilah menggambarkan bentuk data Anda. <Term id="tenant">Tenant</Term> adalah batas isolasi, <Term id="model">model</Term> adalah bentuk data yang diberi nama di dalam sebuah tenant, dan <Term id="field">field</Term> adalah satu atribut bernama milik sebuah model. <Term id="entry">Entry</Term> adalah satu record dari sebuah model. Untuk memahami wujud fisik sebuah entry, lihat [Entry dan payload](/id/concepts/entries-and-payloads).

## Tenant dan isolasi data

Tenant adalah apa pun yang di aplikasi Anda disebut satu pelanggan, satu workspace, atau satu akun. Setiap query yang dibangun engine membawa tenant id di setiap `WHERE` dan setiap `JOIN`. Jadi data satu tenant bukan sekadar disaring dari hasil tenant lain, tetapi memang tidak terjangkau di level SQL.

Dalam praktiknya, artinya:

- **Setiap pemanggilan API menerima tenant id**, dan nilainya harus 1 atau lebih. Nilai ini divalidasi di setiap titik masuk sebelum SQL apa pun dijalankan.
- **Data tenant lain terlihat seperti tidak ada.** `get()` mengembalikan `null` untuk entry milik tenant lain, dan `describeModel()` mengembalikan `null` untuk model milik tenant lain. Keduanya sengaja dibuat tidak bisa dibedakan dari "memang tidak ada".
- **Tenant id berasal dari Anda.** StarDust tidak tahu siapa pengguna Anda. Tentukan tenant dari sesi terautentikasi milik aplikasi Anda sendiri, jangan pernah dari input klien. Lihat [Integrasi dengan aplikasi Anda](/id/usage/integrating#menentukan-tenant-id).

## Model

Model adalah bentuk data bernama di dalam sebuah tenant, kira-kira setara dengan tabel, bedanya Anda mendefinisikannya saat runtime, bukan lewat migration. Sebuah model memiliki sekumpulan field, dan setiap entry milik tepat satu model.

- Nama model unik di dalam satu tenant.
- Mendaftarkan model bersifat get-or-create: meminta nama yang sudah ada akan mengembalikan id yang sudah ada. Lihat [Mendefinisikan model dan field](/id/usage/defining-schema).
- Model bisa [diganti namanya](/id/schema-changes/renaming) seketika dan [dihapus](/id/schema-changes/deleting-models) di latar belakang. Penghapusan tidak bisa dibatalkan.

## Field dan declared type

Field adalah satu atribut bernama milik sebuah model. Ada dua properti yang penting:

- <Term id="declared-type">declared type</Term>, yang menentukan bagaimana nilai divalidasi dan keluarga slot mana yang bisa ditempati field tersebut;
- flag <Term id="filterable">filterable</Term>, yang menentukan apakah field itu mendapat slot atau tidak. Flag inilah satu-satunya pembeda antara "tersimpan dan bisa dibaca" dengan "tersimpan, bisa dibaca, dan bisa di-query secepat index". Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).

Nama field unik di dalam satu model. Field bisa diganti namanya, di-retype, dipromosikan, didemosikan, dan dihapus selagi sistem berjalan. Lihat [Mengubah skema](/id/schema-changes/).

### Empat keluarga slot

Declared type berupa salah satu dari empat nilai, dan masing-masing dipetakan ke satu keluarga kolom slot:

| Declared type | Keluarga slot | Catatan |
| :-- | :-- | :-- |
| `string` | string | Nilai hingga 4 096 karakter. Index hanya mencakup awalan dari setiap nilai, tetapi pencocokan tetap persis. |
| `int` | integer | Signed 64-bit. |
| `numeric` | numeric | Hanya angka yang terhingga (finite). |
| `datetime` | datetime | Disimpan dalam UTC dengan ketelitian detik penuh. |

Sebuah field hanya bisa menempati slot dari keluarganya sendiri. Itu sebabnya [retype](/id/schema-changes/retype) membutuhkan slot baru di keluarga tujuan, bukan konversi di tempat. Menulis nilai yang tidak bisa dikonversi ke declared type-nya akan memunculkan `UncoercibleSlotValueException`. Lihat [Menulis entry](/id/usage/writing-entries#koersi-tipe).

## Nama hanyalah label, id adalah identitas

Di dalam engine, model dan field selalu dirujuk lewat id numeriknya, bukan namanya. Entry, slot, filter, dan ekspor semuanya berpatokan pada id. Ada dua konsekuensi yang akan Anda rasakan:

- **Mengganti nama model itu seketika**, karena tidak ada yang mencari model lewat namanya. Tidak ada pekerjaan latar belakang dan tidak ada window.
- **Mengganti nama field tidak seketika**, karena payload JSON setiap entry memakai nama field sebagai key. Penggantian nama field menulis ulang semua entry dalam model itu di latar belakang, dan engine menjembatani jeda tersebut sehingga pembacaan, penulisan, dan filter pada nama baru tetap berfungsi. Lihat [Mengganti nama field dan model](/id/schema-changes/renaming).

Simpan id yang Anda terima dari `createModel()` dan `describeModel()`, jangan mencari berdasarkan nama setiap kali. Satu-satunya tempat nama dipakai sebagai kunci adalah pendaftaran get-or-create, itulah sebabnya skrip setup yang masih memakai nama model lama akan membuat model kedua setelah rename. Pembahasannya ada di [Mendefinisikan model dan field](/id/usage/defining-schema#skrip-setup-aman-dijalankan-ulang).
