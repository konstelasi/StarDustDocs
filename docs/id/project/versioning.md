# Versi dan stabilitas

## Status pra-rilis

Rilis saat ini adalah `0.3.0-alpha.1` — versi pertama yang dipublikasikan dari sebuah penulisan ulang dari nol, dan alpha dalam arti yang sesungguhnya penting: API publik masih mungkin berubah sebelum `0.3.0` dirilis sebagai versi stabil. Instal dengan flag `@alpha` —

```bash
composer require damarbob/stardust:^0.3@alpha
```

— karena Composer secara bawaan hanya me-resolve versi stabil, dan `composer require damarbob/stardust` polos belum akan menemukan apa pun untuk diinstal. Flag ini hanya berlaku untuk package ini; dependensi Anda yang lain tetap pada tingkat stabilitas apa pun yang sudah Anda tentukan.

Penomoran versi mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html) begitu proyek ini mencapai `1.0.0`. Sebelum itu, perlakukan setiap rilis alpha berdasarkan isinya sendiri, jangan berasumsi lompatan alpha-ke-alpha otomatis aman — periksa [Catatan perubahan](/id/project/changelog) untuk apa yang berubah.

## Apa yang termasuk API publik

Dicakup oleh semantic versioning, begitu StarDust mencapai `1.0`:

- Setiap method pada `StarDust` — lihat [API StarDust](/id/reference/api).
- DTO, value object, dan enum yang diterima dan dikembalikan method-method itu — lihat [Tipe data](/id/reference/types).
- Format wire QueryFilter JSON dan JSON Schema-nya — lihat [Format wire QueryFilter](/id/usage/query-filter).
- Perintah CLI `bin/stardust` beserta flag-nya — lihat [Referensi CLI](/id/reference/cli).

Selain itu adalah detail implementasi, sekalipun sebagian terlihat dari luar engine. Termasuk tabel dan kolom persis yang dibuat StarDust di database Anda (lihat [Tabel di database Anda](/id/reference/database-tables)), kelas internal di balik factory mana pun di atas, dan struktur apa pun di dalam payload tersimpan di luar nilai field yang Anda masukkan sendiri. Semua ini bisa berubah antar rilis tanpa dianggap sebagai perubahan yang merusak API publik.

## Cara perubahan yang merusak kompatibilitas diumumkan

Setiap perubahan pada satu rilis dicatat di [Catatan perubahan](/id/project/changelog) di bawah kategori bergaya Keep a Changelog — Ditambahkan, Diubah, Dihapus, Keterbatasan yang diketahui. Perubahan pada API publik sebagaimana didefinisikan di atas yang merusak kode yang sudah ada disebutkan di bawah Diubah, dan, sebelum `1.0`, dipublikasikan sebagai lompatan versi tersendiri bahkan di antara dua rilis alpha, bukan dilipat diam-diam ke rilis berikutnya.

Satu interface mendapat method wajib baru selama siklus pengembangan `0.3.0`: sebuah search driver kustom yang ditulis terhadap snapshot `EntrySearchInterface` sebelumnya perlu menambahkan `supportsSortOn()` agar tetap mengimplementasikannya dengan benar. Itulah satu-satunya perubahan yang merusak kompatibilitas di seluruh build `0.3.0-alpha.1`, dan dibuat dengan sengaja selagi belum ada rilis yang di-tag — sehingga tidak ada driver pihak ketiga yang benar-benar bisa rusak karenanya. Ini juga bentuk perubahan yang tidak seharusnya Anda harapkan lagi di dalam sebuah rilis yang sudah di-tag: begitu sebuah versi di-tag, perubahan semacam itu dirilis sebagai versi baru, dengan penambahannya disebutkan di Catatan perubahan, bukan mendarat begitu saja tanpa terlihat di bawah Anda.
