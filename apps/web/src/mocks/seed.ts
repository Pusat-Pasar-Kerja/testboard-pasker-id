/**
 * FICTITIOUS demo data for the presentation prototype (VITE_DEMO_MODE=true).
 * Nothing here comes from real UAT workbooks: projects, people and scenarios are invented,
 * and every person is labelled "Demo". Generation is deterministic (seeded PRNG) so the
 * prototype and tests always show the same numbers.
 */
import type {
  DefectPriority,
  DefectSeverity,
  DefectSourceKind,
  DefectStatus,
  ExecutionKind,
  ExecutionStatus,
  MemberRole,
  RunStatus,
  TestCasePriority,
  TestCaseStatus,
  TestType,
} from '@testboard/shared'

export interface MockUser {
  id: string
  display_name: string
  email: string
}

export interface MockProject {
  id: string
  project_code: string
  name: string
  description: string
  bugPrefix: string
  members: { userId: string; role: MemberRole }[]
}

export interface MockModule {
  id: string
  projectId: string
  module_code: string
  name: string
}

export interface MockCase {
  id: string
  projectId: string
  moduleId: string
  suiteName: string
  case_code: string
  category: string
  title: string
  requirement_refs: string | null
  priority_code: TestCasePriority
  test_type_code: TestType
  actor_label: string
  preconditions: string
  steps: string[]
  expected_result: string
  case_status: TestCaseStatus
  current_version: number
  createdBy: string
  updatedBy: string
  created_at: string
  updated_at: string
  revisions: {
    revision_number: number
    changedBy: string
    change_reason: string
    changed_at: string
  }[]
}

export interface MockRun {
  id: string
  projectId: string
  cycleId: string
  run_code: string
  name: string
  environment_name: string
  build_version: string
  environment_url: string
  status_code: RunStatus
  starts_at: string
  ends_at: string | null
}

export interface MockCycle {
  id: string
  projectId: string
  cycle_code: string
  title: string
}

export interface MockRunCase {
  id: string
  runId: string
  caseId: string
  assignedTo: string | null
  case_version: number
  sort_order: number
}

export interface MockExecution {
  id: string
  runCaseId: string
  attempt_number: number
  execution_kind: ExecutionKind
  result_status: ExecutionStatus
  actual_result: string | null
  testerId: string
  tested_at: string
}

export interface MockDefect {
  id: string
  projectId: string
  moduleId: string | null
  bug_code: string
  title: string
  description: string
  steps_to_reproduce: string
  expected_behavior: string
  actual_behavior: string
  severity_code: DefectSeverity
  priority_code: DefectPriority
  status_code: DefectStatus
  source_kind: DefectSourceKind
  environment_name: string
  build_version: string
  browser_name: string
  fixed_in_version: string | null
  reportedBy: string
  assignedTo: string | null
  created_at: string
  updated_at: string
  executionIds: string[]
  history: {
    from: DefectStatus | null
    to: DefectStatus
    by: string
    comment: string | null
    at: string
  }[]
  comments: { id: string; authorId: string; body: string; created_at: string }[]
}

export interface MockDb {
  currentUserId: string
  users: MockUser[]
  projects: MockProject[]
  modules: MockModule[]
  cases: MockCase[]
  cycles: MockCycle[]
  runs: MockRun[]
  runCases: MockRunCase[]
  executions: MockExecution[]
  defects: MockDefect[]
}

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (date: string, hour = 9, minute = 0) =>
  `${date}T${String(hour - 7).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`

type CaseTemplate = [
  category: string,
  title: string,
  type: TestType,
  priority: TestCasePriority,
  actor: string,
  preconditions: string,
  steps: string[],
  expected: string,
]

interface ProjectBlueprint {
  code: string
  name: string
  description: string
  bugPrefix: string
  modules: { code: string; name: string; suite: string; cases: CaseTemplate[] }[]
}

const USERS: MockUser[] = [
  { id: '1', display_name: 'Demo Admin', email: 'admin@demo.invalid' },
  { id: '2', display_name: 'Demo QA Lead', email: 'qa.lead@demo.invalid' },
  { id: '3', display_name: 'Demo Penguji 1', email: 'penguji1@demo.invalid' },
  { id: '4', display_name: 'Demo Penguji 2', email: 'penguji2@demo.invalid' },
  { id: '5', display_name: 'Demo Developer', email: 'developer@demo.invalid' },
  { id: '6', display_name: 'Demo Pemantau', email: 'pemantau@demo.invalid' },
]

const MEMBERS: MockProject['members'] = [
  { userId: '1', role: 'ADMIN' },
  { userId: '2', role: 'QA_LEAD' },
  { userId: '3', role: 'TESTER' },
  { userId: '4', role: 'TESTER' },
  { userId: '5', role: 'DEVELOPER' },
  { userId: '6', role: 'VIEWER' },
]

const LOGIN_PRE = 'Akun uji (fiktif) aktif dan dapat login.'

const PROJECTS: ProjectBlueprint[] = [
  {
    code: 'DEMO-KARIR',
    name: 'Demo Portal Karier',
    description: 'Proyek contoh fiktif: portal lowongan kerja untuk presentasi TestBoard.',
    bugPrefix: 'BUG-DKR',
    modules: [
      {
        code: 'AUTH',
        name: 'Autentikasi',
        suite: 'Autentikasi Pengguna',
        cases: [
          [
            'Login',
            'Pengguna masuk dengan akun yang valid',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Buka halaman login.', 'Isi email dan kata sandi akun uji.', 'Klik tombol Masuk.'],
            'Pengguna diarahkan ke dasbor sesuai perannya.',
          ],
          [
            'Login',
            'Sistem menolak kata sandi yang salah',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            [
              'Buka halaman login.',
              'Isi email terdaftar dengan kata sandi salah.',
              'Klik tombol Masuk.',
            ],
            'Pesan galat umum tampil dan sesi tidak dibuat.',
          ],
          [
            'Login',
            'Akun nonaktif tidak dapat masuk',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Akun uji berstatus nonaktif.',
            ['Buka halaman login.', 'Isi kredensial akun nonaktif.', 'Klik tombol Masuk.'],
            'Login ditolak dengan pesan yang tidak membocorkan status akun.',
          ],
          [
            'Sesi',
            'Sesi berakhir setelah keluar',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Masuk ke aplikasi.', 'Klik Keluar.', 'Tekan tombol Back pada browser.'],
            'Halaman terproteksi tidak dapat diakses kembali tanpa login.',
          ],
          [
            'Akses',
            'Halaman admin tidak dapat dibuka pencari kerja',
            'RBAC',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Masuk sebagai pencari kerja.', 'Buka URL halaman admin secara langsung.'],
            'Sistem menampilkan halaman akses ditolak.',
          ],
          [
            'Lupa kata sandi',
            'Tautan reset kata sandi terkirim',
            'POSITIVE',
            'SHOULD_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Klik Lupa kata sandi.', 'Isi email terdaftar.', 'Kirim formulir.'],
            'Pesan konfirmasi tampil tanpa menyebut apakah email terdaftar.',
          ],
        ],
      },
      {
        code: 'LOKER',
        name: 'Lowongan Kerja',
        suite: 'Pencarian & Detail Lowongan',
        cases: [
          [
            'Pencarian',
            'Mencari lowongan dengan kata kunci',
            'POSITIVE',
            'MUST_HAVE',
            'Pengunjung',
            'Terdapat lowongan contoh berstatus tayang.',
            ['Buka halaman lowongan.', 'Ketik kata kunci posisi.', 'Tekan Enter.'],
            'Daftar lowongan yang relevan tampil beserta jumlah hasil.',
          ],
          [
            'Pencarian',
            'Filter lowongan berdasarkan lokasi',
            'POSITIVE',
            'MUST_HAVE',
            'Pengunjung',
            'Terdapat lowongan di beberapa lokasi.',
            ['Buka halaman lowongan.', 'Pilih filter lokasi.', 'Terapkan filter.'],
            'Hanya lowongan di lokasi terpilih yang tampil.',
          ],
          [
            'Pencarian',
            'Pencarian tanpa hasil menampilkan pesan kosong',
            'NEGATIVE',
            'SHOULD_HAVE',
            'Pengunjung',
            'Tidak ada lowongan dengan kata kunci uji.',
            ['Cari kata kunci acak yang tidak ada.'],
            'Pesan "tidak ada hasil" dan saran pencarian tampil.',
          ],
          [
            'Detail',
            'Detail lowongan menampilkan informasi lengkap',
            'POSITIVE',
            'MUST_HAVE',
            'Pengunjung',
            'Terdapat lowongan contoh berstatus tayang.',
            ['Buka salah satu lowongan.'],
            'Judul, perusahaan, lokasi, gaji (jika ada), dan persyaratan tampil.',
          ],
          [
            'Detail',
            'Lowongan kedaluwarsa tidak dapat dilamar',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Terdapat lowongan yang sudah lewat tanggal tutup.',
            ['Masuk sebagai pencari kerja.', 'Buka lowongan kedaluwarsa.'],
            'Tombol Lamar nonaktif dan label "Ditutup" tampil.',
          ],
          [
            'Kinerja',
            'Halaman daftar lowongan termuat di bawah 3 detik',
            'SLA',
            'SHOULD_HAVE',
            'Pengunjung',
            'Koneksi uji standar.',
            ['Buka halaman lowongan.', 'Catat waktu muat halaman.'],
            'Konten utama tampil dalam waktu kurang dari 3 detik.',
          ],
          [
            'Tampilan',
            'Daftar lowongan nyaman di layar ponsel',
            'UI_UX',
            'SHOULD_HAVE',
            'Pengunjung',
            'Perangkat atau emulator layar 375 px.',
            ['Buka halaman lowongan di ponsel.', 'Gulir daftar dan buka filter.'],
            'Tidak ada geser horizontal; tombol mudah disentuh.',
          ],
        ],
      },
      {
        code: 'PROFIL',
        name: 'Profil Pencari Kerja',
        suite: 'Profil & Dokumen',
        cases: [
          [
            'Profil',
            'Melengkapi data profil',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Buka halaman Profil.', 'Isi data wajib.', 'Klik Simpan.'],
            'Data tersimpan dan persentase kelengkapan profil bertambah.',
          ],
          [
            'Profil',
            'Validasi format nomor telepon',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            LOGIN_PRE,
            ['Buka halaman Profil.', 'Isi nomor telepon dengan huruf.', 'Klik Simpan.'],
            'Pesan galat tampil di bawah kolom nomor telepon.',
          ],
          [
            'Dokumen',
            'Mengunggah CV dalam format PDF',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Tersedia file PDF contoh di bawah 2 MB.',
            ['Buka bagian Dokumen.', 'Pilih file PDF.', 'Klik Unggah.'],
            'CV tersimpan dan dapat dipratinjau.',
          ],
          [
            'Dokumen',
            'Menolak unggahan file berformat EXE',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Tersedia file EXE contoh.',
            ['Buka bagian Dokumen.', 'Pilih file EXE.', 'Klik Unggah.'],
            'Unggahan ditolak dengan pesan format tidak didukung.',
          ],
          [
            'Integrasi',
            'Data identitas tersinkron dari layanan akun',
            'INTEGRATION',
            'SHOULD_HAVE',
            'Pencari kerja',
            'Layanan akun uji tersedia.',
            ['Masuk dengan akun uji.', 'Buka halaman Profil.'],
            'Nama dan email terisi otomatis dan bersifat baca-saja.',
          ],
          [
            'Privasi',
            'Profil tidak terlihat oleh pengguna lain tanpa izin',
            'RBAC',
            'MUST_HAVE',
            'Pencari kerja',
            'Dua akun pencari kerja uji.',
            ['Masuk sebagai akun A.', 'Buka URL profil akun B.'],
            'Akses ditolak; data akun B tidak tampil.',
          ],
        ],
      },
      {
        code: 'LAMAR',
        name: 'Lamaran',
        suite: 'Proses Lamaran',
        cases: [
          [
            'Lamaran',
            'Melamar lowongan dengan profil lengkap',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Profil lengkap dan CV tersedia.',
            ['Buka lowongan tayang.', 'Klik Lamar.', 'Konfirmasi lamaran.'],
            'Lamaran tercatat dan status "Terkirim" tampil.',
          ],
          [
            'Lamaran',
            'Melamar dua kali ke lowongan yang sama ditolak',
            'NEGATIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Sudah melamar lowongan uji.',
            ['Buka lowongan yang sudah dilamar.', 'Klik Lamar lagi.'],
            'Sistem menolak dan menampilkan status lamaran sebelumnya.',
          ],
          [
            'Lamaran',
            'Profil belum lengkap diminta melengkapi data',
            'NEGATIVE',
            'SHOULD_HAVE',
            'Pencari kerja',
            'Profil belum lengkap.',
            ['Buka lowongan tayang.', 'Klik Lamar.'],
            'Pengguna diarahkan ke bagian profil yang belum lengkap.',
          ],
          [
            'Riwayat',
            'Riwayat lamaran menampilkan status terbaru',
            'POSITIVE',
            'MUST_HAVE',
            'Pencari kerja',
            'Terdapat beberapa lamaran uji.',
            ['Buka menu Riwayat Lamaran.'],
            'Setiap lamaran tampil dengan status dan tanggal terbaru.',
          ],
          [
            'Notifikasi',
            'Notifikasi saat status lamaran berubah',
            'INTEGRATION',
            'COULD_HAVE',
            'Pencari kerja',
            'Pemberi kerja uji mengubah status lamaran.',
            ['Ubah status lamaran dari sisi pemberi kerja.', 'Periksa notifikasi pelamar.'],
            'Notifikasi in-app diterima dengan status baru.',
          ],
        ],
      },
      {
        code: 'ADM',
        name: 'Konsol Admin',
        suite: 'Verifikasi Lowongan',
        cases: [
          [
            'Verifikasi',
            'Admin menyetujui lowongan baru',
            'POSITIVE',
            'MUST_HAVE',
            'Admin verifikator',
            'Terdapat lowongan menunggu verifikasi.',
            ['Masuk sebagai admin.', 'Buka antrean verifikasi.', 'Setujui lowongan.'],
            'Lowongan berubah menjadi tayang dan tercatat di log audit.',
          ],
          [
            'Verifikasi',
            'Admin menolak lowongan dengan alasan wajib',
            'NEGATIVE',
            'MUST_HAVE',
            'Admin verifikator',
            'Terdapat lowongan menunggu verifikasi.',
            ['Buka lowongan di antrean.', 'Klik Tolak tanpa mengisi alasan.'],
            'Penolakan tidak dapat disimpan sebelum alasan diisi.',
          ],
          [
            'Akses',
            'Admin wilayah hanya melihat antrean wilayahnya',
            'RBAC',
            'MUST_HAVE',
            'Admin wilayah',
            'Lowongan dari beberapa wilayah tersedia.',
            ['Masuk sebagai admin wilayah A.', 'Buka antrean verifikasi.'],
            'Hanya lowongan wilayah A yang tampil.',
          ],
          [
            'SLA',
            'Lowongan melewati batas waktu ditandai terlambat',
            'SLA',
            'SHOULD_HAVE',
            'Admin verifikator',
            'Lowongan menunggu lebih dari 2 hari kerja.',
            ['Buka antrean verifikasi.'],
            'Lowongan diberi penanda terlambat dan berada di urutan atas.',
          ],
          [
            'Laporan',
            'Ekspor rekap verifikasi ke CSV',
            'POSITIVE',
            'COULD_HAVE',
            'Admin pusat',
            'Terdapat data verifikasi bulan berjalan.',
            ['Buka menu Laporan.', 'Pilih periode.', 'Klik Ekspor CSV.'],
            'File CSV terunduh dengan kolom sesuai tampilan.',
          ],
        ],
      },
    ],
  },
  {
    code: 'DEMO-LATIH',
    name: 'Demo Portal Pelatihan',
    description: 'Proyek contoh fiktif: pendaftaran pelatihan daring.',
    bugPrefix: 'BUG-DLT',
    modules: [
      {
        code: 'KATALOG',
        name: 'Katalog Pelatihan',
        suite: 'Katalog',
        cases: [
          [
            'Katalog',
            'Menampilkan daftar pelatihan aktif',
            'POSITIVE',
            'MUST_HAVE',
            'Pengunjung',
            'Terdapat pelatihan aktif.',
            ['Buka halaman katalog.'],
            'Pelatihan aktif tampil dengan jadwal dan kuota.',
          ],
          [
            'Katalog',
            'Filter pelatihan berdasarkan kategori',
            'POSITIVE',
            'SHOULD_HAVE',
            'Pengunjung',
            'Pelatihan di beberapa kategori.',
            ['Pilih kategori.', 'Terapkan filter.'],
            'Hanya pelatihan pada kategori terpilih yang tampil.',
          ],
          [
            'Katalog',
            'Pelatihan penuh menampilkan status kuota habis',
            'NEGATIVE',
            'MUST_HAVE',
            'Peserta',
            'Pelatihan dengan kuota penuh.',
            ['Buka detail pelatihan penuh.'],
            'Tombol Daftar nonaktif dan label "Kuota penuh" tampil.',
          ],
        ],
      },
      {
        code: 'DAFTAR',
        name: 'Pendaftaran',
        suite: 'Pendaftaran Peserta',
        cases: [
          [
            'Pendaftaran',
            'Peserta mendaftar pelatihan',
            'POSITIVE',
            'MUST_HAVE',
            'Peserta',
            LOGIN_PRE,
            ['Buka pelatihan.', 'Klik Daftar.', 'Konfirmasi.'],
            'Pendaftaran tercatat dan bukti daftar dapat diunduh.',
          ],
          [
            'Pendaftaran',
            'Mendaftar dua pelatihan di jadwal yang sama ditolak',
            'NEGATIVE',
            'MUST_HAVE',
            'Peserta',
            'Sudah terdaftar pada pelatihan dengan jadwal bentrok.',
            ['Daftar pada pelatihan kedua.'],
            'Sistem menolak dan menjelaskan bentrok jadwal.',
          ],
          [
            'Pendaftaran',
            'Pembatalan pendaftaran sebelum batas waktu',
            'POSITIVE',
            'SHOULD_HAVE',
            'Peserta',
            'Terdaftar pada pelatihan uji.',
            ['Buka Pelatihan Saya.', 'Klik Batalkan.'],
            'Status berubah menjadi dibatalkan dan kuota kembali.',
          ],
          [
            'Akses',
            'Instruktur tidak dapat mengubah data peserta',
            'RBAC',
            'MUST_HAVE',
            'Instruktur',
            'Akun instruktur uji.',
            ['Masuk sebagai instruktur.', 'Buka data peserta.'],
            'Data peserta hanya dapat dibaca.',
          ],
        ],
      },
      {
        code: 'SERT',
        name: 'Sertifikat',
        suite: 'Penerbitan Sertifikat',
        cases: [
          [
            'Sertifikat',
            'Sertifikat terbit setelah lulus',
            'POSITIVE',
            'MUST_HAVE',
            'Peserta',
            'Peserta menyelesaikan seluruh modul.',
            ['Buka Pelatihan Saya.', 'Klik Unduh Sertifikat.'],
            'Sertifikat PDF terunduh dengan nama dan nomor unik.',
          ],
          [
            'Sertifikat',
            'Sertifikat tidak tersedia sebelum lulus',
            'NEGATIVE',
            'MUST_HAVE',
            'Peserta',
            'Peserta belum menyelesaikan modul.',
            ['Buka Pelatihan Saya.'],
            'Tombol Unduh Sertifikat tidak tersedia.',
          ],
          [
            'Verifikasi',
            'Verifikasi keaslian sertifikat lewat kode',
            'INTEGRATION',
            'SHOULD_HAVE',
            'Pengunjung',
            'Kode sertifikat uji tersedia.',
            ['Buka halaman verifikasi.', 'Masukkan kode sertifikat.'],
            'Data sertifikat yang valid tampil.',
          ],
        ],
      },
    ],
  },
]

const FAIL_NOTES = [
  'Tombol Simpan tidak merespons setelah formulir diisi lengkap.',
  'Pesan galat tampil dalam bahasa Inggris, seharusnya bahasa Indonesia.',
  'Halaman memuat lebih dari 8 detik pada koneksi uji.',
  'Data yang sudah disimpan hilang setelah halaman dimuat ulang.',
  'Tata letak bergeser dan tombol terpotong di layar 375 px.',
  'Pengguna lain dapat melihat data yang seharusnya privat.',
]

const BLOCK_NOTES = [
  'Data uji belum tersedia di lingkungan staging.',
  'Layanan integrasi pihak ketiga tidak dapat diakses saat pengujian.',
]

const SEVERITY_CYCLE: DefectSeverity[] = ['HIGH', 'MEDIUM', 'CRITICAL', 'LOW', 'MEDIUM', 'HIGH']
const PRIORITY_FOR: Record<DefectSeverity, DefectPriority> = {
  CRITICAL: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'LOW',
}

export function createMockDb(seed = 20261120): MockDb {
  const random = createRandom(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
  let nextId = 100
  const id = () => String(nextId++)

  const db: MockDb = {
    currentUserId: '1',
    users: USERS,
    projects: [],
    modules: [],
    cases: [],
    cycles: [],
    runs: [],
    runCases: [],
    executions: [],
    defects: [],
  }

  PROJECTS.forEach((blueprint, projectIndex) => {
    const project: MockProject = {
      id: String(projectIndex + 1),
      project_code: blueprint.code,
      name: blueprint.name,
      description: blueprint.description,
      bugPrefix: blueprint.bugPrefix,
      members: MEMBERS,
    }
    db.projects.push(project)
    const isMain = projectIndex === 0

    // Library -------------------------------------------------------------------------
    const projectCases: MockCase[] = []
    blueprint.modules.forEach((mod) => {
      const moduleRow: MockModule = {
        id: id(),
        projectId: project.id,
        module_code: mod.code,
        name: mod.name,
      }
      db.modules.push(moduleRow)
      mod.cases.forEach((template, index) => {
        const [category, title, type, priority, actor, pre, steps, expected] = template
        const version = random() < 0.25 ? 2 : 1
        const day = 1 + Math.floor(random() * 9)
        const created = iso(`2026-10-0${day}`, 10)
        const testCase: MockCase = {
          id: id(),
          projectId: project.id,
          moduleId: moduleRow.id,
          suiteName: mod.suite,
          case_code: `UAT-${mod.code}-${String(index + 1).padStart(3, '0')}`,
          category,
          title,
          requirement_refs:
            random() < 0.6 ? `FSD-${mod.code}-${String(index + 1).padStart(2, '0')}` : null,
          priority_code: priority,
          test_type_code: type,
          actor_label: actor,
          preconditions: pre,
          steps,
          expected_result: expected,
          case_status: 'READY',
          current_version: version,
          createdBy: '2',
          updatedBy: '2',
          created_at: created,
          updated_at: version > 1 ? iso('2026-11-03', 14, 20) : created,
          revisions:
            version > 1
              ? [
                  {
                    revision_number: 1,
                    changedBy: '2',
                    change_reason: 'Versi awal',
                    changed_at: created,
                  },
                  {
                    revision_number: 2,
                    changedBy: '2',
                    change_reason: 'Hasil yang diharapkan diperjelas setelah review UAT',
                    changed_at: iso('2026-11-03', 14, 20),
                  },
                ]
              : [],
        }
        projectCases.push(testCase)
      })
    })
    // A couple of cases still in draft and one archived, to show lifecycle states.
    const draft = projectCases.at(-1)
    if (draft) draft.case_status = 'DRAFT'
    const archived = projectCases.at(-4)
    if (isMain && archived) archived.case_status = 'ARCHIVED'
    db.cases.push(...projectCases)
    const readyCases = projectCases.filter((c) => c.case_status === 'READY')

    // Planning -----------------------------------------------------------------------
    const cycle: MockCycle = {
      id: id(),
      projectId: project.id,
      cycle_code: 'SIKLUS-1-2026',
      title: 'Siklus UAT 1 - 2026',
    }
    db.cycles.push(cycle)

    const runPlans: {
      code: string
      name: string
      status: RunStatus
      start: string
      end: string | null
      build: string
      executedShare: number
      days: string[]
    }[] = isMain
      ? [
          {
            code: 'RUN-S1-20261012',
            name: 'UAT Sprint 1',
            status: 'COMPLETED',
            start: '2026-10-12',
            end: '2026-10-16',
            build: '1.0.0-rc.1',
            executedShare: 1,
            days: ['2026-10-12', '2026-10-13', '2026-10-14'],
          },
          {
            code: 'RUN-S2-20261109',
            name: 'UAT Sprint 2',
            status: 'ACTIVE',
            start: '2026-11-09',
            end: null,
            build: '1.1.0-rc.2',
            executedShare: 0.6,
            days: ['2026-11-10', '2026-11-11', '2026-11-12'],
          },
          {
            code: 'RUN-REG-20261130',
            name: 'Regresi Rilis 1.1',
            status: 'PLANNED',
            start: '2026-11-30',
            end: null,
            build: '1.1.0',
            executedShare: 0,
            days: [],
          },
        ]
      : [
          {
            code: 'RUN-S1-20261102',
            name: 'UAT Pendaftaran',
            status: 'ACTIVE',
            start: '2026-11-02',
            end: null,
            build: '0.9.0',
            executedShare: 0.75,
            days: ['2026-11-03', '2026-11-04'],
          },
        ]

    const failedExecutions: {
      exec: MockExecution
      testCase: MockCase
      run: MockRun
      retestPassed: boolean | null
    }[] = []

    runPlans.forEach((plan) => {
      const run: MockRun = {
        id: id(),
        projectId: project.id,
        cycleId: cycle.id,
        run_code: plan.code,
        name: plan.name,
        environment_name: 'STAGING',
        build_version: plan.build,
        environment_url: 'https://staging.demo.invalid',
        status_code: plan.status,
        starts_at: iso(plan.start, 8),
        ends_at: plan.end ? iso(plan.end, 17) : null,
      }
      db.runs.push(run)

      readyCases.forEach((testCase, order) => {
        const tester = order % 2 === 0 ? '3' : '4'
        const runCase: MockRunCase = {
          id: id(),
          runId: run.id,
          caseId: testCase.id,
          assignedTo: plan.status === 'PLANNED' && order % 3 === 0 ? null : tester,
          case_version: plan.status === 'COMPLETED' ? 1 : testCase.current_version,
          sort_order: order + 1,
        }
        db.runCases.push(runCase)
        if (random() >= plan.executedShare || plan.days.length === 0) return

        const roll = random()
        const first: ExecutionStatus =
          roll < 0.68 ? 'PASSED' : roll < 0.86 ? 'FAILED' : roll < 0.95 ? 'BLOCKED' : 'SKIPPED'
        const day = pick(plan.days)
        const exec: MockExecution = {
          id: id(),
          runCaseId: runCase.id,
          attempt_number: 1,
          execution_kind: 'INITIAL',
          result_status: first,
          actual_result:
            first === 'FAILED'
              ? pick(FAIL_NOTES)
              : first === 'BLOCKED'
                ? pick(BLOCK_NOTES)
                : first === 'SKIPPED'
                  ? 'Dilewati: fitur ditunda ke rilis berikutnya.'
                  : 'Sesuai hasil yang diharapkan.',
          testerId: tester,
          tested_at: iso(day, 9 + Math.floor(random() * 7), Math.floor(random() * 60)),
        }
        db.executions.push(exec)

        if (first === 'FAILED') {
          // Completed runs always retested; active runs retest about half of the failures.
          const retest = plan.status === 'COMPLETED' || random() < 0.5
          let retestPassed: boolean | null = null
          if (retest) {
            retestPassed = random() < 0.7
            db.executions.push({
              id: id(),
              runCaseId: runCase.id,
              attempt_number: 2,
              execution_kind: 'RETEST',
              result_status: retestPassed ? 'PASSED' : 'FAILED',
              actual_result: retestPassed
                ? 'Perbaikan terverifikasi; sesuai hasil yang diharapkan.'
                : 'Masih terjadi setelah perbaikan.',
              testerId: tester,
              tested_at: iso(plan.end ?? '2026-11-13', 10 + Math.floor(random() * 6)),
            })
          }
          failedExecutions.push({ exec, testCase, run, retestPassed })
        }
      })
    })

    // Defects ------------------------------------------------------------------------
    let bugNumber = 1
    const nextBugCode = () => `${project.bugPrefix}-${String(bugNumber++).padStart(4, '0')}`
    failedExecutions.forEach(({ exec, testCase, run, retestPassed }, index) => {
      const severity = SEVERITY_CYCLE[index % SEVERITY_CYCLE.length] as DefectSeverity
      const created = exec.tested_at
      const history: MockDefect['history'] = [
        { from: null, to: 'OPEN', by: exec.testerId, comment: null, at: created },
      ]
      let status = 'OPEN' as DefectStatus
      const push = (to: DefectStatus, by: string, at: string, comment: string | null = null) => {
        history.push({ from: status, to, by, comment, at })
        status = to
      }
      const later = (hours: number) =>
        new Date(new Date(created).getTime() + hours * 3_600_000).toISOString()
      if (retestPassed === true) {
        push('IN_PROGRESS', '5', later(3))
        push('FIXED', '5', later(20), 'Perbaikan dirilis ke staging.')
        push('READY_FOR_RETEST', '2', later(22))
        push('VERIFIED', exec.testerId, later(30), 'Retest lulus.')
        if (run.status_code === 'COMPLETED') push('CLOSED', '2', later(40))
      } else if (retestPassed === false) {
        push('IN_PROGRESS', '5', later(3))
        push('FIXED', '5', later(20))
        push('READY_FOR_RETEST', '2', later(22))
        push('REOPENED', exec.testerId, later(30), 'Retest masih gagal.')
      } else {
        const stage = index % 3
        if (stage >= 1) push('IN_PROGRESS', '5', later(4))
        if (stage >= 2) push('FIXED', '5', later(26), 'Menunggu deploy ke staging.')
      }
      const last = history.at(-1)
      db.defects.push({
        id: id(),
        projectId: project.id,
        moduleId: testCase.moduleId,
        bug_code: nextBugCode(),
        title: `${testCase.title}: ${(exec.actual_result ?? '').replace(/\.$/, '').toLowerCase()}`,
        description: `Ditemukan saat ${run.name} pada test case ${testCase.case_code}.`,
        steps_to_reproduce: testCase.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        expected_behavior: testCase.expected_result,
        actual_behavior: exec.actual_result ?? '',
        severity_code: severity,
        priority_code: PRIORITY_FOR[severity],
        status_code: status,
        source_kind: 'UAT',
        environment_name: run.environment_name,
        build_version: run.build_version,
        browser_name: index % 2 === 0 ? 'Chrome' : 'Firefox',
        fixed_in_version: status === 'VERIFIED' || status === 'CLOSED' ? run.build_version : null,
        reportedBy: exec.testerId,
        assignedTo: '5',
        created_at: created,
        updated_at: last?.at ?? created,
        executionIds: [
          exec.id,
          ...db.executions
            .filter((e) => e.runCaseId === exec.runCaseId && e.attempt_number > 1)
            .map((e) => e.id),
        ],
        history,
        comments: [
          {
            id: id(),
            authorId: '5',
            body: 'Sudah direproduksi di staging, sedang dianalisis.',
            created_at: later(2),
          },
          ...(retestPassed === false
            ? [
                {
                  id: id(),
                  authorId: exec.testerId,
                  body: 'Masih terjadi pada build terbaru, bukti terlampir di eksekusi retest.',
                  created_at: later(30),
                },
              ]
            : []),
        ],
      })
    })

    // Standalone bugs reported after UAT (no execution link).
    const standalone: [string, DefectSeverity, DefectStatus][] = isMain
      ? [
          ['Notifikasi email lamaran terkirim dua kali', 'MEDIUM', 'OPEN'],
          ['Ejaan label "Lowongan" salah pada menu ponsel', 'INFO', 'WONT_FIX'],
        ]
      : [['Tautan sertifikat di email kedaluwarsa terlalu cepat', 'LOW', 'IN_PROGRESS']]
    standalone.forEach(([title, severity, finalStatus], index) => {
      const created = iso('2026-11-14', 11 + index)
      const history: MockDefect['history'] = [
        {
          from: null,
          to: 'OPEN',
          by: '6',
          comment: 'Dilaporkan pengguna melalui kanal aduan.',
          at: created,
        },
      ]
      if (finalStatus !== 'OPEN') {
        history.push({
          from: 'OPEN',
          to: finalStatus,
          by: '2',
          comment: finalStatus === 'WONT_FIX' ? 'Akan diganti pada redesain menu.' : null,
          at: iso('2026-11-15', 9),
        })
      }
      db.defects.push({
        id: id(),
        projectId: project.id,
        moduleId: null,
        bug_code: nextBugCode(),
        title,
        description: 'Laporan pengguna setelah UAT (contoh fiktif).',
        steps_to_reproduce: '1. Ikuti langkah pada laporan pengguna.',
        expected_behavior: 'Sistem berjalan sesuai spesifikasi.',
        actual_behavior: title,
        severity_code: severity,
        priority_code: PRIORITY_FOR[severity],
        status_code: finalStatus,
        source_kind: 'USER_REPORT',
        environment_name: 'PRODUCTION',
        build_version: '1.0.0',
        browser_name: 'Chrome',
        fixed_in_version: null,
        reportedBy: '6',
        assignedTo: finalStatus === 'OPEN' ? null : '5',
        created_at: created,
        updated_at: history.at(-1)?.at ?? created,
        executionIds: [],
        history,
        comments: [],
      })
    })
  })

  return db
}
