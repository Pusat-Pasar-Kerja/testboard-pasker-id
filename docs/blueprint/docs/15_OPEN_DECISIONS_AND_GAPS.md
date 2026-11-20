# 15 - Open Decisions & Schema Gap Register

> Elemen berikut belum dikonfirmasi dalam workbook atau schema yang ada. Gunakan keputusan default konservatif, catat asumsi dan jangan membuat migrasi database produksi diam-diam.

| ID | Keputusan | Default blueprint | Impact |
|---|---|---|---|
| DEC-01 | Global Super Admin lintas proyek? | Belum ada; ADMIN per project | Perlu migration jika wajib |
| DEC-02 | Provision user & session storage | Invite/admin-provision; opaque session | Perlu tabel/komponen sesi |
| DEC-03 | Login SSO SIAPKerja? | Tidak untuk MVP; local auth | Integrasi baru P2 |
| DEC-04 | Scope deleted/archive | Soft delete bila kolom ada; no hard delete history | Lifecycle |
| DEC-05 | Batas file per project dan retention | Default usulan di file spec, configurable | Storage quota |
| DEC-06 | Evidence wajib pada FAILED? | Wajib actual result; evidence disarankan dengan alasan jika kosong | Validasi UI/API |
| DEC-07 | Auto bug dari FAILED? | Tidak; user pilih create/link | Kualitas data |
| DEC-08 | Reporter/assignee user cross-project | Hanya project members | RBAC |
| DEC-09 | Optional deadline defect/SLA | Tidak ada di schema | Migration bila perlu |
| DEC-10 | Tracking release label/tag/sprint | Cycle/run/build text saja | Tabel tambahan P1 |
| DEC-11 | Embedded images auto import | Auto untuk anchor jelas; manual review untuk ambigu | Parser & workload |
| DEC-12 | Import legacy hasil eksekusi | Explicit second mode; no automatic default | Data integrity |
| DEC-13 | Retest status mapping Open/Closed/Pending | Manual review, preserve raw | Avoid inaccurate migration |
| DEC-14 | Notifikasi email/in-app | Setelah MVP | Notification table & provider |
| DEC-15 | Dashboard/report recipients | Internal-only project users | RBAC/export |
| DEC-16 | Browser URL produksi | Belum diputus; subpath atau subdomain | Apache Vite base |
| DEC-17 | JavaScript backend in VPS vs PHP | Node.js/Hono recommended | Service management |
| DEC-18 | Cloudflare prototype DB | Mock-only, no production DB | Security/independence |
| DEC-19 | Storage original files | Keep compressed/validated final; original temporary deleted after policy | Retention & audit |
| DEC-20 | Role naming/permissions final | Proposed table in security doc | QA review |
| DEC-21 | English translations for user-authored cases | Manual + fallback | Translation workflow |
| DEC-22 | Deadline/frequency of backups | Ops must decide, test restore | Production readiness |

## Pending schema migration proposals (separate versioned SQL, not included executable here)

1. **Security:** `user_sessions`, `password_reset_tokens` (if local login); optional user invitations.
2. **Global permissions:** explicit `system_roles` / `user_global_roles` if Super Admin is required.
3. **UX enhancements:** `notifications`, `notification_reads`, `watchers`, `tags`, `saved_filters`.
4. **Defect enhancements:** `defect_assignment_history`, `due_date`, `resolution_reason` as needed.
5. **Import performance:** job task scheduler/state if background queue chosen.
6. **Reliability:** optional version/optimistic concurrency fields for collision control.

## Decision process

- Tentukan pemilik keputusan (product owner / lead QA / security / infrastructure).
- Buat perubahan PRD/FSD dan migration **di development lokal**.
- Buat migration forward-only + rollback plan; review FK/index/backup; test pada staging.
- Deploy ke VPS hanya pada release yang disetujui.
