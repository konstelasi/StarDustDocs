# Membaca entry

Ada dua cara membaca: `get()` mengambil satu entry berdasarkan id, dan `read()` mengembalikan satu halaman hasil yang difilter, diurutkan, dan dipaginasi. Keduanya terisolasi per tenant di setiap query, dan keduanya membaca sebuah field dari slot terindeks bila ada dan dari payload JSON bila tidak, sehingga field tanpa slot tetap ikut kembali.

## Membaca satu entry dengan get()

```php
$entry = $engine->get(tenantId: 42, entryId: $someEntryId);

$entry?->id;
$entry?->fields;     // nama field => nilai
$entry?->createdAt;
```

`get()` mengembalikan `null` bila entry tidak ada untuk tenant ini, atau sudah di-soft-delete. Entry milik tenant lain tidak bisa dibedakan dari yang memang tidak ada.

## Query dengan read()

`read()` menerima `EntryQuery` dan mengembalikan `EntryPage`:

```php
use StarDust\Filter\Ast\LeafNode;
use StarDust\Read\EntryQuery;

$page = $engine->read(new EntryQuery(
    tenantId:     42,
    modelId:      $modelId,
    filter:       LeafNode::local('name', 'eq', 'Acme'),
    selectFields: ['name', 'employees'],
    pageSize:     100,
));

$page->rows;        // list<Entry>
$page->nextCursor;  // Cursor|null; null berarti ini halaman terakhir
$page->pageSize;    // ukuran halaman yang diminta
```

| Argumen `EntryQuery` | Artinya |
| :-- | :-- |
| `filter` | Sebuah filter tree, atau abaikan untuk mencocokkan semua entry dalam model. |
| `selectFields` | Nama field yang diisi pada setiap baris. Abaikan untuk semua field terdaftar. |
| `pageSize` | Jumlah baris per halaman, dari 1 sampai 1 000. Bawaannya 100. |
| `cursor` | `nextCursor` dari halaman sebelumnya. |
| `sort` | Sebuah `SortSpec`. Lihat [Pengurutan](#pengurutan). |

Filter berbentuk pohon. Leaf membawa operator, field, dan nilai, lalu `AndNode`, `OrNode`, dan `NotNode` menggabungkannya:

```php
use StarDust\Filter\Ast\AndNode;
use StarDust\Filter\Ast\NotNode;
use StarDust\Filter\Ast\OrNode;

$filter = new AndNode([
    new OrNode([
        LeafNode::local('region', 'eq', 'eu'),
        LeafNode::local('region', 'eq', 'us'),
    ]),
    new NotNode(LeafNode::local('status', 'eq', 'archived')),
]);
```

Pohon yang hanya berisi AND dijalankan sebagai join terindeks. Pohon yang memuat OR atau NOT otomatis beralih ke bentuk eksekusi yang berbeda, tanpa perubahan apa pun di sisi Anda. Daftar operator ada di [Format wire QueryFilter](/id/usage/query-filter#operator), dan [Pencarian](/id/usage/searching) membahas cara menyusun filter dari JSON.

**Filter pada field yang tidak dikenal, tidak filterable, atau belum indexed ditolak sebelum SQL apa pun dijalankan**, dengan exception bertipe. Lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed).

## Paginasi cursor

Halaman ditelusuri dengan <Term id="cursor">cursor</Term> yang opaque. Oper `nextCursor` setiap halaman kembali untuk mendapat halaman berikutnya, dan berhenti ketika nilainya `null`:

```php
$cursor = null;
do {
    $page = $engine->read(new EntryQuery(
        tenantId:     42,
        modelId:      $modelId,
        filter:       $filter,
        selectFields: ['name', 'employees'],
        pageSize:     100,
        cursor:       $cursor,
    ));

    foreach ($page->rows as $entry) {
        // ... pakai $entry
    }

    $cursor = $page->nextCursor;
} while ($cursor !== null);
```

Dua aturan penting di sini:

- **Perlakukan cursor sebagai opaque.** Oper kembali apa adanya dan jangan pernah memeriksa atau membuatnya sendiri.
- **Cursor menandai posisi, bukan query.** Kirim filter, `selectFields`, dan ukuran halaman yang sama pada setiap halaman. Sort yang berubah ditolak mentah-mentah, tetapi filter yang hilang atau berubah *tidak*: halaman setelah yang pertama diam-diam kembali tanpa filter, atau dengan filter yang berbeda. Simpan objek query-nya dan ubah hanya cursor-nya.

### Mengapa tidak ada nomor halaman atau jumlah total

Memang sengaja tidak ada offset dan tidak ada jumlah total. Keduanya memaksa database membaca seluruh himpunan yang cocok, sehingga query yang cepat hari ini akan melambat hanya karena tenant-nya bertambah besar. Setiap pembacaan menghabiskan dua query terbatas berapa pun besar tenant-nya: satu mencari id untuk satu halaman, satu lagi mengambil baris hanya untuk id tersebut.

Konsekuensi bagi UI Anda:

- Infinite scroll dan tombol Next bekerja dengan wajar.
- Tombol Back berarti Anda menyimpan cursor yang sudah dipakai.
- "Halaman 7 dari 214", melompat ke halaman sembarang, dan "menampilkan 1 sampai 20 dari 4 310" tidak bisa dilayani.

Jika Anda memerlukan jumlah total atau nomor halaman, [search driver](/id/extending/custom-search-drivers) kustom yang ditopang index eksternal bisa menyediakannya.

## Pengurutan

Pembacaan kembali dalam urutan penyisipan (id entry menaik) kecuali Anda menentukan lain. Berikan `SortSpec` untuk mengubahnya:

```php
use StarDust\Read\EntryQuery;
use StarDust\Read\SortDirection;
use StarDust\Read\SortSpec;

// Terbaru dulu: kasus yang paling umum, dan yang paling murah.
$page = $engine->read(new EntryQuery(
    tenantId: 42,
    modelId:  $modelId,
    sort:     SortSpec::byId(SortDirection::Desc),
));

SortSpec::byCreatedAt(SortDirection::Desc);
SortSpec::byField('title');                        // menaik
SortSpec::byField('price', SortDirection::Desc);
```

Pengurutan bisa dipadukan dengan filter dan paginasi cursor. Teruslah mengoper `nextCursor` kembali, bersama filter dan sort yang sama. Anda hanya bisa mengurutkan berdasarkan **satu key**. Mengurutkan berdasarkan dua field sekaligus tidak didukung.

### Target pengurutan

Anda bisa mengurutkan berdasarkan id entry, waktu pembuatan, atau salah satu field Anda sendiri. Field harus filterable **dan** punya slot aktif, persyaratan yang sama seperti untuk memfilter. Mengurutkan berdasarkan hal lain memunculkan `FieldNotSortableException`, dan pada nama yang tidak terdaftar `UnknownFieldException`. `describeModel()` memberi tahu field mana yang memenuhi syarat saat ini lewat `ModelDescription::indexedFields()`.

Entry yang tidak punya nilai untuk field pengurut muncul paling awal pada urutan menaik dan paling akhir pada urutan menurun. Mereka tidak dibuang dari halaman.

### Biaya pengurutan berdasarkan field

Mengurutkan berdasarkan id entry atau waktu pembuatan menyusuri index yang sudah ada dan tidak menambah biaya pada kedalaman halaman berapa pun. **Mengurutkan berdasarkan salah satu field Anda sendiri membuat database mengurutkan seluruh himpunan yang cocok di setiap halaman.** Biayanya tetap terbatas, dan tetap dua query, tetapi terukur lebih mahal pada model yang besar. Pilih urutan bawaan bila salah satunya sudah cukup.

### Pengurutan dan cursor

Cursor milik urutan yang menghasilkannya. Ubah key atau arah pengurutan dan cursor lama ditolak dengan `InvalidCursorException`, jadi mulai lagi dari halaman pertama. Itu pengaman, bukan keterbatasan yang perlu dicari jalan pintasnya: memakai ulang cursor akan diam-diam menelusuri urutan yang berbeda.

Di MariaDB, pengurutan berdasarkan field menempatkan karakter supplementary-plane, kebanyakan emoji dan jauh di luar teks sehari-hari, di ujung yang berlawanan dari MySQL. Semua perbandingan lain, dan teks biasa dalam bahasa apa pun, terurut identik di kedua engine.

## Cache versi skema

Setiap pembacaan butuh skema model: field apa saja yang ada dan mana yang punya slot aktif. Agar tidak memuatnya di setiap pemanggilan, jalur baca menyimpan cache dalam proses dan memeriksa satu penghitung schema version untuk tahu apakah cache-nya masih segar. Pemeriksaannya murah dan dirancang di bawah satu milidetik.

Artinya bagi Anda:

- **Perubahan skema terbaca otomatis.** Saat Anda atau sebuah daemon mengubah skema, penghitungnya bergerak dan pembacaan berikutnya menyegarkan cache-nya. Anda tidak perlu me-restart aplikasi. Penyegaran dicatat sebagai event `cache_miss`, yang wajar terjadi setelah perubahan skema dan bukan alasan untuk khawatir.
- **Cache-nya per proses.** Setiap worker PHP-FPM atau proses CLI memegang cache-nya sendiri dan menyegarkannya secara mandiri.
- **Proses yang berjalan lama tidak butuh penanganan khusus.** Daemon atau queue worker melihat perubahan skema pada pembacaan berikutnya seperti proses lainnya.
