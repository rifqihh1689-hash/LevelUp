# MBAPPE OS

RPG kehidupan pribadi untuk satu pengguna: koas FK UB / RSSA → UKMPPD Feb 2028 → PPDS ortopedi.
Game ini menghadiahi **pemulihan, bukan volume**. Tidur adalah pengali semua XP.

Satu file: [`index.html`](index.html). Tanpa build step, tanpa server, tanpa akun, tanpa notifikasi.

## Pakai di HP

1. Buka `index.html` di browser HP. Paling stabil lewat hosting statis (mis. GitHub Pages untuk repo ini). Membuka file lokal juga bisa, tapi beberapa browser HP membatasi localStorage untuk `file://`.
2. Tambahkan ke layar utama ("Add to Home Screen") supaya terbuka seperti aplikasi.
3. Data contoh 7 hari dimuat saat pertama kali dibuka. Hapus dengan tombol **Hapus data contoh**.
4. Isi angka pribadi di **Setelan → Keuangan & target**: sisa utang (HP boss), target Dana Jembatan, target band IELTS.
5. Isi 3 proyek aktif di **Karakter → Main Quest**.

Data tersimpan di localStorage perangkat itu saja. **Export JSON** tiap Weekly Raid (ada pengingatnya), karena menghapus data browser akan menghapus semuanya.

## Alur harian (≤2 menit)

Mutaba'ah (tahajjud, Subuh) → tipe hari (1 tap) → jam tidur malam (1 tap) → centang quest. Setelah tidur siang/qailulah, tap jamnya: total tidur (malam + siang) yang menentukan pengali. Jam berhenti kerja diisi malam itu, atau besok pagi lewat kartu **Tutup kemarin**.

## Uji

```bash
node tests/e2e.js          # butuh paket playwright + Chromium
SHOT_DIR=/tmp node tests/e2e.js   # sekalian simpan screenshot
```

93 pemeriksaan: tipe hari, XP × pengali, Sleep Debt, overtime + token, batas 100, streak saat JAGA/PASCA, jawaban kosong saat hari terkunci, Main Quest ke-4 terkunci, tidur siang & migrasi skema, Raid, reload, export → import identik, localStorage gagal, chapter berat, kunci hadiah. Browser sengaja dijalankan di zona waktu Los Angeles untuk membuktikan aplikasi tetap memakai WIB.

Desain lengkap (model data, rumus, celah & penutupnya): [`DESIGN.md`](DESIGN.md).
