# ADR 0005 - Desain login, sesi, CSRF, dan RBAC (Milestone 2)

- **Status:** Diterima (20 November 2026)
- **Dasar:** blueprint doc 09, keputusan ADR 0004 (Super Admin), migration 0002-0005

## Login & sesi

| Aspek                                        | Keputusan                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hash kata sandi                              | Argon2id (`@node-rs/argon2`), parameter minimum OWASP: memori 19 MiB, 2 iterasi. Tidak pernah plaintext.                                              |
| Panjang kata sandi                           | Minimal 12, maksimal 128 karakter; tidak boleh memuat nama e-mail.                                                                                    |
| Sesi                                         | Token acak 256-bit di cookie `HttpOnly`, `SameSite=Lax`, `Secure` di produksi (nama `__Host-tb_session`). Database hanya menyimpan **SHA-256 token**. |
| Masa berlaku                                 | Mutlak 12 jam, idle 120 menit (`SESSION_HOURS`, `SESSION_IDLE_MINUTES`).                                                                              |
| Logout / ganti kata sandi / nonaktifkan akun | Sesi dicabut di server seketika; ganti kata sandi mengeluarkan semua perangkat lain.                                                                  |
| Pembatasan percobaan                         | 5 kegagalan per e-mail atau 30 per IP dalam 15 menit -> HTTP 429. Disimpan di DB (tahan restart); e-mail disimpan sebagai hash.                       |
| Enumerasi akun                               | Pesan error sama untuk e-mail tidak terdaftar dan kata sandi salah; waktu verifikasi disamakan.                                                       |

## CSRF

1. Request yang mengubah data dari browser wajib berasal dari origin yang terdaftar (`ALLOWED_ORIGINS`, wajib diisi di produksi) - termasuk login.
2. Request yang sudah login wajib mengirim header `X-CSRF-Token` yang sama dengan cookie `tb_csrf`, **dan** hash-nya cocok dengan yang terikat di sesi (token sesi lain ditolak).

## RBAC

- Matriks izin per proyek ada di `packages/shared/src/permissions.ts` (sumber tunggal untuk API dan UI). API menegakkan di setiap route; UI hanya menyembunyikan tombol.
- Proyek yang bukan milik pengguna dijawab **404** (bukan 403), sehingga keberadaan proyek lain tidak bocor.
- Super Admin = akses setara ADMIN di semua proyek + membuat proyek + mengelola akun + pengaturan website; semua aksinya tercatat di `audit_logs`.
- Pengaman: proyek tidak bisa kehilangan ADMIN terakhir; sistem tidak bisa kehilangan Super Admin aktif terakhir.

## Akun pertama & akun lokal

- Produksi: `npm run admin:create-super -w @testboard/api -- --email ... --name "..."` dijalankan **di server**; kata sandi sementara ditampilkan sekali.
- Lokal: `npm run db:seed` membuat akun demo fiktif; kata sandinya hanya di `.local-db/dev-accounts.txt` (git-ignored).

## Test case

- Setiap perubahan yang tersimpan menaikkan `current_version` dan menulis revisi immutable (`test_case_revisions`). Run lama tetap memakai snapshot-nya sendiri (TB-CASE-003).
- Kode otomatis `UAT-<MODUL>-NNN` dibuat di bawah kunci baris proyek, sehingga aman saat dibuat bersamaan.
- Pengeditan bisa membawa `expected_version`; bila sudah ada versi lebih baru, API menjawab 409 (mencegah saling timpa).
- Langkah uji disimpan apa adanya di `test_steps_text`; tampilan per langkah diturunkan dari teks bernomor. Tabel `test_case_steps` dipakai saat hasil per langkah eksekusi dibangun (Milestone 3).
