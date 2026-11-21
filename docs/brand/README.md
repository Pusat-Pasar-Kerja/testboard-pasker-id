# Brand TestBoard

Logo TestBoard **mengikuti tata bahasa visual keluarga logo hub Kemnaker** (Karirhub, Skillhub, Maganghub), diriset dari logo resmi di situs masing-masing pada 20 November 2026. Logo Sertihub tidak tersedia publik, jadi belum ikut dibandingkan. Logo hub **tidak** disalin ke repo ini.

Pada 21 November 2026 pemilik proyek memilih tema **"Langit lembut"** (biru periwinkle dengan aksen pastel) dan logo **"Papan centang"** dari tiga pilihan palet dan tiga pilihan logo. Syaratnya: tampilan berwarna, tetapi tetap **lembut / pastel**, tidak mencolok.

## Pola keluarga hub

| Produk        | Simbol                                              | Posisi titik          | Warna                                |
| ------------- | --------------------------------------------------- | --------------------- | ------------------------------------ |
| Karirhub      | Siku tebal membulat                                 | kanan-atas            | `#339AF0`                            |
| Skillhub      | Chevron tebal membulat                              | kiri-tengah           | `#1E40AF`                            |
| Maganghub     | Busur "C" tebal                                     | tengah                | `#0B60EA`                            |
| **TestBoard** | **Papan bersudut bulat berisi centang** (tes lulus) | **atas-tengah (pin)** | **`#4F5FCF`** + pin persik `#F29B70` |

Aturan bersama yang diikuti:

1. Simbol = **garis tebal** dengan ujung membulat dan ketebalan seragam, ditambah **satu titik solid**. TestBoard memakai dua garis (papan dan centang) dengan ketebalan sama. Titiknya menjadi "pin" yang menahan papan, dan diberi warna aksen pastel agar tampilan lebih berwarna.
2. Wordmark memakai **Inter**: nama produk **ExtraBold (800)**, akhiran **Light (300)**, warna `#1A1A1A`, tracking rapat. Contoh: "**Test**Board" seperti "**Karir**hub".
3. Baris endorsement kecil abu-abu `#808080`, rata kanan di bawah wordmark. Hub memakai "oleh Kemnaker"; TestBoard memakai **"oleh PASKER ID"**.
4. Proporsi: tinggi simbol ±1,4x ukuran font wordmark; endorsement ±0,3x; jarak ±0,25x.

## Spesifikasi simbol

`viewBox="0 0 72 72"`:

- papan: `rect x=9 y=16 width=54 height=48 rx=13`, garis `#4F5FCF`;
- centang: `M23 41 32 50 49 31`, garis `#4F5FCF`;
- kedua garis `stroke-width=8`, `stroke-linecap/linejoin=round`;
- pin: lingkaran `cx=36 cy=12 r=8`, isi `#F29B70`.

File: [`testboard-mark.svg`](testboard-mark.svg). Implementasi di aplikasi: `apps/web/src/components/brand/` (geometri di `mark-geometry.ts`; favicon di `apps/web/public/favicon.svg`; tes memastikan ketiganya sama).

## Warna aplikasi ("Langit lembut")

| Peran                   | Warna                                                                                     | Catatan                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Utama (logo, tautan)    | `#4F5FCF` periwinkle (`brand-600`)                                                        | Kontras 5,4:1 dengan putih                                       |
| Tombol utama            | `#4352BA` (`brand-700`)                                                                   | Teks putih 6,7:1                                                 |
| Latar halaman           | `#F5F6FD` (lavender sangat muda)                                                          | Kartu tetap putih                                                |
| Aksen pastel (dekorasi) | lavender `#E7E9FB`, mint `#DDF4EA`, persik `#FDE6DA`, mentega `#FFF3C9`, langit `#E1EEFC` | Teks di atasnya selalu memakai warna "-ink" pasangannya (>= 5:1) |
| Pin logo                | `#F29B70` persik                                                                          | Dekorasi saja, tidak untuk teks                                  |

Aksen pastel dipakai untuk chip ikon di kartu angka (dasbor, laporan, run), chip proyek (warna tetap per kode proyek), pita pengumuman (mentega), dan bentuk-bentuk lembut di belakang halaman masuk. Warna status tetap semantik (hijau = lulus, merah = gagal, kuning = terhambat), dibuat sedikit lebih lembut, dan selalu disertai label/ikon, tidak hanya warna. Angka di dalam batang status memakai tinta gelap atau putih sehingga kontrasnya minimal 4,5:1. Font Inter dibundel lokal (`@fontsource-variable/inter`), tanpa CDN eksternal.

Semua warna ada di `apps/web/src/styles.css` (blok `@theme`); komponen memakai nama token (`brand-*`, `pastel-*`, `success`, ...), bukan kode warna langsung.

## Hal yang perlu dikonfirmasi pemilik brand

- Teks endorsement "oleh PASKER ID" (alternatif: "oleh Kemnaker").
- Logo Sertihub (jika ada) untuk memastikan TestBoard tidak bentrok warna/bentuk.
