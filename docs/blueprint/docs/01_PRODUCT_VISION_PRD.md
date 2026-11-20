# 01 - Product Requirements Document (PRD)

## Identitas produk

- Nama: **TestBoard PASKER ID**; nama UI ringkas: **TestBoard**.
- Deskripsi: platform berbasis web untuk mendokumentasikan test case, merencanakan siklus UAT, melakukan pengujian, menyimpan bukti, melacak defect, dan menyusun laporan.
- Inspirasi pola navigasi: issue/project workspace sekelas Jira; **bukan replika Jira** atau integrasi Jira.
- Target: tim QA/UAT, Business Analyst, pengembang, pengelola produk, pimpinan/pemantau, dan admin aplikasi.
- Bersifat **multi-project** sehingga tidak mengunci TestBoard hanya pada Karirhub.

## Masalah dari alur saat ini (berdasarkan workbook)

1. Master test case, pelaksanaan UAT, dan tracker tindak lanjut tersebar di beberapa workbook/sheet.
2. Form UAT memiliki identitas case, prasyarat, langkah, expected result, status, bukti, penguji, tanggal, catatan.
3. Tracker terpisah memiliki severity, hasil aktual/defect, retest status, catatan retest, serta gambar tertanam.
4. Pengulangan ID UAT dalam tracker dapat merepresentasikan tambahan catatan/bukti. Import langsung satu baris ke satu test case akan menghasilkan duplikat.
5. Bahasa UI perlu ID/EN dan hasil UAT harus dapat dicari serta diekspor.

## Sasaran produk

- Single source of truth untuk test case dan seluruh jejak eksekusi UAT.
- Workflows dari draft -> siap uji -> run -> execution -> defect -> fix -> retest -> verified/closed.
- Memungkinkan satu kasus mempunyai beberapa attachment untuk tiap eksekusi, bukan satu screenshot per kasus.
- Impor **hasil AI atau Excel lama** dengan validasi dan preview sebelum commit.
- Mendukung lintas proyek, modul, role, build/version, serta release/siklus pengujian.
- Bukti uji tersedia hanya bagi personel berwenang; otomatis melalui pipeline pemrosesan file.

## Non-goals MVP

- AI yang otomatis mengeksekusi website target; versi awal hanya **import AI-generated test cases** (file yang dibuat di luar TestBoard).
- Sinkronisasi dua arah dengan Jira/GitHub Issues.
- Public issue tracker terbuka untuk siapa saja.
- Menyimpan binary screenshot/video dalam MySQL.
- Terjemahan otomatis konten UAT memakai AI tanpa persetujuan pengguna.
- Cloudflare demo dengan koneksi ke database produksi.

## Ruang lingkup minimum (P0)

| ID | Kapabilitas | Output wajib |
|---|---|---|
| PRD-01 | Login, logout, sesi | Autentikasi aman, akun aktif |
| PRD-02 | Project & member | Multi-project, role project |
| PRD-03 | Modul/suite/case | CRUD, pencarian, filter, revisi |
| PRD-04 | Cycle/run | Daftar case untuk run; freeze snapshot |
| PRD-05 | Execution/retest | Hasil per attempt, tak menimpa riwayat |
| PRD-06 | Bug tracker | Defect standalone dan link ke execution |
| PRD-07 | Evidence | Multi-upload, private file, kompresi & scan |
| PRD-08 | Import AI/legacy | XLSX/CSV/JSON, mapping, preview, dedup |
| PRD-09 | Reporting | Dashboard, export daftar, KPI |
| PRD-10 | Bilingual | ID/EN UI, locale user, fallback |
| PRD-11 | Audit | Jejak CRUD dan status transition |
| PRD-12 | Responsive | Desktop/tablet/mobile usable |

## P1 (setelah MVP)

- Bulk assign dan bulk editing aman.
- Templated reports PDF; notifikasi in-app/email dengan queue.
- Saved filter/advanced search; timeline diskusi yang lebih kaya.
- Import gambar tertanam di Excel secara otomatis dengan anchor detection jika tidak sempat di P0 (tetap target tinggi).
- Role & invite lebih granular, tagging, dashboard per milestone, accessibility audit.

## P2 (opsional)

- Webhooks, integrasi GitHub Issue, AI-assisted case generation langsung di dalam aplikasi, analytics tren regresi, API token, integrasi SSO.

## KPI produk

- % test case yang masuk ke run dan terselesaikan; % case Passed/Failed/Blocked/Not Run.
- Jumlah defect aktif menurut severity, waktu dari dilaporkan sampai verified, reopened rate.
- Rasio keberhasilan import tanpa koreksi; jumlah duplikat yang ditangani.
- Waktu rata-rata unggah evidence sampai `READY`, rasio kompresi rata-rata menurut jenis.
- Tingkat kelengkapan evidence untuk FAILED execution.

## Prinsip analitik

- Denominator pass rate: jumlah run case yang valid, bukan jumlah seluruh attempt.
- **Latest status** diambil dari view `v_run_case_latest_status`, sedangkan riwayat attempt tetap dapat dilihat.
- `NOT_RUN`, `BLOCKED` dan `SKIPPED` **bukan** Passed.
- Severity milik defect, bukan status pengujian.
- Angka dashboard dapat difilter menurut project, module, cycle, run, tester, build, dan date range.

## Batas keputusan (yang masih perlu disepakati)

Lihat `docs/15_OPEN_DECISIONS_AND_GAPS.md`. Jika belum diputus, AI builder memakai konfigurasi konservatif dan menandai asumsi, bukan menambahkan field database secara sembarang.
