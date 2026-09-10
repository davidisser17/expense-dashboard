# Panduan Setup Sinkronisasi Gmail

Fitur **Sinkron Gmail** berada di **halaman detail masing-masing bulan**. Setelah memilih **periode pemindaian** (bulan ini, minggu ini, minggu lalu, atau range tanggal), aplikasi memindai email pada periode tersebut (mis. struk GoPay, Shopee, Tokopedia, Grab, OVO, DANA, tagihan, dll), lalu menampilkan **preview/screening** sebelum data masuk ke database bulan yang sedang dibuka — kategori bisa diubah per item sebelum disimpan.

**Dedup otomatis:** setiap email yang datanya sudah disimpan akan ditandai **sudah dibaca (read)** di Gmail dan dicatat ID-nya di database — sehingga saat sinkronisasi ulang, data tersebut **tidak muncul lagi**.

## Prasyarat Sekali Saja: Google OAuth Client ID

Client ID **tersimpan langsung di kode aplikasi** (`GMAIL_CLIENT_ID_DEFAULT` di `src/App.js`) — tidak perlu diinput di browser:
`631899575231-opsuvitd08tj7ef1i3mdj2n2814i887g.apps.googleusercontent.com`

Pastikan Client ID tersebut sudah dikonfigurasi di Google Cloud Console:

1. **Buka [Google Cloud Console](https://console.cloud.google.com/)** dengan akun Gmail Anda (project `expense-dashboard-fc6b2`).

2. **Aktifkan Gmail API:**
   - Menu **APIs & Services → Library**
   - Cari **"Gmail API"** → klik **Enable**

3. **Setup OAuth consent screen:**
   - Menu **APIs & Services → OAuth consent screen**
   - Pilih tipe **External** → isi nama app & email → **Create**
   - Bagian **Data Access / Scopes** → **Add or Remove Scopes** → tambahkan scope `https://www.googleapis.com/auth/gmail.modify` (**gmail.modify** — baca + tandai email sudah dibaca; **tidak bisa menghapus email**) → **Save**
   - Bagian **Test users** → **Add Users** → tambahkan alamat Gmail Anda sendiri

4. **Cek OAuth Client ID (tipe Web application):**
   - Menu **APIs & Services → Credentials**
   - **Authorized JavaScript origins** — pastikan berisi semua origin tempat aplikasi dijalankan:
     - `http://localhost:3000` (development)
     - `https://davidisser17.github.io` (GitHub Pages)

> Jika ingin memakai Client ID lain, cukup ubah nilai `GMAIL_CLIENT_ID_DEFAULT` di `src/App.js`.

## Sesi Tersimpan di Browser (Tanpa Login Ulang)

- Setelah Anda memberi izin **sekali**, token akses Gmail disimpan di browser (localStorage)
- Pemindaian berikutnya **tidak menampilkan popup sama sekali** selama token masih valid
- Token Google hanya berlaku ±1 jam (kebijakan Google). Saat kedaluwarsa, aplikasi **memperbarui token secara otomatis dan senyap** — tanpa popup dan tanpa klik apa pun — selama Anda masih login akun Google di browser tersebut
- Popup izin hanya muncul lagi jika: sesi Google di browser habis/logout, Anda menghapus data situs, atau logout dari aplikasi (sesi Gmail sengaja dibersihkan demi keamanan)

## Alur Pemakaian (Per Bulan)

1. Buka **Dashboard → klik bulan yang dituju** → halaman detail bulan muncul
2. Klik tombol **Sinkron Gmail** (di sebelah Import/Export CSV)
3. **Pilih periode pemindaian:**
   - **Bulan Ini** (default) — email pada bulan yang sedang dibuka
   - **Minggu Ini** — Senin–Minggu pekan berjalan
   - **Minggu Lalu** — Senin–Minggu pekan sebelumnya
   - **Pilih Range Tanggal** — tentukan tanggal mulai & akhir sendiri

   > Semua email pada periode terpilih dipindai (kecuali notifikasi media sosial/forum) — deteksi transaksi dilakukan oleh parser pada tiap email, jadi email dengan subjek/pengirim berbeda pun tetap terdeteksi selama ada nominal "Rp/IDR" di isinya.
4. Klik **Mulai Pemindaian** → popup Google muncul → pilih akun → **Lanjutkan** untuk memberi izin
5. **Preview/screening**: daftar transaksi terdeteksi dengan kategori tebakan otomatis:
   - ☑️ Centang/hilangkan centang untuk memilih data yang mau disimpan
   - Ubah **kategori** lewat dropdown di tiap baris (Ngopi / Makan / Nongkrong / Tak Terduga)
6. Klik **Simpan ke Database** → data masuk ke **bulan yang sedang dibuka**; email terkait otomatis ditandai **read** di Gmail dan tidak akan muncul lagi pada pemindaian berikutnya

## Catatan Privasi

- Scope yang diminta `gmail.modify` — aplikasi **tidak bisa mengirim/menghapus email**; hanya membaca dan menandai email sudah dibaca
- Pemindaian terjadi langsung di browser Anda; isi email tidak disimpan di server aplikasi
- Hanya ringkasan transaksi terdeteksi (tanggal, nominal, deskripsi, kategori) + ID email yang disimpan ke Firestore Anda setelah dikonfirmasi di preview
- Riwayat ID email yang sudah disinkronkan disimpan di field `syncedGmailIds` pada dokumen bulan — ini yang mencegah data kembar saat pemindaian ulang

## Troubleshooting

| Pesan Error | Solusi |
|---|---|
| `Akses Gmail ditolak (403)` | Pastikan Gmail API aktif & email Anda terdaftar sebagai **Test user** di OAuth consent screen |
| `invalid_scope` / scope error di popup | Tambahkan scope `gmail.modify` di **Data Access** OAuth consent screen, lalu coba lagi |
| `origin_mismatch` / popup error | Tambahkan origin aplikasi (`http://localhost:3000` / `https://davidisser17.github.io`) di **Authorized JavaScript origins** — harus persis sama dengan URL di address bar (scheme + host + port, tanpa path, tanpa garis miring akhir) |
| `access_denied` di popup Google | Klik **Lanjutkan** saat peringatan "app not verified" (wajar untuk app mode Testing) |
| Tidak ada transaksi terdeteksi | Cek apakah email struk pada periode itu mengandung nominal "Rp ..." — nominal tanpa "Rp"/"IDR" tidak terdeteksi |
| Data yang lama muncul lagi | Data hanya dianggap "sudah disinkronkan" jika disimpan lewat fitur Sinkron Gmail; input manual tidak terdeteksi |

