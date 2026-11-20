# Brand TestBoard

Logo TestBoard **mengikuti tata bahasa visual keluarga logo hub Kemnaker** (Karirhub, Skillhub, Maganghub), diriset dari logo resmi di situs masing-masing pada 20 November 2026. Logo Sertihub tidak tersedia publik, jadi belum ikut dibandingkan. Logo hub **tidak** disalin ke repo ini.

## Pola keluarga hub

| Produk        | Simbol                                 | Posisi titik  | Warna         |
| ------------- | -------------------------------------- | ------------- | ------------- |
| Karirhub      | Siku tebal membulat                    | kanan-atas    | `#339AF0`     |
| Skillhub      | Chevron tebal membulat                 | kiri-tengah   | `#1E40AF`     |
| Maganghub     | Busur "C" tebal                        | tengah        | `#0B60EA`     |
| **TestBoard** | **Centang tebal membulat** (tes lulus) | **kiri-atas** | **`#3347E0`** |

Aturan bersama yang diikuti:

1. Simbol = **satu glyph tebal** dengan ujung membulat dan ketebalan seragam, ditambah **satu titik solid**, dalam **satu warna biru**. Setiap produk punya shade biru sendiri.
2. Wordmark memakai **Inter**: nama produk **ExtraBold (800)**, akhiran **Light (300)**, warna `#1A1A1A`, tracking rapat. Contoh: "**Test**Board" seperti "**Karir**hub".
3. Baris endorsement kecil abu-abu `#808080`, rata kanan di bawah wordmark. Hub memakai "oleh Kemnaker"; TestBoard memakai **"oleh PASKER ID"**.
4. Proporsi: tinggi simbol ±1,4x ukuran font wordmark; endorsement ±0,3x; jarak ±0,25x.

## Spesifikasi simbol

`viewBox="0 0 72 72"`; titik `cx=16 cy=15 r=9`; centang `M14 40 31 57 60 24`, `stroke-width=16`, `stroke-linecap/linejoin=round`. File: [`testboard-mark.svg`](testboard-mark.svg). Implementasi di aplikasi: `apps/web/src/components/brand/`.

## Warna aplikasi

Warna utama UI diturunkan dari `#3347E0` (skala `brand-50` s.d. `brand-900` di `apps/web/src/styles.css`). Warna status tetap semantik (hijau = lulus, merah = gagal, kuning = terhambat) dan selalu disertai label/ikon, tidak hanya warna. Font Inter dibundel lokal (`@fontsource-variable/inter`), tanpa CDN eksternal.

## Hal yang perlu dikonfirmasi pemilik brand

- Shade biru `#3347E0` dan teks endorsement "oleh PASKER ID" (alternatif: "oleh Kemnaker").
- Logo Sertihub (jika ada) untuk memastikan TestBoard tidak bentrok warna/bentuk.
