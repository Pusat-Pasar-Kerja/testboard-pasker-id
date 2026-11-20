# ADR 0004 - Keputusan pemilik proyek, 20 November 2026

- **Status:** Diterima
- **Pemutus:** Pemilik proyek

## 1. Super Admin global (DEC-01)

**Keputusan:** Ada peran **Super Admin** global yang **dapat mengonfigurasi website dan mengakses semua proyek dan semua fitur**.

Implementasi (Milestone 2, lewat migration baru - tabel baseline tidak diubah):

- Tabel `user_system_roles` (peran global, saat ini hanya `SUPER_ADMIN`) dan `system_settings` (konfigurasi tingkat website).
- Backend: Super Admin melewati cek keanggotaan proyek, tetapi **semua aksinya tetap tercatat di `audit_logs`** dan tetap memakai validasi transisi status yang sama (Super Admin tidak bisa "menimpa" riwayat UAT).
- Super Admin pertama dibuat lewat perintah CLI di server (bukan dari halaman publik).
- Peran per proyek (`ADMIN`, `QA_LEAD`, `TESTER`, `DEVELOPER`, `VIEWER`) tetap berlaku untuk pengguna biasa.

## 2. Database lokal tanpa Docker

**Konteks:** Disk C: laptop pengembang hampir penuh, Docker Desktop tidak bisa dipasang.

**Keputusan:** Database lokal = **instance MariaDB terpisah memakai binary XAMPP (10.4.32, sama persis dengan VPS)**, data di `.local-db/` di drive D (git-ignored), port `127.0.0.1:3307`. Data XAMPP sendiri tidak disentuh. Perintah: `npm run db:init | db:start | db:stop | db:status` (`scripts/local-db.mjs`). Docker compose tetap tersedia sebagai opsi untuk pengembang lain.

## 3. Pengaturan server database VPS (hasil `SELECT` di DBeaver)

| Variabel               | Nilai VPS                                                                                   | Konsekuensi                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql_mode`             | `STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION` | Instance lokal disamakan persis. Data tidak valid ditolak (bukan dipotong diam-diam).                                                                                                                                                                   |
| `character_set_server` | `utf8mb4`                                                                                   | Sama.                                                                                                                                                                                                                                                   |
| `collation_server`     | `utf8mb4_general_ci`                                                                        | Perbandingan teks **tidak peka huruf besar/kecil**: `uat-auth-001` dianggap sama dengan `UAT-AUTH-001` oleh unique key. Backend menormalkan kode (`case_code`, `bug_code`, `project_code`) ke huruf besar sebelum disimpan dan saat cek duplikat impor. |
| `time_zone`            | `SYSTEM` (ikut zona waktu OS VPS)                                                           | Backend **wajib** menjalankan `SET time_zone = '+00:00'` di setiap koneksi supaya `CURRENT_TIMESTAMP` dan semua `DATETIME` tersimpan dalam UTC; UI menampilkan Asia/Jakarta.                                                                            |

## 4. Brand & kenyamanan visual

**Keputusan:** Warna bebas, dengan syarat **lembut, nyaman dipakai lama, animasi halus**. Dipilih biru lembut `#4361D6` (lebih kalem dari `#3347E0`, kontras teks 5,4:1 - lolos WCAG AA), latar kanvas `#F5F7FB`, bayangan tipis.

Prinsip gerak: transisi 160-280 ms dengan kurva perlambatan lembut (`cubic-bezier(0.22, 1, 0.36, 1)`), tanpa efek memantul atau berkedip; halaman, tab, drawer, dan menu muncul dengan fade/slide pendek; bar grafik beranimasi saat filter berubah; **otomatis dimatikan bila pengguna mengaktifkan "kurangi gerakan" di sistem operasi** (`prefers-reduced-motion`).

## 5. Kompresi pada setiap upload (konfirmasi requirement)

**Keputusan:** Sudah menjadi requirement wajib (blueprint doc 07, uji TB-FILE-002/003, Milestone 5) dan dikonfirmasi ulang:

1. **Setiap** file yang diunggah wajib melewati pipeline: validasi tipe/ukuran/signature -> scan malware -> **upaya optimasi/kompresi** -> verifikasi hasil masih bisa dibuka -> simpan di storage privat.
2. Ukuran asli, ukuran akhir, metode (`WEBP_LOSSLESS`, `PNG_OPTIMIZE`, `H264`, `GZIP`, ...) dan hash selalu dicatat di `file_objects`.
3. Screenshot memakai kompresi **lossless** secara default agar teks UI tetap terbaca.
4. File yang sudah terkompresi (JPEG, MP4, PDF, DOCX, XLSX) **tetap diproses**, tetapi bila hasilnya tidak lebih kecil atau merusak file, file asli yang sudah lolos scan disimpan dengan catatan `NO_SIZE_GAIN` - bukan dipaksa turun kualitas.
5. Butuh FFmpeg (video) dan ClamAV (scan) di VPS - dicek pada Milestone 5.
