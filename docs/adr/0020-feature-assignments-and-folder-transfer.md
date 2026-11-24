# ADR 0020 - Penugasan fitur ke kelompok dan pengguna; memindahkan folder fitur antar Fase

- **Status:** Diterima dan diterapkan (v0.23.0, migration `0016`)
- **Pemutus:** Pemilik proyek, 24 November 2026 (setelah v0.22.0 live)
- **Terkait:** ADR 0016 (Mode Workshop), ADR 0019 (Fase › Fitur › Skenario, UAT, Bug Reporting)

## Latar

Setelah v0.22.0, pemilik meminta tiga hal:

1. "Kelompok dan Meja/User itu di-assign ke fitur. Jadi tiap fitur ada inputan penambahan tugas/assignment, dimana ada opsi kelompok sama user."
2. Ikon dan susunan UAT di panel kiri "njomplang, asimetris" antara "Semua UAT" dan baris di bawahnya; seluruh situs harus simetris.
3. Memindahkan fitur dan skenario antar Fase belum memudahkan: perlu cara massal, atau memindahkan satu fitur utuh ke Fase lain.

Jawaban wawancara: hanya kelompok dan pengguna yang tercantum di penugasan sebuah fitur yang mengerjakannya (Admin bebas menambah dan mengurangi); satu fitur boleh ditugaskan ke beberapa kelompok dan beberapa pengguna; pemindahan memakai tombol, centang banyak, **dan** seret-lepas ke folder Fase di panel kiri.

## Keputusan

1. **Penugasan per fitur di UAT.** Kelompok memakai tabel yang sudah ada, `workshop_table_modules` (fitur yang dikerjakan meja). Pengguna yang ditugaskan langsung (tanpa lewat kelompok) dicatat di tabel baru `uat_feature_people (member_id, module_id)`. Keduanya dua arah: formulir kelompok dan kartu fitur mengubah data yang sama.
2. **Hanya yang tercantum.** Seorang peserta boleh mencatat hasil skenario sebuah fitur bila fitur itu ditugaskan ke kelompoknya atau ke dirinya, atau skenarionya ditugaskan langsung kepadanya. Peserta tanpa penugasan belum punya pekerjaan (aturan lama "tanpa kelompok = semua fitur" dihapus). Kartu meja (Mode Mudah) tetap memakai fitur kelompoknya.
3. **Data lama aman.** Migration `0016` menugaskan setiap peserta yang belum masuk kelompok ke semua fitur UAT-nya, sama dengan hak mereka sebelumnya; Admin bisa mengurangi kapan saja.
4. **Fitur yang dilepas dari UAT** membawa penugasannya (kelompok dan pengguna). Hasil yang sudah dicatat tidak pernah dihapus.
5. **Pengguna melihat fiturnya sendiri.** Ringkasan UAT untuk Pengguna membawa `my_features` (fitur lewat kelompok dan lewat nama); halaman UAT, daftar skenario UAT, dan "Tugas saya" hanya menghitung skenario fitur itu.
6. **Memindahkan folder fitur** (`POST /phases/transfer`): satu atau banyak fitur, dari sebuah Fase (atau "Belum masuk Fase") ke Fase lain, sebagai **Salin** atau **Pindahkan**. Salin membuat salinan semua skenario aktif (yang Siap tetap Siap, foto ikut); Pindahkan memindahkan semua skenario termasuk yang diarsipkan, dan folder kosongnya ikut pindah. Skenario Siap yang tiba di sebuah Fase otomatis masuk ke UAT terbuka Fase itu yang menguji fiturnya; UAT di Fase lama tetap menyimpan hasilnya. Tercatat di log aktivitas sebagai "Disalin/Dipindahkan ke Fase lain".
7. **Antarmuka.** Kartu fitur di tab Fitur UAT berisi "Ditugaskan ke" (kelompok dan pengguna sebagai chip yang bisa dihapus) dan pilihan "+ Tugaskan kelompok atau pengguna". Folder fitur di halaman Fase punya kotak centang, tombol Salin/Pindahkan, bilah pilihan massal, dan bisa diseret ke folder Fase di panel kiri (tombolnya tetap ada untuk keyboard dan layar sentuh). Aksi massal skenario punya tombol "Salin ke Fase…" dan "Pindahkan ke Fase…" dengan pemilih Fase berbentuk kartu.
8. **Simetri.** Panel kiri memakai satu bentuk baris pohon untuk Fase, fitur, dan UAT: anak menjorok di bawah ikon induknya dengan garis, ikon sama besar, dan kolom kanan yang sama untuk tombol lipat dan titik status. Ikon UAT diganti labu ukur yang simetris. Tombol "Layar besar" dan "Halaman publik" pindah ke tab Ringkasan UAT supaya deret tombol di kepala halaman rapi.

## Akibat

- Satu tabel baru (`uat_feature_people`); tidak ada kolom atau data yang dihapus. Server perlu menjalankan migration `0016` (lewat `./update.sh`).
- Kesalahan 403 saat mencatat hasil kini berbunyi "This scenario is not assigned to you."
