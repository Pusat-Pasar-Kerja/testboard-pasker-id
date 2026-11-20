# Panduan deploy TestBoard ke VPS (tanpa sudo)

Panduan ini untuk dijalankan **di VPS lewat SSH**, dengan user yang sama yang biasa
menjalankan `update.sh`. Tidak butuh sudo. Semua perintah ditulis lengkap, tinggal salin.
Latar belakang keputusan: [ADR 0010](../adr/0010-production-deploy.md).

## Gambaran: apa ada di mana

| Bagian                         | Lokasi di VPS                                 | Bisa dibuka dari internet?             |
| ------------------------------ | --------------------------------------------- | -------------------------------------- |
| Kode (repo Git)                | `/opt/lampp/htdocs/paskerid/public/testboard` | **Tidak**, dikunci `.htaccess`         |
| Tampilan web (hasil build)     | `.../testboard/apps/web/dist`                 | Ya, di `https://<domain>/testboard/`   |
| API (Node.js)                  | berjalan di `127.0.0.1:8787`                  | Hanya lewat `/testboard/api/` (Apache) |
| Pengaturan rahasia (`api.env`) | `~/testboard-data/config/api.env` (izin 600)  | Tidak (di luar folder publik)          |
| File bukti                     | `~/testboard-data/storage`                    | Tidak (hanya lewat API dengan izin)    |
| Backup, log, Node.js           | `~/testboard-data/backups`, `logs`, `node`    | Tidak                                  |

`~` adalah folder home user SSH Anda. Jangan pernah memindahkan `api.env` atau backup ke
dalam `public/testboard`.

## Yang dibutuhkan (dicek otomatis di Langkah 2)

- Apache LAMPP dengan `mod_rewrite`, `mod_proxy`, `mod_proxy_http`, `mod_headers`, dan
  `AllowOverride All` untuk htdocs (bawaan XAMPP/LAMPP).
- MySQL/MariaDB di server yang sama dengan database `testboard` (schema baseline sudah ada).
- Satu **akun database aplikasi** dengan hak `SELECT, INSERT, UPDATE, DELETE` saja.
- Satu **akun admin MySQL** (mis. `root`) untuk migrasi dan uji restore. Akun ini hanya
  diketik saat diminta, **tidak disimpan** di mana pun.
- Program `git`, `curl`, `tar`, `gzip`, `sha256sum`, `crontab` (umumnya sudah ada).

## Langkah 0 - Rilis disetujui (dilakukan pengembang)

Pengembang menggabungkan branch `develop` ke `main` **setelah Anda setuju**. VPS selalu
mengambil `main`.

## Langkah 1 - Ambil kode terbaru

```bash
cd /opt/lampp/htdocs/paskerid/public/testboard
git pull --ff-only origin main
```

(Atau jalankan `./update.sh` lama Anda sekali lagi - isinya sama.)

## Langkah 2 - Periksa server (hanya membaca)

```bash
bash ops/testboard.sh check
```

Kirimkan seluruh hasilnya ke pengembang. Isinya tidak memuat password. Perhatikan baris
`GAGAL`/`PERLU`; pengembang akan memberi tahu bila ada yang harus diurus admin server.

## Langkah 3 - Setup pertama (sekali saja)

```bash
bash ops/testboard.sh setup
```

Yang terjadi:

1. Ditanya **alamat publik**, isi misalnya `https://domain-anda/testboard/`.
2. Folder `~/testboard-data` dibuat (izin hanya untuk Anda).
3. Bila Node.js 22.12+ belum ada, Node.js 24 resmi diunduh dari nodejs.org (diverifikasi
   checksum) ke `~/testboard-data/node`. Tidak mengubah sistem.
4. File `~/testboard-data/config/api.env` dibuat dari template.
5. Jadwal otomatis (cron) dipasang: API menyala saat server reboot, pengecekan tiap 5 menit,
   backup tiap malam pukul 02.30.

Lalu isi akun database aplikasi:

```bash
nano ~/testboard-data/config/api.env
```

Ganti `__DB_USER__` dan `__DB_PASSWORD__`. Simpan dengan `Ctrl+O`, `Enter`, keluar `Ctrl+X`.

Belum punya akun aplikasi? Buat lewat DBeaver dengan akun admin (ganti `PASSWORD_PANJANG_ACAK`
dengan password baru yang panjang; jangan kirim lewat chat):

```sql
CREATE USER IF NOT EXISTS 'testboard_app'@'127.0.0.1' IDENTIFIED BY 'PASSWORD_PANJANG_ACAK';
GRANT SELECT, INSERT, UPDATE, DELETE ON `testboard`.* TO 'testboard_app'@'127.0.0.1';
```

## Langkah 4 - Deploy pertama

```bash
bash ops/testboard.sh deploy
```

Urutannya (sekitar 3-6 menit):

1. **Backup** database + file bukti (`pre-deploy`).
2. Ambil kode `main`, pasang paket (`npm ci`), build API dan web.
3. **Migrasi database**: daftar migrasi yang belum diterapkan ditampilkan. Deploy pertama
   menerapkan `0001`-`0006` (hanya menambah tabel/kolom baru, tidak menghapus data). Ketik
   `YA`, lalu user dan password admin MySQL (tidak tampil di layar, tidak disimpan).
4. API dinyalakan ulang dan dicek kesehatannya. Bila tidak sehat, otomatis kembali ke versi
   sebelumnya.
5. **Uji alamat publik**: halaman tampil, deep link aman, API lewat Apache, dan 20+ path
   rahasia (`.git`, `.env`, kode sumber, SQL, ...) harus tertutup. Bila ada yang
   `TERBUKA`, **jangan go-live**; kirim hasilnya ke pengembang.

## Langkah 5 - Buat Super Admin pertama

```bash
bash ops/testboard.sh create-admin --email email-anda@instansi.go.id --name "Nama Anda"
```

Password sementara tampil **satu kali**. Login di `https://<domain>/testboard/`, lalu ganti
password dari menu profil.

## Langkah 6 - Ganti `update.sh` lama

```bash
cp ops/update.sh.example update.sh && chmod +x update.sh
```

Mulai sekarang update cukup `./update.sh` (semua langkah aman di Langkah 4 ikut berjalan).

## Langkah 7 - Uji backup dan restore (wajib sebelum go-live, TB-OPS-003)

```bash
bash ops/testboard.sh backup uji
bash ops/testboard.sh restore ~/testboard-data/backups/<nama-folder-yang-baru-dibuat>
```

Restore uji memakai database sementara `testboard_restore_check` (butuh akun admin MySQL),
membandingkan jumlah baris semua tabel dengan catatan backup, lalu menghapusnya lagi. Data
aktif tidak disentuh.

## Sehari-hari

| Keperluan                        | Perintah                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update ke versi terbaru          | `./update.sh`                                                                                                                                             |
| Update ke versi tertentu         | `./update.sh v1.0.0`                                                                                                                                      |
| Kembali ke versi sebelumnya      | `bash ops/testboard.sh rollback`                                                                                                                          |
| Status API                       | `bash ops/testboard.sh status`                                                                                                                            |
| Nyalakan / matikan / restart API | `bash ops/testboard.sh start` / `stop` / `restart`                                                                                                        |
| Lihat log API                    | `tail -n 100 ~/testboard-data/logs/api.log`                                                                                                               |
| Backup manual                    | `bash ops/testboard.sh backup`                                                                                                                            |
| Uji keamanan alamat publik       | `bash ops/testboard.sh smoke`                                                                                                                             |
| Lihat file yang akan dibersihkan | `cd /opt/lampp/htdocs/paskerid/public/testboard && TESTBOARD_ENV_FILE=~/testboard-data/config/api.env npm run maintenance -w @testboard/api -- --dry-run` |

Otomatis: backup tiap malam (disimpan 30 hari, minimal 3 terakhir selalu ada), pembersihan
data tiap hari (unggahan yang tidak pernah dipakai dihapus setelah 90 hari; bukti yang dipakai
tidak pernah dihapus otomatis), API dinyalakan ulang bila mati.

Backup ada di disk server yang sama. Sesekali unduh folder backup terbaru ke tempat lain
(mis. lewat SFTP/WinSCP) sebagai pengaman bila servernya rusak.

## Bila ada masalah

| Gejala                                                   | Kemungkinan penyebab / tindakan                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `smoke` menunjukkan `TERBUKA` untuk `.git`, `.env`, dll. | `.htaccess` tidak dibaca (`AllowOverride None`) atau `mod_rewrite` mati. Jangan go-live; minta admin server mengaktifkannya. |
| Halaman tampil tetapi "API lewat Apache tidak menjawab"  | `mod_proxy`/`mod_proxy_http` tidak aktif, atau API mati (`bash ops/testboard.sh status`).                                    |
| `deploy` berhenti di migrasi                             | Akun admin MySQL salah atau ditolak. Ulangi `./update.sh`; backup `pre-deploy` sudah ada.                                    |
| API tidak sehat setelah start                            | Lihat `tail -n 50 ~/testboard-data/logs/api.log` (biasanya akun database di `api.env`).                                      |
| Node.js gagal jalan ("GLIBC ... not found")              | Sistem operasi VPS terlalu lama untuk Node.js 24; kirim hasil `check` ke pengembang.                                         |
| Deploy lain "sedang berjalan" padahal tidak              | Hapus kunci: `rmdir ~/testboard-data/run/deploy.lock`                                                                        |

## Yang tidak boleh dilakukan

- Menaruh `api.env`, backup, atau file bukti di dalam `public/testboard`.
- Membuka port 8787 di firewall (API hanya untuk Apache di server yang sama).
- Mengubah file kode langsung di VPS (deploy akan berhenti; semua perubahan lewat GitHub).
- Menempelkan password database ke chat, tiket, atau dokumen.
