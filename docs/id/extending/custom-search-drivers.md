# Driver pencarian kustom

Pembacaan dan pencarian selalu melewati sebuah driver. Driver bawaan menjalankan bounded read terhadap MySQL atau MariaDB; driver kustom memungkinkan Anda melayani pemanggilan `read()` / `search()` / `get()` yang sama dari layanan pencarian eksternal — Meilisearch, Elasticsearch, atau apa pun lainnya — tanpa mengubah satu pun titik pemanggilan di aplikasi Anda.

## Kontrak EntrySearchInterface

`StarDust\Search\EntrySearchInterface` adalah seam yang bisa ditukar. Sebuah driver mengimplementasikan tujuh method:

```php
interface EntrySearchInterface
{
    public function list(SearchRequest $request): SearchResult;
    public function get(int $tenantId, int $entryId): ?Entry;
    public function supportedOperators(): array;
    public function supportsFilterOn(int $fieldId): bool;
    public function supportsSortOn(int $fieldId): bool;
    public function supportsFuzzySearch(): bool;
    public function consistencyModel(): string; // 'strong' | 'eventual'
}
```

`list()` dan `get()` mengerjakan pekerjaan baca yang sesungguhnya — tugas yang sama seperti `read()` dan `get()` terhadap driver bawaan, hanya saja terhadap backend Anda sendiri. Lima method lainnya bersifat self-description: pre-flight pipeline dan kode Anda sendiri bisa memeriksanya sebelum sebuah request mencapai `list()` atau `get()`.

**Driver bersifat read-only.** Setiap penulisan tetap melewati jalur tulis StarDust sendiri ke `entry_data` dan, untuk field filterable, ke kolom slot terindeks — sebuah driver tidak pernah menerima pemanggilan tulis. Lihat [Menjaga indeks eksternal tetap sinkron](#menjaga-indeks-eksternal-tetap-sinkron) untuk artinya bagi Anda.

## Mendeklarasikan kapabilitas

`supportedOperators()` mengembalikan operator yang dihormati driver Anda — himpunan tertutup berisi dua belas operator, ditambah operator tambahan apa pun yang spesifik untuk backend Anda. Filter yang memakai operator di luar daftar itu ditolak sebelum driver Anda dipanggil, dengan `capability_unsupported`, bukan penolakan generik, sehingga bisa diukur secara terpisah. Lihat [Event log](/id/reference/log-events#penulisan-dan-pembacaan).

`supportsFilterOn(int $fieldId)` menjawab, per field, apakah filter terhadapnya akan berfungsi *sekarang juga*. Untuk driver MySQL bawaan, ini adalah pertanyaan yang sama dengan yang dijawab `isIndexed` pada sebuah `FieldDescription` — lihat [Filterable vs. indexed](/id/concepts/filterable-vs-indexed). Driver Anda bisa menjawab berbeda: sebuah index eksternal mungkin mencakup sebagian field dan bukan yang lain, dengan jadwal yang tidak ada hubungannya dengan siklus hidup slot milik StarDust sendiri.

`consistencyModel()` melaporkan `'strong'` atau `'eventual'`, dan `supportsFuzzySearch()` melaporkan apakah backend Anda melakukan pencocokan substring, fuzzy, atau berperingkat relevansi — operator bawaan StarDust hanya exact-match, perbandingan, rentang, keanggotaan himpunan, dan prefix berjangkar. Tidak satu pun ditegakkan oleh pipeline; keduanya ada agar kode pemanggil bisa membuat keputusan yang tepat (misalnya, apakah menawarkan fitur "maksud Anda") alih-alih menebak.

## Mendukung pengurutan

`supportsSortOn(int $fieldId)` sengaja menjadi pertanyaan terpisah dari `supportsFilterOn()`, meskipun driver bawaan menjawab keduanya dengan cara yang sama. Sebuah engine eksternal bisa dengan mudah mengindeks sebuah field untuk pencocokan tanpa membuatnya bisa diurutkan — pengurutan biasanya lebih mahal dipelihara daripada pencocokan. Sort yang menyebut field yang menurut driver Anda tidak didukung memunculkan `FieldNotSortableException` sebelum driver Anda sempat berjalan. Lihat [Pengurutan](/id/usage/reading-entries#pengurutan) untuk `SortSpec` yang diterima implementasi `list()` Anda lewat `SearchRequest`, dan perhatikan bahwa aturan satu-key-saja yang sama berlaku terlepas dari driver mana yang melayani pembacaan.

## Mendaftarkan driver Anda

Suntikkan sebuah instance lewat `Config::$searchDriver`:

```php
use StarDust\Config\Config;
use StarDust\Search\EntrySearchInterface;

final class MeilisearchDriver implements EntrySearchInterface
{
    // ...
}

$engine = new StarDust(new Config(
    pdo:          $pdo,
    searchDriver: new MeilisearchDriver(/* ... */),
));
```

`null` (bawaan) memakai `MysqlNativeDriver` yang sudah dibundel. Begitu disuntikkan, setiap pemanggilan `read()`, `get()`, dan `search()` melewati driver Anda setelah validasi isolasi tenant dan pre-flight yang sama yang selalu didapat setiap request — field yang tidak dikenal, non-filterable, atau operator yang tidak didukung driver Anda tetap ditolak sebelum kode Anda tercapai, persis seperti terhadap driver bawaan. Lihat [Error](/id/reference/errors#pembacaan-filter-dan-pengurutan).

## Menjaga indeks eksternal tetap sinkron

Sebuah driver hanya pernah *membaca*. Tidak ada apa pun soal menyuntikkannya yang mengubah cara StarDust menulis, dan meng-cermin-kan pemanggilan `write()` Anda sendiri ke index eksternal Anda saja tidak cukup untuk menjaganya tetap terkini: sebagian perubahan yang dibuat StarDust diterapkan oleh sebuah daemon di latar belakang, bukan oleh penulisan yang dibuat langsung aplikasi Anda. Sebuah rename field menulis ulang setiap entry dalam model. Sebuah retype mengonversi setiap nilai tersimpan ke tipe barunya. Penghapusan field atau model menghapus nilainya sama sekali. Tidak satu pun dari ini berkaitan dengan pemanggilan `write()` yang bisa Anda "kaitkan".

Saat ini belum ada change feed yang memungkinkan sebuah driver mengamati perubahan-perubahan ini saat terjadi. Sampai itu ada, bangun ulang index eksternal Anda dari [ekspor](/id/usage/exports) penuh, alih-alih mencoba meng-cermin-kan penulisan secara inkremental — sebuah ekspor selalu mencerminkan keadaan model saat ini setelah backfill, sehingga ia menghindari seluruh masalah ini alih-alih menyiasatinya baris demi baris.
