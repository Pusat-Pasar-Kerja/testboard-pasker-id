# ADR 0014 - Kode proyek, modul, dan siklus bisa diubah

- **Status:** Diterima dan diterapkan (v0.12.2)
- **Pemutus:** Pemilik proyek, 22 November 2026
- **Terkait:** ADR 0007 (kode bug), ADR 0011 (konsol admin), ADR 0013 (impor Karirhub)

## Latar

Sampai v0.12.1 kode proyek, kode modul, dan kode siklus dikunci setelah dibuat; hanya nama yang bisa diubah. Saat menyiapkan data Karirhub, pemilik perlu mengganti kode yang sudah terlanjur dibuat dan meminta kode-kode itu bisa diubah.

## Keputusan

1. **Kode proyek**: diubah oleh Super Admin di **Administrasi > Proyek > Ubah**. Semua data terhubung lewat id, jadi tidak ada data yang dipindah. Akibatnya:
   - alamat link proyek ikut berubah (`/projects/<kode>/...`); link lama tidak bisa dibuka lagi;
   - kode bug yang sudah ada tidak berubah. Bug baru tetap meneruskan awalan bug terakhir proyek (ADR 0007), jadi penomoran bug tidak loncat.
2. **Kode modul**: diubah oleh yang boleh mengelola modul (**Tim & Pengaturan > Modul & Suite > Ubah**). Test case yang sudah ada **tetap memakai kodenya** (mis. `UAT-LPL-001`), karena kode itu sudah dipakai di laporan, Excel, dan bug. Test case baru memakai kode modul yang baru (`UAT-<KODE-BARU>-001`). Saat impor berikutnya, isi kode modul yang baru supaya baris masuk ke modul yang sama.
3. **Kode siklus**: diubah oleh yang boleh mengelola run (**Siklus Uji > Ubah**), bersama judul, keterangan, dan periode. Run dan bug tetap terhubung karena memakai id siklus.
4. Kode tetap harus unik (proyek: di seluruh website; modul dan siklus: di dalam proyek). Kode yang sudah dipakai ditolak dengan pesan "Sudah dipakai". Setiap perubahan tercatat di log aktivitas dengan kode lama dan kode baru.
5. Kode test case, kode run, dan kode bug tetap tidak bisa diubah. Untuk test case, salin atau gabungkan lewat fitur yang ada.

## Akibat

- Tidak ada migration: kolom kode sudah unik di database, dan semua relasi memakai id.
- Bookmark dan link yang sudah dibagikan untuk proyek yang kodenya diubah perlu diperbarui.
