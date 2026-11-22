# ADR 0015 - "Selalu login di perangkat ini"

- **Status:** Diterima dan diterapkan (v0.12.3, migration `0011`)
- **Pemutus:** Pemilik proyek, 22 November 2026 (aturannya diserahkan ke tim pengembang)
- **Terkait:** ADR 0005 (login dan sesi), ADR 0011 (pengaturan website)

## Latar

Sesi login berakhir setelah 12 jam, atau 120 menit tanpa aktivitas. Bagi pengguna yang membuka TestBoard sesekali (banyak yang bukan orang teknis), harus login berulang kali itu merepotkan. Pemilik meminta pilihan "Selalu login di perangkat ini" dan menyerahkan aturannya.

## Keputusan

1. Kotak centang **"Selalu login di perangkat ini"** di halaman login, **tidak** tercentang bawaan, dengan peringatan "Jangan dicentang di komputer bersama, laptop pinjaman, atau warnet".
2. **Dicentang:** sesi berlaku **30 hari** sejak login (pengaturan website `auth.remember_days`, 0-90). Tidak ada batas diam, dan cookie tetap ada setelah browser ditutup. Setelah 30 hari pengguna login lagi; masa berlaku sengaja **tidak** diperpanjang otomatis.
3. **Tidak dicentang:** seperti sebelumnya (12 jam, keluar setelah 120 menit diam), dan cookie **hilang saat browser ditutup**.
4. Super Admin bisa mematikan pilihan ini dengan mengisi `0` di **Administrasi > Pengaturan situs**; kotak centang lalu tidak tampil dan permintaan "ingat" diabaikan server.
5. **Profil > Perangkat yang sedang masuk** menampilkan perangkat yang masih masuk (jenis browser dan sistem, terakhir aktif, diingat sampai kapan) dan tombol **"Keluar dari semua perangkat lain"**. Token atau hash-nya tidak pernah dikirim ke browser; daftar hanya memuat potongan pendek hash sebagai penanda.
6. Tetap berlaku seperti sebelumnya: logout, ganti kata sandi, dan akun dinonaktifkan langsung mencabut sesi di server, termasuk sesi yang diingat. Setiap login mencatat di log aktivitas apakah perangkat diingat.

## Akibat

- Migration `0011`: kolom `user_sessions.remember_device` (bawaan 0). Sesi lama tidak berubah perilakunya.
- Env opsional `SESSION_REMEMBER_DAYS` (bawaan 30) menjadi nilai awal sebelum Super Admin mengubahnya di website.
