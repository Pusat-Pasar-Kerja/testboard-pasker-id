# 14 - Roadmap dan Development Backlog

## Urutan implementasi berbasis dependensi (bukan estimasi waktu)

### Milestone 0 - Repo & tooling

- [ ] Inisialisasi monorepo npm workspaces, TypeScript strict, eslint/prettier, `.gitignore`.
- [ ] Set repository README, AGENTS.md, CI lint/test/build.
- [ ] Local MySQL Docker/testboard, bootstrap schema baseline hanya **lokal**.
- [ ] Healthcheck API, mock API adapter, API error conventions.
- **DoD:** dev bisa start web dan api lokal tanpa akses ke VPS.

### Milestone 1 - Design system & prototype demo

- [ ] AppShell, sidebar, project switcher, responsive header.
- [ ] Dashboard, list/detail case, run detail, bug tracker mock screens.
- [ ] Bilingual ID/EN, empty/skeleton/error states.
- [ ] Cloudflare demo memakai mock data tanpa secrets.
- **DoD:** Prototype presentasi clickable, konsisten di desktop dan smartphone.

### Milestone 2 - Auth, project dan test case

- [ ] Migration session schema disetujui; login/logout/profile/password hash.
- [ ] Project members and per-project RBAC.
- [ ] Modules/suites/cases CRUD + case revision snapshot.
- **DoD:** Member dari project A tidak dapat mengakses B melalui direct API.

### Milestone 3 - Test cycles, run, execution

- [ ] CRUD cycle/run, add cases, assigned_to, freeze snapshots.
- [ ] Form execution, status + per-step data, attempt append-only, latest view.
- [ ] Dashboard counts from latest status only.
- **DoD:** Retest tidak menghapus hasil UAT awal.

### Milestone 4 - Bug tracking

- [ ] Create defect standalone/from failed execution, link/unlink.
- [ ] Severity/priority/status workflow with history and comments.
- [ ] Ownership/assignment and permissions.
- **DoD:** Bug dapat open -> fixed -> ready retest -> verified -> closed/reopened.

### Milestone 5 - Evidence pipeline

- [ ] Upload multi-file and clipboard paste; temporary area; type/size validation.
- [ ] Malware scan, image optimize, video processing, private storage, thumbnails, authorized download.
- [ ] Image lightbox and evidence gallery.
- **DoD:** Bukti ready setelah scan dan processing, metadata bytes/hash tercatat.

### Milestone 6 - Import legacy/AI

- [ ] XLSX/CSV/JSON parser, sheet & header mapping, preview/validation.
- [ ] Import jobs and row errors; idempotency, duplicate handling.
- [ ] Gambar embedded Excel + row anchors (jika tidak otomatis, review manual).
- [ ] Export templates and import errors.
- **DoD:** Source legacy dapat diimpor tanpa case duplikat serta tanpa membuat akun user dari teks Penguji.

### Milestone 7 - Reports, hardening, VPS deployment

- [ ] Reports, CSV/XLSX export, audit, settings, permissions.
- [ ] Security tests, backups, private storage, retention policy.
- [ ] Apache routing, Node.js service, update.sh build/restart/rollback, smoke tests.
- **DoD:** Production readiness checklist passed; Cloudflare demo remains independent.

## Backlog P1/P2

- P1: Notifications; optional email; saved filters; bulk actions; step attachment annotations; interactive report export PDF; system audit viewer; user invitation/password reset.
- P2: direct AI test generation; external Jira/GitHub issue sync; richer charts; SSO; public API/token; performance and trend advanced.

## Prinsip kerja dengan AI coding agent

- Kerjakan satu milestone, commit + test; jangan generate seluruh app sekaligus tanpa validasi DB.
- Database **existing** harus diperlakukan sebagai baseline; migration baru versioned & reviewed.
- Tidak ada mock credential/real MySQL password dalam Git.
- Pembaruan VPS menggunakan script update yang sudah disetujui dan dikerjakan terpisah dari development lokal.
