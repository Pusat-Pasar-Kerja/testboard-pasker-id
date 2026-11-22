# ADR 0016 - Mode Workshop: fase publik, kartu meja, Mode Mudah

- **Status:** Diterima dan diterapkan (v0.12.4 - v0.13.0, migration `0012`)
- **Pemutus:** Pemilik proyek, 22 November 2026
- **Terkait:** ADR 0005 (sesi), ADR 0006 (run), ADR 0007 (bug), ADR 0008 (bukti), ADR 0015 (selalu login)

## Latar

UAT Karirhub tidak dikerjakan perorangan oleh tim QA, tetapi dalam **forum workshop dua malam**, **berkelompok per meja (roundtable)**, dan setiap meja mengerjakan fitur yang ditugaskan. Banyak peserta adalah **orang tua dan orang awam** di lingkungan Kemnaker. Pemilik meminta: fase yang sedang berjalan tampil di halaman depan untuk umum, peserta bisa langsung bekerja per kelompok, dan situs siap dipresentasikan ke pimpinan.

Keputusan pemilik:

- Tombol publik dipasang di **fase**; isinya diatur **per data** dengan tombol masing-masing; **bawaannya semua tersembunyi**.
- Peserta masuk dengan **kartu meja: QR + kode 6 angka**, tanpa email dan kata sandi, berlaku pada tanggal workshop, bisa dicabut. Kartu memuat **kelompok dan nama anggotanya**.

## Keputusan

### 1. Fase publik (per data)

- `test_cycles.is_public` (tombol utama) dan `public_fields_json` (daftar data yang boleh tampil). 18 data dalam 3 kelompok: tentang fase (keterangan, tanggal, kemajuan), fitur (daftar, kemajuan, judul skenario, meja, nama anggota), masalah (daftar, kode, fitur, uraian, tingkat dampak, prioritas, pelapor, tanggal, jumlah "juga mengalami", foto).
- Data yang bergantung pada data lain otomatis mati bila data dasarnya mati (mis. "Kode bug" butuh "Daftar masalah"). Server **tidak pernah mengirim** data yang tidak dicentang.
- Data yang bisa memuat data pribadi (nama anggota, uraian, pelapor, foto) diberi tanda di layar pengaturan; foto layar Karirhub bisa memuat NIK, nama, dan nomor HP pencari kerja.
- Fitur per fase bisa ditandai **Dibuka / Selesai / Sembunyikan** (`workshop_features`); yang disembunyikan tidak tampil di halaman publik.
- Halaman depan `/` untuk pengunjung yang belum login menampilkan fase publik; petugas yang login langsung ke proyeknya; kartu meja langsung ke Mode Mudah. `/publik` selalu menampilkan halaman publik (untuk pratinjau).

### 2. Meja dan kartu meja

- Setiap meja (`workshop_tables`) punya **akun sendiri** (`users.auth_provider = 'WORKSHOP'`, tanpa kata sandi, email `@meja.invalid`). Akun ini **bukan anggota proyek**; sebuah penjaga di API hanya mengizinkan rute `/workshop/*`, `/public/*`, dan sesi sendiri. Halaman petugas mengembalikan 404.
- Masuk dengan kode 6 angka (`POST /workshop/join`) membuat sesi biasa (hash token, cookie HttpOnly) yang **berakhir tepat pada masa berlaku kartu**. QR berisi alamat `/meja#<kode>`: kode ada setelah `#`, jadi tidak tercatat di log server.
- Kode disimpan apa adanya (kode cetak, seperti PIN pada kartu) karena 6 angka tidak terlindungi oleh hash. Pengamanannya: batas 60 kode salah per alamat per 15 menit (terpisah dari kuota login email), masa berlaku, **Kode baru** (kartu lama mati, semua perangkat keluar), **Nonaktifkan**, dan cakupan akun meja yang sempit.
- Meja terikat ke satu **lembar uji (run)** di fase itu dan ke **fitur** yang ditugaskan; skenarionya = isi run yang modulnya ditugaskan ke meja. Nama anggota disimpan sebagai teks dan bisa diubah dari meja sendiri.
- Meja yang sudah punya jawaban tidak bisa dihapus (riwayat tetap utuh); cukup dinonaktifkan.

### 3. Mode Mudah (peserta)

- Satu layar = satu skenario, huruf dan tombol besar, tiga jawaban: **Sesuai / Tidak sesuai / Tidak bisa dicoba**. "Siapa yang mengisi" dipilih sekali per perangkat.
- Jawaban dicatat lewat **fungsi yang sama** dengan halaman petugas (`recordExecution`): nomor percobaan, run harus Berjalan, bukti, audit. Nama anggota masuk ke `legacy_tester_name`.
- **Tidak sesuai** membuat bug lewat `insertDefect` (kode bug, riwayat status, tautan ke percobaan, bukti, siklus fase). Peserta tidak memilih tingkat dampak.
- Sebelum mengirim, ditampilkan **masalah yang mirip** (kata pada uraian, ditambah bobot untuk skenario yang sama). Memilih "Ya, sama seperti ini" menyimpan **"+1 juga mengalami"** (`defect_confirmations`) dan menautkan percobaan ke bug itu, bukan membuat bug dobel.
- Foto: "Ambil foto" (kamera HP, untuk memotret layar komputer) atau "Pilih gambar"; lewat pipeline bukti biasa (pemeriksaan, pemindaian, kompresi).
- Internet putus: jawaban disimpan di perangkat (kotak keluar) dan dikirim otomatis saat tersambung; setiap kiriman membawa `client_id` sehingga dikirim ulang pun tercatat sekali.
- Ukuran huruf A- / A / A+ berlaku di seluruh situs dan diingat per browser.

### 4. Fasilitator

- Menu **Mode Workshop** per fase: Papan (kemajuan total, per meja, per fitur, kegiatan terbaru), Meja (buat satu atau banyak sekaligus, ubah, kode baru, nonaktifkan, cetak kartu, lembar cadangan), **Masalah masuk** (bug dari meja yang belum ditinjau: tingkat dampak, "Sama dengan BUG-x" yang menutup bug sebagai duplikat dan menghitungnya sebagai "+1", Sudah ditinjau), Tampilan publik, Fitur.
- **Layar besar** untuk proyektor (kontras tinggi, diperbarui tiap 10 detik) dan **cetak kartu meja** (2 per A4, QR + kode) serta **lembar uji cadangan** berkertas.

### 5. Panduan

Halaman **/panduan** tanpa login: cara kerja singkat, langkah untuk peserta, fasilitator (sebelum, saat, sesudah workshop), admin, kamus istilah, dan privasi.

## Akibat

- Migration `0012`: 3 kolom di `test_cycles`, 3 kolom NULL di `defects` (`reviewed_at`, `reviewed_by`, `duplicate_of_id`), 4 tabel baru. Tidak ada data lama yang berubah; semua fase tetap tidak publik sampai dinyalakan.
- Thumbnail: bila tidak ada thumbnail yang lebih kecil (screenshot sederhana), gambar aslinya yang dikirim, sehingga foto selalu tampil di Mode Mudah dan halaman publik.
- Halaman petugas dimuat per halaman (lazy), jadi HP peserta hanya mengunduh halaman publik dan Mode Mudah.
