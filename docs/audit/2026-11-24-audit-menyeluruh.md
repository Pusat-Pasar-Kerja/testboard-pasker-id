# Audit menyeluruh TestBoard PASKER ID - 24 November 2026

Permintaan pemilik proyek: audit seluruh situs lalu perbaiki apa saja yang membuat situs sulit dipahami, karena "developer saja tidak paham cara kerjanya, apalagi orang awam". Situs akan dipantau langsung oleh pimpinan, dan banyak peserta workshop adalah orang tua.

## Cara audit

1. **Wawancara pemilik** (tiga putaran) untuk keputusan yang hanya bisa diambil pemilik: tampilan, kata-kata, susunan menu, peran, dan alur anggota meja.
2. **Penyisiran tampilan dan bahasa**: setiap halaman di `router.tsx`, setiap kalimat di `id/common.json` (1.801 kunci), dan perbedaan antar-bingkai halaman.
3. **Pemetaan hak akses**: matriks izin, setiap rute API, skema database, dan alur sesi kartu meja.
4. **Pemeriksaan langsung di browser** (desktop dan HP) setelah setiap tahap.

## Ringkasan perubahan (v0.14.0 - v0.19.0)

| Tahap | Versi   | Isi                                                                                                                                                         |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | v0.14.0 | Tema "Biru Pasker" (keluarga Kemnaker), satu halaman masuk (Kartu Meja / Akun Pengguna), satu bingkai untuk semua halaman publik, panduan di dalam aplikasi |
| 2     | v0.15.0 | Tiga tingkat peran: Super Admin, Admin, Pengguna dengan tugas (ADR 0017, migration `0013`); pesan server dalam bahasa Indonesia                             |
| 3     | v0.16.0 | Anggota meja dengan email menjadi akun Pengguna, tautan aktivasi, "Aktifkan akun saya", halaman Tugas saya (ADR 0018, migration `0014`)                     |
| 4     | v0.17.0 | Menu per tahap kerja, kata-kata awam di seluruh situs, "Mulai di sini" di beranda proyek                                                                    |
| 5     | v0.18.0 | Tombol Bantuan per halaman, tur singkat, panduan baru menurut peran                                                                                         |
| 6     | v0.19.0 | Perapian temuan audit (lihat di bawah) dan laporan ini                                                                                                      |

## Temuan dan statusnya

Status: **Selesai** = sudah diperbaiki; **Sebagian** = diperbaiki sebagian; **Berikutnya** = dicatat untuk perbaikan lanjutan.

### Tampilan dan bingkai

| Temuan                                                                                  | Status                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Halaman masuk, halaman depan, panduan, dan aplikasi terlihat seperti situs yang berbeda | Selesai (v0.14.0): satu tema, satu bingkai publik, panduan di dalam aplikasi |
| Warna belum bernuansa Kemnaker                                                          | Selesai (v0.14.0): biru/navy Kemnaker, toska SIAPkerja, latar Pasker         |
| Pengatur ukuran huruf tidak ada di aplikasi                                             | Selesai (v0.18.0)                                                            |
| Pengumuman situs hanya muncul di aplikasi dan halaman depan                             | Selesai (v0.19.0): di semua halaman, termasuk layar meja                     |
| Layar memuat kosong tanpa identitas                                                     | Selesai (v0.19.0): logo dan teks "Memuat halaman..."                         |
| Tab browser tidak menyebut halaman                                                      | Selesai (v0.19.0): mis. "Masalah · TestBoard PASKER ID"                      |
| Layar besar (proyektor) memakai warna gelap sendiri                                     | Berikutnya: disengaja untuk proyektor; belum diselaraskan                    |

### Bahasa

| Temuan                                                                                                          | Status                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Istilah teknis dan Inggris (test case, run, siklus, modul, suite, bug, severity, snapshot, ...) di 300+ kalimat | Selesai (v0.17.0): kata awam, istilah asli kecil di menu dan kamus                                          |
| Kata hasil uji berbeda antara staf dan peserta                                                                  | Selesai (v0.17.0): Sesuai / Tidak sesuai / Tidak bisa dicoba di semua tempat                                |
| Tingkat dampak dan prioritas memakai kata yang sama                                                             | Selesai (v0.17.0): Kritis/Berat/Sedang/Ringan vs Segera/Tinggi/Sedang/Rendah, dengan penjelasan di formulir |
| Pesan dari server tampil dalam bahasa Inggris                                                                   | Selesai (v0.15.0)                                                                                           |
| "Mode DEMO ... Milestone 2", "Petugas", contoh kode yang tidak konsisten, istilah ClamAV/WebP                   | Selesai (v0.14.0 - v0.19.0)                                                                                 |
| Versi bahasa Inggris belum seluruhnya memakai kata awam                                                         | Sebagian: menu, judul, status, panduan, dan bantuan sudah; kalimat lain masih istilah lama                  |

### Alur dan navigasi

| Temuan                                                                       | Status                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tidak tahu harus mulai dari mana                                             | Selesai (v0.17.0): "Mulai di sini" untuk Admin, kartu "Tugas Anda" untuk Pengguna             |
| Menu tidak berurutan dan sama untuk semua peran                              | Selesai (v0.17.0): 4 kelompok tahap kerja, menyesuaikan tugas                                 |
| Fase, lembar uji, dan Mode Workshop tumpang tindih                           | Selesai (v0.17.0 - v0.18.0): dijelaskan di judul halaman, Mulai di sini, Bantuan, dan panduan |
| Perubahan penting tanpa konfirmasi (tugas anggota, peran situs, status fase) | Selesai (v0.15.0, v0.19.0)                                                                    |
| Pesan error tampil berwarna hijau seperti sukses (11 tempat)                 | Selesai (v0.19.0)                                                                             |
| Pengunjung yang salah alamat dibawa ke halaman masuk                         | Selesai (v0.19.0): halaman "tidak ditemukan" di bingkai publik                                |
| Status fitur di Mode Workshop berubah tanpa konfirmasi                       | Berikutnya (dampaknya kecil dan bisa dikembalikan)                                            |
| Kotak cari di atas hanya mencari skenario uji                                | Berikutnya: label sudah jelas ("Cari skenario uji...")                                        |
| Halaman depan publik belum menampilkan angka keseluruhan                     | Berikutnya                                                                                    |

### Peran dan akses

| Temuan                                                                            | Status                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Admin proyek vs QA Lead membingungkan; hanya Super Admin yang bisa membuat proyek | Selesai (v0.15.0): Super Admin / Admin / Pengguna dengan tugas |
| Anggota kelompok hanya teks, bukan akun                                           | Selesai (v0.16.0): nama + email menjadi akun Pengguna          |
| Peserta tidak punya cara mengaktifkan akun                                        | Selesai (v0.16.0): tautan aktivasi dan "Aktifkan akun saya"    |
| Pengguna tidak punya satu tempat untuk pekerjaannya                               | Selesai (v0.16.0): Tugas saya                                  |

### Bantuan

| Temuan                                                        | Status                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tidak ada panduan yang mudah, tidak ada penjelasan di halaman | Selesai (v0.18.0): Bantuan per halaman, tur singkat, panduan menurut peran dengan ilustrasi |
| Panduan menyebut menu yang tidak ada dan peran lama           | Selesai (v0.18.0): ditulis ulang                                                            |

### Catatan teknis yang tersisa (Berikutnya)

- Log aktivitas masih menampilkan nama kolom database dan nilai JSON mentah.
- Laporan tindakan massal menampilkan ID database bila kode kosong.
- Daftar "masalah mirip" di layar meja masih menyebut kode masalah.

## Yang perlu dilakukan pemilik di server

Versi ini membawa **dua migration** database:

- `0013_three_tier_roles.sql`: akun yang dulu Admin atau QA Lead di sebuah proyek menjadi **Admin** situs, dan peran lamanya di proyek menjadi Penguji. Tidak ada tabel atau kolom baru.
- `0014_table_members.sql`: satu tabel baru untuk anggota meja; nama anggota yang sudah ada disalin otomatis.

Jalankan `./update.sh` seperti biasa. Bila diminta konfirmasi migration, ketik `YA` dan masukkan kata sandi root database (sama seperti pembaruan sebelumnya). Setelah selesai, periksa: masuk sebagai Super Admin, buka **Pengguna**, dan pastikan orang-orang yang dulu mengelola proyek kini berperan **Admin**.
