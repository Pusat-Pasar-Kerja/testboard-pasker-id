# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [SemVer](https://semver.org/lang/id/). Setiap entri sesuai dengan satu tag Git.

## [1.1.0] - 2026-11-24

Penelusuran UX per peran (Admin, Pengguna UAT, peserta meja, pengunjung publik), lalu perbaikan yang paling terasa. Tanpa migration.

### Diubah

- **Pengguna UAT langsung ke "Tugas saya"** setelah masuk, dan saat menekan logo: skenario yang menunggu mereka, dengan tombol Lanjutkan. Admin dan Super Admin tetap ke Proyek, kartu meja tetap ke Mode Mudah.
- **Daftar menyesuaikan ruang yang tersedia**, bukan ukuran layar. Di samping panel kiri, laptop menampilkan daftar sebagai kartu yang mudah dibaca (judul utuh), bukan tabel yang terjepit. Kolom tambahan muncul saat ruangnya cukup. Berlaku untuk semua daftar: masalah, skenario, UAT, dan lainnya.
- **Bug Reporting lebih tenang**: yang tampil hanya pencarian dan tombol status. Status lengkap, Tingkat dampak, Prioritas, Penugasan, dan Fase pindah ke "Saring lebih lanjut", yang terbuka sendiri bila salah satunya sedang dipakai.
- **Tanda per langkah lebih jelas**: lima tombol sama lebar dalam satu baris, dengan keterangan arti ikonnya di atas ("Tandai tiap langkah (tidak wajib): Sesuai, Tidak sesuai, Tidak bisa dicoba, Dilewati").
- **Nama folder fitur tidak terpotong** lagi di halaman Fase (boleh dua baris). Nama proyek di panel kiri tampil lengkap saat disorot.

## [1.0.0] - 2026-11-24

**Versi 1.** Ditetapkan oleh pemilik: TestBoard PASKER ID sudah live di `paskerid.kemnaker.go.id/testboard` dan dipakai untuk UAT bersama. Isi versi 1, singkatnya:

- proyek tersusun seperti Google Drive (Fase › Fitur › Skenario);
- UAT dengan peserta, kelompok bernomor meja, dan penugasan per fitur;
- Mode Mudah lewat kartu meja (QR);
- Bug Reporting dengan laporan masyarakat yang ditinjau dulu;
- halaman publik dengan saklar ON/OFF;
- laporan untuk pimpinan;
- tiga jenis pengguna (Super Admin, Admin, Pengguna);
- Aksesibilitas (bahasa ID/EN, ukuran teks, tema);
- pratinjau tautan.

### Diubah

- **Kaki halaman ramping**: satu baris putih seperti kepala halaman (© Pusat Pasar Kerja · Kementerian Ketenagakerjaan, lalu Panduan · Beranda publik · nomor versi). Di aplikasi ia menutup kolom halaman tepat di samping panel kiri, sehingga panel, kepala, dan kaki membingkai area kerja. Isinya sejajar dengan kepala halaman di semua halaman.
- **Panduan menjadi halaman baca**: tanpa panel kerja di sampingnya, satu kolom di tengah, dengan kartu "Mulai dari peran Anda" (Peserta di meja, Pengguna UAT, Admin, Super Admin), daftar isi berbentuk tombol, dan tombol "Ke daftar isi" saat halaman digulir.
- **"Buka TestBoard" dan "Kembali ke meja"** di Panduan dan halaman publik kini kembali ke halaman yang terakhir dikerjakan, bukan ke halaman awal.
- Kepala halaman publik tidak lagi sempat menampilkan "Masuk" kepada orang yang sudah masuk.
- Nomor versi tampil di kaki halaman.
- Mulai versi 1: patch untuk perbaikan, minor untuk fitur baru, major untuk perubahan yang tidak cocok dengan versi sebelumnya (ADR 0001).

## [0.25.0] - 2026-11-24

Tautan TestBoard yang dibagikan (WhatsApp, Telegram, Facebook, LinkedIn, X) sekarang tampil dengan gambar dan keterangan. Tanpa migration.

### Ditambahkan

- **Pratinjau tautan** di setiap halaman: judul, deskripsi singkat, dan gambar 1200 × 630 bergaya TestBoard (logo, "Uji layanan bersama pengguna sebelum dipakai masyarakat", Pusat Pasar Kerja · Kementerian Ketenagakerjaan). Juga ikon untuk layar utama ponsel.
- `npm run brand:share-image` membuat ulang gambar itu dari logo dan font Inter.
- Uji setelah deploy (`ops/testboard.sh smoke`) kini juga memeriksa kartu pratinjau, gambarnya, dan pengalihan ke https.

### Diperbaiki

- **`/testboard` tanpa garis miring di akhir** dulu dialihkan lewat `http://` sebelum sampai ke `https://`, dan ponsel yang membuat pratinjau WhatsApp berhenti di situ. Sekarang langsung ke `https://.../testboard/` dalam satu langkah.

## [0.24.1] - 2026-11-24

### Diubah

- **Ikon Aksesibilitas** di kepala halaman sekarang simbol akses universal: sosok manusia dengan tangan terbuka di dalam lingkaran, menggantikan ikon kursi roda. Bentuknya senada dengan ikon Bantuan di sebelahnya.

## [0.24.0] - 2026-11-24

Masukan pemilik di Beranda proyek: kepala halaman satu baris, bahasa masuk Aksesibilitas, kepala dan kaki halaman sama di semua halaman. Tanpa migration.

### Diubah

- **Kepala halaman selalu satu baris**, juga di layar laptop, tablet, dan ponsel. Susunannya bercermin: logo │ proyek dan pencarian … ikon Aksesibilitas, Bantuan, Administrasi │ akun. Tombol berupa ikon bulat yang tenang dengan label kecil saat disorot; nama dan peran akun pindah ke dalam menu akun (inisial saja di kepala).
- Di aplikasi, logo berada di atas panel kiri (garisnya menyambung), dan pemilih proyek sejajar dengan judul halaman.
- **Pilihan bahasa ID/EN pindah ke Aksesibilitas** (paling atas, "Bahasa · Language"), tidak lagi sebagai tombol terpisah di kepala, kaki, atau menu ponsel.
- **Satu kaki halaman untuk semua halaman** (publik, aplikasi, layar meja): navy Kemnaker, rata tengah, berisi logo, tautan Beranda publik · Panduan, dan nama Pusat Pasar Kerja · Kemnaker.
- Layar meja (Mode Mudah) memakai kepala yang sama: logo, nama kelompok dan UAT, ikon Aksesibilitas dan Bantuan, lalu tombol Keluar.
- Panel kiri: judul "4. Pengaturan" yang tertinggal diganti **"Kelola proyek"**, dan "Fitur & kelompok" menjadi **"Pengaturan proyek"** (agar tidak tertukar dengan Kelompok di UAT).

## [0.23.0] - 2026-11-24

Masukan pemilik setelah v0.22.0 live: penugasan fitur, pindah folder fitur yang mudah, dan tampilan simetris (ADR 0020, migration `0016`).

### Ditambahkan

- **Penugasan per fitur di UAT**: setiap kartu fitur di tab Fitur punya daftar "Ditugaskan ke" berisi kelompok (dengan nomor meja) dan pengguna, plus pilihan "+ Tugaskan kelompok atau pengguna". Satu fitur boleh dipegang beberapa kelompok dan beberapa pengguna; Admin bebas menambah dan mengurangi.
- **Hanya yang tercantum mengerjakan fitur itu**: peserta hanya bisa mencatat hasil skenario fitur yang ditugaskan ke kelompoknya atau ke dirinya. "UAT saya", daftar skenario UAT, dan "Tugas saya" hanya menampilkan fitur miliknya.
- **Salin / Pindahkan folder fitur utuh ke Fase lain**, beserta semua skenarionya: lewat tombol di tiap folder, centang beberapa folder sekaligus, atau **seret folder ke folder Fase di panel kiri** seperti di Google Drive.
- Aksi massal skenario punya tombol **"Salin ke Fase…"** dan **"Pindahkan ke Fase…"** dengan pemilih Fase berbentuk kartu.

### Diubah

- **Panel kiri simetris**: Fase, fitur, dan UAT memakai bentuk baris yang sama; anak menjorok rapi di bawah induknya, ikon sama besar, tombol lipat dan titik status sejajar di kanan. Ikon UAT diganti labu ukur yang simetris; panel sedikit lebih lebar agar nama tidak terpotong.
- Kepala halaman UAT lebih ringkas: "Layar besar" dan "Halaman publik" pindah ke tab Ringkasan.
- Data lama aman: peserta yang belum masuk kelompok otomatis ditugaskan ke semua fitur UAT-nya (seperti sebelumnya) dan bisa dikurangi Admin.

## [0.22.0] - 2026-11-24

Perombakan tahap 9 (wawancara pemilik setelah v0.21.0): proyek disusun **seperti Google Drive**, dengan UAT dan Bug Reporting yang saling terhubung (ADR 0019, migration `0015`).

### Ditambahkan

- **Fase › Fitur › Skenario seperti folder Google Drive.** Panel kiri proyek berisi Ringkasan, folder Fase yang bisa dibuka sampai folder Fitur, daftar UAT, Bug Reporting, lalu menu Kelola. Skenario yang belum punya Fase dikumpulkan di "Belum masuk Fase", jadi tidak ada yang hilang.
- **Salin ke Fase / Pindahkan ke Fase** untuk skenario yang dicentang, seperti di Drive. Salinan membawa foto layarnya dan tetap Siap.
- **UAT** sebagai bagian tersendiri: buat UAT dari sebuah Fase dalam tiga langkah (pilih Fase, pilih fitur, beri nama). Skenario Siap dari fitur itu masuk otomatis, termasuk yang ditandai Siap belakangan. Satu Fase boleh punya UAT 1, UAT 2, dan seterusnya.
- Halaman UAT dengan tab **Ringkasan, Peserta, Kelompok & meja, Fitur, Masalah masuk, Tampilan publik**, langkah persiapan yang tercoret otomatis, serta tombol Mulai / Selesaikan / Buka lagi / Kunci hasil (selalu dengan konfirmasi).
- **Peserta UAT**: tambahkan banyak orang sekaligus (nama, e-mail bila ada), pindahkan antarkelompok, kirim tautan aktivasi, keluarkan dari UAT. Orang yang sama tidak pernah tercatat dua kali.
- **Nomor meja** untuk setiap kelompok, tercetak besar di kartu dan lembar cetak, serta tampil di papan, Mode Mudah, dan "Tugas saya".
- **UAT saya** untuk Pengguna: hanya UAT yang ia ikuti, lengkap dengan kelompok dan nomor mejanya.
- **Bug Reporting** per proyek dengan tab Daftar masalah, Laporan publik, dan Tampilan publik, serta **saklar ON/OFF publik** sendiri.
- **Formulir lapor untuk masyarakat** (setelah go-live), dengan saklarnya sendiri. Setiap laporan menunggu tinjauan Admin sebelum tampil; Admin bisa menandai ditinjau, menggabungkan dengan masalah yang sama, atau membuangnya. Dilindungi jebakan robot dan batas jumlah laporan per perangkat.
- Halaman publik baru: **halaman UAT** dan **halaman masalah proyek** (dengan saringan fitur dan formulir lapor). Halaman depan publik menampilkan UAT yang dibuka dan Bug Reporting yang publik beserta jumlahnya.
- Filter tombol (chip) yang lebih mudah, mis. status skenario dan status UAT.

### Diubah

- **Hanya tiga jenis orang**: Super Admin, Admin, dan Pengguna. Developer dan Pemantau menjadi Pengguna. Pengguna tidak lagi membuka pustaka skenario; ia bekerja di dalam UAT yang ia ikuti.
- Istilah di seluruh aplikasi: "Lembar uji" menjadi **UAT**, "Fase uji" menjadi **Fase**, "Meja workshop" menjadi **Kelompok** dengan nomor meja.
- Tampilan publik dipisah: data UAT di UAT, data masalah di Bug Reporting.
- Panduan, Bantuan per halaman, kartu "Mulai di sini", dan tur singkat mengikuti alur baru.
- Alamat lama tetap bekerja: menu Fase uji, Lembar uji, dan Workshop diarahkan ke halaman barunya; tautan publik lama `/publik/<fase>` membuka UAT publik Fase tersebut.

## [0.21.0] - 2026-11-24

Perombakan tahap 8 (masukan pemilik setelah v0.20.0): satu tampilan untuk seluruh situs, logo baru, dan paket aksesibilitas.

### Ditambahkan

- **Paket Aksesibilitas** di bilah atas setiap halaman (publik, aplikasi, dan layar meja): ukuran teks 5 tingkat; tema Terang, Gelap, Kontras tinggi, atau Ikuti perangkat; jarak baca lebih lega; huruf mudah dibaca (Atkinson Hyperlegible, dibundel di situs); garis bawah tautan; dan kurangi gerakan. Pilihan disimpan di perangkat dan langsung berlaku saat halaman dibuka, tanpa kedip putih.

### Diubah

- **Logo dan favicon baru "Siklus uji"**: satu busur tebal dan satu titik toska, mengikuti keluarga logo hub Kemnaker (Karirhub, Maganghub, Skillhub), tanpa centang.
- **Satu bilah atas untuk seluruh situs**: halaman publik, aplikasi, dan layar meja memakai bilah atas yang sama (logo, garis biru-toska, aksesibilitas, bahasa, akun).
- **Panel kiri tidak dicampur lagi** (seperti Google Drive): di dalam proyek hanya isi proyek, di halaman Administrasi hanya menu Administrasi, dan di luar proyek daftar proyek. Bantuan dan Administrasi pindah ke bilah atas; panduan lengkap, tur singkat, dan halaman publik ada di panel Bantuan.
- Tombol A−/A/A+ diganti paket Aksesibilitas; ukuran huruf yang sudah dipilih tetap terbawa.

### Diperbaiki

- Panel **Bantuan** di halaman Administrasi dan halaman aplikasi lain tampil terpotong di bilah atas. Sekarang terbuka penuh di sisi kanan.
- Pengguna yang bukan Admin tidak lagi melihat menu Administrasi bila membuka alamat `/admin`.

## [0.20.0] - 2026-11-24

Perombakan tahap 7: **sisa temuan audit** diselesaikan (`docs/audit/2026-11-24-audit-menyeluruh.md`).

### Ditambahkan

- **Cari di proyek ini**: satu pencarian untuk skenario uji, masalah, dan lembar uji sekaligus. Kotak cari ada di atas pada layar lebar; di layar lebih kecil dan HP lewat tombol bergambar kaca pembesar.
- **Ringkasan semua fase yang dibuka** di halaman depan publik: fase dibuka, skenario sudah dicoba, hasil sesuai, dan masalah dilaporkan. Hanya bagian yang memang ditampilkan tiap fase yang ikut dihitung.

### Diubah

- **Log aktivitas** memakai kata biasa. Setiap baris menyebut nama atau kode datanya (mis. "Masalah BUG-KAR-0012 · Login gagal"), nama kolom menjadi label (mis. "Tingkat dampak"), kode menjadi kata (mis. "Sedang diperbaiki"), nomor ID menjadi nama, dan perubahan status tampil langsung di barisnya. Baris masuk dan aktivasi menyebut orangnya, bukan "Sistem".
- Mengubah **status fitur di Mode Workshop** meminta konfirmasi dulu, dengan penjelasan akibatnya di halaman publik. Pilihan "Sembunyikan" menjadi "Disembunyikan".
- **Layar besar** memakai warna keluarga Kemnaker: latar navy, cincin kemajuan biru ke toska, dan warna hasil yang sama dengan situs.
- Layar meja: daftar "Mungkin sudah dilaporkan" tidak lagi menampilkan kode masalah, melainkan meja pelapornya. Tombol kirim menjadi "Kirim: sama seperti masalah yang dipilih".
- Kata hasil uji **Sesuai / Tidak sesuai / Tidak bisa dicoba** kini juga dipakai di petunjuk yang tersisa, mis. "Persentase sesuai" dan "Tandai semua langkah sesuai".
- **Versi bahasa Inggris** memakai kata awam yang sama (test scenario, test sheet, test phase, feature, problem, impact) di 249 kalimat dan di judul kolom berkas unduhan.

### Diperbaiki

- Kalimat rusak "Admin atau Admin" dan "ADMIN dan Admin" di empat tempat; Pemantau juga disebut boleh mengunduh data.
- Laporan tindakan massal tidak lagi menampilkan nomor ID database untuk data tanpa kode.
- Log aktivitas kini mengenal jenis data "Meja workshop" serta aksi "Juga mengalami", "Ditinjau", dan "Akun diaktifkan".

## [0.19.1] - 2026-11-24

### Diperbaiki

- Pengaturan situs **"Bahasa bawaan"** kini benar-benar dipakai: pengunjung yang belum pernah memilih bahasa di perangkatnya melihat situs dalam bahasa bawaan tersebut.
- Halaman Pemulihan akun tidak lagi menampilkan perintah server; cukup dijelaskan bahwa akun Super Admin utama dipulihkan langsung di server oleh tim teknis.

## [0.19.0] - 2026-11-24

Perombakan tahap 6: **perapian temuan audit** dan laporan audit (`docs/audit/2026-11-24-audit-menyeluruh.md`).

### Diubah

- Pesan gagal kini selalu tampil **merah** (sebelumnya 11 tempat tampil hijau seperti sukses).
- Mengubah **status fase** meminta konfirmasi lebih dulu.
- **Pengumuman situs** tampil di semua halaman: aplikasi, halaman publik, dan layar meja.
- Setiap halaman memberi nama pada **tab browser**, mis. "Masalah · TestBoard PASKER ID". Judul halaman memakai warna navy Kemnaker.
- Layar memuat menampilkan logo dan "Memuat halaman...".
- Alamat yang tidak ada kini menampilkan halaman **"tidak ditemukan"** di bingkai yang sesuai (pengunjung tidak lagi dibawa ke halaman masuk).
- Layar meja: kode skenario dikecilkan di bawah judul, dan "Dicoba sebagai" menjadi "Anda berperan sebagai".
- Kata-kata teknis yang tersisa diganti: contoh kode fase (FASE-1), keterangan unggah bukti, "Dikecilkan tanpa mengurangi ketajaman", "Sudah diperiksa, bebas virus".

### Diperbaiki

- Formulir ganti kata sandi menyebut minimal 12 karakter, padahal aturannya 8.

## [0.18.0] - 2026-11-24

Perombakan tahap 5: **bantuan di mana-mana**.

### Ditambahkan

- Tombol **Bantuan** di bagian atas setiap halaman aplikasi: panel samping yang menjelaskan halaman yang sedang dibuka dengan kata-kata awam (untuk apa halaman ini, apa yang biasa dilakukan), dengan tautan ke bagian panduan yang tepat.
- **Tur singkat** saat pertama kali membuka aplikasi: menyorot Tugas saya, menu yang tersusun per tahap kerja, Mulai di sini, Bantuan, Panduan, dan ukuran huruf satu per satu. Bisa dilewati, dan bisa diulang dari panel Bantuan.
- **Panduan baru, disusun menurut peran**, dengan ilustrasi: cara kerja, cara masuk (termasuk mengaktifkan akun), peserta di meja, Penguji, Admin, Developer, Pemantau dan pimpinan, tabel peran dan hak akses, membuka fase untuk publik, Super Admin, kamus istilah (dengan istilah aslinya), serta privasi.
- Penjelasan singkat di bawah pilihan **Tingkat dampak** dan **Prioritas** saat melaporkan masalah, agar keduanya tidak tertukar.

### Diubah

- Pengatur ukuran huruf **A- / A / A+** kini juga ada di aplikasi (sebelumnya hanya di halaman publik dan layar meja).
- Tautan langsung ke bagian panduan (mis. `/panduan#peran`) langsung menggulir ke bagiannya.

## [0.17.0] - 2026-11-24

Perombakan tahap 4: **menu sesuai urutan kerja**, **kata-kata awam**, dan **beranda proyek yang menuntun**.

### Ditambahkan

- **"Mulai di sini"** di beranda proyek (untuk Admin): enam langkah dari proyek kosong sampai laporan (buat fase, siapkan skenario, pilih cara menguji, jalankan, tinjau masalah, lihat laporan). Langkah yang sudah dikerjakan otomatis dicentang, setiap langkah punya tombolnya, dan kartunya bisa disembunyikan.
- Kartu **"Tugas Anda"** di beranda proyek untuk Penguji, Developer, dan Pemantau, berisi apa yang bisa mereka lakukan dan tombol ke tempat yang tepat.
- Halaman **Proyek** menyapa pengguna, menyebut perannya, dan memberi jalan pintas ke **Tugas saya** dan **Panduan**. Kartu proyek kini menonjolkan nama proyek dan tombol **Buka proyek**.

### Diubah

- **Menu proyek dikelompokkan per tahap kerja**: 1. Persiapan (Fase uji, Skenario uji, Impor dari Excel), 2. Pelaksanaan (Workshop & meja, Lembar uji), 3. Hasil & laporan (Masalah, Foto & bukti, Laporan), 4. Pengaturan (Anggota & tugas, Fitur & kelompok). Setiap menu memakai kata awam dengan istilah aslinya kecil di bawahnya (mis. "Skenario uji" - Test Case).
- **Menu menyesuaikan tugas**: Penguji dan Developer hanya melihat bagian yang menjadi tugasnya; Pemantau melihat semua tanpa bisa mengubah.
- **Kata-kata awam di seluruh situs**: test case menjadi skenario uji, run menjadi lembar uji, siklus menjadi fase, modul menjadi fitur, suite menjadi kelompok skenario, bug menjadi masalah, severity menjadi tingkat dampak, dan lain-lain (lebih dari 300 kalimat).
- **Satu bahasa untuk hasil uji**: Sesuai / Tidak sesuai / Tidak bisa dicoba / Dilewati / Belum dicoba, sama seperti di meja workshop. Status masalah juga dibuat awam (mis. Baru dilaporkan, Sedang diperbaiki, Sudah dicek beres, Muncul lagi). Tingkat dampak (Kritis / Berat / Sedang / Ringan) kini berbeda dari prioritas (Segera / Tinggi / Sedang / Rendah), dan prioritas skenario memakai Wajib / Penting / Tambahan / Tidak sekarang.
- Label dan judul kolom di berkas ekspor laporan (CSV/Excel) ikut memakai kata-kata baru, mis. "Kode masalah", "Tingkat dampak", lembar "Masalah".

## [0.16.0] - 2026-11-24

Perombakan tahap 3: **anggota meja dengan akun Pengguna**, aktivasi akun, dan **Tugas saya** (ADR 0018, migration `0014`).

### Ditambahkan

- Formulir meja: setiap anggota punya **Nama** dan **Email (opsional)**. Email yang diisi otomatis menjadi **akun Pengguna** (tugas Penguji di proyek) yang belum aktif. Peserta di meja tidak pernah mengetik email: cukup pindai QR / ketik kode, lalu ketuk namanya.
- **Tautan aktivasi** dari Admin (di Anggota & tugas dan di formulir meja): tautan sekali pakai untuk membuat kata sandi sendiri, bisa **disalin** atau **dikirim lewat WhatsApp**.
- **"Aktifkan akun saya"** di layar meja, hanya untuk anggota yang didaftarkan Admin dan belum punya kata sandi, dan hanya sekali. Meja hanya melihat email yang disamarkan (mis. `b***@gmail.com`).
- Halaman **Tugas saya**: meja tempat Anda terdaftar (tombol **Buka meja ini** tanpa kode kartu, nama Anda langsung terpilih), lembar uji yang ditugaskan (tombol **Lanjutkan**), dan masalah yang Anda laporkan.
- Halaman tautan aktivasi memakai kata "Aktifkan akun Anda".

### Diubah

- **Migration `0014`**: tabel baru `workshop_table_members`; nama anggota meja yang sudah ada disalin otomatis.
- Nama anggota yang punya akun tidak bisa dihapus atau diganti dari layar meja; nama lain tetap bisa diatur oleh meja.

## [0.15.0] - 2026-11-24

Perombakan tahap 2: **tiga tingkat peran** yang mudah dijelaskan (ADR 0017, migration `0013`).

### Ditambahkan

- **Peran situs Admin**: membuat proyek dan mengelola **semua** proyek (fase, fitur, skenario uji, impor, meja, tampilan publik, tinjauan masalah, anggota). Super Admin tetap memegang akun pengguna, pengaturan situs, pemulihan akun, dan log aktivitas situs.
- **Tugas Pengguna per proyek**: Penguji (bawaan), Developer, Pemantau. Halaman **Anggota & tugas** menjelaskan ketiganya dan meminta **konfirmasi** sebelum tugas seseorang diubah.
- **Tambah anggota tanpa akun**: cukup email; bila belum ada akun, Admin diminta mengisi nama dan akunnya dibuatkan (status **Belum aktif** sampai orangnya membuat kata sandi).
- Halaman **Pengguna** (Super Admin): pilih peran **Pengguna / Admin / Super Admin** beserta penjelasannya, dengan konfirmasi sebelum peran berubah.
- Pemantau boleh **mengunduh laporan**.

### Diubah

- **Migration `0013`**: akun yang dulu Admin atau QA Lead di sebuah proyek otomatis menjadi **Admin** situs; peran lamanya di proyek menjadi Penguji. Peran "QA Lead" dan "Admin proyek" tidak ditawarkan lagi.
- Pembuat proyek tidak lagi otomatis dimasukkan sebagai anggota, dan aturan "minimal satu Admin per proyek" dihapus (Admin situs mengelola semua proyek).
- **Tidak ada lagi pesan berbahasa Inggris** dari server di layar: setiap pesan diterjemahkan ke kalimat awam, dan pesan yang tidak dikenal diganti kalimat umum yang menenangkan.

### Diperbaiki

- Data contoh untuk tes tidak lagi bocor antar-tes (daftar pengguna contoh disalin per tes).

## [0.14.0] - 2026-11-24

Awal perombakan menyeluruh agar situs mudah dipahami orang awam dan para pimpinan. Tahap ini: **tampilan bernuansa keluarga Kemnaker** dan **satu halaman masuk**.

### Diubah

- **Tema "Biru Pasker"** menggantikan "Langit lembut": biru Kemnaker sebagai warna utama, navy Kemnaker untuk judul dan kaki halaman, toska SIAPkerja / Pasker sebagai warna kedua, latar biru sangat muda seperti paskerid.kemnaker.go.id, kartu putih bergradasi tipis dengan bayangan lembut. Logo ikut berganti warna (papan biru, pin toska).
- **Satu halaman masuk** (`/masuk`) dengan dua pilihan yang jelas: **Kartu Meja** (peserta di meja: pindai QR atau ketik 6 angka, tanpa email) dan **Akun Pengguna** (email dan kata sandi). Kata "Petugas" tidak dipakai lagi. Alamat lama tetap berfungsi: QR di kartu meja yang sudah dicetak (`/meja`) langsung membuka pilihan Kartu Meja, dan `/login` membuka pilihan Akun Pengguna.
- **Bingkai yang sama** untuk halaman depan, fase publik, panduan, halaman masuk, dan pemulihan akun: kepala halaman dengan menu **Beranda** dan **Panduan** serta tombol **Masuk** (atau **Buka TestBoard** / **Kembali ke meja** bila sudah masuk), dan kaki halaman navy seperti situs Kemnaker.
- **Panduan tidak lagi "pindah situs"**: bila sudah masuk, panduan terbuka di dalam aplikasi lengkap dengan menu samping.
- Mode Mudah (layar peserta meja) memakai kaki halaman yang sama.
- Pesan "Mode DEMO ... Milestone 2" diganti penjelasan mode contoh yang awam.

## [0.13.1] - 2026-11-23

Masukan pemilik setelah memakai v0.13.0.

### Ditambahkan

- **Panduan selalu terjangkau** dari halaman petugas: tombol **Panduan** di bagian atas (langsung ke bagian yang sesuai halaman) dan menu **Panduan** serta **Halaman publik** di sisi kiri. Di halaman publik, petugas yang sudah masuk melihat **Kembali ke TestBoard**.
- **Pratinjau tampilan publik**: di Mode Workshop > Tampilan publik ada langkah 1-2-3-4 dan tombol **Pratinjau tampilan publik**. Tombol ini membuka halaman fase persis seperti yang dilihat umum, dengan pilihan data yang sedang dicentang, termasuk yang belum disimpan dan saat fase belum dibuka. Hanya Admin / QA Lead proyek yang bisa membuka pratinjau.
- Panduan bagian baru **Membuka fase untuk publik**: langkah demi langkah dan isi yang dilihat pengunjung.

### Diubah

- Panah pada semua pilihan dropdown tidak lagi menempel di tepi kanan.
- Pilihan login cukup bertuliskan **"Selalu login di perangkat ini"**, tanpa keterangan di bawahnya.

## [0.13.0] - 2026-11-22

**Mode Workshop** untuk UAT yang dikerjakan berkelompok per meja di forum workshop, dengan peserta yang banyak di antaranya orang tua dan awam (ADR 0016, migration `0012`).

### Ditambahkan

- **Halaman depan publik** (`/`): fase yang dibuka untuk umum, dengan kemajuan, fitur yang dikerjakan, dan daftar masalah. Tombol **Tampilkan secara publik** ada di setiap fase, dan **setiap data punya tombol sendiri** (18 data). Bawaannya semua tersembunyi; data yang bisa memuat data pribadi diberi tanda.
- **Kartu meja**: tiap meja mendapat kartu cetak (2 per A4) berisi **QR + kode 6 angka**, fitur, dan nama anggota. Peserta masuk tanpa email dan kata sandi, hanya pada masa berlaku kartu. Panitia bisa membuat kode baru atau menonaktifkan kartu kapan saja.
- **Mode Mudah** untuk peserta: satu skenario per layar, huruf dan tombol besar, tiga jawaban (**Sesuai / Tidak sesuai / Tidak bisa dicoba**), pilih "siapa yang mengisi", foto layar dengan kamera HP, dan saran **"masalah mirip sudah dilaporkan"** dengan tombol **"Saya juga mengalami"** supaya bug tidak dobel.
- **Kirim saat tersambung**: bila internet putus, jawaban disimpan di perangkat dan dikirim otomatis (tidak pernah tercatat dua kali).
- **Mode Workshop** untuk fasilitator: papan kemajuan per meja dan per fitur, kegiatan terbaru, buat banyak meja sekaligus, **Masalah masuk** (tingkat dampak, tandai sama dengan bug lain, sudah ditinjau), status fitur, daftar persiapan.
- **Layar besar** untuk proyektor dan **lembar uji cadangan** berkertas per meja.
- **Panduan** (`/panduan`): cara kerja singkat, langkah peserta, fasilitator, dan admin, kamus istilah, privasi.
- Tombol **A- / A / A+** untuk ukuran huruf di seluruh situs.

### Diubah

- Halaman petugas dimuat per halaman, sehingga HP peserta hanya mengunduh halaman publik dan Mode Mudah. Peringatan build (ukuran berkas dan komentar `zod`) tidak muncul lagi saat `update.sh`.
- Pelapor dan penguji dari meja ditampilkan sebagai "Meja 1 · nama anggota" di halaman bug dan hasil uji.

### Diperbaiki

- Foto tanpa thumbnail yang lebih kecil (screenshot sederhana) kini tetap tampil sebagai thumbnail.

## [0.12.5] - 2026-11-22

Tahap antara Mode Workshop: halaman web (publik, kartu meja, Mode Mudah, fasilitator, cetak, panduan).

## [0.12.4] - 2026-11-22

Tahap antara Mode Workshop: API, migration `0012`, dan tes integrasinya.

## [0.12.3] - 2026-11-22

### Ditambahkan

- **"Selalu login di perangkat ini"** di halaman login (ADR 0015, migration `0011`): dicentang = tetap masuk 30 hari tanpa batas diam; tidak dicentang = keluar saat browser ditutup atau 120 menit diam. Lama hari diatur Super Admin (0 = pilihan disembunyikan).
- **Profil > Perangkat yang sedang masuk**: daftar perangkat yang masih masuk dan tombol "Keluar dari semua perangkat lain".

## [0.12.2] - 2026-11-22

### Diubah

- **Kode proyek, kode modul, dan kode siklus bisa diubah** setelah dibuat (ADR 0014):
  - kode proyek di **Administrasi > Proyek > Ubah** (link proyek ikut berubah);
  - kode modul di **Tim & Pengaturan > Modul & Suite > Ubah** (test case lama tetap memakai kodenya, test case baru memakai kode baru);
  - kode siklus, judul, keterangan, dan periode di **Siklus Uji > Ubah**.

  Kode yang sudah dipakai ditolak, dan setiap perubahan tercatat di log aktivitas.

## [0.12.1] - 2026-11-22

### Diperbaiki

- Panduan impor Karirhub: nama pilihan disamakan dengan tampilan website (**Pindahkan juga hasil UAT lama**, **Nama run**, **Status test case baru**).

## [0.12.0] - 2026-11-21

Perubahan v1 tahap 4 selesai: alat kelola data dan impor data Karirhub (ADR 0013).

### Ditambahkan

- **Panduan impor Karirhub** ([`docs/deploy/import-karirhub.md`](docs/deploy/import-karirhub.md)): langkah di website untuk UAT Fase 1, Bug Tracker Fase 1, dan draf Fase 2 (versi ringkas lalu versi lengkap), lengkap dengan angka yang diharapkan.
- Impor test case dengan migrasi hasil: run baru bisa langsung dimasukkan ke **siklus** (mis. UAT Fase 1).

### Diperbaiki

- Impor Bug: **baris lanjutan** "Aduan user" (ID sama, tanpa status atau detail, hanya screenshot tambahan) tidak lagi dianggap duplikat. Barisnya digabung ke aduan pertama, dan screenshot-nya ikut ke bug itu (pada uji coba: 70 screenshot, sebelumnya 57).

### Diuji

- Uji coba ketiga workbook asli di database lokal sementara (langsung dihapus): 1.122 test case, 1 run dengan 88 hasil uji dan 85 screenshot, 78 bug (19 tertaut ke hasil uji gagal) dengan 70 screenshot. Kode bentrok Fase 2 dan pencarian test case mirip bekerja sesuai rancangan.

## [0.11.5] - 2026-11-21

Perubahan v1 tahap 4, bagian 4: peninjauan kode bentrok saat impor test case (ADR 0013).

### Ditambahkan

- Impor test case: pengaturan **"Bila kode sudah dipakai test case lain"**, pilihannya _Lewati baris_ atau _Buat dengan kode baru_. Dipakai untuk sheet tersembunyi Fase 2 yang memakai kode yang sama untuk isi berbeda.
- Pratinjau menampilkan daftar **Kode bentrok**: judul di file berdampingan dengan judul yang sudah ada. Keputusan bisa diatur per baris, atau "Semua pakai kode baru" / "Lewati semua".
- Test case berkode baru mendapat nomor berikutnya di modulnya; kode asalnya dicatat di riwayat revisi.

## [0.11.4] - 2026-11-21

Perubahan v1 tahap 4, bagian 3: Impor Bug (ADR 0013).

### Ditambahkan

- **Impor Bug**: di halaman Impor (sekarang "Impor Data") pilih "Bug", lalu unggah tracker (XLSX/CSV).
  - Kolom dikenali otomatis: ID UAT, ID, Fitur / Proses, Detail Hasil Aktual / Defect, Severity, Prioritas, Status (UAT / Retest), Notes, Penguji, Tgl, Bukti.
  - Status, severity, dan prioritas di file dipetakan ke nilai sistem dan bisa diubah. Baris berhasil atau belum diuji dilewati; Gagal Diuji menjadi bug Terbuka; Done menjadi Ditutup.
  - Per sheet bisa diatur modul dan sumber (UAT / laporan pengguna). Semua bug masuk ke siklus yang dipilih dan bisa otomatis ditautkan ke hasil uji test case-nya.
  - Screenshot tertanam ikut dilampirkan ke bug yang tepat. Bug yang kodenya sudah ada tidak dibuat dua kali.
- Migration `0010_import_target.sql` (1 kolom dengan nilai bawaan).

### Diubah

- Judul halaman Impor menjadi "Impor Data" (test case atau bug).

## [0.11.3] - 2026-11-21

Perubahan v1 tahap 4, bagian 2: gabung test case duplikat (ADR 0013).

### Ditambahkan

- **Gabungkan (duplikat)** di aksi massal Test Case: pilih 2 atau lebih, lalu tentukan yang dipertahankan. Sisanya diarsipkan dan menunjuk ke yang dipertahankan. Hasil uji lama tidak berubah.
- **Cari yang mirip** (tombol di halaman Test Case): pasangan kemungkinan duplikat berdampingan, dengan skor, alasan (judul mirip, hasil diharapkan mirip, rujukan sama), serta tombol "Pertahankan ..." atau "Bukan duplikat". Kode tidak dipakai untuk mencocokkan.
- Detail test case: catatan "Sudah digabung ke ..." dan "Gabungan dari ..." dengan tautan.

## [0.11.2] - 2026-11-21

### Diperbaiki

- Format kode dua file dari v0.11.1 (pemeriksaan format CI gagal). Tidak ada perubahan perilaku; v0.11.1 tidak dinaikkan ke `main`.

## [0.11.1] - 2026-11-21

Perubahan v1 tahap 4, bagian 1: siklus pada bug dan aksi massal (ADR 0013).

### Ditambahkan

- **Siklus (fase) pada bug**: pilih di formulir bug, tampil di detail, kolom dan filter "Siklus" di Daftar Bug. Bug yang dilaporkan dari hasil uji otomatis mengikuti siklus run-nya bila siklus tidak dipilih.
- **Pilih banyak + aksi massal**:
  - _Daftar Bug_: ubah status, severity, prioritas, modul, siklus, atau penanggung jawab sekaligus.
  - _Test Case_: tandai Siap / jadikan Draf, pindahkan ke modul, ubah prioritas, tambahkan ke run, atau arsipkan sekaligus.
  - Setiap item mengikuti aturan yang sama seperti diubah satu per satu (hak peran, alur status, versi baru, log aktivitas). Item yang ditolak dilewati dan dilaporkan beserta alasannya.
- Detail bug menampilkan pelapor, tanggal, dan asal baris untuk bug hasil impor (persiapan impor Tracker).
- Migration `0009_data_tools.sql`: hanya menambah 5 kolom NULL.

## [0.11.0] - 2026-11-21

Perubahan v1 tahap 3: tema pastel dan logo baru, sesuai pilihan pemilik proyek (palet A "Langit lembut", logo 2 "Papan centang").

### Diubah

- **Logo baru "Papan centang"**: papan bersudut bulat berisi centang, dengan pin persik di atasnya. Tetap mengikuti gaya logo hub Kemnaker (garis tebal membulat dan satu titik). Ikut diganti: favicon dan `docs/brand/testboard-mark.svg`.
- **Tema "Langit lembut"**: warna utama biru periwinkle (`#4F5FCF`, tombol `#4352BA`) dan latar lavender sangat muda. Aksen pastel lavender, mint, persik, mentega, dan langit:
  - chip ikon berwarna di kartu angka dasbor, laporan, dan detail run;
  - chip warna per proyek di halaman Proyek (warnanya tetap untuk kode proyek yang sama);
  - pita pengumuman berwarna mentega;
  - bentuk pastel lembut di belakang halaman masuk, pemulihan akun, dan reset kata sandi;
  - menu aktif di sidebar lebih jelas.
- Warna latar status (lulus, terhambat, gagal, info) menjadi versi pastel. Teksnya tetap kontras minimal 4,5:1.
- Warna grafik status sedikit dilembutkan. Angka persen di dalam batang kini selalu terbaca (kontras minimal 4,5:1; sebelumnya teks putih di atas hijau kurang kontras).
- Panduan brand (`docs/brand/README.md`) diperbarui: spesifikasi simbol, tabel warna, dan aturan pemakaian aksen pastel.

## [0.10.0] - 2026-11-21

Perubahan v1 tahap 2: pemulihan akun lewat Super Admin (ADR 0012).

### Ditambahkan

- **"Lupa kata sandi?" dan "Lupa email?"** di halaman masuk: formulir "Hubungi Administrator" tanpa perlu masuk. Jawabannya selalu sama, baik email terdaftar maupun tidak. Permintaan yang diulang digabung, bukan menjadi baris ganda. Ada batas per jaringan dan penyaring bot.
- **Administrasi > Pemulihan akun** (hanya Super Admin), dengan angka merah di menu untuk permintaan baru:
  - daftar permintaan (Menunggu / Selesai / Diabaikan / Semua): otomatis dicocokkan dengan akun lewat email, atau dihubungkan ke akun oleh admin; tandai selesai atau abaikan dengan catatan; buka lagi;
  - daftar tautan aktif, masing-masing dengan bar sisa masa berlaku dan tombol Cabut.
- **Tautan reset berbatas waktu**, dibuat dari permintaan atau dari halaman Pengguna:
  - berlaku 24 jam (diatur di Pengaturan situs, 1-168 jam) dan hanya sekali pakai;
  - tampil sekali dengan tombol salin; database hanya menyimpan hash-nya;
  - **satu tautan aktif per akun**, dijamin di database. Membuat tautan kedua harus lewat "Cabut & buat tautan baru".
- **Bar masa berlaku** (sisa waktu, jam berakhir, warna hijau/kuning/merah) di dialog, daftar tautan, kartu permintaan, daftar Pengguna, dan halaman reset.
- **Halaman buat kata sandi baru** (`/reset-password`):
  - menampilkan nama dan email akun, sehingga juga menjawab "lupa email";
  - setelah berhasil, semua sesi dikeluarkan dan permintaan terbuka akun itu otomatis selesai;
  - tautan yang kedaluwarsa, dicabut, atau sudah dipakai menjelaskan alasannya.
- Migration `0008_account_recovery.sql` (2 tabel baru). Retensi harian juga menghapus isi permintaan yang sudah selesai setelah 180 hari, dan tautan 30 hari setelah kedaluwarsa.

### Keamanan

- Token tautan 256-bit diletakkan setelah `#`, jadi tidak terkirim ke server dan tidak tercatat di log Apache. Token juga dihapus dari bilah alamat begitu dibaca.
- Akun Super Admin utama tidak bisa direset dari website. Pemulihannya lewat server: `bash ops/testboard.sh create-admin --email ... --reset-password`.

## [0.9.0] - 2026-11-21

Perubahan v1 tahap 1 (permintaan pemilik proyek setelah go-live pertama): konsol Super Admin (ADR 0011).

### Ditambahkan

- **Buat proyek**: tombol untuk Super Admin di halaman Proyek dan di menu Administrasi. Pembuat proyek otomatis menjadi Admin proyek. Bila belum ada proyek, Super Admin melihat ajakan membuat proyek pertama (bukan "Anda belum menjadi anggota").
- **Menu Administrasi** (hanya Super Admin):
  - **Proyek**: semua proyek beserta jumlah anggota dan isi; ubah nama/deskripsi; arsipkan dan aktifkan lagi. Proyek yang diarsipkan hanya bisa dibaca (diperiksa di server).
  - **Pengguna**.
  - **Pengaturan situs**: nama situs, pengumuman berupa pita di semua halaman, bahasa bawaan, kontak bantuan di halaman masuk, lama sesi, batas diam, dan retensi data. Berlaku dalam hitungan detik tanpa restart; setiap perubahan tercatat siapa dan kapan.
  - **Log aktivitas** seluruh situs, dengan filter proyek atau "Tingkat situs".
- **Super Admin permanen** (migration `0007`): ditetapkan hanya dari server dengan `bash ops/testboard.sh protect-admin --email ...`. Website menolak mencabut atau menonaktifkan akun itu, siapa pun yang meminta. Di daftar pengguna ditandai "Super Admin utama" dan tombolnya terkunci.
- Endpoint publik `GET /settings/public`; halaman masuk menampilkan nama situs dan kontak bantuan.

### Diubah

- Password minimal **8** karakter (sebelumnya 12).
- Label "Nama tampilan" menjadi **"Nama"**.
- Lama sesi dan batas diam kini diambil dari Pengaturan situs; nilai di `api.env` menjadi nilai bawaannya. Retensi harian juga mengikuti pengaturan itu.
- Log aktivitas proyek dan log seluruh situs memakai komponen yang sama.

## [0.8.5] - 2026-11-20

### Diperbaiki

- Uji di akhir `deploy` kini dijalankan dari versi skrip yang baru saja ditarik (proses terpisah). Sebelumnya deploy yang memperbarui `ops/testboard.sh` masih memakai kode uji versi lama yang sudah dimuat ke memori. Akibatnya deploy pertama ke v0.8.3 menampilkan bug `000000` dan 3 "GAGAL" palsu, padahal semua cek langsung ke Apache lulus.

## [0.8.4] - 2026-11-20

### Dokumentasi

- Panduan deploy: bagian baru "Bila situs tidak bisa dibuka".
  - Cara membedakan IP jaringan sendiri yang diblokir firewall (cek dari data seluler) dari server yang benar-benar bermasalah.
  - Yang harus dilakukan saat diblokir: jangan mencoba berulang, minta tim jaringan membuka blokir dengan menyebut waktu dan IP publik, kerja lewat hotspot.
  - Pemeriksaan langsung di VPS tanpa lewat firewall, dengan tabel arti hasilnya.
- Larangan baru: jangan menjalankan uji keamanan berulang ke alamat publik.

## [0.8.3] - 2026-11-20

Perbaikan uji keamanan `smoke` dari deploy pertama di VPS.

### Diperbaiki

- Status "tidak terjawab" kini dikenali dengan benar. Sebelumnya `curl` yang gagal tersambung menghasilkan kode `000000`, sehingga path yang tidak bisa dihubungi tercatat "Tertutup" dan Apache lokal yang tidak ada dianggap terjangkau.
- Dari VPS, alamat publik sering tidak terjangkau karena ada firewall di depan situs. Kini itu hanya peringatan: halaman, deep link, dan API diuji langsung ke Apache di server itu. Gagal hanya bila keduanya tidak menjawab.
- Uji path rahasia lengkap (`.git`, `.env`, ...) hanya dikirim langsung ke Apache di server. Lewat alamat publik hanya ada uji halaman/API dan satu path biasa, karena firewall menganggap rentetan permintaan `.git`/`.env` sebagai serangan dan bisa memblokir IP komputer penguji (terjadi saat pengujian dari luar).
- Diuji di Apache lokal untuk tiga kondisi (mirip VPS, tidak terjangkau sama sekali, keduanya terjangkau), plus uji negatif tanpa `.htaccess` yang harus gagal.

### Dokumentasi

- Panduan deploy: arti peringatan "alamat publik tidak terjangkau", dan gejala situs tidak bisa dibuka dari satu komputer karena IP-nya diblokir firewall.

## [0.8.2] - 2026-11-20

Deploy bisa dijalankan sebagai root tanpa harus berpindah user.

### Diubah

- `ops/testboard.sh` yang dijalankan sebagai root kini otomatis:
  - membuat akun Linux `testboard` saat `setup`, tanpa password dan tanpa login dari luar;
  - menyerahkan folder TestBoard ke akun itu;
  - menjalankan dirinya ulang atas nama akun tersebut.

  Pemilik cukup tetap login sebagai root (termasuk lewat `./update.sh`); aplikasi, cron, dan data (`/home/testboard/testboard-data`) tetap tidak pernah berjalan sebagai root.

- Perintah baru `bash ops/testboard.sh maintenance [--dry-run]` untuk pembersihan data, tanpa perlu menyusun perintah npm sendiri.
- Panduan deploy dan ADR 0010: penjelasan singkat apa itu user `testboard`, path data absolut, tanpa langkah `su`.

## [0.8.1] - 2026-11-20

Perbaikan dari pemeriksaan pertama di VPS.

### Diperbaiki

- `.htaccess`: sebelum deploy pertama (hasil build web belum ada), aturan rewrite berputar dan menghasilkan 500. Kini permintaan berhenti dengan 404 biasa. Diuji pada Apache 2.4: aturan lama 500 ("exceeded internal redirects"), aturan baru 404, dan file rahasia tetap 403.
- `ops/testboard.sh smoke` tidak lagi memberi alarm palsu bila firewall (WAF) di depan situs memblokir path rahasia dengan halamannya sendiri (mis. status 500). Kini hanya jawaban 2xx yang dianggap "terbuka".
- `smoke` sekarang juga menguji path rahasia langsung ke Apache di server itu (melewati firewall), sehingga yang terbukti adalah aturan `.htaccess`-nya sendiri. Coba skema/port situs dulu, lalu HTTP biasa; pendengar yang hanya mengalihkan (redirect) dilewati.
- `check`: login sebagai root kini disebut "hak admin penuh" dengan saran memakai user khusus; baris AllowOverride yang membingungkan diganti petunjuk ke uji `smoke`.

### Dokumentasi

- Panduan deploy: langkah membuat user khusus `testboard` bila login sebagai root, serta penanganan halaman "Web Page Blocked!" dari firewall dan pesan git "dubious ownership".

## [0.8.0] - 2026-11-20

**Milestone 7 selesai di repo**: halaman Laporan (ringkasan, ekspor, log aktivitas), pengamanan produksi, retensi data, serta paket deploy VPS tanpa sudo. Go-live di VPS menunggu langkah di `docs/deploy/vps-deploy.md` dan persetujuan rilis ke `main`.

### Ditambahkan

- Halaman **Laporan**, tab Ringkasan:
  - Filter siklus, run, modul, dan periode (WIB), disimpan di URL.
  - Penjelasan "Cara menghitung", lalu angka utama: test case dalam run, sudah dieksekusi, tingkat lulus, percobaan dan uji ulang, bug terbuka.
  - Bilah status terbaru dan tabel per modul, per run, dan per penguji. Penguji dari impor lama diberi tanda "dari impor".
  - Bug terbuka per tingkat keparahan.
- **Ekspor data** (QA Lead/Admin): hasil terbaru, semua percobaan, daftar bug, atau pustaka test case dalam CSV atau Excel (.xlsx), dengan label bahasa Indonesia atau Inggris. Pesan yang jelas bila datanya terlalu banyak.
- Tab **Log aktivitas** (QA Lead/Admin): siapa mengubah apa dan kapan, dengan filter jenis data, aksi, pengguna, dan tanggal, serta rincian field yang berubah. Penghapusan otomatis tercatat sebagai "Sistem".
- Mode demo menghitung laporan dengan aturan yang sama seperti API dan bisa mengekspor CSV/XLSX langsung di browser.
- Tes: alur UI laporan (filter, ekspor CSV/XLSX, log aktivitas, akses tester), serta label ekspor yang wajib sama dengan label di aplikasi.

### Diubah

- Menu Laporan tidak lagi bertanda "Segera"; halaman "segera hadir" dihapus karena semua fitur roadmap sudah dibangun.
- Garis bawah tab digambar tanpa margin negatif, sehingga scrollbar vertikal kecil di samping tab hilang di semua halaman bertab.

## [0.7.3] - 2026-11-20

Milestone 7 bagian 3: paket deploy VPS tanpa sudo, sesuai keputusan pemilik proyek (ADR 0010).

### Ditambahkan

- `.htaccess` di root repo dengan daftar putih. Yang bisa dibuka hanya `/testboard/api/*` (diteruskan ke API di 127.0.0.1:8787) dan file hasil build web (dengan `.htaccess` sendiri untuk SPA, cache, CSP, dan header keamanan). `.git`, `.env`, kode sumber, SQL, skrip, dan `node_modules` selalu 404/403, termasuk URL ter-encode dan `../`.
- `ops/testboard.sh`, satu skrip tanpa sudo:
  - `check`: laporan server, hanya membaca.
  - `setup`: folder data `~/testboard-data` di luar web root, Node.js 24 resmi dengan verifikasi checksum, pengaturan rahasia berizin 600, dan cron.
  - `deploy`: backup, build dengan pergantian folder web secara atomik, migrasi dengan persetujuan dan akun admin yang tidak disimpan, restart, health check, rollback otomatis, dan uji keamanan publik.
  - Perintah lain: `rollback`, `start`/`stop`/`status`, `watchdog` (dengan rotasi log), `backup` (30 hari, manifest + checksum), `restore` (uji ke database sementara atau `--production`), `smoke`, `create-admin`, `cron`.
- `ops/update.sh.example` kini pengganti `update.sh` di server (memanggil deploy lengkap).
- Template pengaturan produksi `ops/env/api.env.example`.
- Panduan deploy berbahasa Indonesia (`docs/deploy/vps-deploy.md`), checklist go-live (`docs/deploy/production-checklist.md`), dan ADR 0010.

### Diverifikasi di lokal

- Apache 2.4 (XAMPP) dengan aturan induk ala Laravel: 25 pemeriksaan `smoke` lulus (halaman, deep link, API lewat proxy, semua path rahasia tertutup).
- Backup + uji restore ke MariaDB 10.4 lokal: checksum, jumlah baris semua tabel, view, dan file bukti cocok.

## [0.7.2] - 2026-11-20

Milestone 7 bagian 2 (API): pengamanan untuk produksi dan retensi data.

### Ditambahkan

- Retensi otomatis harian di dalam API, sesuai keputusan pemilik proyek:
  - File unggahan yang tidak pernah dipakai di hasil uji, bug, test case, atau impor dihapus setelah 90 hari. File yang dipakai tidak pernah dihapus otomatis.
  - Isi file yang sudah dihapus (manual atau otomatis) baru dibuang dari disk setelah 7 hari. Catatan dan jejak auditnya tetap ada.
  - Folder kerja impor dibersihkan setelah 90 hari; job dan hasil per barisnya tetap tersimpan di database.
  - Sesi kedaluwarsa, catatan percobaan login lama, dan sisa unggahan yang terputus juga dibersihkan.
  - Setiap penghapusan otomatis tercatat di audit.
- Perintah `npm run maintenance -w @testboard/api [-- --dry-run]` untuk menjalankan atau melihat dulu pembersihan dari shell server.
- Pengaturan `TESTBOARD_ENV_FILE` (lokasi file rahasia API), `RETENTION_UNUSED_FILE_DAYS`, `RETENTION_IMPORT_DAYS`, `RETENTION_ENABLED`.

### Diubah (keamanan)

- Alamat klien di balik Apache kini diambil dari hop terakhir `X-Forwarded-For` (ditambahkan oleh proxy), bukan entri pertama yang bisa dipalsukan. Kunci login per IP tidak bisa lagi diakali dengan header palsu. Audit memakai alamat yang sama.
- Mode produksi menolak start bila file rahasia (`.env`) berada di dalam folder aplikasi, karena di VPS folder itu ada di bawah web root publik.
- Tes integrasi hardening: IP palsu, retensi (file nganggur vs dipakai, masa tunggu 7 hari, audit), sesi lama, dan sisa karantina.

## [0.7.1] - 2026-11-20

Milestone 7 bagian 1 (API): laporan, ekspor CSV/XLSX, dan log audit proyek.

### Ditambahkan

- `GET /projects/:p/reports/overview`: ringkasan per run, modul, dan penguji, ditambah ringkasan bug per tingkat keparahan dan status. Filternya run, siklus, modul, dan periode (hari kalender WIB). Satu test case dalam run dihitung sekali, memakai percobaan terakhir; tingkat lulus = Berhasil Diuji / semua test case dalam run.
- `GET /projects/:p/reports/export`: dataset hasil terbaru, semua percobaan, bug, dan pustaka test case (format template impor), dalam CSV (BOM, formula dinetralkan) atau XLSX asli (sel bertipe, tanpa formula, header beku + filter). Label status mengikuti bahasa (ID/EN), waktu dalam WIB. Hanya QA Lead/Admin, setiap ekspor tercatat di audit, maksimal 50.000 baris.
- `GET /projects/:p/audit-logs`: log aktivitas proyek untuk QA Lead/Admin, dengan filter jenis data, aksi, pengguna, dan periode, plus daftar field yang berubah.
- Modul bersama `@testboard/shared`: penulis CSV/XLSX/ZIP tanpa dependensi baru, label kode ID/EN untuk file ekspor, definisi dataset laporan.
- Tes integrasi laporan (agregasi, filter, isolasi proyek, injeksi CSV, XLSX dibaca ulang, hak akses, audit).

### Diubah

- CSV daftar masalah impor memakai penulis CSV bersama.

## [0.7.0] - 2026-11-20

**Milestone 6 selesai**: test case dan hasil UAT lama bisa diimpor dari Excel, CSV, atau JSON lewat wizard di UI (mode API dan demo).

### Ditambahkan

- Halaman Impor: unggah tarik-lepas dengan progres, template CSV dan contoh JSON AI (data dummy), riwayat job impor beserta status, hanya untuk QA Lead/Admin proyek.
- Wizard job impor: pilih sheet, nomor baris header (dengan cuplikan baris teratas), modul/suite bawaan per sheet, pemetaan kolom (terisi otomatis dari nama kolom lama), mode bila kode sudah ada, status test case baru, lalu "Periksa" untuk pratinjau.
- Pratinjau: jumlah dibuat/diperbarui/tidak berubah/perlu ditinjau/duplikat/tidak valid, modul & suite baru, pemetaan status hasil lama (label seperti Closed tidak diterjemahkan otomatis), gambar tertanam yang otomatis terpasang vs perlu ditinjau (dengan pratinjau gambar), daftar baris per status dengan alasan, unduh daftar masalah (CSV), dan petunjuk bila tidak ada baris data.
- Migrasi hasil UAT lama: nama run, lingkungan, build/versi; konfirmasi menyebut run yang akan dibuat; hasil akhir menautkan ke test case dan run (periode run mengikuti tanggal uji di file).
- Mode demo mensimulasikan impor CSV/JSON (aturan sama dengan API); impor Excel menjelaskan bahwa fitur itu butuh server.
- Tes: aturan impor di data demo dan alur UI (unggah → periksa → terapkan, migrasi hasil ke run, Excel di demo, akses hanya lead).

### Diubah

- Perencana impor (pemetaan, validasi, duplikat, pratinjau) dipindah ke `@testboard/shared` sehingga API dan demo memakai aturan yang sama.
- Periode run migrasi hanya dihitung dari baris yang benar-benar masuk run.

## [0.6.1] - 2026-11-20

Milestone 6 bagian API: impor test case dan migrasi hasil UAT lama.

### Ditambahkan

- Job impor: `POST /projects/:p/imports` (XLSX/CSV/JSON, maks 40 MB), `PUT /imports/:id/config` (sheet, baris header, pemetaan kolom, modul/suite per sheet, mode, opsi migrasi hasil) yang langsung menghasilkan pratinjau, `GET /imports/:id/rows` (filter valid/perlu ditinjau/duplikat/tidak valid), `GET /imports/:id/errors.csv` (aman dari formula injection), `GET /imports/:id/images/:key`, `POST /imports/:id/commit` (di latar), `GET /imports`, `DELETE /imports/:id`.
- Pembaca XLSX yang ketat (batas ukuran per bagian ZIP, DTD dan makro ditolak, formula tidak dijalankan): banyak sheet, sheet tersembunyi, deteksi header (mis. baris 11), metadata dokumen di atas header, sel gabungan, sel tanggal, gambar tertanam dengan anchor sel.
- Aturan bersama (`@testboard/shared`): pemetaan nama kolom lama, normalisasi prioritas/jenis/status/tanggal campuran, parser CSV, skema JSON AI, validasi baris, sidik isi untuk impor ulang.
- Duplikat dalam file dan terhadap proyek, mode CREATE_ONLY / UPDATE / NEW_REVISION (selalu versi + revisi baru, snapshot run lama aman).
- Migrasi hasil UAT lama ke run baru: status dipetakan (label retest tidak diterjemahkan diam-diam), nama penguji sebagai teks tanpa membuat akun, screenshot tertanam diperiksa + dikompres lalu ditautkan ke percobaan; gambar tanpa baris = perlu ditinjau.
- Semua perubahan dalam satu transaksi; job yang terputus saat restart ditandai gagal.
- Tes integrasi TB-IMP-001..007 dan unit aturan impor; ADR 0009.

## [0.6.0] - 2026-11-20

**Milestone 5 selesai**: bukti (screenshot, dokumen, log) bisa diunggah, diperiksa, dikompres, dilihat, dan dilampirkan dari UI (mode API dan demo).

### Ditambahkan

- Pengunggah bukti: pilih banyak file, tarik-lepas, atau tempel screenshot dari clipboard (Ctrl+V); progres unggah per file, status pemeriksaan, hasil kompresi ("170 KB → 6,9 KB · hemat 96% · WebP lossless"), alasan penolakan yang jelas, ulangi, hapus, keterangan, dan tautan ke nomor langkah.
- Workspace eksekusi: bukti disimpan bersama hasil uji (simpan ditahan sampai semua file selesai diperiksa), peringatan lembut bila hasil gagal tanpa screenshot, galeri per percobaan, dan "Tambah bukti" ke percobaan sendiri yang sudah tersimpan.
- Bug: bagian Lampiran (lampirkan/lepas sesuai peran); saat melaporkan bug dari hasil gagal, screenshot percobaan itu otomatis ikut (file yang sama, tidak disalin) dan bisa ditambah bukti baru.
- Test case: tab Dokumen acuan untuk QA Lead/Admin.
- Pusat Bukti: semua file proyek dengan filter jenis/status/nama/belum dipakai, ukuran sebelum/sesudah, pengunggah, tempat file dipakai (tautan ke percobaan/bug/test case), pratinjau, unduh, dan hapus untuk file yang belum dipakai.
- Penampil screenshot (lightbox) dengan navigasi panah/Esc; semua pratinjau dan unduhan lewat izin API, tidak ada tautan publik.
- Mode demo mensimulasikan alur yang sama (cek jenis asli, penolakan, proses, hasil kompresi khas).
- Tes: aturan bukti di data demo dan alur UI (unggah saat uji, file palsu ditolak, pakai ulang di bug, Pusat Bukti, viewer).

### Diubah

- Optimasi PNG kini benar-benar lossless (opsi `effort` di sharp diam-diam mengaktifkan kuantisasi palet); tes regresi gambar banyak warna harus identik piksel.
- Thumbnail hanya dibuat bila lebih kecil dari gambar utuh (screenshot UI datar sering lebih kecil utuh dalam WebP lossless).

## [0.5.1] - 2026-11-20

Milestone 5 bagian API: unggah bukti dengan pemeriksaan dan kompresi.

### Ditambahkan

- `POST /projects/:p/files`: unggah banyak file sekaligus (multipart, di-stream ke karantina privat, batas per jenis dan per permintaan), diproses di belakang; `GET /files` (Pusat Bukti: filter jenis/status/nama/belum dipakai, beserta tempat file dipakai), `GET /files/:id`, `/status`, `/preview` (dengan `Range`), `/thumbnail`, `/download` (tercatat di audit), `DELETE /files/:id` untuk unggahan yang belum dipakai.
- Pipeline doc 07: jenis asli dari byte, pemeriksaan virus (default pemeriksaan dasar tanpa konfigurasi, ClamAV opsional; gagal periksa tidak pernah lolos), screenshot dikompres tanpa mengubah piksel (WebP lossless/PNG optimize, JPEG berkualitas tinggi hanya bila jauh lebih kecil), EXIF/GPS dibuang, thumbnail; PDF/DOCX/XLSX diperiksa dari skrip, makro, objek tertanam, dan zip bomb; log harus teks, HAR disensor otomatis (cookie, token, Authorization), gzip bila lebih kecil.
- Lampirkan bukti saat menyimpan hasil uji (`evidence` di `POST /run-cases/:id/executions`), ke percobaan yang sudah ada (`POST/DELETE /executions/:id/files`), ke bug (`evidence` saat membuat bug, `POST/DELETE /defects/:id/files`), dan ke test case (`POST/DELETE /test-cases/:id/files`); file yang sama bisa dipakai di beberapa tempat tanpa disalin. Detail percobaan, bug, dan test case kini memuat daftar file.
- Migration `0006`: jenis pemeriksaan, waktu periksa, dan alasan penolakan per file. Pengaturan `STORAGE_DIR` (wajib di luar folder aplikasi saat production), `SCAN_ENGINE`, `CLAMD_HOST`, `CLAMD_PORT`.
- Upload yang terputus karena restart ditandai gagal, tidak pernah dirilis.
- Tes integrasi TB-FILE-001..006 plus sensor HAR, makro, zip bomb, batas ukuran, hak lampir, pemakaian ulang file, dan pemulihan setelah restart; ADR 0008.

## [0.5.0] - 2026-11-20

**Milestone 4 selesai**: alur bug lengkap dari UI (mode API dan demo).

### Ditambahkan

- Laporkan bug dari Daftar Bug (bug mandiri, mis. laporan pengguna) atau langsung dari workspace eksekusi: "Laporkan bug dari percobaan #n" mengisi judul, langkah, perilaku yang diharapkan/aktual, modul, lingkungan, build, dan browser dari hasil uji, menautkan bug ke percobaan itu, lalu kembali ke pengujian.
- "Tautkan bug yang ada" di workspace eksekusi (cari bug terbuka, tautkan ke percobaan terakhir).
- Detail bug: tombol status sesuai peran dan alur ADR 0007 dengan konfirmasi (versi perbaikan saat ditandai diperbaiki, alasan wajib saat dibuka kembali atau tidak diperbaiki), riwayat status dengan nama dan alasan, komentar, lepas tautan percobaan uji, tautan langsung ke workspace eksekusi.
- Form ubah bug dengan kolom terkunci sesuai peran (pelapor mengubah uraian, developer yang ditugaskan mengisi versi perbaikan, QA Lead/Admin semua termasuk penugasan) dan pencegahan saling timpa.
- Filter penugasan di Daftar Bug ("Ditugaskan ke saya", belum ditugaskan, per orang); API `GET /defects?assigned_to=`.
- Mode demo menerapkan aturan bug yang sama dengan API.
- Tes: aturan bug di data demo dan alur UI (lapor mandiri, lapor dari hasil gagal, tautkan, alur status, developer, viewer, komentar).

### Diperbaiki

- Dialog konfirmasi kadang muncul jauh di bawah layar dan halaman melompat: dialog kini dirender di `document.body` dan animasi masuk halaman tidak lagi menahan `transform` setelah selesai.

## [0.4.1] - 2026-11-20

Milestone 4 bagian API.

### Ditambahkan

- Bug: `POST /projects/:p/defects` (kode otomatis `BUG-XXX-0001` di bawah kunci proyek, bisa langsung tertaut ke percobaan uji, boleh tanpa tautan, `Idempotency-Key`), `PATCH /defects/:id` dengan pembatasan kolom per peran dan `expected_updated_at`, `POST /defects/:id/status` sesuai alur ADR 0007 (alasan wajib untuk REOPENED/WONT_FIX, riwayat + audit dalam satu transaksi), komentar (`GET/POST /defects/:id/comments`), riwayat (`GET /defects/:id/history`), tautkan/lepas percobaan uji (`POST /defects/:id/executions`, `DELETE /defects/:id/executions/:executionId`).
- Aturan alur bug dan pembatasan kolom ada di `@testboard/shared` (dipakai API, demo, dan UI); izin baru `defect.comment` dan `defect.link`.
- Tes integrasi TB-BUG-001..004, pembatasan kolom, komentar, tautan, idempotensi, isolasi proyek; ADR 0007.

## [0.4.0] - 2026-11-20

**Milestone 3 selesai**: siklus uji, perencanaan run, dan workspace eksekusi dari UI (mode API dan demo).

### Ditambahkan

- Halaman Siklus Uji: daftar siklus (periode, jumlah run yang bisa diklik), buat siklus dengan validasi kode dan urutan tanggal, ubah status siklus.
- Buat/ubah run (nama, kode otomatis atau manual, siklus, lingkungan, build, URL lingkungan) dan filter run per siklus.
- Detail run: tombol status sesuai alur `PLANNED -> ACTIVE -> COMPLETED -> (ACTIVE | LOCKED)` dengan konfirmasi (penguncian diberi peringatan final), tambah test case Siap Uji (cari, pilih semua, tugaskan langsung), pilih banyak baris untuk tugaskan/lepas penugasan atau keluarkan dari run, filter "Tugas saya"/belum ditugaskan/per penguji, tombol "Lanjutkan pengujian" ke case berikutnya yang belum diuji.
- Workspace eksekusi (`runs/:run/cases/:case`): skenario dari snapshot run (peringatan bila test case sudah punya versi lebih baru), hasil per langkah dengan "Tandai semua lulus", empat pilihan hasil besar, hasil aktual wajib saat gagal dan alasan wajib saat terhambat/dilewati, lingkungan uji (terisi dari percobaan terakhir), perbandingan dengan percobaan sebelumnya, riwayat percobaan append-only, bug terkait, navigasi sebelum/berikutnya, "Simpan & lanjut", kunci idempotensi anti klik ganda, peringatan perubahan belum disimpan. Di layar ponsel tampil sebagai tab Skenario / Catat hasil / Riwayat.
- Penjelasan yang jelas saat hasil tidak bisa dicatat (run belum dimulai/selesai/dikunci, case milik penguji lain, peran hanya melihat).
- Mode demo menerapkan aturan yang sama dengan API (transisi status, hanya READY, snapshot, attempt append-only, idempotensi, TESTER hanya case miliknya).
- Tes: aturan run/eksekusi di data demo dan alur UI siklus, perencanaan run, penguncian, eksekusi gagal/lulus/terhambat, hak penguji.

### Diubah

- Tabel responsif mendukung pilihan baris (kotak centang di tabel dan di kartu ponsel).
- Kolom bug terkait di detail run hanya tampil di layar lebar agar judul test case tetap terbaca.

## [0.3.1] - 2026-11-20

Milestone 3 bagian API.

### Ditambahkan

- Siklus uji: `GET/POST /projects/:p/cycles`, `PATCH /cycles/:id` (validasi tanggal, kode unik).
- Run: buat (kode otomatis `RUN-YYYYMMDD-N`), ubah, transisi status `PLANNED -> ACTIVE -> COMPLETED -> (ACTIVE | LOCKED)`, tambah test case READY dengan snapshot beku, keluarkan case yang belum punya hasil, tugaskan penguji massal (hanya anggota ADMIN/QA Lead/Tester aktif).
- Eksekusi: `POST /projects/:p/run-cases/:id/executions` append-only dengan nomor attempt di bawah kunci baris, INITIAL/RETEST, hasil per langkah, wajib hasil aktual (FAILED) / alasan (BLOCKED, SKIPPED), penguji & waktu dari server, TESTER hanya case miliknya, `Idempotency-Key` anti klik ganda. `GET /run-cases/:id` untuk workspace (snapshot, riwayat attempt, bug terkait, navigasi sebelum/berikutnya).
- Tes integrasi TB-RUN-001/002, TB-EXEC-001..004, siklus status, penugasan, idempotensi, isolasi proyek; ADR 0006.

## [0.3.0] - 2026-11-20

**Milestone 2 selesai**: login asli, sesi, Super Admin, hak akses per proyek, serta pengelolaan test case, anggota, modul, dan suite dari UI.

### Ditambahkan

- Web memakai API sungguhan saat `VITE_DEMO_MODE=false`: halaman login (email + kata sandi, pesan galat umum, info lockout), penjaga sesi (diarahkan ke login lalu kembali ke halaman tujuan), logout, bahasa mengikuti profil dan tersimpan ke profil saat diganti.
- Form buat/ubah test case: validasi di browser dengan skema yang sama dengan API, galat per kolom dari server, peringatan perubahan belum disimpan, `expected_version` mencegah saling timpa; aksi Duplikat, Arsipkan (dengan konfirmasi) dan Pulihkan.
- Halaman Tim & Pengaturan: anggota (tambah lewat email, ubah peran, keluarkan dengan konfirmasi), Modul & Suite (lihat dan tambah).
- Halaman Profil (nama, bahasa, ganti kata sandi) dan Kelola Pengguna khusus Super Admin (buat akun dengan kata sandi sementara yang tampil sekali, aktif/nonaktif, beri/cabut Super Admin).
- Tombol hanya tampil untuk peran yang berhak (matriks izin yang sama dengan API); akses langsung lewat URL tetap ditolak API.
- Komponen baru: Button, field form aksesibel (label, petunjuk, galat), dialog konfirmasi (fokus terkunci, Esc), toast; mode demo juga mendukung semua aksi ini secara fiktif.
- Tes web: alur login, buat/ubah/arsip test case, pembatasan VIEWER, peran anggota, akun baru, validasi kata sandi.

### Diubah

- Logika langkah uji bernomor dipindah ke `@testboard/shared` (dipakai API dan demo).

## [0.2.3] - 2026-11-20

### Ditambahkan

- API baca (read-only) untuk layar yang sudah ada di UI: `GET /projects/:p/runs`, `/runs/:id` (judul dari snapshot run, jumlah percobaan, bug terkait), `/defects` (filter `open`/status/severity/prioritas, cari, paginasi), `/defects/:id` (eksekusi terkait, riwayat status, komentar), `/reports/summary` (dasbor dari status terbaru per test case). Aksi tulis run/eksekusi tetap di Milestone 3, alur bug di Milestone 4.
- Tes integrasi: retest dihitung sekali (TB-DASH-001), snapshot run, filter bug terbuka, isolasi antar proyek.

## [0.2.2] - 2026-11-20

Milestone 2 bagian backend (API). Integrasi UI login & form test case menyusul (target `v0.3.0`).

### Ditambahkan

- Migration 0001-0005 disetujui dan **diterapkan ke database lokal** lewat runner baru `npm run db:migrate` (checksum, menolak file yang berubah). VPS belum.
- `npm run dev` otomatis menyalakan database lokal bila sudah di-setup.
- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /profile`, `POST /profile/change-password` - Argon2id, sesi server-side (hash token), cookie HttpOnly/SameSite, CSRF terikat sesi + cek origin, lockout percobaan login, audit LOGIN/LOGOUT.
- RBAC: matriks izin bersama (`@testboard/shared`), akses proyek (non-anggota = 404), Super Admin global.
- API proyek, anggota, modul, suite, test case (list/filter/search/paginasi, detail, buat dengan kode otomatis, edit = versi + revisi, `expected_version`, arsip, clone, riwayat revisi), admin pengguna & pengaturan website. Semua perubahan dicatat di `audit_logs` dalam transaksi yang sama.
- `npm run admin:create-super -w @testboard/api` (Super Admin pertama, untuk server) dan `npm run db:seed` (data demo fiktif + akun lokal).
- Tes integrasi (database `testboard_test` yang dibangun ulang setiap run): TB-AUTH-001..004, TB-RBAC-001..003, TB-CASE-001..004, CSRF, lockout, Super Admin; tes unit matriks izin & skema.
- ADR 0005 (desain auth, sesi, CSRF, RBAC, test case).

## [0.2.1] - 2026-11-20

### Ditambahkan

- Database lokal **tanpa Docker**: `npm run db:init|db:start|db:stop|db:status` menjalankan instance MariaDB 10.4.32 terpisah dari binary XAMPP (data di `.local-db/` drive D, port 3307), dengan `sql_mode` dan collation persis seperti VPS, user dev CRUD-only, dan schema baseline terimpor.
- API terhubung ke database: pool mysql2 (sesi UTC, BIGINT sebagai string, `sql_mode` sesi sama dengan server), `/api/v1/health` melaporkan status database (503 `degraded` bila mati).
- Tes integrasi database lokal (`npm run test:integration -w @testboard/api`): versi & pengaturan sama dengan VPS, UTC per koneksi, BIGINT aman, 27 tabel + view, user aplikasi tanpa hak DDL.
- Usulan migration Milestone 2 (belum diterapkan): `schema_migrations`, `user_sessions`, `user_system_roles` (Super Admin), `system_settings`, `auth_login_attempts` - sintaks sudah divalidasi di database sementara.
- ADR 0004: Super Admin global, DB lokal tanpa Docker, pengaturan DB VPS, brand lembut, konfirmasi kompresi wajib pada setiap upload.

### Diubah

- Tampilan lebih lembut: biru `#4361D6` (kontras AA), kanvas dan garis lebih kalem, bayangan tipis; logo ikut warna baru.
- Animasi halus: transisi halaman, tab, drawer, menu, tooltip, dan bar grafik dengan kurva perlambatan lembut; otomatis nonaktif bila OS memakai "kurangi gerakan".

## [0.2.0] - 2026-11-20

Milestone 1 selesai: design system & prototype demo yang bisa diklik (data contoh fiktif).

### Ditambahkan

- AppShell responsif: sidebar (desktop), drawer navigasi dengan focus trap dan Esc (ponsel/tablet), topbar dengan pemilih proyek, pencarian test case, ganti bahasa, menu pengguna demo, tautan "lewati ke konten".
- Routing sesuai sitemap doc 04 (React Router), filter tersimpan di URL sehingga refresh dan deep link tetap.
- Layar: Proyek, Dasbor, daftar & detail Test Case (tab Ringkasan/Dipakai di run/Revisi/Bukti), daftar & detail Run, daftar & detail Bug (riwayat status, eksekusi terkait, komentar), login DEMO tanpa kolom kata sandi, halaman "segera hadir" untuk fitur milestone berikutnya, 404.
- Dasbor dihitung dari status terbaru per test case dalam run (retest tidak dihitung ganda); bar status bersegmen dan grafik bug per severity mengikuti panduan dataviz (urutan hijau/kuning/merah aman buta warna, label + ikon, tooltip, tautan ke daftar terfilter).
- Komponen: badge status/severity/prioritas dengan ikon + label ID/EN, tabel responsif (kartu di ponsel), filter, paginasi, tab aksesibel, state loading/kosong/galat dengan kode referensi.
- `@testboard/shared`: DTO kontrak API dan helper metrik (status terbaru, tingkat lulus, bug terbuka).
- Data demo fiktif deterministik (2 proyek, 39 test case, 4 run, retest, 14 bug) melalui adaptor `DataSource`; adaptor HTTP sudah memakai endpoint kontrak doc 06 untuk Milestone 2-3.
- Panduan deploy demo Cloudflare Pages (`docs/deploy/cloudflare-demo.md`), belum di-deploy.
- Tes: paritas kunci ID/EN, invarian data mock (isolasi antar proyek, retest), render halaman via router.

## [0.1.1] - 2026-11-20

### Diubah

- Database lokal: Docker `mariadb:10.4.32`, sama persis dengan VPS (sebelumnya MySQL 8.4). Batasan MariaDB 10.4 dan risiko EOL dicatat di ADR 0003.
- Brand: logo TestBoard baru mengikuti tata bahasa logo hub Kemnaker (Karirhub, Skillhub, Maganghub): simbol centang + titik, wordmark Inter "**Test**Board", endorsement "oleh PASKER ID". Warna utama UI menjadi biru-indigo `#3347E0`. Font Inter dibundel lokal. Spesifikasi di `docs/brand/README.md`.

## [0.1.0] - 2026-11-20

### Ditambahkan

- Milestone 0 (fondasi): monorepo npm workspaces (`packages/shared`, `apps/api`, `apps/web`), TypeScript strict, ESLint, Prettier, CI GitHub Actions.
- `@testboard/shared`: enum status/kode sesuai schema baseline, tipe kontrak API, helper ID BIGINT-sebagai-string.
- `@testboard/api`: Hono + Node, `GET /api/v1/health`, request id (`X-Request-Id`), secure headers, format error seragam, validasi env (API produksi wajib loopback).
- `@testboard/web`: React + Vite + Tailwind (token design system), i18n ID/EN tanpa reload, adaptor data mock/http, halaman fondasi dengan status API.
- Dokumen blueprint di `docs/blueprint/` (IP VPS disensor), schema baseline read-only, docker-compose MySQL lokal opsional, ADR 0001-0002.
