# 04 - Sitemap dan Spesifikasi Layar

## Sitemap (rute web yang disarankan)

```text
/login
/projects
/projects/:projectCode/dashboard
/projects/:projectCode/test-cases
/projects/:projectCode/test-cases/new
/projects/:projectCode/test-cases/:caseId
/projects/:projectCode/test-cases/:caseId/edit
/projects/:projectCode/suites
/projects/:projectCode/cycles
/projects/:projectCode/runs
/projects/:projectCode/runs/:runId
/projects/:projectCode/runs/:runId/cases/:runCaseId/execute
/projects/:projectCode/bugs
/projects/:projectCode/bugs/new
/projects/:projectCode/bugs/:bugId
/projects/:projectCode/evidence
/projects/:projectCode/imports
/projects/:projectCode/imports/:jobId
/projects/:projectCode/reports
/projects/:projectCode/members
/projects/:projectCode/settings
/profile
/403
/404
```

## S01 - Login

Fields email, password, remember-me (sesuai kebijakan), language switch; forgot password P1. Validasi server dan error generic. Beri identitas 'TestBoard PASKER ID'. Tidak ada daftar publik; pendaftaran user melalui admin/invite.

## S02 - Project dashboard

- Project switcher, environment/build filter, date range, module.
- KPI: planned, executed, Passed, Failed, Blocked, Not Run, open defects, critical/high defects.
- Visual: progress stacked, defect by severity, trend per run, recent activity, assigned-to-me.
- Klik metric memfilter daftar relevan; query hanya data project yang diizinkan.

## S03 - Test case library

- Table: `case_code`, `title`, `module`, `category`, `priority`, `type`, `status`, `updated_at`, `updated_by`.
- Filter: module, suite, priority, test type, status, keyword, archived.
- Actions: create, import, export, edit, duplicate, archive, add-to-run.
- Detail: source doc, requirement refs, actor, precondition, steps, expected, revisions/history, attachments, link run usage.
- Form steps: optional step table (step_number, instruction, expected_result); preserve legacy plain text.

## S04 - Test cycles and runs

- Cycle list: `cycle_code`, title, period, status, related runs.
- Run wizard: choose cycle, name, environment, build version, URL, cases, assignees.
- Run detail: progress KPI + table case status from `v_run_case_latest_status`, assignee, last tested, attempts, associated defects.
- Completion/lock: actions restricted by role and outstanding cases policy.

## S05 - Execution workspace

Layout desktop: left panel steps (40%), center result form (35%), right evidence/bugs/history (25%) or one responsive layout.

Form display: test case snapshot; run environment; tester; attempted at; result; actual result; notes; steps checklist; paste/drop/upload files; create/link bug.

On Failed: require actual_result, show evidence/reason warning, option create bug. On retest: show prev attempt and linked bugs; save new execution (no overwrite).

## S06 - Bug list and detail

- Table: `bug_code`, title, status, severity, priority, project module, reporter, assignee, created, updated.
- Views: table, kanban (P1), My issues, Open/Ready for retest, All.
- Bug detail: description, steps to reproduce, expected/actual, environment, version, linked executions, attachments, comments, history.
- Buttons follow permitted status transitions; show invalid transition error if attempted.
- Standalone bug allowed (e.g. post-UAT bug list).

## S07 - Evidence center

- Gallery/list of files with type filter, uploader, date, owning case/execution/bug, processing status, before/after bytes.
- Files are not direct public links. Preview/download only after permission check.
- Bulk download optional P1; prevent leaking across projects.

## S08 - Import wizard

**Step 1 Upload**: XLSX/CSV/JSON + project + source kind.

**Step 2 Select sheet**: workbook sheets, preview sampled rows, detect header automatically but allow manual header row.

**Step 3 Map columns**: legacy headers to canonical DB, plus source doc, suite, module.

**Step 4 Validate**: show parsed records, warnings, errors, duplicates, embedded image count, accepted/rejected rows.

**Step 5 Select policy**: CREATE_ONLY, UPDATE, NEW_REVISION; separate explicit checkbox for importing historical executions; default create draft.

**Step 6 Commit**: progress and summary with downloadable row-error CSV; status preserved in import_jobs.

## S09 - Reports

Summary per project/run/module/tester; export CSV/XLSX with filters, run detail results and defects; optional PDF P1. Clear definition of numerator/denominator and timezone.

## S10 - Members and settings

- Admin sees project members list, role and active status.
- Settings: default locale, allowed MIME/limits, evidence retention, run/code prefix, modules.
- Note: changing role affects API authorization immediately; never rely on frontend for enforcement.

## S11 - Profile

Display name, locale ID/EN, password change (local auth), sessions (P1), preferences. Database `users.preferred_locale` is authoritative preference.

## Global UI behavior

- Breadcrumb with project title.
- Browser refresh keeps current deep link.
- State filter encoded in URL query string.
- Input date in Asia/Jakarta UI, timestamps stored consistently as UTC.
- All user-entered content escaped/sanitized on rendering.
