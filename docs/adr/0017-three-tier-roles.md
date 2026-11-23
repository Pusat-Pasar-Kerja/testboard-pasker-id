# ADR 0017 - Tiga tingkat peran: Super Admin, Admin, Pengguna dengan tugas

- **Status:** Diterima dan diterapkan (v0.15.0, migration `0013`)
- **Pemutus:** Pemilik proyek, 24 November 2026 (wawancara audit menyeluruh)
- **Menggantikan sebagian:** ADR 0004 (Super Admin dan peran per proyek)
- **Terkait:** ADR 0011 (konsol admin), ADR 0012 (pemulihan akun), ADR 0016 (Mode Workshop)

## Latar

Sebelumnya ada satu peran situs (Super Admin) dan lima peran per proyek (Admin, QA Lead, Penguji, Developer, Pemantau). Pemilik dan tim pengembang sendiri bingung membedakan "Admin proyek" dengan "QA Lead", dan siapa yang boleh membuat proyek. Pemilik meminta tiga tingkat yang mudah dijelaskan:

> Super Admin yang bisa undang user, konfigurasi website, serta kuasa keseluruhan website. Admin bisa handle dan nambah fase, fitur, atau project. User hanya bisa akses bagian yang dia termasuk.

## Keputusan

1. **Peran situs** (`user_system_roles.role_code`), satu per akun:
   - **Super Admin** (`SUPER_ADMIN`): segalanya, termasuk membuat akun dan mengatur perannya, pengaturan situs, pemulihan akun, dan log aktivitas situs.
   - **Admin** (`ADMIN`, baru): membuat proyek dan mengelola **semua** proyek (fase, fitur, skenario uji, impor, meja dan kartu meja, tampilan publik, tinjauan masalah, anggota dan tugasnya, arsip proyek). Tidak bisa membuat akun lewat menu Pengguna, mengubah pengaturan situs, atau membuka pemulihan akun.
   - Tanpa peran situs = **Pengguna**.
2. **Tugas Pengguna per proyek** (`project_members.role_code`), satu per proyek: **Penguji** (`TESTER`, bawaan), **Developer** (`DEVELOPER`, boleh mengubah status perbaikan masalah), **Pemantau** (`VIEWER`, hanya melihat; cocok untuk pimpinan, boleh mengunduh laporan). Pengguna hanya melihat proyek tempat ia menjadi anggota.
3. Admin dan Super Admin bertindak sebagai `ADMIN` di setiap proyek tanpa baris keanggotaan. Pembuat proyek tidak lagi dimasukkan sebagai anggota, dan aturan "minimal satu ADMIN per proyek" dihapus.
4. Nilai `ADMIN` dan `QA_LEAD` di `project_members` menjadi **peran lama**: masih dikenali (izinnya sama seperti dulu) tetapi tidak pernah ditawarkan lagi, dan API menolak memberikannya (`role_code` hanya `TESTER`, `DEVELOPER`, `VIEWER`).
5. **Migration `0013`**: setiap akun LOCAL yang pernah menjadi Admin atau QA Lead di sebuah proyek (dan belum Super Admin) mendapat peran situs Admin; baris `ADMIN`/`QA_LEAD` diubah menjadi `TESTER`. Bila peran Admin dicabut kelak, orangnya menjadi Pengguna (Penguji) di proyek-proyek itu.
6. **Anggota tanpa akun**: Admin cukup mengisi nama dan email. Bila belum ada akun dengan email itu, server membuat akun LOCAL **tanpa kata sandi** (belum aktif, tidak bisa login) lalu menjadikannya Penguji. Orangnya mengaktifkan akun dengan tautan aktivasi (lihat tahap berikutnya di CHANGELOG).
7. Pemantau mendapat izin `report.export` (pimpinan mengunduh laporan). Matriks izin lain tidak berubah.
8. Pengunjung publik dan kartu meja **bukan** jenis pengguna: kartu meja tetap akun `WORKSHOP` yang hanya bisa membuka Mode Mudah (ADR 0016), dan sesi kartu meja tidak pernah punya peran situs.

## Akibat

- `CurrentUser` dan `AdminUserDto` mendapat `system_role` (`SUPER_ADMIN` | `ADMIN` | null); `is_super_admin` tetap ada sebagai singkatan. `MemberDto.user` dan `AdminUserDto` mendapat `has_password` (false = belum aktif).
- Rute `/admin/projects` terbuka untuk Admin; rute `/admin/*` lainnya tetap khusus Super Admin. `POST /projects` memakai `requireAdmin`.
- Halaman **Anggota & tugas** hanya menawarkan tiga tugas, menjelaskan masing-masing, meminta konfirmasi sebelum tugas diubah, dan meminta nama bila email belum punya akun. Halaman **Pengguna** (Super Admin) memilih peran situs Pengguna / Admin / Super Admin dengan konfirmasi.
- Migration hanya menambah baris di `user_system_roles` dan mengubah nilai `role_code`; tidak ada kolom atau tabel baru, dan grant `testboard_app` tidak berubah.
