# Brand TestBoard

Logo TestBoard **mengikuti tata bahasa visual keluarga logo hub Kemnaker** (Karirhub, Skillhub, Maganghub), diriset dari logo resmi di situs masing-masing pada 20 November 2026. Logo Sertihub tidak tersedia publik, jadi belum ikut dibandingkan. Logo hub **tidak** disalin ke repo ini.

Pada 21 November 2026 pemilik proyek memilih logo "Papan centang". Pada 24 November 2026 logo itu diganti dengan **"Siklus uji"** (lihat di bawah), karena pemilik meminta logo tanpa centang yang mengikuti bentuk keluarga hub. Pada tanggal yang sama temanya diganti menjadi **"Biru Pasker"**: nuansa keluarga Kemnaker (Pusat Pasar Kerja paskerid.kemnaker.go.id, Karirhub, SIAPkerja, kemnaker.go.id) dengan warna yang lembut, nyaman di mata, dan menyatu. Tema sebelumnya ("Langit lembut", periwinkle + persik) tidak dipakai lagi.

## Pola keluarga hub

| Produk        | Simbol                                   | Posisi titik   | Warna                                 |
| ------------- | ---------------------------------------- | -------------- | ------------------------------------- |
| Karirhub      | Siku tebal membulat                      | kanan-atas     | `#339AF0`                             |
| Skillhub      | Chevron tebal membulat                   | kiri-tengah    | `#1E40AF`                             |
| Maganghub     | Busur "C" tebal                          | tengah         | `#0B60EA`                             |
| **TestBoard** | **Busur tebal 270 derajat** (siklus uji) | **kanan-atas** | **`#1F6CBC`** + titik toska `#10A493` |

Aturan bersama yang diikuti:

1. Simbol = **satu bentuk tebal** dengan ujung membulat dan ketebalan seragam, ditambah **satu titik solid**, tanpa centang. TestBoard memakai satu busur tebal yang terbuka di kanan-atas: uji, lapor, perbaiki, lalu uji lagi. Titiknya duduk di bukaan busur dan diberi warna toska.
2. Wordmark memakai **Inter**: nama produk **ExtraBold (800)**, akhiran **Light (300)**, warna navy Kemnaker `#15406A`, tracking rapat. Contoh: "**Test**Board" seperti "**Karir**hub".
3. Baris endorsement kecil abu-abu `#808080`, rata kanan di bawah wordmark. Hub memakai "oleh Kemnaker"; TestBoard memakai **"oleh PASKER ID"**.
4. Proporsi: tinggi simbol ±1,4x ukuran font wordmark; endorsement ±0,3x; jarak ±0,25x.

## Spesifikasi simbol

`viewBox="0 0 72 72"`:

- busur: `M58 36A22 22 0 1 1 36 14` (dari arah jam 3 searah jarum jam sampai jam 12), garis `#1F6CBC`, `stroke-width=11`, `stroke-linecap=round`;
- titik: lingkaran `cx=51.5 cy=20.5 r=7.5`, isi `#10A493`.

File: [`testboard-mark.svg`](testboard-mark.svg). Implementasi di aplikasi: `apps/web/src/components/brand/` (geometri di `mark-geometry.ts`; favicon di `apps/web/public/favicon.svg`; tes memastikan ketiganya sama).

## Warna aplikasi ("Biru Pasker")

| Peran                   | Warna                                                                                   | Catatan                                                          |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Utama (logo, tautan)    | `#1F6CBC` biru Kemnaker (`brand-600`)                                                   | Kontras 5,3:1 dengan putih                                       |
| Tombol utama            | `#17569A` (`brand-700`)                                                                 | Teks putih 7,4:1                                                 |
| Judul, kaki halaman     | `#15406A` navy Kemnaker (`brand-800`)                                                   | Sama dengan warna kemnaker.go.id                                 |
| Warna kedua             | `#10A493` toska (`teal-500`), teks toska `#087064` (`teal-700`)                         | Dari SIAPkerja / Pasker                                          |
| Latar halaman           | `#F2F7FF` biru sangat muda                                                              | Sama dengan latar paskerid.kemnaker.go.id                        |
| Kartu                   | putih dengan gradasi biru tipis, garis `rgba(31,108,188,.14)`, bayangan lembut kebiruan | Gaya kartu Pasker (`card-pasker`)                                |
| Chip ikon               | gradasi `#2F9FE8` ke `#10A493`, ikon putih (`chip-gradient`)                            | Gaya chip ikon Pasker                                            |
| Aksen lembut (dekorasi) | biru `#E6EEFB`, mint `#E3F6EE`, persik `#FDEEE6`, mentega `#FFF8E1`, langit `#E2F3FA`   | Teks di atasnya selalu memakai warna "-ink" pasangannya (>= 5:1) |

Warna status tetap semantik (hijau = lulus, merah = gagal, kuning = terhambat) dan selalu disertai label/ikon, tidak hanya warna. Font Inter dibundel lokal (`@fontsource-variable/inter`), tanpa CDN eksternal.

Semua warna ada di `apps/web/src/styles.css` (blok `@theme`); komponen memakai nama token (`brand-*`, `teal-*`, `pastel-*`, `success`, ...), bukan kode warna langsung.

## Kepala dan kaki halaman (2026-11-24)

Satu kepala dan satu kaki halaman untuk seluruh situs: halaman publik, aplikasi, dan layar meja (Mode Mudah).

- **Kepala** (`TopBar`): selalu **satu baris** dan tidak pernah turun ke baris kedua. Susunannya bercermin: kiri = logo, garis tipis, lalu konteks (pemilih proyek dan pencarian, menu publik, atau nama kelompok); kanan = tombol ikon bulat, garis tipis, lalu akun (inisial nama, atau satu tombol pil: Masuk / Buka TestBoard / Keluar). Semua kontrol setinggi 44 px; ikon abu-abu tenang dan menjadi biru saat disentuh, dengan label kecil saat disorot atau difokus (`header-tip`). Di aplikasi, logo berada di kolom selebar panel kiri sehingga pemilih proyek sejajar dengan judul halaman.
- **Bahasa** (ID/EN) ada di dalam **Aksesibilitas**, paling atas, bersama ukuran teks dan tema.
- **Kaki** (`SiteFooter`): navy Kemnaker, semua di tengah: logo putih, tautan Beranda publik · Panduan (· Masuk bila belum masuk), dan "© tahun Pusat Pasar Kerja · Kementerian Ketenagakerjaan Republik Indonesia".

## Hal yang perlu dikonfirmasi pemilik brand

- Teks endorsement "oleh PASKER ID" (alternatif: "oleh Kemnaker").
- Logo Sertihub (jika ada) untuk memastikan TestBoard tidak bentrok warna/bentuk.
