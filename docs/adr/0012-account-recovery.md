# ADR 0012 - Pemulihan akun: "Lupa email / Lupa kata sandi" lewat Super Admin

- **Status:** Diterima (perubahan v1, tahap 2)
- **Pemutus:** Pemilik proyek, 21 November 2026
- **Terkait:** ADR 0005 (sesi, RBAC), ADR 0011 (Super Admin permanen), doc 09 (keamanan)

## Latar

Pengguna yang lupa email atau kata sandi belum punya jalan keluar selain menghubungi admin di
luar sistem. Pemilik meminta tombol "Lupa Email" dan "Lupa Password" berupa formulir
"Notify Administrator". Hanya Super Admin yang boleh membantu. Super Admin memberikan tautan
yang berlaku terbatas, ada bar untuk melihat sisa masa berlakunya, dan tidak boleh ada dua
tautan aktif untuk akun yang sama.

Server belum punya layanan email (SMTP), jadi sistem tidak bisa mengirim email sendiri.

## Keputusan

1. **Formulir publik** di `/recover` (tautan "Lupa kata sandi?" dan "Lupa email?" di halaman
   masuk), tanpa perlu masuk:
   - _Lupa kata sandi_: email akun, nama, kontak (opsional), pesan.
   - _Lupa email_: nama, kontak (wajib, agar admin bisa memastikan identitas), pesan.
   - Jawaban **selalu sama** ("Permintaan terkirim"), baik email terdaftar maupun tidak, agar
     formulir tidak bisa dipakai menebak akun.
   - Permintaan yang sama selagi masih menunggu **digabung** (hitungan "dikirim 2×"), tidak
     menjadi baris ganda. Batas 5 permintaan baru per jam per alamat jaringan. Kolom jebakan
     tersembunyi untuk bot.
2. **Pemberitahuan ke admin = di dalam aplikasi**: angka merah di menu Administrasi >
   Pemulihan akun (diperbarui tiap menit). Email otomatis bisa ditambah nanti bila server
   punya SMTP.
3. **Halaman Pemulihan akun** (hanya Super Admin): daftar permintaan (Menunggu / Selesai /
   Diabaikan / Semua) dan daftar tautan aktif. Permintaan lupa kata sandi otomatis dicocokkan
   dengan akun lewat emailnya; permintaan lupa email dihubungkan ke akun oleh admin. Admin bisa
   menandai selesai atau mengabaikan dengan catatan, dan membuka lagi.
4. **Tautan reset**:
   - Dibuat Super Admin dari permintaan atau dari halaman Pengguna. Berlaku **24 jam** (bisa
     diubah 1-168 jam di Pengaturan situs, `recovery.link_hours`), **sekali pakai**.
   - Token acak 256-bit; database hanya menyimpan SHA-256-nya. Tautan tampil **sekali** saat
     dibuat (tombol salin); bila hilang, buat yang baru.
   - **Satu tautan aktif per akun**, dijamin di database (`UNIQUE` pada `active_user_id`).
     Membuat tautan kedua ditolak (409 `RESET_LINK_ACTIVE`) kecuali admin memilih
     "Cabut & buat tautan baru", yang mencabut tautan lama dalam transaksi yang sama.
   - **Bar masa berlaku** (sisa waktu, jam berakhir, warna hijau/kuning/merah) tampil di dialog
     setelah membuat tautan, di daftar tautan aktif, di kartu permintaan, di daftar Pengguna, dan
     di halaman reset milik pengguna.
   - Token ditaruh setelah `#` (`/reset-password#token`) sehingga tidak pernah terkirim ke server
     dalam alamat, tidak tercatat di log Apache, dan dihapus dari bilah alamat begitu dibaca.
   - Halaman reset menampilkan nama dan **email akun** (sekaligus menjawab "lupa email"), lalu
     meminta kata sandi baru (minimal 8, tidak memuat nama email). Setelah berhasil: tautan
     terpakai, semua sesi akun dikeluarkan, kunci akibat salah kata sandi dihapus, permintaan
     terbuka akun itu otomatis "Selesai".
   - Tautan yang dicabut, kedaluwarsa, atau sudah dipakai menjelaskan alasannya kepada
     pembukanya.
5. **Super Admin utama** (ADR 0011) tidak bisa direset dari website oleh siapa pun; pemulihannya
   lewat server: `bash ops/testboard.sh create-admin --email <email> --reset-password`.
   Akun nonaktif harus diaktifkan dulu sebelum dibuatkan tautan.
6. **Jejak dan retensi**: log aktivitas mencatat permintaan baru (tanpa data pribadi), perubahan
   status, tautan dibuat/dicabut, dan reset kata sandi. Isi permintaan yang sudah selesai dihapus
   otomatis setelah 180 hari; tautan dihapus 30 hari setelah kedaluwarsa.

## Konsekuensi

- Migration `0008_account_recovery.sql`: 2 tabel baru (`account_recovery_requests`,
  `password_reset_links`), tidak mengubah tabel lama.
- Tanpa SMTP, admin harus rutin melihat angka merah di menu. Tautan dikirim admin secara manual
  (mis. WhatsApp) setelah memastikan identitas peminta.
- Endpoint baru: `POST /auth/recovery-requests`, `POST /auth/reset-password/check`,
  `POST /auth/reset-password` (publik); `GET /admin/recovery-summary`,
  `GET /admin/recovery-requests`, `PATCH /admin/recovery-requests/:id`,
  `GET /admin/reset-links`, `POST|DELETE /admin/users/:id/reset-link` (Super Admin).
