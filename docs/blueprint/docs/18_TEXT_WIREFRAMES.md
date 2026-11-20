# 18 - Text Wireframes (referensi implementasi UI)

Wireframe di bawah **bukan desain final**; gunakan sebagai referensi alur, density dan hierarchy saat membuat UI React. Fokus pada kemudahan tester mengisi hasil UAT dan mengelola evidence.

## A. Dashboard desktop

```text
+--------------------------------------------------------------------------------------------------+
| TestBoard PASKER ID                 [Project: KARIRHUB v]  [Search...]  [ID/EN] [Profile]          |
+----------------------+---------------------------------------------------------------------------+
| Dashboard            |  Dashboard / KARIRHUB                                                    |
| Test Cases           |  [Cycle] [Run] [Module] [Build] [Date]  [Export Report]                    |
| Cycles & Runs        |                                                                           |
| Bug Tracker          |  [TOTAL 156] [PASSED 92] [FAILED 15] [BLOCKED 9] [NOT RUN 40]             |
| Evidence             |                                                                           |
| Import               |  +---------------------------+  +--------------------------------------+ |
| Reports              |  | Run completion chart      |  | Defects by severity                  | |
| Team / Settings      |  | (latest status only)      |  | Critical/High/Medium/Low             | |
|                      |  +---------------------------+  +--------------------------------------+ |
|                      |  Recent runs                              Recent bugs                         |
+----------------------+---------------------------------------------------------------------------+
```

## B. Library test case

```text
[Cases] / [KARIRHUB]                   [Import XLSX/CSV/JSON] [+ Create Test Case]
[Search code/title...] [Module] [Priority] [Type] [Status] [More filters]
----------------------------------------------------------------------------------------------------
[ ] Code           Title/Feature                         Module      Priority    Type     Status
[ ] UAT-PKI-001    User without login...                 PKI         MUST        NEGATIVE READY
[ ] UAT-VLN-001    Submit vacancy for verification      VLN         MUST        POSITIVE READY
...

Click a row -> case detail with tabs Overview / Steps / Evidence / Revisions / Used in Runs.
```

## C. Execution workspace - PRIORITAS UX

```text
[Back to Run]   UAT-PKI-001  |  Run PHASE-2  |  Attempt #2 (Retest) | [Save Result]
+------------------------------------+----------------------------------+-------------------------+
| Test Case (snapshot)               | Record Result                    | Evidence & Bugs         |
| Preconditions                      | Tester: signed-in account        | [Drop/paste/choose]     |
| - Test data ready                  | [PASSED][FAILED][BLOCKED]...    | 2 screenshots           |
| Test steps                        | Actual Result*                  | 1 recording            |
| 1. Navigate to ...                 | [textarea]                      |                         |
| 2. Click ...                       | Notes                           | [Create/link defect]    |
| Expected result                   | [textarea]                      | BUG-KAR-0001            |
| ...                                | Browser / Device / Build        | Attempt history         |
+------------------------------------+----------------------------------+-------------------------+
```

Behavior: clicking FAILED exposes required Actual Result and encourages evidence; browser file picker `multiple`, clipboard paste and drag/drop; retest is another attempt, no old execution overwritten.

## D. Bug Detail

```text
BUG-KAR-0001 | Login issue                [OPEN v] [Assign] [Link UAT] [Attach]
[Overview] [Comments] [Evidence] [History]
Title, description, steps to reproduce, expected behavior, actual behavior
Severity [HIGH]     Priority [URGENT]    Reporter [Tester A]   Assignee [Dev B]
Related executions: PH-1 / UAT-REG-001 / Attempt #1 FAILED
Evidence gallery (PNG/MP4/PDF/log)     Timeline (created, assigned, FIXED, retest, verified)
```

## E. Import Wizard

```text
[Upload]----[Select sheets]----[Map columns]----[Validate preview]----[Commit]----[Result]
File: UAT Phase 1.xlsx                 Sheet: Modul Verifikasi Loker
Detected header row: 11  [Change]
Rows valid 34 | Duplicate 7 | Need review 4 | Errors 1 | Embedded images 10
[Preview Table: source row | ID UAT | title | target field | issue | evidence anchor]
Mode: (o) CREATE_ONLY ( ) UPDATE ( ) NEW_REVISION
[ ] Also migrate historical executions (separate explicit choice)
[Back] [Download row errors] [Confirm Import]
```

## F. Responsive mobile

```text
+---------------------------------+
| [menu] TestBoard   [ID/EN] [me] |
| Project: KARIRHUB v             |
| UAT-PKI-001   Attempt 1          |
| [Steps] [Result] [Evidence]     |
|                                 |
| PRECONDITIONS                   |
| ...                             |
| RESULT:  [Passed][Failed]       |
| Actual result                   |
| [textarea]                      |
| [ + Attach files ]              |
|                                 |
| [Save Result]                   |
+---------------------------------+
```

Use tabs/collapsibles in mobile; avoid three full columns squeezed into 375px. Preserve Save action visibility without blocking input fields.
