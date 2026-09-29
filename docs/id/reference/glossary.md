# Glosarium

Definisi sederhana untuk setiap istilah StarDust yang akan Anda temui saat memakai library ini. Kalau Anda baru di sini, baca dulu [Bagaimana semuanya saling terhubung](#bagaimana-semuanya-saling-terhubung), yang merangkai istilah-istilah inti dalam satu alur. Bagian [Istilah](#istilah) di bawahnya berurutan menurut abjad, untuk dicari kemudian.

Istilah teknis di halaman ini sengaja dibiarkan dalam bahasa Inggris, sama seperti di seluruh dokumentasi. Yang diterjemahkan hanya penjelasannya.

## Bagaimana semuanya saling terhubung

**Tenant** adalah batas isolasi Anda: satu pelanggan, satu workspace, satu akun, apa pun artinya di aplikasi Anda. Di dalam sebuah tenant Anda mendefinisikan **model** (sebuah bentuk data, misalnya "company" atau "invoice"), dan setiap model punya **field**. **Entry** adalah satu record dari sebuah model.

Saat Anda menulis entry, seluruh datanya, semua field baik filterable maupun tidak, masuk ke satu **payload** JSON yang disimpan di tabel `entry_data`. Payload itu adalah **system of record**: selalu lengkap, selalu menjadi sumber yang sah, dan tidak ada bagian lain dari engine yang boleh berbeda dengannya.

Kalau hanya itu, hasilnya document store yang tidak bisa di-query dengan efisien. Maka StarDust menambahkan langkah kedua: setiap field yang Anda tandai **filterable** *juga* disalin ke kolom bertipe yang terindeks, sebuah **slot**, di **extension page**, tabel samping yang berelasi 1:1 dengan `entry_data`. Filter pada field itu kemudian membaca B-tree index sungguhan, bukan memindai JSON. Pemisahan ini adalah seluruh arsitekturnya, dan ia punya nama: **vertical schema partitioning**.

Slot adalah sumber daya terbatas: sebuah page dibuat dengan sekumpulan kolom terindeks yang tetap dan tidak bisa dilebarkan sesudahnya. Daemon **Watcher** menyediakan page baru ketika kapasitas menipis, dan **index headroom** membuat setiap page baru membawa kolom cadangan agar beberapa field yang dipromosikan berurutan mendarat bersama, bukan tercerai-berai. Ketika sebuah field sudah *dideklarasikan* filterable tetapi belum disalin, ia juga belum **indexed**, dan memfilternya ditolak sejak awal lewat **pre-flight rejection**, bukan dibiarkan berubah menjadi scan yang lambat.

Jarak antara "sudah saya minta" dan "sudah berfungsi" itulah **backfill window**, dan ia adalah konsep yang paling layak Anda pahami betul. Menjadikan field filterable, me-retype-nya, mengganti namanya, atau menghapusnya semuanya kembali seketika dan selesai di latar belakang. Daemon **Reconciler** yang mengerjakan proses menyusul itu. Selama window, pembacaan tetap berjalan dari payload JSON, sedangkan filter pada field yang sedang diproses tidak. Dua daemon lain melengkapi gambaran ini: **Liberator** mereklamasi slot yang dibebaskan oleh field yang didemosikan atau dihapus, dan **Chronicler** menulis file ekspor.

Seiring waktu, slot milik sebuah model bisa tersebar di lebih banyak page daripada yang diperlukan, itulah **spread**, dan ia menambah satu join pada setiap query terfilter. Engine melaporkannya dan Anda yang memutuskan apakah akan membayar **compaction**.

Untuk cerita yang sama lengkap dengan diagram, lihat [Sekilas arsitektur](/id/concepts/architecture).

## Istilah

### Artifact

File yang dihasilkan oleh ekspor yang sudah selesai, berupa CSV atau JSON, ditulis ke direktori yang Anda konfigurasikan. Anda sendiri yang menyajikan atau memindahkannya. [Chronicler](#chronicler) menghapusnya secara otomatis setelah TTL-nya habis (24 jam secara bawaan), jadi anggap path-nya sementara.

**Lihat juga:** [Export job](#export-job).

### Backfill

Proses latar belakang yang mengisi kolom slot dengan nilai yang dibaca dari payload JSON yang sudah tersimpan. Prosesnya berjalan dalam chunk yang terbatas sehingga tidak pernah mengunci database Anda, dan inilah yang mengubah field yang baru [filterable](#filterable) menjadi [indexed](#indexed). Backfill adalah tugas [Reconciler](#reconciler), jadi tidak ada yang maju tanpa Reconciler yang berjalan.

**Lihat juga:** [Backfill window](#backfill-window), [Reconciler](#reconciler).

### Backfill window

Rentang antara saat sebuah operasi skema kembali dan saat proses latar belakangnya selesai, yaitu periode ketika perubahan sudah *dideklarasikan* tetapi belum sepenuhnya *diterapkan* ke data yang tersimpan. Setiap operasi asinkron punya window: menjadikan field filterable, me-[retype](#retype)-nya, mengganti namanya, menghapusnya, dan menghapus model.

Apa yang tetap berfungsi selama window itu disengaja dan perlu diketahui: **pembacaan tetap mengembalikan field tersebut**, dilayani dari [payload](#payload) JSON, dan **penulisan tetap diterima**. Yang tidak berfungsi adalah **memfilter berdasarkan field yang sedang diproses**, yang ditolak dengan exception bertipe, bukan diam-diam mengembalikan hasil yang salah. Window tertutup saat [Reconciler](#reconciler) selesai. Tanpa Reconciler yang berjalan, window tidak akan pernah tertutup.

**Lihat juga:** [Backfill](#backfill), [Pre-flight rejection](#pre-flight-rejection), [Indexed](#indexed).

### Bounded read

Strategi dua query di balik setiap pembacaan dan pencarian. Query pertama hanya mencari ID entry yang cocok untuk satu halaman, memakai index dan batas [cursor](#cursor). Query kedua mengambil baris lengkap hanya untuk ID tersebut. Intinya, database tidak pernah menyusun result set yang lebih besar daripada ukuran halaman Anda, dan itu berlaku berapa pun besar tenant-nya. Meski begitu, menemukan ID untuk halaman itu tidak selalu murah di setiap selektivitas: filter yang cocok dengan sebagian besar data, tetapi bukan hampir semuanya, bisa lebih mahal untuk ditemukan dibanding filter yang hanya cocok dengan segelintir baris. Jadi yang terjaga batasnya adalah *result set*-nya, belum tentu kerja untuk menemukannya.

**Lihat juga:** [Cursor](#cursor).

### Bulk ingestion

Menulis banyak entry dalam satu pemanggilan. Batch di-commit per chunk, bukan sebagai satu transaksi raksasa, sehingga kegagalan di tengah batch meninggalkan chunk sebelumnya tetap ter-commit: Anda mendapat laporan per chunk, bukan semua-atau-tidak-sama-sekali. Hingga 1 000 entry dijalankan langsung dan hasilnya dikembalikan seketika. Lebih dari itu, Anda mengirim batch, langsung mendapat handle job, lalu memantaunya sementara [Reconciler](#reconciler) mengerjakannya.

**Lihat juga:** [Idempotency key](#idempotency-key), [Reconciler](#reconciler).

### Chronicler

Daemon yang mengubah export job menjadi file. Ia mengambil job yang pending, menelusuri data dengan [bounded read](#bounded-read) yang sama seperti API sinkron, men-stream CSV atau JSON ke disk, dan membersihkan [artifact](#artifact) yang sudah kedaluwarsa. Beberapa salinan bisa berjalan bersamaan untuk menambah throughput.

**Lihat juga:** [Export job](#export-job), [Daemon](#daemon).

### Compaction

Pemadatan yang dimulai operator untuk mengatasi [spread](#spread): ia memindahkan field filterable milik sebuah model ke jumlah page paling sedikit yang bisa memuatnya, sehingga join yang sebenarnya tidak perlu hilang. Prosesnya sengaja lambat dan manual. Ia memindahkan satu field per satu waktu, membutuhkan [Reconciler](#reconciler) yang berjalan, dan menunggu sampai setiap pemindahan selesai, jadi jangan pernah memanggilnya dari jalur request. Dry run mencetak rencananya tanpa menyentuh apa pun, dan menjalankan ulang setelah crash aman karena field yang sudah di tempatnya dilewati.

**Lihat juga:** [Spread](#spread), [Backfill window](#backfill-window).

### Correlation ID

Pengenal yang mengikat semua event log milik satu operasi, termasuk event yang dipancarkan sebuah [daemon](#daemon) beberapa menit kemudian di proses yang berbeda. Engine membuatnya satu per operasi, tetapi Anda bisa memberikan milik Anda sendiri, biasanya ID request HTTP, sehingga tiket dukungan yang menyebut satu ID request bisa dijawab dari ujung ke ujung.

### Cursor

Token opaque yang menandai posisi Anda dalam pembacaan berhalaman. Anda mengoper cursor dari halaman sebelumnya untuk mendapat halaman berikutnya, dan ketiadaan cursor berarti Anda sudah sampai di akhir. Memang sengaja tidak ada parameter offset dan tidak ada jumlah total: keduanya mengharuskan database membaca seluruh himpunan yang cocok, sehingga query yang cepat hari ini akan melambat hanya karena tenant-nya bertambah besar. Infinite scroll dan tombol Next bekerja dengan wajar. "Halaman 7 dari 214" tidak bisa dilayani.

**Lihat juga:** [Bounded read](#bounded-read), [Sort](#sort).

### Daemon

Proses latar belakang yang berjalan lama dan Anda jalankan berdampingan dengan aplikasi. StarDust menyediakan empat ([Watcher](#watcher), [Reconciler](#reconciler), [Liberator](#liberator), [Chronicler](#chronicler)), semuanya dijalankan lewat `bin/stardust`. Mereka tidak pernah berbicara langsung satu sama lain. Database adalah satu-satunya tempat mereka berkoordinasi. Pengisian kapasitas dan pekerjaan latar belakang bergantung pada pemeliharaan ini berjalan dengan satu cara atau lainnya: jika host Anda sama sekali tidak bisa mempertahankan proses yang hidup lama, `bin/stardust tick` menjalankan satu putaran terbatas dari Watcher, Liberator, dan Reconciler lewat baris cron. Jadi pilihannya adalah mode mana yang dipakai, bukan apakah akan menjalankannya.

### Dead-letter queue

Tempat [Reconciler](#reconciler) menaruh satu record yang tidak bisa ia proses, sehingga satu baris bermasalah tidak menyumbat seluruh antrean. Tidak ada yang dicoba ulang secara otomatis dan tidak ada yang kedaluwarsa dengan sendirinya. Antrean ini memang dimaksudkan untuk Anda periksa. Setelah penyebabnya Anda perbaiki, sebuah perintah CLI memproses ulang baris-baris itu kembali ke antrean kerja, satu per satu atau berdasarkan alasan kegagalan.

**Lihat juga:** [Reconciler](#reconciler), [Sync queue](#sync-queue).

### Declared type

Tipe yang Anda daftarkan untuk sebuah field: `string`, `int`, `numeric`, atau `datetime`. Ia menentukan keluarga kolom [slot](#slot) mana yang bisa ditempati field itu dan bagaimana nilai filter terhadapnya divalidasi. Mengubahnya kemudian disebut [retype](#retype).

### Demotion

Menandai field yang sebelumnya filterable menjadi non-filterable. Efeknya seketika: pembacaan langsung kembali ke [payload](#payload) JSON, filter pada field itu mulai ditolak, dan [slot](#slot)-nya di-[tombstone](#tombstoned-slot) untuk direklamasi oleh [Liberator](#liberator). Berbeda dengan [promotion](#promotion), tidak ada masa tunggu, karena tidak ada yang perlu dibangun.

**Lihat juga:** [Promotion](#promotion), [Filterable](#filterable).

### Entry

Satu record dari sebuah [model](#model), milik satu [tenant](#tenant). Secara fisik ia selalu berupa satu baris di `entry_data` yang menyimpan [payload](#payload) lengkap, ditambah, bila model itu punya field filterable yang sudah punya slot, satu baris salinan di setiap [extension page](#extension-page) tempat slot-slot itu berada.

**Lihat juga:** [Model](#model), [Payload](#payload).

### Exhaustion fallback

Yang terjadi ketika Anda menulis field filterable dan tidak ada kapasitas [slot](#slot) yang tersedia: nilainya tetap masuk ke [payload](#payload) JSON, entry diantrekan untuk disalin kemudian, dan penulisan berhasil. Pilihan rancangannya adalah **penulisan tidak pernah gagal atau terblokir karena kehabisan kapasitas index**. Penulisan turun menjadi tanpa index sampai [Watcher](#watcher) menyediakan page dan [Reconciler](#reconciler) menyusul. Harganya, entry yang terdampak untuk sementara tidak terlihat oleh filter pada field itu.

**Lihat juga:** [Sync queue](#sync-queue), [Watcher](#watcher).

### Export job

Permintaan untuk membuang entry milik sebuah model ke file, ditangani secara asinkron agar ekstraksi besar tidak menahan sebuah request. Anda mengirimnya, mendapat ID, lalu memantau sampai statusnya completed atau failed. Ekspor mencakup seluruh model, dan ekspor yang difilter ditolak saat pengiriman, bukan diam-diam diabaikan. Setiap tenant hanya boleh punya sejumlah terbatas yang berjalan bersamaan (tiga secara bawaan).

**Lihat juga:** [Chronicler](#chronicler), [Artifact](#artifact).

### Extension page

Tabel samping, secara fisik bernama `entry_slots_page_1`, `entry_slots_page_2`, dan seterusnya, yang memuat kolom [slot](#slot) terindeks yang menyalin nilai field filterable. Setiap barisnya sejajar 1:1 dengan satu baris di `entry_data`. Sebuah page dibuat dengan sekumpulan kolom terindeks yang tetap dan **tidak bisa diubah sesudahnya**. Sifat tak-berubah itulah yang menjaga provisioning tetap aman di database yang sedang berjalan, dan itu juga alasan page dibuat dengan [index headroom](#index-headroom), bukan persis sebanyak kolom yang dibutuhkan pada saat itu.

**Lihat juga:** [Slot](#slot), [Watcher](#watcher), [Spread](#spread).

### Field

Satu atribut bernama milik sebuah [model](#model). Field punya [declared type](#declared-type) dan flag [filterable](#filterable), dan flag itu adalah satu-satunya pembeda antara "tersimpan dan bisa dibaca" dengan "tersimpan, bisa dibaca, dan bisa di-query secepat index". Field bisa diganti namanya, di-retype, dipromosikan, didemosikan, dan dihapus selagi sistem berjalan.

**Lihat juga:** [Filterable](#filterable), [Retype](#retype), [Declared type](#declared-type).

### Filter tree

Struktur yang dibentuk sebuah filter: kondisi-kondisi individual (field, operator, nilai) yang digabung dengan AND, OR, dan NOT menjadi pohon dengan kedalaman berapa pun. Anda bisa membangunnya langsung di PHP, atau menyerahkan JSON [QueryFilter](#queryfilter) kepada engine untuk di-decode. Kosakata operator bawaannya sengaja kecil: kesamaan, perbandingan, rentang, keanggotaan himpunan, pengecekan null, dan pencocokan awalan (prefix), tanpa pencocokan substring, fuzzy, atau pemeringkatan relevansi. [Search driver](#search-driver) kustom boleh mendeklarasikan operatornya sendiri di luar himpunan itu.

**Lihat juga:** [QueryFilter](#queryfilter), [Search driver](#search-driver).

### Filterable

Flag yang menentukan apakah sebuah field mendapat [slot](#slot). Field filterable disalin ke kolom terindeks dan bisa dipakai dalam filter dan pengurutan. Field non-filterable hanya berada di [payload](#payload) JSON: tetap ditulis, tetap dikembalikan oleh pembacaan, hanya tidak bisa di-query. Non-filterable adalah pilihan bawaan yang lebih murah, karena tidak memakai slot dan tidak menambah beban pemeliharaan index.

Perhatikan bahwa mendeklarasikan field sebagai filterable dan field itu *benar-benar bisa* di-query adalah dua saat yang berbeda. Lihat [Indexed](#indexed).

**Lihat juga:** [Indexed](#indexed), [Promotion](#promotion), [Slot](#slot).

### Idempotency key

String opsional yang Anda lampirkan pada pengiriman bulk asinkron, supaya bila dicoba ulang, misalnya setelah koneksi terputus, yang dikembalikan adalah job aslinya, bukan mengimpor semuanya dua kali. Key bersifat unik per [tenant](#tenant). Pengiriman tanpa key tidak pernah bertabrakan dengan apa pun.

**Lihat juga:** [Bulk ingestion](#bulk-ingestion).

### Index headroom

Jumlah kolom terindeks cadangan untuk setiap tipe yang disertakan pada setiap [extension page](#extension-page) baru, bisa dikonfigurasi dan bawaannya empat. Ia ada karena page tidak bisa dilebarkan setelah dibuat: tanpa kolom cadangan, tiga field yang dipromosikan berturut-turut bisa masing-masing memicu page baru dan akhirnya tersebar di tiga page, yang membebani satu join per page pada setiap query yang menyentuh ketiganya. Dengan headroom, page baru membawa cukup kapasitas cadangan sehingga beberapa promosi berikutnya mendarat bersama. Menaikkan pengaturannya hanya memengaruhi page yang dibuat setelahnya.

**Lihat juga:** [Extension page](#extension-page), [Spread](#spread).

### Indexed

Apakah [slot](#slot) sebuah field aktif *saat ini juga*, yaitu apakah filter padanya benar-benar akan berfungsi. Ini berbeda dari dideklarasikan [filterable](#filterable), dan keduanya tidak sama selama seluruh [backfill window](#backfill-window). Introspeksi skema melaporkan keduanya, dan menjadikan yang ini sebagai syarat di UI Anda adalah yang mencegahnya menawarkan filter yang akan ditolak engine.

**Lihat juga:** [Filterable](#filterable), [Backfill window](#backfill-window), [Pre-flight rejection](#pre-flight-rejection).

### Liberator

Daemon yang mereklamasi [slot](#slot). Ketika sebuah field didemosikan atau dihapus, slotnya di-[tombstone](#tombstoned-slot), tidak langsung diberikan ke field berikutnya, karena nilai lamanya masih ada di kolom. Liberator mengosongkannya per chunk yang terbatas dan baru setelah itu menandai slot sebagai free, sehingga slot yang didaur ulang tidak akan pernah membocorkan data field sebelumnya ke query field yang baru. Beberapa salinan bisa berjalan bersamaan, dan mereka membagi pekerjaan tanpa saling mengganggu.

**Lihat juga:** [Tombstoned slot](#tombstoned-slot), [Daemon](#daemon).

### Model

Bentuk data bernama di dalam sebuah [tenant](#tenant), kira-kira setara dengan tabel, bedanya Anda mendefinisikannya saat runtime, bukan lewat migration. Sebuah model memiliki sekumpulan [field](#field), dan setiap [entry](#entry) milik tepat satu model. Model bisa diganti namanya (seketika, karena tidak ada yang mencari model lewat nama) dan dihapus (di latar belakang, dan tidak bisa dibatalkan).

**Lihat juga:** [Field](#field), [Entry](#entry), [Tenant](#tenant).

### Payload

Objek JSON lengkap yang memuat semua nilai field sebuah [entry](#entry), disimpan di `entry_data`. Semua field ada di sini, filterable maupun tidak. [Slot](#slot) terindeks hanyalah *salinan* dari sebagian nilai ini, tidak pernah aslinya. Inilah [system of record](#system-of-record), sebab itu field tanpa slot tetap bisa dibaca sepenuhnya dan backfill yang gagal tidak akan pernah menghilangkan data.

**Lihat juga:** [System of record](#system-of-record), [Slot](#slot).

### Pre-flight rejection

Kebijakan engine untuk menolak query yang mustahil di batas API, sebelum database disentuh sama sekali. Memfilter atau mengurutkan berdasarkan field yang tidak dikenal, non-[filterable](#filterable), atau belum [indexed](#indexed) langsung memunculkan exception bertipe, bukan menjalankan query yang akan melakukan table scan. Ini pertukaran yang disengaja: Anda mendapat error yang jelas, cepat, dan bisa di-catch, bukan query yang tampak berjalan lalu ambruk seiring tenant membesar.

**Lihat juga:** [Indexed](#indexed), [Filterable](#filterable).

### Promotion

Mengubah field non-filterable menjadi filterable pada sistem yang sedang berjalan. Sebuah [slot](#slot) dipesan dan nilai entry yang sudah ada disalin ke dalamnya oleh [Reconciler](#reconciler). Sampai proses itu selesai, field berada di [backfill window](#backfill-window)-nya: bisa dibaca, bisa ditulis, belum bisa difilter. Inilah operasi di balik kejutan paling umum di StarDust: field yang baru saja Anda tandai filterable ternyata belum bisa difilter *saat itu juga*.

**Lihat juga:** [Backfill window](#backfill-window), [Demotion](#demotion), [Filterable](#filterable).

### QueryFilter

Format wire JSON untuk filter, sehingga sebuah filter bisa dikirim dari browser atau klien API dan divalidasi sebelum mencapai database Anda. Decoding-nya ketat dan kegagalannya presisi: setiap penolakan membawa kode error yang bisa dibaca mesin, penunjuk ke node yang bermasalah di JSON Anda, dan rincian ketidakcocokannya, cukup untuk membuat HTTP 400 yang berguna tanpa menulis handler untuk tiap jenis kegagalan.

**Lihat juga:** [Filter tree](#filter-tree), [Pre-flight rejection](#pre-flight-rejection).

### Reconciler

Daemon yang mengerjakan proses menyusul. Ia menguras setiap jenis pekerjaan tertunda yang dihasilkan engine (entry yang diantrekan saat [exhaustion fallback](#exhaustion-fallback), impor bulk asinkron, backfill [promotion](#promotion) dan [retype](#retype), penulisan ulang akibat rename, dan pembersihan akibat penghapusan) dalam chunk yang terbatas. Beberapa salinan bisa berjalan bersamaan, dan mereka membagi pekerjaan tanpa saling mengganggu. Hampir setiap [backfill window](#backfill-window) di glosarium ini tertutup karena sebuah Reconciler yang menutupnya.

**Lihat juga:** [Backfill window](#backfill-window), [Dead-letter queue](#dead-letter-queue), [Daemon](#daemon).

### Retype

Mengubah [declared type](#declared-type) sebuah field pada sistem yang sedang berjalan, misalnya `string` menjadi `int`. Nilai yang sudah ada dikonversi dari [payload](#payload) JSON ke [slot](#slot) baru bertipe tujuan di latar belakang. Nilai yang tidak bisa dikonversi (`"42abc"` ke integer) menjadi null *hanya di slot*. Payload tetap menyimpan nilai aslinya, jadi pembacaan tetap menampilkannya dan tidak ada yang hilang. Konversi antara `int`/`numeric` dan `datetime` ditolak sepenuhnya, karena tidak ada tafsir angka polos sebagai tanggal yang bisa dipilihkan engine untuk Anda. Konversikan lewat `string` bila Anda memerlukannya.

**Lihat juga:** [Declared type](#declared-type), [Backfill window](#backfill-window).

### Schema registry

Kumpulan tabel berawalan `stardust_` yang mencatat model, field, page, dan penetapan slot Anda. Ini adalah pembukuan milik engine sendiri: Anda membuatnya sekali dengan `bootstrap` lalu membacanya lewat API introspeksi, bukan meng-query-nya langsung. Ia juga satu-satunya saluran koordinasi antar [daemon](#daemon). Tidak ada message bus dan tidak ada komunikasi langsung antar proses.

**Lihat juga:** [Schema version](#schema-version).

### Schema version

Satu penghitung yang dinaikkan setiap kali state registry yang relevan bagi koordinasi berubah. Engine menyimpan cache hasil lookup skema di jalur baca dan memakai penghitung ini untuk tahu kapan cache-nya sudah usang, sehingga perubahan skema yang sedang berjalan langsung terbaca tanpa me-restart aplikasi Anda.

**Lihat juga:** [Schema registry](#schema-registry).

### Search driver

Komponen yang bisa diganti yang benar-benar menjalankan pembacaan terfilter. Bawaannya menjalankan MySQL native terhadap [slot](#slot) terindeks. Anda bisa menyuntikkan milik Anda sendiri untuk mendelegasikan ke layanan pencarian eksternal. Driver bersifat read-only, karena penulisan selalu menuju MySQL, dan masing-masing mendeklarasikan kapabilitasnya sendiri, sehingga bila Anda meminta sesuatu yang tidak sanggup dilakukan driver aktif, Anda mendapat penolakan bertipe, bukan jawaban yang salah.

**Lihat juga:** [Filter tree](#filter-tree), [Pre-flight rejection](#pre-flight-rejection).

### Slot

Satu kolom bertipe yang terindeks di sebuah [extension page](#extension-page) yang menyalin nilai satu field filterable. Slot terbagi menjadi empat keluarga yang sesuai dengan [declared type](#declared-type), string, integer, numeric, dan datetime, dan sebuah field hanya bisa menempati slot dari keluarganya sendiri, itulah sebabnya [retype](#retype) membutuhkan slot baru, bukan konversi di tempat. Sebuah page memuat jumlah terbatas dari tiap keluarga, sehingga slot adalah sumber daya terbatas milik engine dan menjadi pokok perencanaan kapasitas.

Slot string menyimpan nilai yang panjang (batas nilai filter hingga 4 096 karakter) dan dicocokkan secara persis meskipun index hanya mencakup awalan dari setiap nilai.

**Lihat juga:** [Extension page](#extension-page), [Filterable](#filterable), [Tombstoned slot](#tombstoned-slot).

### Soft deletion

Cara menghapus sebuah *entry* bekerja: sebuah timestamp diisi, barisnya tidak dibuang, dan setelah itu entry lenyap dari pembacaan, filter, point read, dan ekspor sekaligus. Menghapus [model](#model) adalah satu-satunya operasi yang benar-benar menghancurkan baris (entry, baris slot salinannya, dan definisi model itu sendiri), dan tidak ada undelete, jadi ekspor dulu bila Anda mungkin menginginkan datanya kembali.

**Lihat juga:** [Entry](#entry), [Model](#model).

### Sort

Urutan hasil sebuah pembacaan. Anda boleh mengurutkan berdasarkan satu key: ID entry, waktu pembuatan, atau satu field yang [indexed](#indexed). Dua yang pertama menyusuri index yang sudah ada dan tetap murah pada kedalaman halaman berapa pun. Mengurutkan berdasarkan field membutuhkan satu putaran pengurutan penuh atas himpunan yang cocok di setiap halaman, yang tetap terbatas tetapi tidak gratis. Mengurutkan berdasarkan dua field sekaligus tidak didukung. Sebuah field harus indexed agar bisa diurutkan, dengan alasan yang sama seperti ia harus indexed untuk difilter.

**Lihat juga:** [Cursor](#cursor), [Indexed](#indexed).

### Spread

Jumlah [extension page](#extension-page) tempat [slot](#slot) filterable milik satu model tersebar. Ini penting karena setiap page tambahan yang disentuh query terfilter menambah satu join. Spread bukan bug. Ia konsekuensi wajar dari page yang tidak bisa diubah dan slot yang dibagikan dari page mana pun yang masih punya ruang, dan model yang tumbuh field demi field selama setahun sangat mungkin akhirnya tersebar.

Engine mengukurnya sebagai *excess pages*: jumlah page yang benar-benar ditempati model dikurangi jumlah paling sedikit yang bisa memuatnya. Laporannya murni bersifat saran dan tidak pernah mengubah apa pun dengan sendirinya. Menindaklanjutinya adalah [compaction](#compaction), yang Anda pilih sendiri untuk dijalankan.

**Lihat juga:** [Compaction](#compaction), [Index headroom](#index-headroom), [Extension page](#extension-page).

### Sync queue

Tabel kecil yang menyimpan entry yang penyalinan ke index-nya ditunda, hampir selalu karena [exhaustion fallback](#exhaustion-fallback). Satu baris di sini berarti "payload entry ini sudah benar, tetapi kolom slotnya belum". [Reconciler](#reconciler) menguras antrean ini dan menghapus setiap baris bila berhasil. Antrean yang terus membesar berarti Reconciler tidak berjalan, atau [Watcher](#watcher) tidak mengejar kebutuhan kapasitas.

**Lihat juga:** [Exhaustion fallback](#exhaustion-fallback), [Reconciler](#reconciler).

### System of record

Salinan otoritatif dari data Anda: di StarDust, selalu berupa [payload](#payload) JSON di `entry_data`, tidak pernah [slot](#slot) terindeks. Slot adalah cermin yang bisa di-query, yang bebas dibangun ulang, dikosongkan, atau dipindahkan engine kapan saja. Urutan inilah yang membuat setiap jaminan lain di sini aman: koersi yang gagal, backfill yang belum berjalan, dan slot yang sedang direklamasi semuanya hanya memengaruhi apa yang *bisa di-query*, tidak pernah apa yang *tersimpan*.

**Lihat juga:** [Payload](#payload), [Slot](#slot).

### Tenant

Batas isolasi tingkat teratas. Setiap query yang dibangun engine membawa tenant ID di setiap `WHERE` dan `JOIN`, sehingga data satu tenant bukan sekadar disaring dari hasil tenant lain, tetapi tidak terjangkau di level SQL. Semua model, field, dan entry berada di dalam tepat satu tenant.

**Lihat juga:** [Model](#model), [Entry](#entry).

### Tombstoned slot

[Slot](#slot) yang field-nya sudah tidak ada (didemosikan atau dihapus) tetapi nilai lamanya masih secara fisik berada di kolom. Slot yang di-tombstone tidak boleh dipakai ulang: menyerahkannya ke field baru selagi data penghuni sebelumnya masih di sana akan membuat filter field baru itu cocok dengan nilai yang tidak pernah ditulis untuknya. [Liberator](#liberator) mengosongkan kolom itu dan baru setelahnya mengembalikan slot ke kumpulan slot bebas.

**Lihat juga:** [Liberator](#liberator), [Demotion](#demotion).

### Vertical schema partitioning

Arsitektur di balik StarDust, dan yang membedakannya dari document store maupun tabel EAV: setiap entry dipecah menjadi [payload](#payload) JSON lengkap untuk penyimpanan dan kolom [slot](#slot) terindeks yang terpisah untuk query. Penyimpanan tetap schemaless dan murah, sedangkan query mendapat B-tree index sungguhan dan jumlah join yang tetap dan kecil. Rancangan alternatifnya gagal ke arah yang berlawanan: satu tabel lebar tidak bisa menampung field per tenant, dan tabel satu-atribut-per-baris ambruk oleh self-join.

**Lihat juga:** [Payload](#payload), [Slot](#slot), [Extension page](#extension-page).

### Watcher

Daemon yang menjaga kapasitas [slot](#slot) selalu di depan kebutuhan. Ia menyediakan [extension page](#extension-page) baru ketika kapasitas bebas turun di bawah ambang (20% secara bawaan) atau ketika ada field filterable yang menunggu slot yang belum ada, dan ia meng-index setiap page baru untuk field yang sedang mengantre. Hanya satu Watcher yang boleh berjalan pada satu waktu, dan ia menegakkannya sendiri. Pada host yang menjalankannya sebagai proses persisten, kapasitas tidak akan pernah terisi ulang tanpanya, dan penulisan filterable diam-diam turun menjadi JSON tanpa index sampai ia berjalan lagi. `bin/stardust tick` menyediakan kapasitas yang sama lewat baris cron, untuk host yang tidak bisa mempertahankan Watcher persisten.

**Lihat juga:** [Extension page](#extension-page), [Exhaustion fallback](#exhaustion-fallback), [Index headroom](#index-headroom).
