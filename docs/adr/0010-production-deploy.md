# ADR 0010 - Deploy produksi di VPS, retensi, dan backup

- **Status:** Diterima (Milestone 7)
- **Pemutus:** Pemilik proyek, 20 November 2026
- **Terkait:** doc 12 (deployment), doc 15 (DEC-05, DEC-16, DEC-19, DEC-22), ADR 0001, ADR 0008

## Keputusan pemilik proyek

| Pertanyaan                   | Keputusan                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Alamat web (DEC-16)          | Subfolder `https://<domain-paskerid>/testboard/`                                            |
| Lokasi kode di VPS           | **Tetap** di `/opt/lampp/htdocs/paskerid/public/testboard` (di dalam web root publik)       |
| Akses admin server (sudo)    | Tidak ada / tidak diketahui                                                                 |
| Retensi & backup (DEC-05/22) | Backup disimpan **30 hari**; unggahan yang tidak pernah dipakai dihapus setelah **90 hari** |

## Konsekuensi dan desain

### 1. Repo di web root -> daftar putih Apache + rahasia di luar folder

Karena folder repo bisa diakses lewat browser, `.htaccess` di root repo memakai **daftar putih**:
hanya `/testboard/api/*` (diteruskan ke API di `127.0.0.1:8787`) dan file hasil build
(`apps/web/dist`, dengan `.htaccess` sendiri untuk SPA) yang bisa dibuka. Segala yang lain
404/403: `.git`, `.env`, kode sumber, `package.json`, SQL, skrip, `node_modules`, termasuk
trik URL ter-encode dan `../`. Diuji pada Apache 2.4 nyata dengan aturan induk ala Laravel
(lihat `ops/testboard.sh smoke`, 25 pemeriksaan).

Lapisan kedua, supaya satu aturan yang salah hanya membuka kode yang memang publik di GitHub:

- File rahasia API (`api.env`, izin 600), file bukti, backup, log, dan Node.js disimpan di
  `~/testboard-data/`, **di luar** folder publik.
- API menolak start di mode produksi bila file rahasianya ada di dalam folder aplikasi, dan
  bila `STORAGE_DIR` di dalam folder aplikasi (ADR 0008).
- `ops/testboard.sh smoke` dijalankan otomatis di akhir setiap deploy; satu saja path rahasia
  yang terbuka = jangan go-live.

Sisa risiko: aplikasi induk di domain yang sama berbagi origin dengan TestBoard (XSS di
aplikasi induk bisa memanggil API TestBoard atas nama pengguna yang sedang login). Subdomain
sendiri menghilangkan risiko ini dan bisa dipilih kemudian tanpa mengubah kode.

### 2. Tanpa sudo

Semua operasi berjalan sebagai user biasa, tidak pernah sebagai root.

**Pembaruan 20 Nov 2026 (pemeriksaan VPS):** pemilik ternyata login sebagai `root` dan tidak
ingin berpindah user. Karena itu `ops/testboard.sh` yang dijalankan sebagai root membuat
akun Linux terkunci `testboard` (tanpa password, tanpa login dari luar) saat `setup`,
menyerahkan folder aplikasi kepadanya, lalu menjalankan dirinya ulang atas nama akun itu
(`runuser`). Pemilik tetap bekerja sebagai root; aplikasi, cron, dan data
(`/home/testboard/testboard-data`) milik `testboard`.

Sebagai user biasa:

- Node.js 24 dipasang ke `~/testboard-data/node` dari nodejs.org dengan verifikasi SHA-256.
- API dijalankan `ops/testboard.sh start` (nohup + pidfile), dijaga `watchdog` via **cron user**
  tiap 5 menit, dan dinyalakan lagi saat server reboot (`@reboot`).
- Apache tidak diubah: cukup `.htaccess` (butuh `AllowOverride All`, `mod_rewrite`,
  `mod_proxy`, `mod_proxy_http`, `mod_headers` - default XAMPP/LAMPP; dicek oleh
  `ops/testboard.sh check`).
- Bila kelak ada admin server dengan sudo, langkah opsional (user layanan khusus, systemd,
  konfigurasi vhost) bisa ditambahkan tanpa mengubah aplikasi.

### 3. Deploy yang aman

`ops/testboard.sh deploy` (dipanggil oleh `update.sh` baru): kunci deploy -> cek pengaturan ->
backup -> ambil kode -> `npm ci` + build (web dibangun ke folder baru lalu diganti dalam satu
rename) -> tampilkan migrasi yang tertunda dan **minta persetujuan + akun admin MySQL yang
tidak disimpan** -> restart -> health check -> otomatis kembali ke versi sebelumnya bila tidak
sehat -> smoke test. Migrasi bersifat maju saja; bila perlu mundur, database dipulihkan dari
backup `pre-deploy`.

### 4. Retensi (berjalan harian di dalam API)

| Data                                                         | Kapan dihapus                              |
| ------------------------------------------------------------ | ------------------------------------------ |
| Unggahan yang tidak dipakai di hasil uji/bug/test case/impor | 90 hari setelah diunggah                   |
| Bukti yang dipakai                                           | Tidak pernah otomatis                      |
| Isi file yang sudah dihapus (manual atau otomatis)           | 7 hari setelah dihapus; catatan tetap ada  |
| Folder kerja impor (workbook asli + salinan olahan)          | 90 hari; job dan hasil per baris tetap ada |
| Sesi kedaluwarsa, percobaan login, sisa unggahan terputus    | 7 hari / 90 hari / 24 jam                  |

Setiap penghapusan otomatis dicatat di audit tanpa aktor. Dapat dilihat dulu dengan
`npm run maintenance -w @testboard/api -- --dry-run`.

### 5. Backup

`ops/testboard.sh backup` tiap malam 02:30 (cron): `mysqldump` dengan transaksi konsisten +
arsip file bukti + manifest (versi, commit, jumlah baris tiap tabel) + SHA-256. Memakai akun
database aplikasi (cukup SELECT); view dibuat ulang dari baseline saat restore. Disimpan 30
hari (selalu menyisakan 3 terbaru). `ops/testboard.sh restore <folder>` menguji pemulihan ke
database sementara dan membandingkan jumlah baris (TB-OPS-003), lalu membersihkannya;
`--production` memulihkan ke database aktif setelah konfirmasi dan backup pengaman.

Catatan: backup berada di disk yang sama dengan server. Untuk perlindungan dari kerusakan
server, salinan berkala ke tempat lain (mis. diunduh lewat SFTP) tetap disarankan.
