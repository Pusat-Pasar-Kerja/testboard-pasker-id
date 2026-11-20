# ADR 0007 - Alur bug (Milestone 4)

- **Status:** Diterima (20 November 2026)
- **Dasar:** blueprint doc 02 bagian 4 dan 7, doc 06 (Defects), doc 13 (`TB-BUG-001..004`), DEC-07, DEC-08

## Alur status

Diagram blueprint:

`OPEN -> IN_PROGRESS -> FIXED -> READY_FOR_RETEST -> VERIFIED -> CLOSED`, `READY_FOR_RETEST -> REOPENED -> IN_PROGRESS`, `OPEN -> WONT_FIX`.

Tambahan yang kami putuskan (blueprint tidak melarang, dan kebutuhan nyata UAT):

| Transisi                  | Alasan                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `IN_PROGRESS -> WONT_FIX` | Developer/QA Lead baru tahu saat dikerjakan bahwa bug tidak valid |
| `REOPENED -> WONT_FIX`    | Sama, setelah dibuka ulang                                        |
| `VERIFIED -> REOPENED`    | Terjadi lagi sebelum ditutup                                      |
| `CLOSED -> REOPENED`      | Regresi setelah rilis                                             |
| `WONT_FIX -> REOPENED`    | Keputusan dibatalkan                                              |

Transisi lain ditolak backend dengan `409 CONFLICT` (TB-BUG-004). `expected_status` (opsional) menolak perubahan bila status sudah diubah orang lain.

## Siapa boleh apa

| Ke status                                  | Peran                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `IN_PROGRESS`, `FIXED`, `READY_FOR_RETEST` | ADMIN, QA Lead, Developer **yang ditugaskan**                                                     |
| `VERIFIED`, `REOPENED`                     | ADMIN, QA Lead, Tester (verifikasi lewat uji; developer tidak memverifikasi perbaikannya sendiri) |
| `CLOSED`, `WONT_FIX`                       | ADMIN, QA Lead                                                                                    |

`REOPENED` dan `WONT_FIX` wajib alasan. Alasan tersimpan di `defect_status_history.change_comment`. Super Admin diperlakukan sebagai ADMIN.

Perubahan status, baris riwayat, dan audit ditulis dalam satu transaksi dengan kunci baris bug. `resolved_at` diisi saat `FIXED`, `closed_at` saat `CLOSED`/`WONT_FIX`; keduanya dikosongkan saat `REOPENED`. Versi perbaikan (`fixed_in_version`) dapat dikirim bersama `FIXED`/`READY_FOR_RETEST`.

## Bug dan hasil uji

- Hasil uji tidak pernah mengubah status bug secara otomatis, dan bug tidak dibuat otomatis dari hasil gagal (DEC-07). Penguji memilih membuat bug baru (otomatis tertaut ke percobaan itu, TB-BUG-001) atau menautkan bug yang sudah ada.
- Bug boleh berdiri sendiri tanpa tautan (laporan pasca-UAT, TB-BUG-002).
- Menutup bug tidak mengubah hasil `FAILED` lama (doc 02 bagian 10).

## Kode bug

`BUG-<PREFIX>-NNNN`, dibuat di bawah kunci baris proyek. Prefix diambil dari: pengaturan proyek `defect.code_prefix` bila ada, jika tidak dari prefix bug terakhir proyek itu (meneruskan penomoran lama/hasil impor), jika belum ada bug: `BUG-` + 3 huruf pertama segmen terakhir kode proyek (`KARIRHUB` -> `BUG-KAR-0001`). Kode manual tetap boleh dan dicek unik per proyek.

## Ubah isi bug (field restrictions)

| Peran                         | Kolom yang boleh diubah                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| ADMIN, QA Lead                | semua, termasuk penugasan                                                                   |
| Tester **pelapor**            | judul, deskripsi, langkah, perilaku, modul, severity, prioritas, lingkungan, build, browser |
| Developer **yang ditugaskan** | versi perbaikan                                                                             |

Penugasan hanya ke anggota aktif proyek selain VIEWER (DEC-08). `expected_updated_at` (opsional) mencegah saling timpa. Komentar boleh dari ADMIN, QA Lead, Tester, Developer; VIEWER hanya membaca. Menautkan/melepas percobaan uji: ADMIN, QA Lead, Tester.

Tidak perlu migration: semua tabel (`defects`, `defect_status_history`, `defect_comments`, `defect_execution_links`) sudah ada di baseline.
