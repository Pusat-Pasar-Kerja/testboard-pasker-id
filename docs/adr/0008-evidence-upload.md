# ADR 0008 - Unggah bukti (evidence) dan kompresi (Milestone 5)

- **Status:** Diterima (20 November 2026)
- **Dasar:** blueprint doc 07, doc 06 (Files), doc 09 (RBAC upload), doc 13 (`TB-FILE-001..006`), OWASP File Upload Cheat Sheet
- **Keputusan pemilik proyek:** pemeriksaan tanpa konfigurasi (ClamAV opsional), **tidak ada video** (cukup screenshot), HAR disensor otomatis.

## Jenis file

| Jenis        | Format                   | Batas per file | Proses                                                                                                                                                                     |
| ------------ | ------------------------ | -------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCREENSHOT` | PNG, JPG/JPEG, WebP      |         15 MiB | Decode + batas 50 juta piksel, coba WebP lossless / PNG optimize (piksel identik), JPEG mozjpeg q90 hanya bila ≥15% lebih kecil; EXIF/GPS selalu dibuang; thumbnail 480 px |
| `DOCUMENT`   | PDF, DOCX, XLSX          |         25 MiB | PDF: struktur + tolak JavaScript/Launch/EmbeddedFile/XFA. DOCX/XLSX: paket valid, tolak makro/ActiveX/OLE, tolak zip bomb. Disimpan apa adanya (sudah terkompresi)         |
| `LOG`        | TXT, LOG, CSV, JSON, HAR |         20 MiB | UTF-8 valid, JSON/HAR harus bisa dibaca; HAR disensor; gzip bila lebih kecil, selalu dikirim kembali sebagai teks asli                                                     |

Video (`VIDEO`) dan `OTHER` tidak diterima (keputusan pemilik proyek). Ekstensi lain ditolak sebelum disimpan. Maksimal 10 file dan 300 MiB per unggahan. Batas mengikuti usulan doc 07 dan bisa diubah nanti.

## Alur (doc 07)

1. Unggahan **di-stream** langsung ke karantina `STORAGE_DIR/tmp/` (tidak pernah ditampung utuh di memori), batas ukuran diperiksa selama byte masuk. Baris `file_objects` dibuat `PROCESSING` dan API menjawab `202`.
2. Antrean di proses API (2 sekaligus) memeriksa **jenis asli dari byte** (magic number), bukan nama file atau `Content-Type` browser. Tidak cocok = `REJECTED` `SIGNATURE_MISMATCH` (TB-FILE-004).
3. Pemeriksaan virus. Gagal/timeout **tidak pernah** menjadi `CLEAN`: file `FAILED`, `scan_status = ERROR`, tidak bisa dibuka (TB-FILE-005).
4. Optimasi per jenis, lalu hasil **diverifikasi** (gambar harus bisa di-decode dengan ukuran sama).
5. Pindah atomik ke `STORAGE_DIR/objects/<project>/<yyyy>/<mm>/<uuid>.<ext>`; tercatat sha256 asli dan tersimpan, ukuran awal/akhir, `compression_method`, `compression_note`, `READY`/`CLEAN`, mesin pemeriksa, waktu.
6. Setelah restart, file yang masih `PROCESSING` dijadikan `FAILED` (`INTERRUPTED`) dan karantina dikosongkan; tidak ada yang lolos tanpa diproses.

"Selalu dikompres" berarti **selalu dicoba**: bila tidak ada hasil yang lebih kecil, file asli (yang sudah lolos pemeriksaan, metadata dibuang) disimpan dengan catatan `NO_SIZE_GAIN`/`ALREADY_COMPRESSED`, tidak dipaksa jadi zip agar tetap bisa dipreview.

## Pemeriksaan virus tanpa konfigurasi

- Default `SCAN_ENGINE=basic`: tidak perlu memasang apa pun. Lapisan perlindungan: jenis asli dari byte, daftar format yang sempit, gambar di-decode ulang (konten tersembunyi tidak ikut), dokumen dengan makro/skrip/objek tertanam ditolak, log harus teks murni, ditambah deteksi tanda uji antivirus standar (EICAR). Tercatat sebagai `scan_engine = BASIC`.
- Opsional `SCAN_ENGINE=clamav` (+ `CLAMD_HOST`/`CLAMD_PORT`): memakai daemon ClamAV lewat INSTREAM, tercatat `CLAMAV`. Panduan pemasangan disiapkan di Milestone 7 (butuh RAM ±1-1,5 GB; `StreamMaxLength` ≥ 30M).
- Migration `0006` menambah `scan_engine`, `scanned_at`, `failure_reason` agar UI jujur menampilkan file lolos pemeriksaan dasar atau antivirus.

## Penyimpanan dan akses

- Production **wajib** `STORAGE_DIR` absolut di luar folder aplikasi; API menolak start bila tidak (di VPS repo berada di bawah web root Apache). Usulan: `/var/lib/testboard/storage`.
- Tidak ada URL publik. Preview/thumbnail/unduh lewat API dengan sesi + keanggotaan proyek; hanya `READY` + `CLEAN`. Header: `nosniff`, CSP `sandbox`, `Content-Disposition` (inline hanya untuk gambar, PDF, log sebagai `text/plain`), dukungan `Range`. Unduhan dicatat di `audit_logs` (`DOWNLOAD`).
- Satu file bisa dipakai di beberapa tempat (percobaan uji, bug, test case) tanpa menyalin isi (doc 07). Menghapus hanya untuk unggahan yang belum dipakai (soft delete).

## Siapa boleh apa

| Aksi                                   | Peran                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unggah                                 | ADMIN, QA Lead, Tester, Developer (VIEWER tidak)                                            |
| Lampirkan ke percobaan uji             | Penguji percobaan itu, ADMIN, QA Lead; lepas hanya ADMIN/QA Lead; run LOCKED final          |
| Lampirkan ke bug                       | ADMIN, QA Lead, Tester, Developer **yang ditugaskan**; lepas: ADMIN/QA Lead atau pengunggah |
| Lampirkan ke test case (dokumen acuan) | ADMIN, QA Lead                                                                              |
| Lihat/unduh                            | Semua anggota proyek                                                                        |

## Belum dicakup

Video, pemindaian ulang massal saat ClamAV dipasang kemudian, kuota/retensi penyimpanan dan pembersihan otomatis file tak terpakai (butuh kebijakan pengelola, doc 07).
