# 09 - Authentication, RBAC & Security

## 1. Model akun

- `users`: akun web (display_name, email, password_hash, auth_provider, preferred_locale, is_active).
- `project_members`: membership (project_id, user_id, role_code).
- **`testboard_app` adalah user MySQL aplikasi, bukan user login website.** Jangan gunakan credential MySQL di React.
- Tidak ada public self-registration MVP; admin mengundang/provision akun pertama. Hal ini butuh desain bootstrap dan schema migration sesi/invite.

## 2. Session policy yang diusulkan

- Local auth email/password; hash dengan **Argon2id** sesuai OWASP, tidak pernah plaintext/SHA256 langsung.
- Session opaque random token disimpan/didukung server-side, cookie `HttpOnly; Secure; SameSite=Lax/Strict`; CSRF protection untuk modifying routes.
- Rekam last login dan login failures hanya jika field/tabel pendukung tersedia; jangan menyelundupkan ke kolom yang tidak sesuai.
- Rate limit login, lockout adaptif, rotate session setelah login/privilege change, logout invalidation.
- Password reset via token berumur pendek dan single use bila fitur ditambahkan.
- **Database existing belum mempunyai session store**: gunakan migration terencana sebelum login production-ready.

## 3. RBAC permissions (proposal MVP)

Legend: `C` create; `R` read; `U` update; `D` delete/archive; `E` execute; `A` assign; `M` manage.

| Resource / aksi | ADMIN | QA_LEAD | TESTER | DEVELOPER | VIEWER |
|---|---|---|---|---|---|
| Project settings & member | M | R | - | - | - |
| Suite & test case | CRUD | CRUD | R | R | R |
| Import test case | M | M | - | - | - |
| Cycle & run | CRUD | CRUD | R | R | R |
| Assign tester | M | A | - | - | - |
| Execute test / retest | E | E | E (assigned) | - | - |
| Defect create/read | CRUD | CRUD | CRU (owned) | R/U (assigned) | R |
| Defect status fix | M | M | - | U (IN_PROGRESS/FIXED) | - |
| Defect verify/reopen | M | M | U (case-linked, assigned tester) | - | - |
| Upload evidence | M | M | E (assigned) | U (bug assigned) | - |
| Reports | R/export | R/export | R (scope) | R (scope) | R (scope) |
| Audit log | R | R (project) | - | - | - |

- Tabel ini **policy design**, bukan privilege yang otomatis aktif karena schema. Implement enforcement di backend.
- IDOR prevention: setiap resource lookup harus memverifikasi project membership, entity scope, dan ownership bila berlaku.
- `ADMIN` di skema bersifat per project, bukan otomatis global admin.

## 4. MySQL privilege

- `testboard_app` production: `SELECT`, `INSERT`, `UPDATE`, `DELETE` terbatas pada `testboard.*`.
- `DB_HOST=127.0.0.1` hanya benar untuk backend yang berjalan di **VPS yang sama dengan MySQL**.
- Saat development lokal: `127.0.0.1` menunjuk komputer lokal sendiri, **BUKAN** VPS. Gunakan DB lokal atau SSH tunnel read-only untuk troubleshooting yang diizinkan; jangan menjadikan production DB sebagai dev DB.
- Jangan memperluas MySQL host user menjadi `%` atau membuka port 3306 publik untuk kemudahan.
- Schema changes & migrations dengan akun admin/migration terpisah, backup dahulu.

## 5. Upload dan file download

- Validasi izin upload, proyek, tipe file, MIME, signature, size dan AV scan.
- Storage privat di luar document root Apache. Preview/download melalui handler auth.
- Reject path traversal, executable upload, decompression bombs, malicious SVG.
- File `READY` tapi `scan_status != CLEAN` tetap belum boleh didownload.

## 6. Ancaman spesifik dan kontrol

| Risiko | Mitigasi |
|---|---|
| User melihat bug proyek lain | Row scoping + RBAC backend + tests |
| SQL injection | Prepared statements/parameter binding |
| XSS dari catatan UAT | Escape/sanitize text and rich text |
| CSV formula injection | Escape export values beginning `=`, `+`, `-`, `@`, tab/control |
| Image/doc malware | AV scan + content verification + sandbox |
| Leaked env or Git files from public folder | Apache deny default + serve only dist, prefer source outside webroot |
| Compromised session | HTTP-only cookie, CSRF, session rotate, TLS |
| Unauthorized download | Per-file project+entity authorization |
| Race condition attempt number | DB unique + transaction/locking |
| Accidental loss UAT history | Snapshot, immutable attempts, backups, audit |
| Cloudflare prototype contains production PII | Dummy data only; no prod credentials |

## 7. Logging and audit

- `audit_logs` untuk perubahan status, create/update/archive, import commit, download evidence, dan pengaturan penting.
- Redact passwords, auth tokens, cookies, raw attachments, NIK/email pribadi pada log tak perlu.
- Request ID correlated dengan server logs; retention ditentukan admin organisasi.

## 8. Security gate sebelum VPS dapat diakses publik

1. TLS HTTPS, redirect HTTP -> HTTPS.
2. Apache melayani **hanya** assets publik yang dibutuhkan. Semua `.git`, `.env`, `apps/api`, `database`, `node_modules`, repo docs harus unreachable via HTTP. Uji langsung menggunakan HTTP status.
3. Backend Node bound `127.0.0.1` dan hanya diproksi API route yang diperlukan.
4. MySQL restricted localhost dan privilege minimum.
5. Private storage di luar webroot dengan permission minimal.
6. Dependency lockfile, package audits, AV processing, secure headers, backup dan restore drill.
7. UAT security: guest, viewer, cross-project, revoked membership, expired session, file URL reuse.

## Sumber rujukan

- OWASP Authentication: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
