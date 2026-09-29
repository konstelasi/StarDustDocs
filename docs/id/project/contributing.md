# Berkontribusi

Laporan bug, pertanyaan, dan pull request terhadap engine-nya diterima dengan senang hati, begitu pula perbaikan untuk situs dokumentasi ini. Keduanya punya repository sendiri dengan alur kontribusi masing-masing — halaman ini membahas keduanya.

## Persiapan lingkungan

Clone [repository engine-nya](https://github.com/damarbob/StarDust), lalu:

```bash
composer install
cp phpunit.xml.dist phpunit.xml    # gitignored — isi dengan kredensial database Anda
```

Arahkan kredensialnya ke **database sekali pakai** — test bootstrap menghapus setiap tabel StarDust di antara setiap run. Anda butuh PHP 8.1+ dan server MySQL 8.0.13+, Percona 8.0.13+, atau MariaDB 10.11+ untuk menjalankan smoke suite lengkap, tetapi suite-nya di-skip dengan bersih alih-alih gagal saat tidak ada kredensial yang dikonfigurasi, sehingga clone yang baru langsung hijau tanpa itu.

## Sebelum melakukan push

Tiga perintah, sama seperti yang dijalankan CI:

```bash
vendor/bin/phpstan analyse
npx --yes markdownlint-cli2@0.23.2 "*.md" "src/**/*.md" ".agent/**/*.md" "docs/**/*.md"
vendor/bin/phpunit --testsuite Smoke
```

Sebagian besar konvensi proyek ini ditegakkan oleh perintah-perintah ini, bukan lewat review, sehingga kesalahan langsung terlihat alih-alih baru muncul beberapa hari kemudian di komentar pull request.

## Melaporkan masalah

Buka issue di [repository GitHub engine-nya](https://github.com/damarbob/StarDust/issues). Sertakan versi PHP Anda, engine database beserta versinya, dan reproduksi minimal bila Anda bisa menyusunnya — test yang gagal adalah cara tercepat agar sesuatu diperbaiki.

## Membantu memperbaiki dokumentasi ini

Menemukan kesalahan di situs ini, tautan yang rusak, atau halaman yang bisa lebih jelas? Situs ini punya repository sendiri — [StarDustDocs](https://github.com/konstelasi/StarDustDocs) — dibangun dengan [VitePress](https://vitepress.dev/). Clone repository-nya, `npm install`, lalu `npm run docs:dev` untuk melihat pratinjau perubahan Anda secara lokal sebelum membuka pull request.

Halaman tersedia dalam bahasa Inggris di bawah `docs/` dan bahasa Indonesia di bawah `docs/id/`, saling mencerminkan file demi file. Perbaikan pada satu biasanya juga dibutuhkan di yang lain — bila Anda tidak nyaman membuat perubahan versi Indonesianya sendiri, sebutkan saja di pull request dan tandai halaman mana yang membutuhkannya.
