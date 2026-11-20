# 17 - Hasil Pemetaan Excel UAT Legacy ke TestBoard

## Provenance

Dokumen ini disusun dengan membuka **tiga workbook pengguna**, membaca header, sheet names, contoh struktur dan file media embedded. Tidak seluruh catatan/test case disalin ke paket. Angka `xl/media` adalah jumlah file tertanam, bukan hitungan baris/bukti unik.

## Ringkasan sumber

| Workbook | Sheet | Format utama | `xl/media` |
|---|---:|---|---:|
| Draft Test Case Phase 2 v.2.xlsx | 14 | FSD-based UAT case draft; header biasanya row 11; sebagian versi alternatif | 0 |
| V2_UAT Phase 1 (Pengembangan Karirhub) 30_31 Juli 2026.xlsx | 4 | UAT case + status/bukti aktual, header row 11 | 103 |
| Tracker v2 Phase 1 Karirhub Development.xlsx | 7 | Bug/retest tracker; header ada di row 1 atau 2 serta sheet variatif | 157 |

## Phase 2: sheet yang ditemukan

- Lapor Loker
- Lapor Perusahaan
- Pemberi Kerja Individu
- Gig Workers
- CDC Campus
- Calendar Service
- Lapor Loker 3
- Lapor Loker 2
- Lapor Perusahaan 3
- Employer Individu 3
- Lapor Perusahaan 2
- Employer Individu 2
- Gig Workers 3
- CDC Campus 3

**Catatan:** beberapa sheet membawa suffix `2`/`3` dan struktur yang berbeda; **jangan seluruhnya diimpor sebagai versi resmi** tanpa pemilihan baseline oleh pengguna.

Pola header UAT di sheet utama, row 11:

`No. | ID UAT | Kategori | Fitur/Proses | Prioritas | Jenis Pengujian | Aktor | Prasyarat | Langkah Pengujian | Hasil yang Diharapkan | Status | Bukti Uji | Penguji | Tanggal Uji | Catatan`

Informasi metadata dokumen berada di area awal sheet, misalnya Dokumen Acuan, Versi Dokumen, Unit Pemilik, Ruang Lingkup. Simpan metadata suite/doc, tidak sebagai test case.

## Phase 1: 4 sheet yang ditemukan

- Pemberi Kerja KL Skema Registra
- Pemberi Kerja KL Skema Invitati
- Modul Verifikasi Loker Karirhub
- Modul Verifikasi Pendaftaran Pe

Contoh header sama dengan Phase 2 UAT, memiliki hasil status seperti **Berhasil Diuji, Gagal Diuji, Belum Diuji**. Simpan lewat execution import mode, bukan overwrite test_cases.

## Tracker: 7 sheet yang ditemukan

- Pemberi Kerja KL Skema Registra
- Pemberi Kerja KL Skema Invitati
- Modul Verifikasi Loker Karirhub
- Modul Verifikasi Pendaftaran Pe
- Copy Tracker Aduan User
- Aduan user (Phase 1)
- List fitur yang done

Header utama tracker (terdeteksi pada row 1/2 di beberapa sheet):

`No. | ID UAT | Kategori | Fitur / Proses | Bukti | Prioritas | Status UAT | Detail Hasil Aktual / Defect | Severity | Penguji | Tgl UAT | Status Retest | Catatan Retest`

Beberapa sheet ringkasan/aduan tidak memakai ID UAT sebagai header. Perlakukan sebagai sumber berbeda, jangan importer menganggap 7 sheet memiliki template sama.

## Konsekuensi data model

| Temuan legacy | Requirement TestBoard |
|---|---|
| Kolom `Bukti` hanya satu pada Excel | Uploader mendukung banyak file per execution, case, defect |
| Excel ada gambar tertanam | Parser membaca drawing anchor; uncertain -> manual mapping |
| ID UAT yang sama berulang di tracker | Dedup `(project, case_code)` + row trace + preservasi metadata sumber |
| Status UAT berbeda dengan Status Retest | Dua lifecycle: execution vs defect workflow |
| Ada file referensi FSD dan versinya | `test_suites.reference_document`, `reference_version` |
| Ada actor label bukan user login | `actor_label` string, jangan auto-create users |
| Ada berbagai tanggal UAT format teks/Excel date | Date normalization + timezone policy |
| Ada sheet versi alternatif | Import wizard perlu pilih sheet dan preview |
| Ada hasil actual/defect long text | Rich text safe, kolom `MEDIUMTEXT` |

## Catatan kualitas data

- Jangan menormalkan `Minor` menjadi `LOW` tanpa aturan mapping yang terlihat dan disetujui user.
- Jangan menganggap setiap FAILED otomatis defect yang perlu diberi bug_code; beberapa baris actual adalah catatan observasi.
- Jangan menimpa hasil UAT lama ketika source tracker dan source UAT punya record case yang sama.
- Jangan menyimpan data pribadi penguji atau gambar asli ke cloud prototype tanpa persetujuan dan redaksi.
