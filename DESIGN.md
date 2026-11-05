# MBAPPE OS — Desain

## Prinsip yang dikunci di kode

| Prinsip | Implementasi |
|---|---|
| Hadiah untuk pemulihan | Pengali tidur dikalikan ke semua XP NORMAL/LIBUR. Setelan menolak tabel pengali yang tidak naik seiring jam tidur. |
| Tipe hari menentukan quest | NORMAL / JAGA / PASCA-JAGA / LIBUR. PASCA hanya berisi quest pemulihan. JAGA & PASCA tidak pernah memutus streak. |
| XP dari lead measure | Quest harian = tindakan hari ini. 1RM, waktu lari, saldo, utang = boss & milestone (0 XP). |
| Edit / lihat statistik = 0 XP | Hari yang lewat jendela isi mundur **dibekukan**. Mengedit quest/mekanika tidak mengubah XP masa lalu. |
| WIP ≤ 3 | Main Quest ke-4 hanya bisa disimpan ke Beku. Batas WIP di Setelan maksimal 3. |
| Mutaba'ah tanpa skor | Disimpan terpisah, tampilan netral abu-abu, tidak masuk XP, level, streak, raid, atau heatmap. Tampil paling atas di Hari Ini karena ibadah pagi adalah amal pertama hari itu. |
| Tanpa sosial/notifikasi | Tidak ada jaringan sama sekali. Setiap kolom catatan bebas diberi peringatan identitas pasien + deteksi pola (No. RM, angka ≥6 digit, Tn./Ny./An. + nama). |

## Model data (`schemaVersion: 2`)

```jsonc
{
  "schemaVersion": 2,
  "settings": { "xpSize": {"kecil":5,"sedang":10,"besar":20}, "dailyCap":100,
    "sleepTiers":[{"min":6.5,"mult":1.2},{"min":6,"mult":1.0},{"min":5,"mult":0.8},{"min":0,"mult":0.6}],
    "sleepDebtBelow":5, "sleepQuestMin":6, "overtimePenalty":15, "overtimeTokensPerWeek":1,
    "worstCaseEmpty":true, "passPct":60, "shieldsPerWeek":1, "levelBase":150, "levelStep":50,
    "statDivisor":3, "jagaMult":1.0, "pascaXP":100, "raidXP":50, "wipLimit":3, "mqSize":"sedang",
    "backfillDays":1, "heavyTargetPct":60, "napCounts":true, "tentirMin":9, "tentirMax":15, "careerMinHours":2 },
  "finance":  { "debtInitial":null, "debtTargetDate":"YYYY-MM-DD", "bridgeTarget":null, "bridgeTargetDate":"YYYY-MM-DD" },
  "targets":  { "benchKg":100, "run5kBaselineSec":1860, "ieltsBand":null, "koasEnd":"YYYY-MM-DD", "ukmppd":"YYYY-MM-DD" },
  "milestones": { "srSubmittedAt":null, "ielts":[{"date":"…","band":6.5}] },
  "quests": [{ "id":"q_lift", "name":"Beban sore", "stat":"STR", "size":"besar", "types":["NORMAL","LIBUR"],
               "days":[1,3,5], "freq":"daily|weekly", "tag":"heavy|interval|sleep|workend|tentir|sdwalk|",
               "core":true, "metric":"latihan|karier|konten|", "hours":0, "active":true, "sys":false }],
  "mutabaah": [{ "id":"m_qiyam", "name":"Ibadah pagi (contoh)" }],
  "chapters": [{ "id":"…", "name":"Stase contoh", "start":"YYYY-MM-DD", "end":"YYYY-MM-DD", "weight":"ringan|sedang|berat", "summarySeen":false }],
  "mainQuests": [{ "id":"…", "name":"…", "stat":"RSC", "status":"aktif|beku|selesai", "next":"langkah berikut", "createdAt":"…", "doneAt":null }],
  "days": { "YYYY-MM-DD": { "type":"NORMAL", "sleep":5.25, "nap":1, "done":{"q_study":true,"MQ:<id>":true},
             "workEnd":"ok|late|null", "token":false, "shield":false, "tentir":{"jam":2,"sesi":1,"ok":true},
             "mut":{"m_qiyam":true}, "note":"", "frozen":{ "…hasil final saat hari terkunci…" } } },
  "weekly": { "YYYY-MM-DD (Senin)": { "debt":0, "bridge":0, "leads":0, "priorities":["","",""],
             "raidDone":false, "raidXP":50, "snapshot":{ "…8 angka saat raid…" } } },
  "workouts": [{ "kind":"bench", "date":"…", "kg":60, "reps":5, "sets":3 }, { "kind":"run", "km":5, "sec":1860, "runType":"easy|kualitas|tes" }],
  "rewards": [{ "id":"…", "name":"…", "cost":0 }],
  "claims":  [{ "rewardId":"…", "date":"…", "level":3 }]
}
```

Meta yang tidak ikut export (`lastExportAt`) disimpan di kunci terpisah, supaya export → import menghasilkan data yang identik byte-per-byte.

## Rumus XP final

- **NORMAL / LIBUR:** `XP = round(min(Σ XP quest selesai, 100) × M_tidur) − 15·[overtime ∧ ¬token]`
  - `M_tidur` dari **total tidur = tidur malam sebelumnya + tidur siang (qailulah) hari itu**: ≥6,5 → ×1,2 · 6–6,5 → ×1,0 · 5–6 → ×0,8 · <5 → ×0,6 · kosong → ×0,6.
  - Sleep Debt (total <5 jam): quest `heavy` & `interval` terkunci, diganti "Jalan/mobilitas 20 mnt" (10 XP). Tidur siang yang menaikkan total ke ≥5 jam membukanya lagi.
  - Hitungan tidur siang bisa dimatikan di Setelan (`napCounts`).
- **JAGA:** `round(min(Σ, 100) × 1,0)`. Tidak ada debuff (malam jaga).
- **PASCA-JAGA:** `round(100 × selesai/total) − 15·[overtime ∧ ¬token]`. Hanya sah bila kemarin JAGA.
- **Lolos:** selesai/total ≥ 60% (quest mingguan di luar penyebut). Tentir hanya masuk daftar bila ada jam tentir.
- **Streak:** hari lolos berturut-turut. JAGA/PASCA & hari ber-shield netral (tidak memutus, tidak menambah). Hari ini yang belum lolos tidak memutus.
- **Total XP** = Σ XP harian + 50 per Raid. **Level** L→L+1 butuh `150 + 50·L`. **Stat**: `(150 + 50·L) / 3`.
- **Stat XP** = porsi tiap quest × (min(Σ,100)/Σ) × M. Penalti overtime dipotong dari VIT.
- **Chapter berat:** hanya quest inti ★ + maksimal 1 blok Main Quest. Target harian = 60% dari batas.
- **Kalkulator:** e1RM Epley = beban × (1 + rep/30), 1 rep = beban aktual. Riegel 10K = waktu 5K × 2^1,06.

## Celah "menang dengan mengorbankan tidur" & penutupnya

| Celah | Penutup |
|---|---|
| Begadang untuk menambah quest | Batas 100 sebelum pengali. Tidur <5 j paling banyak 60 XP, ≥6,5 j sampai 120 XP. |
| Tentir sampai malam demi uang/XP | Jam tentir 0 XP. XP hanya untuk "selesai ≤21.00". Tentir lewat 21.00 otomatis tercatat overtime. Raid menandai jam di atas kapasitas 15 j/minggu. |
| Token overtime sebagai jalan pintas | Token hanya membatalkan −15, quest "berhenti ≤21.00" tetap gagal. Satu token per minggu. |
| Tidak mengisi jam kerja/tidur | Data kosong = skenario terburuk: tidur kosong ×0,6; jam kerja kosong saat hari terkunci = lewat 21.00. |
| Mengubah Setelan jadi menu cheat | Pagar pengaman: pengali wajib monoton naik, tier terpendek ≤ ×1,0, PASCA ≤ batas, WIP ≤ 3, ukuran XP berurutan & ≤50. |
| Mengubah definisi quest untuk menaikkan XP masa lalu | Hari terkunci dibekukan (hasil final disimpan). |
| PASCA-JAGA palsu (100 XP mudah) | Hanya sah setelah JAGA. Bila tidak, dihitung NORMAL dan bisa memutus streak. |
| Sleep Debt untuk menukar quest berat | Pengganti 10 XP + pengali ×0,6. Selalu rugi. |
| Menambal streak lewat edit riwayat | Isi mundur 1 hari. Shield 1/minggu, hanya 7 hari terakhir. |
| Farming Raid / Main Quest | Raid 1×/minggu. Menyelesaikan Main Quest 0 XP; yang dihargai blok kerja harian, dan WIP ≤3 membatasinya. |
| Sisa risiko | Jam tidur dan status JAGA dilaporkan sendiri. Tanpa sensor, kejujuran tetap asumsi dasar. |

## Layar

1. **Hari Ini** — tipe hari, jam tidur, quest (checkbox besar), tentir, mingguan, XP & pengali (bar lengket di atas), mutaba'ah, catatan, shield, prioritas minggu ini, kartu "Tutup kemarin".
2. **Karakter** — level, XP bar, radar 6 stat, status effect, streak/shield/token, Main Quest (aktif/beku/selesai), hadiah.
3. **Boss & Milestone** — Boss Utang (HP, damage, proyeksi lunas), Shield Dana Jembatan, milestone, kalkulator, hitung mundur.
4. **Weekly Raid** — Minggu (susulan Senin), timer 30 menit, dashboard 8 angka, 3 angka mingguan, 3 prioritas, pengingat backup, +50 XP.
5. **Riwayat** — heatmap bulanan (warna = tipe hari, isi penuh = lolos), detail hari, log latihan, mutaba'ah 30 hari, ringkasan chapter.
6. **Setelan** — quest, mekanika, chapter, keuangan & target, hadiah, mutaba'ah, export/import, ringkasan aturan.

## Jadwal malam & tidur siang (v2)

Pola umum: tidur malam bisa pendek karena bangun sebelum fajar untuk ibadah. Kalau pengali hanya memakai tidur malam, game menghukum ibadah itu setiap hari dan mengadu ibadah dengan poin. Itu bertentangan dengan alasan mutaba'ah dibuat tanpa XP. Karena itu sejak v2:

- Pengali dan Sleep Debt memakai **total tidur 24 jam** (malam + qailulah). Tidur siang setelah jadwal pagi adalah lead measure yang bisa dikendalikan hari itu.
- Kartu Tidur menunjukkan berapa jam tidur siang lagi untuk naik tier atau membuka beban: hadiah untuk pemulihan, bukan untuk tidur lebih sedikit.
- Ibadah harian tetap mutaba'ah: tanpa XP, tanpa streak, hanya catatan konsistensi 7 dan 30 hari.
- Prinsip 1 tetap utuh: tidak ada cara menang dengan tidur lebih sedikit. Yang berubah hanya *kapan* tidur dihitung.

Migrasi v1 → v2 menambahkan `nap: 0` ke setiap hari dan memperbarui nama bawaan. Hari yang sudah terkunci tetap memakai hasil bekunya.
