# 13 - Test Cases untuk TestBoard itu Sendiri

Daftar ini adalah **acceptance test usulan**, bukan hasil UAT Karirhub lama. Gunakan sebagai awal automated tests (Playwright/API) dan UAT manual.

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TB-AUTH-001 | Login valid | Akun aktif masuk, role terbaca | P0 |
| TB-AUTH-002 | Password salah | Error umum; tidak ada session; rate limiting | P0 |
| TB-AUTH-003 | User disabled | Tidak bisa login | P0 |
| TB-AUTH-004 | Logout | Session tidak valid kembali | P0 |
| TB-RBAC-001 | VIEWER create case via direct API | HTTP 403 | P0 |
| TB-RBAC-002 | Project A access resource B | 403/404 tanpa leak data B | P0 |
| TB-RBAC-003 | DEVELOPER edit expected result via API | Ditolak | P0 |
| TB-PRJ-001 | Multi-project switch | Filter, counts, resources berubah sesuai scope | P0 |
| TB-CASE-001 | Create draft case | Data valid tersimpan, code unique | P0 |
| TB-CASE-002 | Duplicate same code | 409/validation, tidak duplikat | P0 |
| TB-CASE-003 | Edit case after in run | Revision baru, run lama snapshot tetap | P0 |
| TB-CASE-004 | Archive case used in past | History run tetap ada | P0 |
| TB-RUN-001 | Create run and add cases | `test_run_cases` punya snapshot & version | P0 |
| TB-RUN-002 | Two testers create execution concurrently | Attempt number unik dan terurut | P0 |
| TB-EXEC-001 | Mark PASSED | Attempt saved + latest view updated | P0 |
| TB-EXEC-002 | Mark FAILED without actual_result | 422 / required field | P0 |
| TB-EXEC-003 | Retest after failure | New attempt; prior FAILED remains | P0 |
| TB-EXEC-004 | BLOCKED with reason | Blocked excluded from passed count | P0 |
| TB-BUG-001 | Bug from failed execution | Link exists in defect_execution_links | P0 |
| TB-BUG-002 | Create standalone bug post-UAT | Defect created without execution | P0 |
| TB-BUG-003 | Mark FIXED then RETEST fail | REOPENED + history, no auto pass | P0 |
| TB-BUG-004 | Invalid status transition | Rejected by backend | P0 |
| TB-FILE-001 | Upload 3 screenshots + PDF | 4 file objects, proper relations | P0 |
| TB-FILE-002 | Compress PNG UI screenshot | Text remains legible, size/method recorded | P0 |
| TB-FILE-003 | Already-compressed PDF | Valid and accessible; note if no reduction | P0 |
| TB-FILE-004 | Invalid MIME disguised as PNG | REJECTED; no public file | P0 |
| TB-FILE-005 | Virus scan error | Not downloadable; fail-safe | P0 |
| TB-FILE-006 | Guest downloads URL from different project | Unauthorized | P0 |
| TB-FILE-007 | Video upload/transcode interrupted | FAILED, retry/cleanup available | P1 |
| TB-IMP-001 | Canonical CSV import | Correct fields, draft cases | P0 |
| TB-IMP-002 | AI JSON with 2 cases | Cases in preview and commit, source_kind=AI | P0 |
| TB-IMP-003 | Excel Phase2 header row 11 | Detect or manually select header; no metadata imported | P0 |
| TB-IMP-004 | Tracker duplicated UAT ID | One case, duplicate rows reported | P0 |
| TB-IMP-005 | Reimport same file | No duplicate on CREATE_ONLY | P0 |
| TB-IMP-006 | Multiple embedded images per UAT | Correct row anchors or manual review state | P1 |
| TB-IMP-007 | Malformed CSV/XLSX | Per row validation; no partial corrupted data | P0 |
| TB-I18N-001 | Switch locale ID -> EN | All UI labels switch; case original content stable | P0 |
| TB-I18N-002 | Translate one case manually | Correct language displayed with fallback | P1 |
| TB-DASH-001 | Failed->Passed on retest | Latest status PASSED; attempts count still 2 | P0 |
| TB-REPORT-001 | Export filtered reports | Matching filtered rows only, CSV injection escaped | P0 |
| TB-OPS-001 | Browser refresh deep link on VPS | SPA loads no 404 | P0 |
| TB-OPS-002 | Access `.git` or `.env` via public URL | 403/404 | P0 |
| TB-OPS-003 | Backup and restore test | Able to restore data/files with consistency | P0 |
| TB-UI-001 | Mobile viewport 375 px | Menus/forms usable, no unbounded horizontal overflow | P0 |

## Exit criteria MVP

- Semua P0 critical-path tests passed dan tidak ada Critical/High open security defects.
- Pass/fail history, import dedup dan evidence permissions diuji di frontend dan API.
- Security checks, DB backups, Docker/local tests dan Apache deploy checks terdokumentasi.
- Locale switching, accessibility keyboard basics, dan project-scoped report berfungsi.

## Tool uji rekomendasi

- Unit: Vitest (jika dipilih).
- API/integration: test runner + MySQL lokal isolasi.
- E2E: Playwright (Chromium, Firefox, WebKit) dengan fixtures dummy dan screenshots.
- Load: minimal concurrency uploads + import cases dengan ukuran realistis.

Referensi Playwright: https://playwright.dev/docs/intro
