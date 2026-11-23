# ADR 0018 - Anggota meja dengan akun Pengguna, aktivasi, dan "Tugas saya"

- **Status:** Diterima dan diterapkan (v0.16.0, migration `0014`)
- **Pemutus:** Pemilik proyek, 24 November 2026 (wawancara audit menyeluruh)
- **Terkait:** ADR 0012 (pemulihan akun), ADR 0016 (Mode Workshop), ADR 0017 (tiga tingkat peran)

## Latar

Sebelumnya nama anggota meja hanya teks (`member_names_json`). Pemilik meminta: "isian kelompok tuh ngisi nama sama email, otomatis jadi user". Pemilik juga ragu bagaimana bila peserta di meja mengetik email yang berbeda-beda. Usul yang disetujui: **peserta tidak pernah mengetik email**; di meja cukup pindai QR / ketik kode, ketuk nama sendiri, lalu bekerja.

## Keputusan

1. **Tabel `workshop_table_members`** (migration `0014`): satu baris per orang di meja (urutan, nama, dan `user_id` bila ada akun). Nama lama disalin dari `member_names_json`; kolom lama tidak dipakai lagi tetapi tidak dihapus.
2. **Admin mengisi nama + email (opsional)** per anggota di formulir meja. Email yang diisi:
   - mencari akun dengan email itu, atau **membuat akun LOCAL tanpa kata sandi** (belum aktif, tidak bisa login);
   - memberi orang itu tugas **Penguji** di proyek (kecuali ia sudah anggota atau Admin/Super Admin).
3. **Meja tidak pernah melihat email lengkap.** Sesi kartu meja hanya menerima nama, status akun (`NONE` / `NOT_ACTIVATED` / `ACTIVE`), dan email tersamar (`b***@gmail.com`).
4. **Meja hanya bisa mengubah nama tanpa akun.** Orang yang didaftarkan Admin dengan email tetap ada dan tidak bisa diganti namanya dari meja.
5. **Aktivasi, dua jalan:**
   - **Tautan aktivasi dari Admin** (halaman Anggota & tugas, atau formulir meja): tautan sekali pakai (memakai tabel `password_reset_links`, masa berlaku = `recovery.link_hours`), bisa disalin atau dikirim lewat WhatsApp. Hanya untuk akun LOCAL aktif tanpa peran situs yang **belum pernah** punya kata sandi. Tautan baru membatalkan tautan lama. Halaman tautan memakai kata "Aktifkan akun".
   - **"Aktifkan akun saya" di layar meja**: hanya untuk anggota yang terdaftar di meja itu, akunnya belum punya kata sandi, dan **hanya sekali** (pembaruan `password_hash IS NULL`). Setelah itu lupa kata sandi ditangani lewat "Lupa kata sandi" (ADR 0012).
6. **"Tugas saya"** (`/tugas`, `GET /me/tasks`): meja tempat orang itu terdaftar, skenario yang ditugaskan kepadanya (per lembar uji, dengan tombol Lanjutkan), dan jumlah masalah yang ia laporkan. Hanya data miliknya sendiri.
7. **Buka meja dari "Tugas saya"** (`POST /workshop/join-member`): orang yang terdaftar di meja bisa membuka Mode Mudah meja itu tanpa kode kartu, selama kartu berlaku. Sesi pribadinya di perangkat itu diakhiri (perangkat beralih menjadi layar meja) dan namanya langsung terpilih sebagai "yang mengisi".
8. Hasil uji, laporan masalah, dan "+1" dari meja tetap tercatat atas nama akun meja + nama anggota (tidak berubah dari ADR 0016).

## Akibat

- Risiko yang diterima: teman semeja bisa mengaktifkan akun orang lain lebih dulu. Akibatnya kecil (akun Penguji, satu proyek), tercatat di log aktivitas (`ACTIVATE`), dan pemilik akun bisa meminta tautan baru kepada Admin / Super Admin.
- `WorkshopTableDto` mendapat `members` (dengan email, untuk Admin); `WorkshopSessionDto.table` mendapat `members` (tanpa email lengkap). `member_names` tetap ada untuk tampilan lama (papan, kartu cetak, halaman publik).
- `ResetLinkCheck.activation` menandai tautan aktivasi.
