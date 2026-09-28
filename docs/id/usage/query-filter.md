# Format wire QueryFilter

QueryFilter adalah format JSON untuk filter, sehingga sebuah filter bisa dikirim dari browser atau klien API dan divalidasi sebelum mencapai database Anda. Halaman ini adalah referensi untuk struktur dokumen, operator, tipe nilai, batasan, dan kode error. Untuk memakainya di kode, lihat [Pencarian](/id/usage/searching#menerima-filter-dalam-bentuk-json).

## Struktur dokumen

Dokumen adalah objek JSON dengan `version` opsional dan `filter` opsional:

```json
{
  "version": "1",
  "filter": {
    "op": "and",
    "args": [
      { "op": "eq", "field": { "model": "invoice", "name": "status" }, "value": "paid" },
      { "op": "gt", "field": { "model": "invoice", "name": "amount" }, "value": 100 },
      { "op": "is_not_null", "field": { "model": "invoice", "name": "due_date" } }
    ]
  }
}
```

- **`version`** adalah string `"1"`. Boleh dihilangkan, dan nilai lain ditolak dengan `version_unsupported`.
- **`filter`** adalah satu node. **Hilangkan key-nya sama sekali untuk mencocokkan semuanya.** `"filter": null` yang eksplisit ditolak, begitu pula `filter` yang bukan objek.
- **Referensi field** berbentuk `{ "model": ..., "name": ... }`. Kedua key wajib berupa string tidak kosong. Pencarian berjalan terhadap model yang ada di request, dan field dicari di model itu.
- JSON Schema menolak key yang tidak dikenal pada sebuah node. Decoder mengabaikannya, dan itu adalah salah satu dari dua perbedaan antara keduanya. Lihat [JSON Schema](#json-schema).

## Node logika: and, or, not

| Node | Bentuk | Artinya |
| :-- | :-- | :-- |
| `and` | `{ "op": "and", "args": [ ... ] }` | Semua anak harus cocok. |
| `or` | `{ "op": "or", "args": [ ... ] }` | Minimal satu anak harus cocok. |
| `not` | `{ "op": "not", "arg": { ... } }` | Anaknya tidak boleh cocok. Ia menerima satu `arg`, bukan `args`. |

`and` dan `or` butuh minimal satu anak dan maksimal 64. Node bisa bersarang hingga kedalaman berapa pun selama masih dalam [batasan](#batasan). Pohon yang hanya berisi AND dijalankan sebagai join terindeks. Pohon yang memuat `or` atau `not` otomatis beralih bentuk eksekusi.

## Operator

Dua belas operator membentuk format ini. Himpunannya tertutup: `op` yang tidak dikenal ditolak dengan `operator_unknown`.

### Kesamaan dan perbandingan

| Operator | Nilai | Artinya |
| :-- | :-- | :-- |
| `eq` | satu skalar | Sama dengan. |
| `neq` | satu skalar | Tidak sama dengan. |
| `lt` | satu skalar | Kurang dari. |
| `lte` | satu skalar | Kurang dari atau sama dengan. |
| `gt` | satu skalar | Lebih dari. |
| `gte` | satu skalar | Lebih dari atau sama dengan. |

Skalar adalah string, angka, atau boolean. Mengirim array di tempat yang meminta skalar menghasilkan error `node_malformed`.

### Rentang dan himpunan

| Operator | Nilai | Artinya |
| :-- | :-- | :-- |
| `between` | array berisi tepat dua skalar | Berada dalam rentang, inklusif di kedua ujung. |
| `in` | array skalar yang tidak kosong | Sama dengan salah satu nilai yang tercantum. |
| `nin` | array skalar yang tidak kosong | Tidak sama dengan semua nilai yang tercantum. |

`in` dan `nin` menerima hingga 1 024 elemen, dan duplikat dibuang saat dokumen di-decode.

### Awalan (prefix)

| Operator | Nilai | Artinya |
| :-- | :-- | :-- |
| `prefix` | string tidak kosong | Diawali dengan teks yang diberikan. |

`prefix` berjangkar di awal, sehingga bisa memakai index. Tidak ada operator substring, akhiran, atau fuzzy. Prefix kosong ditolak dengan `value_out_of_bounds`: untuk mencocokkan semuanya, hilangkan saja filternya.

### Pengecekan null

| Operator | Nilai | Artinya |
| :-- | :-- | :-- |
| `is_null` | tidak ada | Field tidak punya nilai. |
| `is_not_null` | tidak ada | Field punya nilai. |

Keduanya **tidak boleh** membawa key `value`, kalau tidak node ditolak dengan `value_unexpected`. Semua operator lain wajib memilikinya.

## Tipe nilai

Sebuah nilai harus sesuai dengan declared type field yang dibandingkan:

| Declared type | Menerima |
| :-- | :-- |
| `string` | String hingga 4 096 karakter. |
| `int` | Bilangan bulat dalam rentang signed 64-bit. |
| `numeric` | Angka yang terhingga (finite). |
| `datetime` | String RFC 3339 dengan offset UTC eksplisit. |

Nilai yang tidak sesuai ditolak dengan `value_type_mismatch`, atau `value_out_of_bounds` bila tipenya benar tetapi di luar batas.

### Datetime wajib menyertakan offset

Nilai `datetime` harus membawa offset UTC eksplisit, baik `Z` di akhir maupun `±HH:MM`. Nilai polos `2026-01-01T10:00:00` ditolak dengan `value_type_mismatch`, karena datetime yang tersimpan selalu UTC dan menebak zona waktu yang dimaksud pemanggil bukan tugas engine.

Offset yang Anda kirim kemudian **diterapkan**: engine mengonversi batas itu ke instan yang dimaksud sebelum mencocokkan. Memfilter `2026-01-01T10:00:00+07:00` menemukan entry yang ditulis pada instan yang sama, apa pun offset yang dipakai keduanya. Pecahan detik diterima dan diperhitungkan saat membandingkan, meskipun nilai yang tersimpan berketelitian detik penuh.

## Batasan

Decoder menegakkan batas-batas ini sebelum apa pun menyentuh database. Ini adalah nilai bawaan `Config::$queryFilterLimits`, dan masing-masing bisa Anda perketat atau longgarkan secara terpisah:

| Batas | Bawaan |
| :-- | :-- |
| Kedalaman bersarang maksimum | 8 |
| Total node maksimum | 256 |
| Anak maksimum dari satu `and` / `or` | 64 |
| Elemen maksimum dalam array `in` / `nin` | 1 024 |
| Panjang string maksimum | 4 096 karakter |
| Ukuran dokumen maksimum | 64 KiB |

Kalau Anda menerima filter dari klien yang tidak tepercaya, pertimbangkan untuk menurunkannya. Lihat [Keamanan](/id/operations/security#menerima-filter-dari-sumber-yang-tidak-tepercaya).

## Kode error

Format ini punya tiga belas kode error yang tertutup. Decoder menghasilkan sembilan yang pertama, dan pemeriksaan pre-flight yang berjalan sesudahnya menghasilkan sisanya.

| Kode | Muncul ketika |
| :-- | :-- |
| `envelope_malformed` | Dokumen bukan JSON yang valid, atau root maupun `filter` bukan objek JSON. |
| `node_malformed` | Node kekurangan key wajib (`op`, `field`, `value`, `arg`, `args`) atau sebuah key berbentuk salah. |
| `operator_unknown` | `op` bukan salah satu operator di atas atau `and` / `or` / `not`. |
| `value_count_mismatch` | `and` / `or` tanpa anak, array `in` / `nin` kosong, atau `between` tidak berisi tepat dua elemen. |
| `value_unexpected` | `is_null` atau `is_not_null` membawa `value`. |
| `value_out_of_bounds` | Batas ukuran terlampaui (panjang string, panjang array, jumlah anak, ukuran dokumen), atau `prefix` kosong. |
| `nesting_too_deep` | Pohon lebih dalam daripada batas kedalaman. |
| `node_count_exceeded` | Pohon punya node lebih banyak daripada batas node. |
| `version_unsupported` | `version` bukan `"1"`. |
| `field_unknown` | Sebuah field tidak terdaftar di model. |
| `field_not_filterable` | Field ada tetapi tidak filterable. |
| `capability_unsupported` | Driver aktif tidak mendukung sebuah operator atau field. |
| `value_type_mismatch` | Nilai tidak sesuai dengan declared type field-nya. |

Setiap penolakan membawa JSON Pointer RFC 6901 ke node yang bermasalah. Dua kode pre-flight, `field_unknown` dan `field_not_filterable`, muncul sebagai `UnknownFieldException` dan `FieldNotFilterableException`, bukan `QueryFilterValidationException`. [Pencarian](/id/usage/searching#meneruskan-penolakan-ke-klien-api-anda) menunjukkan cara mengubah semuanya menjadi HTTP 400.

## JSON Schema

Format ini juga tersedia sebagai JSON Schema normatif (draft 2020-12), untuk memvalidasi filter di sisi klien atau dalam bahasa apa pun. Ia disertakan dalam package di `schemas/queryfilter.schema.json`.

Schema hanya memeriksa struktur. Apakah sebuah field ada atau nilai sesuai tipenya bergantung pada registry Anda, sehingga diputuskan saat runtime. Schema dan decoder sepakat tentang dokumen mana yang valid dan tidak, kecuali dua asimetri yang terdokumentasi: schema menolak key tak dikenal pada sebuah node sementara decoder mengabaikannya, dan deduplikasi array serta batas kedalaman, jumlah node, dan ukuran dokumen pada decoder tidak punya padanan di schema.
