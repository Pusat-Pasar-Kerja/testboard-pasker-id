# 10 - Internationalization (ID / EN)

## Tujuan

- UI dapat ditampilkan bahasa Indonesia (`id`) dan English (`en`), termasuk form, label status, validasi, toast, filter, tooltip, export header, email template bila ada.
- Bahasa UI dipilih pengguna dari topbar/profile dan disimpan di `users.preferred_locale`; guest default Indonesia.
- Konten asli test case **tidak otomatis berubah bahasa** hanya dengan mengganti UI; jika terjemahan ada pakai `test_case_translations` dengan fallback ke `test_cases.source_locale`.

## Stack

React + `i18next` + `react-i18next`, file JSON berisi key yang sama pada `locales/id/*.json` dan `locales/en/*.json`. Jangan hardcode string Bahasa Inggris di JSX.

## Aturan

- Kode di database tetap English uppercase enum (`PASSED`, `FAILED`) agar data konsisten.
- `id` untuk locale Indonesia; `en` untuk English. Gunakan `Intl.DateTimeFormat` dan `Intl.NumberFormat`; timezone tampilan `Asia/Jakarta` (default), data API UTC.
- Bahasa URL optional `?lang=en`; preferensi user tersimpan tetap utama.
- Translation entry `test_case_translations` dikelola manual/approval; pada kasus tidak ada terjemahan tampil sumber asli dengan penanda `Original language` jika perlu.
- Gunakan pluralization dari i18next; jangan gabungkan string agar grammar kedua bahasa tetap benar.
- Error code API stabil, pesan pengguna diterjemahkan via key, backend error sanitised.

## Kode status

| Code | Indonesia | English |
|---|---|---|
| NOT_RUN | Belum Diuji | Not Tested |
| IN_PROGRESS | Sedang Diuji | In Progress |
| PASSED | Berhasil Diuji | Passed |
| FAILED | Gagal Diuji | Failed |
| BLOCKED | Terhambat | Blocked |
| SKIPPED | Dilewati | Skipped |
| OPEN | Terbuka | Open |
| FIXED | Diperbaiki | Fixed |
| READY_FOR_RETEST | Siap Diuji Ulang | Ready for Retest |
| VERIFIED | Terverifikasi | Verified |
| REOPENED | Dibuka Kembali | Reopened |
| CLOSED | Ditutup | Closed |
| WONT_FIX | Tidak Akan Diperbaiki | Won't Fix |
| DRAFT | Draf | Draft |
| READY | Siap | Ready |
| ARCHIVED | Diarsipkan | Archived |
| CRITICAL | Kritis | Critical |
| HIGH | Tinggi | High |
| MEDIUM | Sedang | Medium |
| LOW | Rendah | Low |
| INFO | Informasi | Informational |

## Contoh translation JSON (usulan)

`locales/id/common.json`

```json
{
  "app.title":"TestBoard PASKER ID",
  "navigation.dashboard":"Dasbor",
  "navigation.testCases":"Test Case",
  "navigation.testRuns":"Pelaksanaan UAT",
  "navigation.defects":"Daftar Bug",
  "actions.save":"Simpan",
  "actions.cancel":"Batal",
  "actions.upload":"Unggah Bukti",
  "test.result.PASSED":"Berhasil Diuji",
  "test.result.FAILED":"Gagal Diuji",
  "upload.processing":"File sedang diproses"
}
```

`locales/en/common.json`

```json
{
  "app.title":"TestBoard PASKER ID",
  "navigation.dashboard":"Dashboard",
  "navigation.testCases":"Test Cases",
  "navigation.testRuns":"Test Runs",
  "navigation.defects":"Bug Tracker",
  "actions.save":"Save",
  "actions.cancel":"Cancel",
  "actions.upload":"Upload Evidence",
  "test.result.PASSED":"Passed",
  "test.result.FAILED":"Failed",
  "upload.processing":"File is being processed"
}
```

## Checklist QA bilingual

- Pergantian ID/EN berlaku di semua layar tanpa mixed labels.
- Status report dan download punya header bilingual sesuai setting; kode DB unchanged.
- Teks konten UAT tetap asli jika translation belum tersedia.
- Date display lokal, input user dan export timezone jelas.
- Tidak ada layout rusak untuk label English yang lebih panjang.

Rujukan: https://react.i18next.com/getting-started
