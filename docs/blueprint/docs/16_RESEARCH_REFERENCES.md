# 16 - Sumber, Referensi, dan Provenance

## A. Sumber internal dari pengguna (dibaca langsung saat menyusun blueprint)

- **S1** `Draft Test Case Phase 2 v.2.xlsx` - 14 sheet; acuan struktur test case baru, termasuk kolom: No., ID UAT, Kategori, Fitur/Proses, Prioritas, Jenis Pengujian, Aktor, Prasyarat, Langkah Pengujian, Hasil yang Diharapkan, Status, Bukti Uji, Penguji, Tanggal Uji, Catatan. Metadata dokumen pada bagian atas sheet. Beberapa sheet merupakan versi lama/alternatif.
- **S2** `V2_UAT Phase 1 (Pengembangan Karirhub) 30_31 Juli 2026.xlsx` - 4 sheet, eksekusi UAT Phase 1 dan evidence. 103 entries `xl/media/`.
- **S3** `Tracker v2 Phase 1 Karirhub Development.xlsx` - 7 sheet; ID UAT, Bukti, Prioritas, Status UAT, Detail Hasil Aktual / Defect, Severity, Penguji, Tgl UAT, Status Retest, Catatan Retest. 157 entries `xl/media/`; beberapa duplicate case IDs.
- **S4** `testboard_schema_existing_db.sql` - snapshot schema MySQL existing, 27 tables + view, user confirmed already applied to DB `testboard`.
- **S5** `Template_Import_Test_Case_UAT.xlsx` dan `Contoh_AI_Test_Cases.json` - contoh/format yang telah dibuat sebelumnya sebagai alat bantu import, bukan data bisnis resmi.

**Tidak mengemas S1-S3 secara utuh dalam ZIP** karena file UAT real mengandung data internal staf, evidence/screenshots, dan catatan bug. Dokumen ini menyertakan only metadata, mapping, empty templates dan dummy samples.

## B. Sumber teknis publik (diperiksa 19 November 2026)

1. Hono on Node.js, cara serve Node backend: https://hono.dev/docs/getting-started/nodejs
2. Hono + Cloudflare Workers + Vite prototype (opsional): https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
3. Vite public base path untuk deploy subfolder: https://vite.dev/guide/build.html#public-base-path
4. Vite env security (`VITE_*` visible in client): https://vite.dev/guide/env-and-mode
5. React i18next for translations: https://react.i18next.com/getting-started
6. TanStack Query React: https://tanstack.com/query/latest/docs/framework/react/overview
7. OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
8. OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
9. OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
10. OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
11. MySQL 8.0 Foreign Key documentation: https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html
12. Atlassian Jira work item status overview (reference concept, not copied software): https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-statuses-priorities-and-resolutions/
13. Playwright E2E: https://playwright.dev/docs/intro
14. Sharp Node image processing: https://sharp.pixelplumbing.com/
15. FFmpeg CLI: https://ffmpeg.org/ffmpeg.html
16. MySQL2 driver: https://sidorares.github.io/node-mysql2/docs
17. Docker Compose: https://docs.docker.com/compose/

## C. Jenis rekomendasi vs fakta

- **Fakta dari sumber:** nama kolom/sheet legacy, jumlah media embedded pada workbook, struktur SQL, status DB yang telah dikonfirmasi pengguna.
- **Rekomendasi desain (belum keputusan resmi):** palette brand contoh, role permission matrix detail, default file limits, session storage migration, API endpoints, Node/Hono stack, URL/routing produksi, Cloudflare demo mode, status transition rules.
- **Tidak diketahui hingga diuji di lingkungan nyata:** Apache DocumentRoot dan rewrite config VPS, MySQL runtime version & actual grants, kemampuan VPS media transcode, domain final, status kesiapan HTTPS/AV scan.

Gunakan `docs/15_OPEN_DECISIONS_AND_GAPS.md` saat mengubah rekomendasi menjadi requirement final.
