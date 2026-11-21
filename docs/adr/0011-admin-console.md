# ADR 0011 - Konsol Super Admin, pengaturan situs, dan Super Admin permanen

- **Status:** Diterima (perubahan v1, tahap 1)
- **Pemutus:** Pemilik proyek, 21 November 2026
- **Terkait:** ADR 0004 (Super Admin), ADR 0010 (deploy, retensi), doc 09 (RBAC)

## Latar

Setelah go-live pertama, database produksi kosong dan Super Admin tidak bisa membuat proyek:
API `POST /projects` sudah ada sejak Milestone 2, tetapi tidak ada tombol di web. Pengaturan
situs (`system_settings`) juga hanya tersedia sebagai API generik tanpa layar. Pemilik meminta:
fitur Buat Proyek, menu Super Admin untuk mengatur seluruh website, password minimal 8
karakter, akun pemilik yang tidak bisa dicabut, dan label "Nama" (bukan "Nama tampilan").

## Keputusan

1. **Menu Administrasi** (hanya Super Admin), di sidebar dan menu pengguna:
   - **Proyek**: semua proyek (termasuk yang diarsipkan), buat, ubah nama/deskripsi,
     arsipkan/aktifkan lagi. Pembuat proyek otomatis menjadi Admin proyek itu. Tombol
     "Buat proyek" juga ada di halaman Proyek.
   - **Pengguna**: halaman yang sudah ada.
   - **Pengaturan situs**: daftar pengaturan yang tetap dan tervalidasi (bukan kunci bebas):
     nama situs, pengumuman (pita di semua halaman), bahasa bawaan, kontak bantuan (tampil di
     halaman masuk), lama sesi, batas diam, retensi unggahan tak terpakai, retensi file
     impor. Disimpan di `system_settings`; tanpa baris = nilai bawaan (sebagian dari
     `api.env`). Berlaku dalam beberapa detik (cache 15 detik), tanpa restart.
   - **Log aktivitas**: log audit seluruh situs (semua proyek + tingkat situs: akun,
     pengaturan), dengan filter proyek, jenis data, aksi, pengguna, tanggal.
2. **Proyek diarsipkan = hanya baca.** Satu pemeriksaan pusat di akses proyek menolak semua
   perubahan (409 `PROJECT_ARCHIVED`); membaca, laporan, dan ekspor tetap jalan.
3. **Super Admin permanen** (migration `0007`, kolom `user_system_roles.is_permanent`):
   ditetapkan **hanya dari server** (`bash ops/testboard.sh protect-admin --email ...`).
   Website menolak mencabut atau menonaktifkannya, siapa pun yang meminta, termasuk akun itu
   sendiri. `--release` (juga hanya di server) melepasnya, mis. saat serah terima pemilik.
   Alamat email pemilik tidak disimpan di repo publik.
4. **Password minimal 8 karakter** (sebelumnya 12). Pengaman tetap: penguncian login per email
   dan per IP, hash Argon2id.
5. Endpoint publik `GET /settings/public` (nama situs, pengumuman, bahasa bawaan, kontak
   bantuan) untuk halaman masuk; pengaturan lain hanya Super Admin.

## Konsekuensi

- Deploy berikutnya menerapkan migration `0007` (deploy akan meminta akun admin MySQL).
- Peran tetap 6 tingkat: Super Admin (seluruh situs) + Admin, QA Lead, Penguji, Developer,
  Pemantau (per proyek).
