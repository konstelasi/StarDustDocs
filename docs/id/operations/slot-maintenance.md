# Perawatan slot

Field filterable sebuah model bisa berakhir tersebar di lebih banyak extension page daripada yang sebenarnya dibutuhkan — **spread** — semata-mata karena page terisi penuh seiring waktu dan slot sebuah field mendarat di mana pun ada ruang saat dipesan. Spread bukan bug; ia adalah konsekuensi alami dari page yang bersifat permanen begitu dibuat. Meski begitu, ada biaya nyata: setiap page ekstra yang disentuh sebuah query yang difilter berarti satu join tambahan.

Dua laporan read-only memungkinkan Anda melihat ini sebelum jadi masalah, dan satu perintah yang dijalankan operator memungkinkan Anda memperbaikinya.

## Laporan spread

```bash
bin/stardust spread:report
bin/stardust spread:report --tenant=1 --model=7
```

Untuk setiap model yang punya slot filterable yang hidup, laporan ini menunjukkan berapa banyak page yang sebenarnya ditempati slot-slotnya dibandingkan dengan paling sedikit yang bisa ditempati — selisihnya adalah jumlah join yang sebenarnya bisa dihindari yang dibayar setiap query filter yang menyentuh semua field itu pada model tersebut. Laporan ini registry-only: ia hanya membaca schema registry dan tidak menyentuh data extension page mana pun, sehingga aman dijalankan terhadap produksi kapan saja, termasuk pada jam sibuk.

Angka yang sama tersedia langsung dari PHP jika Anda sedang membangun dashboard pengaturan atau pemeriksaan otomatis:

```php
foreach ($engine->spreadSampler()->report(tenantId: 42) as $sample) {
    if ($sample->excessPages() > 0) {
        echo "model {$sample->modelId}: {$sample->excessPages()} page yang bisa dihindari\n";
    }
}
```

## Laporan kardinalitas

```bash
bin/stardust cardinality:report
bin/stardust cardinality:report --tenant=1 --model=7
```

Laporan ini menunjukkan jumlah baris, jumlah nilai unik, dan selektivitas untuk setiap slot filterable yang hidup — selektivitas rendah dengan jumlah baris yang banyak berarti indeks yang tidak bisa dimanfaatkan secara efektif oleh query optimizer, terlepas dari apa yang seharusnya bisa dilakukan secara teori. Berbeda dari laporan spread, laporan ini **bukan** registry-only: ia memindai `COUNT(*)` / `COUNT(DISTINCT kolom)` di setiap extension page yang cocok, sehingga membutuhkan I/O sungguhan dan lebih baik dijalankan di luar jam sibuk untuk dataset besar.

`--model` mempersempit slot mana yang diperiksa, tetapi bukan baris mana yang dihitung: agregatnya per `(tenant, kolom slot)` di seluruh partisi tenant pada page tersebut, karena indeks yang diukur dipakai bersama oleh setiap model yang punya slot di page yang sama.

```php
foreach ($engine->cardinalitySampler()->report(tenantId: 42) as $sample) {
    if ($sample->selectivity < 0.01) {
        echo "slot {$sample->slotColumn} pada page {$sample->pageId}: selektivitas rendah\n";
    }
}
```

## Memadatkan model (compaction)

```bash
bin/stardust compact:model --tenant=1 --model=7 --dry-run
bin/stardust compact:model --tenant=1 --model=7
```

Compaction adalah tindakan yang menanggapi laporan spread: ia memindahkan field filterable sebuah model ke page paling sedikit yang bisa menampungnya, satu field pada satu waktu, menghilangkan join yang sebenarnya bisa dihindari yang ditunjukkan laporan tadi. Prosesnya sengaja lambat dan diinisiasi operator — ia memindahkan satu field, menunggu Reconciler yang sedang berjalan menuntaskan relokasi itu, baru memindahkan field berikutnya — dan ia menunggu sampai setiap perpindahan selesai. Jangan pernah memanggil `compactModel()` dari request path; jalankan sebagai tugas perawatan sekali jalan dengan Reconciler yang sudah berjalan.

Aman dijalankan ulang: field yang sudah berada di posisi targetnya dilewati, sehingga compaction yang terhenti di tengah jalan cukup melanjutkan sisa relokasi pada run berikutnya.

```php
$plan = $engine->compactModel(tenantId: 42, modelId: $modelId, dryRun: true);
```

### Dry run

`--dry-run` (atau `dryRun: true` dari PHP) merencanakan relokasi dan melaporkan apa yang akan dilakukannya — jumlah relokasi, jumlah page setelahnya, jumlah excess page yang dihilangkan — tanpa memindahkan apa pun atau menyentuh Reconciler. Jalankan ini lebih dulu untuk apa pun yang belum Anda yakini; sifatnya registry-only dan sama amannya dengan laporan spread itu sendiri.

### Saat compaction menolak berjalan

Compaction menolak berjalan — dry run pun termasuk — selama ada field milik model tersebut yang sedang di tengah retype, di tengah promosi, di tengah demosi, atau sudah sedang direlokasi oleh compaction lain. Field dalam salah satu keadaan itu belum punya lokasi penyimpanan yang pasti, sehingga rencana apa pun yang dibuat selama window itu akan melaporkan jumlah page yang tidak sesuai dengan apa yang ditunjukkan laporan spread sesaat kemudian. Tunggu Reconciler menuntaskan pekerjaan itu lalu jalankan ulang; laporan spread sendiri tetap tersedia sepanjang waktu, karena sifatnya read-only dan registry-only terlepas dari apa pun yang sedang berjalan.
