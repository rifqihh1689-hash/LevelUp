// Uji penerimaan MBAPPE OS (Playwright, Chromium, lebar 375 px).
// Jalankan: node tests/e2e.js   (butuh paket `playwright` + Chromium)
// Browser sengaja di zona waktu America/Los_Angeles untuk membuktikan aplikasi tetap memakai WIB.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOT_DIR || null; // isi untuk menyimpan screenshot
const T0 = '2026-11-03T10:00:00+07:00';   // Selasa
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const section = (t) => console.log('\n' + t);

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const urlAt = (iso) => base + '?now=' + encodeURIComponent(iso);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, timezoneId: 'America/Los_Angeles', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const xpToday = async () => parseInt(await page.textContent('#xpToday'), 10);
  const day = (k) => ev((k) => MBAPPE.computeDay(k), k);
  const setNow = (iso) => ev((iso) => MBAPPE.setNow(iso), iso);
  const tab = (t) => page.click(`#tabs [data-tab=${t}]`);
  const qids = () => page.$$eval('#questCard [data-qid]', (els) => els.map((e) => e.dataset.qid));
  const stateJSON = () => ev(() => JSON.stringify(MBAPPE.state));
  const sheetText = async () => ((await page.$('#sheet.open')) ? page.textContent('#sheet') : '');
  const closeSheet = async () => { if (await page.$('#sheet.open')) await page.click('#sheet .sheet-bg', { position: { x: 10, y: 10 } }); };
  const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };

  await page.goto(urlAt(T0));

  section('0. Data contoh & zona waktu');
  const st0 = await ev(() => ({ n: Object.keys(MBAPPE.state.days).length, types: Object.values(MBAPPE.state.days).map((d) => d.type), today: MBAPPE.todayKey(), streak: MBAPPE.streakInfo().cur }));
  ok(st0.n === 7, '7 hari data contoh', st0.n);
  ok(st0.types.includes('JAGA') && st0.types.includes('PASCA'), 'data contoh memuat JAGA & PASCA-JAGA');
  ok(st0.today === '2026-11-03', 'hari ini 2026-11-03 walau browser di Los Angeles', st0.today);
  ok(st0.streak === 5, 'streak contoh = 5 (JAGA/PASCA tidak memutus)', st0.streak);
  const sw = await ev(() => document.documentElement.scrollWidth);
  ok(sw <= 375, 'tidak ada scroll horizontal di 375 px', sw);

  await page.click('[data-act=closeY][data-v=ok]');
  ok((await ev(() => MBAPPE.state.days['2026-11-02'].workEnd)) === 'ok', 'kartu "Tutup kemarin": 1 tap menutup jam kerja kemarin');

  section('1. Hari berganti pukul 03.00 WIB');
  await setNow('2026-11-04T02:59:00+07:00');
  ok((await ev(() => MBAPPE.todayKey())) === '2026-11-03', '02.59 WIB masih 3 Nov');
  await setNow('2026-11-04T03:00:00+07:00');
  ok((await ev(() => MBAPPE.todayKey())) === '2026-11-04', '03.00 WIB sudah 4 Nov');
  await setNow(T0);

  section('2. Hapus data contoh (satu tombol)');
  await page.click('[data-act=clearSample]');
  const st1 = await ev(() => ({ n: Object.keys(MBAPPE.state.days).length, s: MBAPPE.state.sampleLoaded, mq: MBAPPE.state.mainQuests.length, debt: MBAPPE.state.finance.debtInitial }));
  ok(st1.n === 0 && !st1.s && st1.mq === 0 && st1.debt === null, 'semua data contoh terhapus', st1);

  section('3. Ganti tipe hari');
  await page.click('[data-act=setType][data-type=NORMAL]');
  let q = await qids();
  ok(q.length === 8 && q.includes('q_run_easy') && q.includes('q_referat') && !q.includes('q_lift'), 'NORMAL Selasa: 8 quest sesuai jadwal', q);
  await page.click('[data-act=setType][data-type=JAGA]');
  q = await qids();
  ok(q.length === 2 && q.includes('j_nap') && q.includes('j_finish'), 'JAGA: tidur siang pra-jaga + selesaikan jaga', q);
  ok((await page.$('#multPill')) === null && (await page.textContent('#xpFormula')).includes('×1,0 tetap'), 'JAGA: pengali ×1,0 tetap');
  await page.click('[data-act=setType][data-type=LIBUR]');
  q = await qids();
  ok(q.length === 7 && !q.includes('q_referat'), 'LIBUR: daftar quest libur', q);
  // PASCA tanpa JAGA kemarin: kemarin otomatis ditandai JAGA
  await page.click('[data-act=setType][data-type=PASCA]');
  q = await qids();
  ok(q.length === 3 && q.every((x) => x.startsWith('p_')), 'PASCA-JAGA: hanya quest pemulihan', q);
  ok((await ev(() => MBAPPE.state.days['2026-11-02'].type)) === 'JAGA', 'kemarin otomatis ditandai JAGA');
  ok((await page.$('#sleepVal')) === null, 'PASCA-JAGA: input tidur disembunyikan');
  for (const id of ['p_rest', 'p_eat', 'p_walk']) await page.click(`[data-act=toggleQ][data-id=${id}]`);
  ok((await xpToday()) === 100, 'PASCA-JAGA selesai = 100 XP', await xpToday());
  ok((await page.textContent('#passChip')).includes('Lolos'), 'PASCA-JAGA selesai = hari lolos');
  // kembalikan: kemarin NORMAL, hari ini NORMAL
  await page.click('[data-act=dayPrev]');
  await page.click('[data-act=setType][data-type=NORMAL]');
  await page.click('[data-act=dayNext]');
  const inv = await day('2026-11-03');
  ok(inv.invalidPasca === true && inv.effType === 'NORMAL', 'PASCA tanpa JAGA kemarin dihitung NORMAL (celah ditutup)', inv.effType);
  await page.click('[data-act=setType][data-type=NORMAL]');
  // PASCA saat kemarin NORMAL: minta konfirmasi, batal = tidak berubah
  await page.click('[data-act=setType][data-type=PASCA]');
  ok(await page.isVisible('[data-act=confirmOk]'), 'PASCA saat kemarin NORMAL → minta konfirmasi');
  await page.click('#sheet [data-act=closeSheet].btn');
  ok((await ev(() => MBAPPE.state.days['2026-11-03'].type)) === 'NORMAL', 'batal → tipe tetap NORMAL');

  section('4. XP & pengali tidur');
  await page.click('[data-act=setSleep][data-v="7"]');
  ok((await page.textContent('#multPill')).trim() === '×1,2', 'tidur 7 jam → ×1,2');
  await page.click('[data-act=toggleQ][data-id=q_study]');
  await page.click('[data-act=toggleQ][data-id=q_drill]');
  ok((await xpToday()) === 36, '(10 tidur + 10 + 10) × 1,2 = 36', await xpToday());
  await page.click('[data-act=setSleep][data-v="6"]');
  ok((await xpToday()) === 30, 'tidur 6 jam: 30 × 1,0 = 30', await xpToday());
  await page.click('[data-act=setSleep][data-v="5.5"]');
  ok((await xpToday()) === 16, 'tidur 5,5 jam: quest tidur gagal, 20 × 0,8 = 16', await xpToday());
  await page.click('[data-act=setSleep][data-v="4.5"]');
  ok((await xpToday()) === 12, 'tidur 4,5 jam: 20 × 0,6 = 12', await xpToday());
  await page.click('[data-act=stepSleep][data-d="0.25"]');
  ok((await page.textContent('#sleepVal')) === '4,75', 'stepper +15 menit → 4,75');
  // Sleep Debt di hari angkat beban (Senin = kemarin)
  await page.click('[data-act=dayPrev]');
  await page.click('[data-act=setSleep][data-v="4.5"]');
  q = await qids();
  const lockedTxt = await page.$$eval('.q.locked .qn', (e) => e.map((x) => x.textContent));
  ok(!q.includes('q_lift') && q.includes('sd_walk') && lockedTxt.some((t) => t.includes('Beban')), 'Sleep Debt: beban terkunci, diganti jalan/mobilitas 20 mnt', { q, lockedTxt });
  ok((await page.textContent('#effects')).includes('Sleep Debt'), 'status effect Sleep Debt tampil');
  ok((await page.textContent('#napHint')).includes('0,5 j lagi'), 'petunjuk: tidur siang 0,5 j lagi membuka beban', await page.textContent('#napHint'));
  await page.click('[data-act=setNap][data-v="0.5"]');
  q = await qids();
  ok(q.includes('q_lift') && !q.includes('sd_walk') && (await page.textContent('#sleepTotal')) === '5 j', 'qailulah 0,5 j → total 5 j, Sleep Debt hilang, beban terbuka');
  await page.click('[data-act=setNap][data-v="0"]');
  await page.click('[data-act=setSleep][data-v="6.5"]');
  q = await qids();
  ok(q.includes('q_lift') && !q.includes('sd_walk'), 'tidur 6,5 jam: beban terbuka lagi');
  await page.click('[data-act=dayNext]');
  // jadwal tahajjud: tidur malam pendek + qailulah
  await page.click('[data-act=setSleep][data-v="5"]');
  ok((await xpToday()) === 16, 'malam 5 j tanpa tidur siang: 20 × 0,8 = 16', await xpToday());
  await page.click('[data-act=setNap][data-v="1"]');
  ok((await xpToday()) === 30 && (await page.textContent('#sleepTotal')) === '6 j', 'malam 5 j + qailulah 1 j = 6 j: quest tidur ✓, 30 × 1,0 = 30', await xpToday());
  await page.click('[data-act=setNap][data-v="1.5"]');
  ok((await page.textContent('#multPill')).trim() === '×1,2', 'malam 5 j + siang 1,5 j = 6,5 j → ×1,2');
  await page.click('[data-act=setNap][data-v="0"]');
  await page.click('[data-act=setSleep][data-v="7"]');
  const order = await ev(() => !!(document.querySelector('#mutCard').compareDocumentPosition(document.querySelector('.types')) & Node.DOCUMENT_POSITION_FOLLOWING));
  ok(order, "mutaba'ah tampil sebelum tipe hari (tahajjud & Subuh lebih dulu)");
  ok((await page.textContent('#mutCard')).includes('Tahajjud sebelum Subuh') && !(await page.textContent('#mutCard')).includes('XP '), "Tahajjud tercatat sebagai mutaba'ah, tanpa XP");

  section('5. Debuff Overtime & token');
  const before = await xpToday();
  await page.click('[data-act=setWorkEnd][data-v=late]');
  ok((await xpToday()) === before - 15, 'lewat 21.00 → −15 XP', [before, await xpToday()]);
  await page.click('[data-act=useToken]');
  ok((await xpToday()) === before, 'token pengecualian membatalkan −15 (tanpa bonus)', await xpToday());
  await page.click('[data-act=dayPrev]');
  await page.click('[data-act=setWorkEnd][data-v=late]');
  ok(await page.isDisabled('[data-act=useToken]'), 'token kedua di minggu yang sama tidak tersedia');
  ok((await day('2026-11-02')).penalty === 15, 'kemarin kena −15');
  await page.click('[data-act=dayNext]');
  await page.click('[data-act=setWorkEnd][data-v=ok]');  // hari ini: ok (token otomatis dilepas)
  ok((await ev(() => MBAPPE.state.days['2026-11-03'].token)) === false, 'jawab ≤21.00 → token dikembalikan');
  // tentir lewat 21.00 → otomatis overtime
  await page.click('[data-act=stepTentir][data-d="0.5"]');
  await page.click('[data-act=stepTentir][data-d="0.5"]');
  ok((await qids()).includes('q_tentir'), 'tentir > 0 jam → quest tentir muncul');
  await page.click('[data-act=setTentirOk][data-v="0"]');
  ok((await ev(() => MBAPPE.state.days['2026-11-03'].workEnd)) === 'late', 'tentir lewat 21.00 → tercatat overtime');
  await page.click('[data-act=setTentirOk][data-v="1"]');
  await page.click('[data-act=setWorkEnd][data-v=ok]');

  section('6. Main Quest ke-4 terkunci (WIP ≤ 3)');
  await tab('char');
  for (const n of ['Systematic review', 'Bank soal UKMPPD', 'Program bench']) {
    await page.click('#mqAddBtn');
    await page.fill('form[data-form=mq] input[name=name]', n);
    await page.click('form[data-form=mq] button[type=submit]');
  }
  ok((await page.textContent('#mqCount')).includes('3/3'), 'Aktif 3/3');
  ok((await page.textContent('#mqAddBtn')).includes('terkunci'), 'tombol Main Quest ke-4 terkunci');
  await page.click('#mqAddBtn');
  ok((await page.textContent('form[data-form=mq]')).includes('Simpan ke Beku'), 'form ke-4 hanya bisa menyimpan ke Beku');
  await page.fill('form[data-form=mq] input[name=name]', 'Ide proyek ke-4');
  await page.click('form[data-form=mq] button[type=submit]');
  let mq = await ev(() => MBAPPE.state.mainQuests.map((m) => m.status));
  ok(mq.filter((s) => s === 'aktif').length === 3 && mq.filter((s) => s === 'beku').length === 1, 'yang ke-4 masuk Beku, aktif tetap 3', mq);
  await page.dispatchEvent('[data-act=mqActivate]', 'click'); // tombol aria-disabled tetap bisa di-tap
  mq = await ev(() => MBAPPE.state.mainQuests.filter((m) => m.status === 'aktif').length);
  ok(mq === 3, 'mengaktifkan dari Beku ditolak saat WIP penuh', mq);
  ok((await page.textContent('#toast')).includes('Terkunci'), 'pesan terkunci tampil');
  await page.click('[data-act=mqFreeze]');
  ok(!(await page.textContent('#mqAddBtn')).includes('terkunci'), 'setelah 1 dibekukan → slot terbuka');
  await page.click('[data-act=mqActivate] >> nth=0');
  ok((await page.textContent('#mqCount')).includes('3/3'), 'aktifkan dari Beku → 3/3 lagi');

  section('7. Batas XP harian 100');
  await tab('today');
  const ids = await page.$$eval('#questCard [data-act=toggleQ]', (e) => e.filter((b) => b.getAttribute('aria-pressed') === 'false').map((b) => b.dataset.id));
  for (const id of ids) await page.click(`#questCard [data-act=toggleQ][data-id="${id}"]`);
  const r3 = await day('2026-11-03');
  ok(r3.base > 100 && r3.capped === 100 && r3.xp === 120, `semua quest + 3 blok MQ: dasar ${r3.base} → dibatasi 100 × 1,2 = 120`, { base: r3.base, xp: r3.xp });
  ok(r3.pass, 'hari ini lolos');
  await shot('today-full');

  section('8. Streak saat JAGA/PASCA-JAGA & jawaban kosong');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 1, 'streak = 1 (kemarin gagal, hari ini lolos)');
  await setNow('2026-11-04T10:00:00+07:00');
  await page.click('[data-act=setType][data-type=JAGA]');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 1, 'JAGA tanpa quest selesai: streak tetap 1');
  await setNow('2026-11-05T10:00:00+07:00');
  await page.click('[data-act=setType][data-type=PASCA]');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 1, 'PASCA-JAGA tanpa quest selesai: streak tetap 1');
  await setNow('2026-11-06T10:00:00+07:00');
  await page.click('[data-act=setType][data-type=NORMAL]');
  await page.click('[data-act=setSleep][data-v="6.5"]');
  for (const id of ['q_study', 'q_drill', 'q_lift', 'q_referat', 'q_english']) await page.click(`#questCard [data-act=toggleQ][data-id="${id}"]`);
  const lv0 = await ev(() => MBAPPE.levelOf(MBAPPE.totalXP()).level);
  await page.click('[data-act=setWorkEnd][data-v=ok]');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 2, 'NORMAL lolos setelah JAGA+PASCA → streak 2 (bersambung)');
  const lvTxt = await sheetText();
  ok(lvTxt.includes('Level') && lvTxt.includes('token hadiah'), 'naik level → layar level-up + token hadiah', { lv0, lvTxt: lvTxt.slice(0, 60) });
  await closeSheet();
  await setNow('2026-11-07T10:00:00+07:00');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 2, 'hari ini belum diisi tidak memutus streak');
  const d5 = await day('2026-11-05');
  ok(d5.frozen && d5.autoLate && d5.penalty === 15, 'PASCA 5 Nov terkunci tanpa jawaban jam kerja → dihitung lewat 21.00', { f: d5.frozen, a: d5.autoLate, p: d5.penalty });
  await setNow('2026-11-08T10:00:00+07:00');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 0, 'hari NORMAL/kosong yang gagal (7 Nov) memutus streak');
  await page.click('[data-act=dayPrev]');
  await page.click('[data-act=toggleShield]');
  ok((await ev(() => MBAPPE.streakInfo().cur)) === 2, 'shield (sakit/darurat) untuk 7 Nov → streak pulih ke 2');
  await page.click('[data-act=dayNext]');

  section('9. Hari terkunci tidak berubah saat quest diedit (edit = 0 XP)');
  const xp3 = (await day('2026-11-03')).xp;
  const total0 = await ev(() => MBAPPE.totalXP());
  await tab('set');
  await page.click('details[data-sec=quest] summary');
  await page.click('[data-act=qEdit][data-id=q_study]');
  await page.selectOption('form[data-form=quest] select[name=size]', 'besar');
  await page.click('form[data-form=quest] button[type=submit]');
  ok((await day('2026-11-03')).xp === xp3 && (await ev(() => MBAPPE.totalXP())) === total0, 'mengedit ukuran quest tidak mengubah XP hari terkunci & total');
  // pagar pengaman: tidur lebih sedikit tidak boleh lebih menguntungkan
  await page.click('details[data-sec=mech] summary');
  await page.fill('form[data-form=mech] input[name=tmul_3]', '1.4');
  await page.click('form[data-form=mech] button[type=submit]');
  ok((await page.textContent('#mechErr')).includes('naik seiring jam tidur'), 'Setelan menolak pengali yang memberi hadiah tidur sedikit');
  ok((await ev(() => MBAPPE.state.settings.sleepTiers[3].mult)) === 0.6, 'mekanika tidak berubah');

  section('10. Weekly Raid (Minggu)');
  await tab('raid');
  ok(await page.isVisible('#raidDoneBtn'), 'raid terbuka hari Minggu');
  await page.click('#raidDoneBtn');
  ok((await page.textContent('#raidErr')).length > 0, 'raid tanpa prioritas/angka ditolak');
  await page.fill('[data-k=bridge]', '3.200.000'); await page.press('[data-k=bridge]', 'Tab');
  await page.fill('[data-k=debt]', '23.000.000'); await page.press('[data-k=debt]', 'Tab');
  await page.fill('[data-k=leads]', '2'); await page.press('[data-k=leads]', 'Tab');
  for (let i = 0; i < 3; i++) await page.fill(`[data-input=prio][data-i="${i}"]`, 'Prioritas ' + (i + 1));
  const tilesTxt = await page.textContent('#raidTiles');
  ok(tilesTxt.includes('Tidur non-jaga (total)') && tilesTxt.includes('Rp 3,2 jt') && tilesTxt.includes('Rp 23 jt'), 'dashboard 8 angka terisi', tilesTxt.slice(0, 120));
  const tBefore = await ev(() => MBAPPE.totalXP());
  await page.click('#raidDoneBtn');
  ok((await ev(() => MBAPPE.totalXP())) === tBefore + 50, 'raid selesai = +50 XP');
  ok((await page.textContent('#sheet')).includes('Export JSON'), 'pengingat backup muncul setelah raid');
  await page.click('#sheet [data-act=closeSheet].btn');
  await shot('raid-done');

  section('11. Peringatan identitas pasien');
  await tab('today');
  await page.fill('[data-input=note]', 'Tn. Budi RM 1234567 stabil');
  ok(await page.isVisible('#notePhi .phi.hit'), 'pola Tn./No. RM terdeteksi');
  await page.fill('[data-input=note]', 'Belajar fraktur femur.');
  ok(!(await page.isVisible('#notePhi .phi.hit')), 'teks biasa tidak memicu peringatan merah');

  section('12. Reload: data tetap ada');
  await page.waitForTimeout(500); // debounce simpan catatan
  const sBefore = await stateJSON();
  await page.goto(urlAt('2026-11-08T10:00:00+07:00'));
  const sAfter = await stateJSON();
  ok(sBefore === sAfter, 'state identik setelah reload', [sBefore.length, sAfter.length]);
  ok((await ev(() => MBAPPE.state.days['2026-11-08'].note)) === 'Belajar fraktur femur.', 'catatan tersimpan');

  section('13. Export → Import identik');
  await tab('set');
  await page.click('details[data-sec=data] summary');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const file = path.join(require('os').tmpdir(), 'mbappe-export-test.json');
  await dl.saveAs(file);
  const exported = fs.readFileSync(file, 'utf8');
  ok(dl.suggestedFilename() === 'mbappe-os-2026-11-08.json', 'nama file backup bertanggal', dl.suggestedFilename());
  ok(exported === (await ev(() => MBAPPE.exportString())), 'file export = state');
  // ubah data, lalu import file tadi
  await ev(() => { MBAPPE.state.days['2026-11-08'].note = 'diubah'; MBAPPE.state.workouts.push({ id: 'x', date: '2026-11-08', kind: 'bench', kg: 50, reps: 5 }); });
  await page.setInputFiles('#importFile', file);
  await page.click('[data-act=confirmOk]');
  ok((await ev(() => MBAPPE.exportString())) === exported, 'import → state identik byte-per-byte dengan file');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const file2 = file.replace('.json', '-2.json');
  await dl2.saveAs(file2);
  ok(fs.readFileSync(file2, 'utf8') === exported, 'export ulang setelah import = identik');
  await page.goto(urlAt('2026-11-08T10:00:00+07:00'));
  ok((await ev(() => MBAPPE.exportString())) === exported, 'tetap identik setelah reload');

  section('13b. Migrasi skema v1 → v2');
  const v1 = await ev(() => {
    const d = JSON.parse(MBAPPE.exportString());
    d.schemaVersion = 1;
    for (const k of Object.keys(d.days)) delete d.days[k].nap;
    delete d.settings.napCounts;
    d.quests.find((q) => q.id === 'q_sleep').name = 'Tidur malam ≥6 jam';
    d.mutabaah.find((m) => m.id === 'm_qiyam').name = 'Qiyamul lail';
    return JSON.stringify(d);
  });
  const xpBeforeMig = await ev(() => MBAPPE.totalXP());
  await tab('set');
  await page.click('details[data-sec=data] summary');
  await page.click('details[data-sec=data] summary.small');
  await page.fill('#importText', v1);
  await page.click('[data-act=importPaste]');
  await page.click('[data-act=confirmOk]');
  const mig = await ev(() => ({ v: MBAPPE.state.schemaVersion, nap: Object.values(MBAPPE.state.days).every((d) => d.nap === 0), nc: MBAPPE.state.settings.napCounts, q: MBAPPE.state.quests.find((q) => q.id === 'q_sleep').name, m: MBAPPE.state.mutabaah.find((m) => m.id === 'm_qiyam').name, xp: MBAPPE.totalXP() }));
  ok(mig.v === 2 && mig.nap && mig.nc === true, 'file v1 dimigrasi ke v2 (kolom tidur siang ditambahkan)', mig);
  ok(mig.q === 'Total tidur ≥6 jam' && mig.m === 'Tahajjud sebelum Subuh', 'nama bawaan ikut diperbarui', mig);
  ok(mig.xp === xpBeforeMig, 'migrasi tidak mengubah XP riwayat', [xpBeforeMig, mig.xp]);
  await page.setInputFiles('#importFile', file);
  await page.click('[data-act=confirmOk]');
  ok((await ev(() => MBAPPE.exportString())) === exported, 'kembali ke backup v2 asli');

  section('14. localStorage gagal → jalan di memori + banner');
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx2.addInitScript(() => {
    const thrower = () => { throw new DOMException('blocked', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: thrower, configurable: true });
  });
  const p2 = await ctx2.newPage();
  const err2 = [];
  p2.on('pageerror', (e) => err2.push(e.message));
  await p2.goto(urlAt(T0));
  ok(await p2.isVisible('.banner'), 'banner peringatan tampil');
  ok((await p2.textContent('.banner')).includes('memori'), 'banner menjelaskan mode memori');
  await p2.click('[data-act=setType][data-type=NORMAL]');
  ok((await p2.$$('#questCard [data-qid]')).length > 0 && (await p2.evaluate(() => MBAPPE.memoryMode)) === true, 'aplikasi tetap jalan di memori');
  ok(err2.length === 0, 'tanpa error JS', err2);
  await ctx2.close();

  section('15. Chapter berat, ringkasan chapter, kunci hadiah');
  await page.goto(urlAt('2026-11-08T10:00:00+07:00'));
  await tab('set');
  await page.click('details[data-sec=chapter] summary');
  const addChapter = async (name, start, end, weight) => {
    await page.click('[data-act=chNew]');
    await page.fill('form[data-form=chapter] input[name=name]', name);
    await page.fill('form[data-form=chapter] input[name=start]', start);
    await page.fill('form[data-form=chapter] input[name=end]', end);
    await page.selectOption('form[data-form=chapter] select[name=weight]', weight);
    await page.click('form[data-form=chapter] button[type=submit]');
  };
  await addChapter('Stase Anak', '2026-11-01', '2026-11-07', 'sedang');
  await addChapter('IPD Junior', '2026-11-08', '2026-12-20', 'berat');
  await tab('today');
  const sum = await sheetText();
  ok(sum.includes('Chapter selesai') && sum.includes('Stase Anak') && sum.includes('hari lolos'), 'akhir chapter → ringkasan otomatis', sum.slice(0, 80));
  await closeSheet();
  await page.click('[data-act=setType][data-type=NORMAL]');
  q = await qids();
  ok(q.length === 5 && !q.includes('q_career') && !q.includes('q_english') && q.filter((x) => x.startsWith('MQ:')).length === 1, 'chapter berat: quest inti + 1 blok Main Quest saja', q);
  ok((await page.textContent('#xpFormula')).includes('/60') && (await page.textContent('#effects')).includes('Chapter berat'), 'chapter berat: target harian turun ke 60');
  await tab('set');
  await page.click('details[data-sec=reward] summary');
  for (const [n, c] of [['Nonton', '50.000'], ['Tidur siang ekstra', '0']]) {
    await page.fill('form[data-form=reward] input[name=name]', n);
    await page.fill('form[data-form=reward] input[name=cost]', c);
    await page.click('form[data-form=reward] button[type=submit]');
  }
  await tab('char');
  const claims = await page.$$eval('#rewards .rw', (rows) => rows.map((r) => [r.textContent.includes('Nonton'), r.querySelector('[data-act=claim]').disabled]));
  const lvNow = await ev(() => MBAPPE.levelOf(MBAPPE.totalXP()).level);
  ok(lvNow >= 2 && claims.some(([paid, dis]) => paid && dis) && claims.some(([paid, dis]) => !paid && !dis), 'hadiah berbiaya terkunci (Dana Jembatan belum tercapai), hadiah gratis bisa diklaim', { lvNow, claims });
  await shot('char-final');

  section('16. iPhone (emulasi iPhone 13)');
  const { devices } = require('playwright');
  const ctx3 = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Jakarta' });
  await ctx3.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { const f = d.files[0]; window.__shared = { name: f.name, type: f.type, text: await f.text() }; };
  });
  const p3 = await ctx3.newPage();
  const err3 = [];
  p3.on('pageerror', (e) => err3.push(e.message));
  await p3.goto(urlAt(T0));
  ok((await p3.getAttribute('meta[name=apple-mobile-web-app-status-bar-style]', 'content')) === 'black', 'status bar iPhone tidak menutupi header');
  ok(((await p3.getAttribute('link[rel=apple-touch-icon]', 'href')) || '').startsWith('data:image/png;base64,'), 'ikon layar utama tertanam di file');
  ok((await p3.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'tidak ada scroll horizontal di lebar iPhone 13');
  await p3.click('#tabs [data-tab=set]');
  await p3.click('details[data-sec=data] summary');
  await p3.click('#exportBtn');
  await p3.waitForFunction(() => window.__shared !== null);
  const shared = await p3.evaluate(() => window.__shared);
  const exp3 = await p3.evaluate(() => MBAPPE.exportString());
  ok(shared.name === 'mbappe-os-2026-11-03.json' && shared.type === 'application/json' && shared.text === exp3, 'Export di iPhone membuka lembar Bagikan dengan file backup utuh', { name: shared.name, type: shared.type });
  ok((await p3.textContent('#toast')).includes('dibagikan'), 'tanggal backup terakhir tercatat');
  ok((await p3.getAttribute('#importFile', 'accept')) === null, 'pemilih file import tidak memfilter .json (iPhone)');
  if (OUT) await p3.screenshot({ path: path.join(OUT, 'iphone-today.png') });
  ok(err3.length === 0, 'tanpa error JS di emulasi iPhone', err3);
  await ctx3.close();

  section('17. Tanpa error JS');
  ok(errors.length === 0, 'tidak ada error di console', errors);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
