# 03 - UI/UX & Design System

## Brand dan arah visual

Nama produk: **TestBoard**; supporting brand: **PASKER ID**. Gaya: produk SaaS enterprise modern, clean, kontras tinggi, navigasi padat tapi teratur, nyaman dipakai sepanjang hari. **Warna di bawah adalah usulan desain, bukan klaim warna resmi instansi.**

| Token | Contoh | Kegunaan |
|---|---|---|
| `brand.700` | `#0D5B4B` | Sidebar aktif, CTA primer |
| `brand.600` | `#157563` | Hover/links |
| `brand.100` | `#DFF2EA` | Selected state |
| `ink` | `#17252B` | Teks |
| `bg` | `#F7F9F8` | Canvas app |
| `surface` | `#FFFFFF` | Tabel/card/modal |
| `border` | `#DAE3DF` | Divider |
| `danger` | `#B42318` | Gagal/critical |
| `warning` | `#A46100` | Blocked/perhatian |
| `success` | `#207651` | Passed |
| `info` | `#2162A5` | Informasi |

- Font: Inter atau system UI (fallback tanpa wajib font eksternal).
- Skala spacing 4/8/12/16/24/32 px; radius 8-12 px; shadow ringan.
- Desktop layout: left sidebar 248 px; topbar; konten max 1440 px; page header + action group.
- Tablet: collapsible sidebar; smartphone: drawer + header; tabel punya horizontal scrolling/column visibility dan card detail.
- Light/dark mode opsional P1; bilingual P0.
- Icon: Lucide; jangan gunakan emoji sebagai indikator status utama.

## Struktur navigasi utama

1. Dashboard
2. Projects (project switcher)
3. Test Cases
4. Test Plans / Cycles
5. Test Runs
6. Bug Tracker
7. Evidence Center
8. Imports
9. Reports
10. Team & Settings

## Pattern UI wajib

- Search global + per-page; filter chip status/module/priority/assignee/date.
- List view: column customization, sort, pagination server-side, selection, bulk actions (dengan konfirmasi).
- Detail view: header status, metadata sidebar, tab Overview / Steps / Evidence / History / Linked bugs.
- Create/edit pakai form dengan validasi per field, autosave draft opsional; konfirmasi meninggalkan form unsaved.
- Upload: drag/drop + file picker, multiple, preview, progress, processing status, remove per file.
- Image preview modal dengan zoom dan pan, navigasi previous/next, file caption, informasi sebelum/sesudah ukuran.
- Activity timeline yang menampilkan siapa, kapan, dan apa yang berubah.
- Empty states dengan CTA; skeleton loaders; toast yang ringkas; error dengan kode referensi.
- Destructive action memerlukan konfirmasi dan memeriksa FK/soft delete.

## Komponen standar

`AppShell`, `ProjectSwitcher`, `PageHeader`, `Breadcrumbs`, `StatusBadge`, `PriorityBadge`, `SeverityBadge`, `DataTable`, `TableFilters`, `FormField`, `RichTextEditor` (jika dipakai, sanitize output), `UserAvatar`, `AssigneePicker`, `StepEditor`, `AttachmentUploader`, `EvidenceGallery`, `ImageLightbox`, `ActivityTimeline`, `ImportWizard`, `MetricCard`, `ReportFilters`, `ConfirmDialog`, `EmptyState`, `Pagination`, `LanguageSwitcher`.

## Status color guideline

- Execution: PASSED hijau; FAILED merah; BLOCKED kuning; NOT_RUN abu-abu; IN_PROGRESS biru; SKIPPED abu-abu muted.
- Defect: OPEN merah muted, IN_PROGRESS biru, FIXED/READY_FOR_RETEST kuning, VERIFIED hijau, CLOSED abu-abu/hijau muted, REOPENED merah, WONT_FIX abu-abu.
- Warna **bukan satu-satunya indikator**; label dan icon selalu ada.

## Kebutuhan accessibility

- Target WCAG 2.2 AA untuk contrast dan kontrol keyboard.
- Navigasi tab, label input yang eksplisit, focus ring, aria-live status upload, landmark dan heading hierarchy.
- Jangan bergantung pada hover untuk aksi penting; semua control bisa diklik/tap.
- Timestamp tooltip lengkap dengan zona; default display Asia/Jakarta.
- Bilingual bebas ganti tanpa reload halaman; pilihan disimpan ke profil/user setting.

## UX untuk UAT yang benar-benar dipakai

- Mode fokus execution: pada satu layar terlihat **precondition, steps, expected, actual, result, evidence**, tidak perlu bolak-balik halaman.
- Tombol aksi cepat `Passed / Failed / Blocked / Skipped`; ketika Failed buka input actual result dan attach evidence.
- Retest menampilkan perbandingan attempt terbaru vs sebelumnya; bug related di sisi kanan.
- User dapat paste screenshot dari clipboard, upload multi screenshot, drag/drop; jangan hanya 1 field 'Bukti'.
- Defect detail menampilkan link balik ke original case dan run serta semua retest terkait.

## Visual responsif

- 1440 px: sidebar, table utama, side detail opsional.
- 1024 px: sidebar collapsed, table dengan 7-8 kolom prioritas.
- 768 px: nav drawer, filter sheet, card list opsional.
- 375 px: forms satu kolom, sticky action bar, minimum target sentuh 44 px, bukti ditampilkan carousel/grid.

## Kriteria desain

- Tidak ada layout overflow horizontal global di layar 375px.
- Semua status memiliki label ID dan EN.
- Tidak ada teks dummy yang dianggap data produksi.
- Semua halaman memiliki error state, empty state, loading state.
