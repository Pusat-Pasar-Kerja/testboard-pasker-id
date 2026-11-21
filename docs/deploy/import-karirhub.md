# Panduan impor data Karirhub (UAT Fase 1, Bug Tracker Fase 1, Draf Fase 2)

Panduan ini untuk Super Admin / Admin proyek. Semua langkah dilakukan **di website**
(`https://paskerid.kemnaker.go.id/testboard/`). Tidak ada perintah server selain update.
Workbook asli **jangan** diunggah ke GitHub; cukup diunggah lewat halaman Impor Data.

Urutan di bawah sudah dicoba di laptop dengan ketiga workbook (database uji sementara yang
langsung dihapus). Hasil yang diharapkan tertulis di setiap langkah.

## 0. Sebelum mulai

1. VPS sudah di-update ke versi terbaru (`./update.sh`, migration `0008`-`0010` dijawab `YA`).
2. Masuk sebagai Super Admin, lalu buka **Administrasi > Proyek** dan buat proyek
   **KARIRHUB** (nama: Karirhub) bila belum ada.
3. Di proyek Karirhub buka **Siklus Uji** dan buat dua siklus:
   - `FASE-1` - "UAT Fase 1" (tanggal 30-31 Juli 2026, status Selesai bila mau);
   - `FASE-2` - "UAT Fase 2".

## 1. UAT Fase 1 (hasil uji 30-31 Juli 2026)

File: `V2_UAT Phase 1 (Pengembangan Karirhub) 30_31 Juli 2026.xlsx`

1. **Impor Data** > pilih **Test case** > unggah file.
2. Sheet: biarkan 4 sheet yang tercentang (sheet tersembunyi tidak dicentang). Kode modul
   yang disarankan boleh dipakai apa adanya.
3. Centang **Migrasi hasil UAT lama**, isi nama run "UAT Fase 1 (30-31 Juli 2026)", lalu
   pilih siklus **UAT Fase 1**.
4. **Periksa**. Yang diharapkan: 162 test case akan dibuat; status Berhasil Diuji = Berhasil,
   Gagal Diuji = Gagal, Belum Diuji = Belum diuji; sekitar 110 screenshot terhubung ke barisnya.
5. **Terapkan impor**. Hasil: run baru dengan 88 hasil uji (65 berhasil, 23 gagal) dan sekitar
   85 screenshot. Screenshot di baris "Belum Diuji" tidak ikut, karena belum ada hasil uji
   untuk ditempeli.

## 2. Bug Tracker Fase 1

File: `Tracker v2 Phase 1 Karirhub Development.xlsx`

1. **Impor Data** > pilih **Bug** > unggah file.
2. Sheet: 4 sheet modul + **Aduan user (Phase 1)** tercentang. Sheet tersembunyi ("Copy
   Tracker Aduan User", "List fitur yang done") biarkan tidak dicentang.
3. **Kode modul**: samakan dengan kode modul langkah 1 untuk sheet yang namanya sama, supaya
   bug masuk ke modul yang sama dengan test case-nya. Untuk "Aduan user" isi mis. `ADUAN` dan
   pilih sumber **Laporan pengguna**.
4. Siklus: **UAT Fase 1**. Biarkan **Tautkan ke hasil uji** tercentang.
5. **Periksa**. Yang diharapkan: 78 bug akan dibuat (21 dari baris Gagal Diuji + 57 aduan),
   sekitar 138 baris dilewati (baris berhasil / belum diuji tidak menjadi bug). Cek peta nilai:
   - Gagal Diuji = Terbuka; Berhasil / Belum Diuji = Lewati;
   - Not Done = Terbuka; Done = Ditutup; Info = Ditutup (ubah bila maksudnya lain).
     Baris aduan lanjutan (ID sama tanpa status, hanya screenshot tambahan) otomatis
     digabung ke aduan pertamanya.
6. **Terapkan impor**. Hasil: 78 bug, sekitar 19 tertaut ke hasil uji gagal di run Fase 1, dan
   sekitar 70 screenshot. Screenshot di baris berhasil diuji tidak ikut (itu bukti lulus, bukan
   bug).

## 3. Draf test case Fase 2

File: `Draft Test Case Phase 2 v.2.xlsx`. Isinya dua versi: sheet terlihat (versi ringkas v.2)
dan sheet tersembunyi "... 3" (versi lengkap). Keduanya memakai **kode yang sama untuk isi
yang berbeda**, jadi diimpor dua kali.

### 3a. Versi ringkas v.2

1. **Impor Data** > **Test case** > unggah file.
2. Centang: Lapor Loker, Lapor Perusahaan (tersembunyi, tapi bagian v.2), Pemberi Kerja
   Individu, Gig Workers, CDC Campus, Calendar Service. Sheet "... 2" dan "... 3" jangan.
3. Kode modul (disarankan mengikuti kode di ID UAT): Lapor Loker `LPL`, Lapor Perusahaan
   `LPP`, Pemberi Kerja Individu `PKI`, Gig Workers `GW`, CDC Campus `CDC`, Calendar
   Service `CHS`.
4. Status test case: **Draf**. Jangan centang migrasi hasil.
5. **Periksa** (diharapkan 254 akan dibuat, tanpa kode bentrok) > **Terapkan impor**.

### 3b. Versi lengkap "... 3"

1. Unggah **file yang sama** lagi (Test case).
2. Centang hanya: Lapor Loker 3, Lapor Perusahaan 3, Employer Individu 3, Gig Workers 3, CDC
   Campus 3. Kode modul **sama** dengan 3a (Employer Individu 3 = `PKI`). Nama suite boleh
   diberi akhiran "(versi lengkap)".
3. Pengaturan **Bila kode sudah dipakai test case lain**: **Buat dengan kode baru**.
4. **Periksa**. Diharapkan 706 akan dibuat, dengan 219 baris di daftar **Kode bentrok**
   (kode 001-0xx yang juga dipakai versi ringkas). Daftar itu menampilkan judul di file
   berdampingan dengan judul yang sudah ada; ubah per baris bila ada yang mau dilewati.
5. **Terapkan impor**. Baris yang bentrok mendapat nomor berikutnya di modulnya (mis.
   UAT-LPL-125 dst.); kode asalnya tercatat di riwayat test case.

### 3c. Merapikan duplikat

1. **Test Case > Cari yang mirip**, pilih modul.
2. Setiap pasangan ditampilkan berdampingan dengan skor kemiripan dan rujukan FSD yang sama.
   Pilih **Pertahankan ...** untuk menggabungkan, atau **Bukan duplikat**.
3. Untuk banyak sekaligus: centang beberapa test case di daftar Test Case > aksi
   **Gabungkan (duplikat)**.
4. Pada uji coba, pasangan dengan kemiripan 70% ke atas: LPL 16, LPP 39, PKI 3, GW 2, CDC 1.
   Pasangan 100% biasanya test case yang sama di versi ringkas dan versi lengkap.

## Bila ada yang salah

- Sebelum **Terapkan**, impor bisa dibatalkan tanpa mengubah data.
- Setelah diterapkan: test case bisa diarsipkan massal (aksi massal **Arsipkan**), bug bisa
  diubah massal. Setiap impor tercatat di **Log aktivitas**.
- Backup harian tetap berjalan; sebelum impor besar boleh juga menjalankan
  `bash ops/testboard.sh backup sebelum-impor` di VPS.
