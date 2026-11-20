# AGENTS.md - Instructions for AI Coding Agents (TestBoard PASKER ID)

Read **README.md** and all files in `docs/` in the order listed before generating code.

## Hard requirements

1. Build **TestBoard PASKER ID**, a multi-project UAT and bug tracking web app; UI must support Indonesian and English.
2. Work **locally first**. Do **not** connect to production VPS MySQL, Cloudflare, GitHub accounts, or deploy without explicit user command. Cloudflare is prototype/demo-only with mock data.
3. Production database already exists: MySQL schema `testboard` with 27 tables and `v_run_case_latest_status` view. Treat `database/schema_baseline_reference.sql` as read-only baseline; use controlled migrations for new tables.
4. Stack: React + TypeScript + Vite frontend, Hono + Node.js + TypeScript backend, mysql2/promise, i18next, Tailwind; private VPS file storage. Alter stack only if a major blocker is documented.
5. Data integrity: test case definition != execution != defect; retest is append-only; original outcome remains visible.
6. Multi-file evidence including screenshots, screen recordings, PDFs, XLSX/DOCX and logs. Files stored privately, metadata only in MySQL. Every upload passes scan/validate/optimize attempt and must be safe/READY before download.
7. Import XLSX/CSV/JSON AI-generated cases with sheet selection, header detection, column mapping, preview, per-row validation, duplicates and result report. Legacy embedded images need drawing anchor matching or manual review.
8. Use server-side authentication, session management and RBAC, not frontend-only gates. Never commit credentials, tokens, screenshots with PII, or `.env`.
9. Make accessible, modern UI matching the design system and responsive down to 375px, with deterministic ID/EN text.
10. Use project-scoped SQL queries, prepared statements, transactions for execution attempt counter, status history and imports. Serialize MySQL BIGINT IDs as JSON strings.

## Workflow rules

- Implement one milestone at a time following `docs/14_ROADMAP_BACKLOG.md`.
- First scaffold and render demo with mock API; then implement local persistence and auth safely.
- Before each coding milestone, list files you will edit and tests you will add; after the milestone, run typecheck/lint/build and targeted tests.
- Do not change or delete existing unrelated repositories or VPS files.
- Never blindly run baseline SQL against production or generate `DROP TABLE` migrations.
- For any schema gap (sessions, super-admin, notification) propose a migration in `database/migrations/` and document DB impact; do not apply it to VPS.
- If import source has ambiguous values, preserve raw source and flag manual review. Do not invent data.
- Distinguish P0 requirements from P1 enhancements; no unnecessary AI/cloud dependencies for production.

## Release gate

No production deployment until tests in `docs/13_UAT_ACCEPTANCE_CRITERIA.md`, file security, Apache webroot hardening, RBAC and backup/restore checks pass.
