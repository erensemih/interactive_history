#!/usr/bin/env node
/**
 * End-to-end verification in a real (headless) Chromium.
 *
 *   npm run e2e            # builds if needed, serves the build, runs the scenario
 *
 * Scenario (the acceptance test of the brief):
 *   1. Range = 1500. Click a point in Anatolia   -> the Ottoman Empire is highlighted, the timeline lists Ottoman events.
 *   2. Click a point in China                    -> Ming is highlighted. The map must not have moved.
 *   3. Range = 1450–1500                         -> the map's events update to exactly that range.
 * Plus: clicks (land, sea, marker, timeline node) never move the camera, the map's content never depends on
 * the selected place, the layout never shifts, and keyboard/typed range controls work.
 *
 * Writes screenshots and a Turkish report to docs/verification/.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'verification');
const PORT = Number(process.env.E2E_PORT ?? 4173);
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

/* ------------------------------------------------------------------ server */
async function startServer() {
  if (process.env.E2E_URL) return { url: process.env.E2E_URL, stop: () => {} };
  if (!existsSync(join(ROOT, 'dist', 'index.html')) || process.argv.includes('--build')) {
    console.log('building…');
    execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('preview server did not start');
}

/* -------------------------------------------------------------------- data */
function loadEvents() {
  const dir = join(ROOT, 'public', 'data', 'events');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  return index.files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).events);
}
const yearOf = (d) => Number((typeof d === 'string' ? d : d.start).slice(0, 4));
const endYearOf = (d) => Number((typeof d === 'string' ? d : (d.end ?? d.start)).slice(0, 4));
/** Reference implementation of "events on the map in this range" (importance >= 3, overlapping the years). */
const expectedMapEvents = (events, from, to) =>
  events.filter((e) => e.importance >= 3 && yearOf(e.date) <= to && endYearOf(e.date) >= from).map((e) => e.id);

/* ---------------------------------------------------------------- the test */
const server = await startServer();
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
});

const camera = () =>
  page.evaluate(() => {
    const m = window.__ayni.map;
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
  });
const sameCamera = (a, b) => a.lng === b.lng && a.lat === b.lat && a.zoom === b.zoom && a.bearing === b.bearing && a.pitch === b.pitch;
const pixelOf = (lon, lat) =>
  page.evaluate(
    ([lo, la]) => {
      const p = window.__ayni.map.project([lo, la]);
      const r = document.querySelector('#map').getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lon, lat],
  );
const text = (sel) => page.locator(sel).first().innerText();
const settle = (ms = 500) => page.waitForTimeout(ms);
const geometry = () =>
  page.evaluate(() => {
    const r = (s) => {
      const b = document.querySelector(s).getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(',');
    };
    return { dock: r('.dock'), map: r('.map-wrap'), panel: r('.panel') };
  });
const markerIds = () => page.evaluate(() => window.__ayni.visibleMarkerIds().sort());
const setRange = async (from, to) => {
  await page.locator('[data-testid=input-from]').fill(String(from));
  await page.locator('[data-testid=input-from]').press('Enter');
  await page.locator('[data-testid=input-to]').fill(String(to));
  await page.locator('[data-testid=input-to]').press('Enter');
  await settle(700);
};

console.log(`\nAynı Zamanda · uçtan uca doğrulama · ${server.url}\n`);
try {
  await page.goto(server.url);
  await page.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
  await page.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await settle(800);
  const allEvents = loadEvents();

  /* ---- 0. initial state */
  console.log('0. Açılış');
  check('Başlık "Dünya" ve seçili yer yok', (await text('[data-testid=title-main]')) === 'Dünya');
  check('Çizelge "yer seçilmedi" durumunda', (await text('[data-testid=timeline-name]')).includes('seçilmedi'));
  await page.screenshot({ path: join(OUT, '01-acilis.png') });

  /* ---- 1. 1500 + Anatolia */
  console.log('\n1. 1500 yılı, Anadolu\'da bir nokta');
  await setRange(1500, 1500);
  check('Aralık 1500–1500', JSON.stringify(await page.evaluate(() => window.__ayni.store.state.range)) === '{"from":1500,"to":1500}');
  check('Haritadaki sınır yılı 1500', (await text('[data-testid=shown-year]')) === '1500');

  const baseCam = await camera();
  const baseGeo = await geometry();
  const markersBefore = await markerIds();
  const mapEventsBefore = await page.evaluate(() => window.__ayni.view().mapEvents.map((e) => e.id).sort());

  const anatolia = await pixelOf(35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await page.waitForFunction(() => document.querySelector('[data-testid=title-main]').textContent.trim() !== 'Dünya', null, { timeout: 8000 });
  await settle(600);

  const t1 = (await text('[data-testid=title-main]')).trim();
  check('Başlık: Osmanlı İmparatorluğu', t1 === 'Osmanlı İmparatorluğu', t1);
  check('Bilgi panelinde yer kartı Osmanlı', (await text('[data-testid=place-title]')).trim() === 'Osmanlı İmparatorluğu');
  const hl = await page.evaluate(() => {
    const m = window.__ayni.map;
    return {
      filter: JSON.stringify(m.getFilter('polity-selected-line')),
      drawn: m.queryRenderedFeatures({ layers: ['polity-selected-line'] }).length,
    };
  });
  check('Osmanlı poligonu vurgu katmanında çiziliyor', hl.filter.includes('ottoman-empire') && hl.drawn > 0, `${hl.drawn} parça`);
  check('Zaman çizelgesi başlığı Osmanlı', (await text('[data-testid=timeline-name]')).trim() === 'Osmanlı İmparatorluğu');
  const tl1 = await page.$$eval('.tl-ev', (els) => els.map((e) => e.dataset.id));
  const ottomanIds = allEvents.filter((e) => e.parties.includes('ottoman-empire')).map((e) => e.id);
  check('Çizelgede Osmanlı olayları var', tl1.length >= 3 && tl1.every((id) => ottomanIds.includes(id)), `${tl1.length} olay: ${tl1.join(', ')}`);
  check('Yakın tarihli Osmanlı olayı (Sefarad göçü 1492) çizelgede', tl1.includes('sefarad-gocu-1492'));
  check('Küresel (Osmanlı dışı) olay çizelgede yok', !tl1.includes('kolomb-1492'));
  const cam1 = await camera();
  check('Harita HAREKET ETMEDİ (merkez, yakınlaştırma, açı)', sameCamera(baseCam, cam1), JSON.stringify(cam1));
  check('Harita içeriği yere bağlı değil: işaretçiler aynı', JSON.stringify(await markerIds()) === JSON.stringify(markersBefore));
  check('Harita olay kümesi aynı', JSON.stringify(await page.evaluate(() => window.__ayni.view().mapEvents.map((e) => e.id).sort())) === JSON.stringify(mapEventsBefore));
  check('Düzen kaymadı (harita/panel/alt bölüm aynı boyutta)', JSON.stringify(await geometry()) === JSON.stringify(baseGeo));
  await page.screenshot({ path: join(OUT, '02-anadolu-1500.png') });

  /* ---- 2. China */
  console.log('\n2. Çin\'de bir nokta');
  const china = await pixelOf(112.0, 33.0);
  await page.mouse.click(china.x, china.y);
  await page.waitForFunction(() => document.querySelector('[data-testid=title-main]').textContent.includes('Ming'), null, { timeout: 8000 });
  await settle(600);
  const t2 = (await text('[data-testid=title-main]')).trim();
  check('Başlık: Ming Hanedanı', t2 === 'Ming Hanedanı', t2);
  const hl2 = await page.evaluate(() => JSON.stringify(window.__ayni.map.getFilter('polity-selected-line')));
  check('Ming poligonu vurgulandı', hl2.includes('ming-dynasty'));
  const tl2 = await page.$$eval('.tl-ev', (els) => els.map((e) => e.dataset.id));
  const mingIds = allEvents.filter((e) => e.parties.includes('ming-dynasty')).map((e) => e.id);
  check('Çizelgede yalnızca Ming olayları var', tl2.length >= 2 && tl2.every((id) => mingIds.includes(id)), tl2.join(', '));
  const cam2 = await camera();
  check('Harita HAREKET ETMEDİ (Çin tıklaması)', sameCamera(baseCam, cam2));
  check('Düzen kaymadı', JSON.stringify(await geometry()) === JSON.stringify(baseGeo));
  check('İşaretçiler hâlâ aynı', JSON.stringify(await markerIds()) === JSON.stringify(markersBefore));
  await page.screenshot({ path: join(OUT, '03-cin-1500.png') });

  /* ---- 3. range 1450–1500 */
  console.log('\n3. Aralık 1450–1500');
  await setRange(1450, 1500);
  const range3 = await page.evaluate(() => window.__ayni.store.state.range);
  check('Aralık 1450–1500', range3.from === 1450 && range3.to === 1500);
  check('Sınır yılı aralığın ortası (1475)', (await text('[data-testid=shown-year]')) === '1475');
  const expected = expectedMapEvents(allEvents, 1450, 1500).sort();
  const actual = await page.evaluate(() => window.__ayni.view().mapEvents.map((e) => e.id).sort());
  check('Haritanın olay kümesi, aralığa göre hesaplanan kümeyle birebir aynı', JSON.stringify(expected) === JSON.stringify(actual), `${actual.length} olay`);
  check('İstanbul\'un Fethi (1453) ve Kolomb (1492) kümede', actual.includes('istanbul-fethi-1453') && actual.includes('kolomb-1492'));
  check('Aralık dışı olaylar (Luther 1517, Armada 1588) yok', !actual.includes('luther-95-tez-1517') && !actual.includes('armada-1588'));
  const visible = await markerIds();
  check('Görünen her işaretçi aralığın içinde', visible.every((id) => expected.includes(id)), `${visible.length} görünür`);
  const listIds = await page.$$eval('.evlist .row', (els) => els.map((e) => e.dataset.id).sort());
  check('Paneldeki "başka yerlerde" listesi aynı küme', JSON.stringify(listIds) === JSON.stringify(expected.filter((id) => !mingIds.includes(id)).sort()), `${listIds.length} satır`);
  check('Seçili yer (Ming) korundu', (await text('[data-testid=title-main]')).trim() === 'Ming Hanedanı');
  const cam3 = await camera();
  check('Harita HAREKET ETMEDİ (aralık değişimi)', sameCamera(baseCam, cam3));
  await page.screenshot({ path: join(OUT, '04-aralik-1450-1500.png') });

  /* ---- 4. markers and timeline nodes */
  console.log('\n4. İşaretçi ve çizelge tıklamaları');
  const marker = page.locator('.evt[data-id="istanbul-fethi-1453"]');
  check('İstanbul işaretçisi haritada görünür', (await marker.count()) === 1 && !(await marker.evaluate((el) => el.classList.contains('is-hidden'))));
  await marker.click();
  await settle(500);
  check('İşaretçi tıklaması olayı bilgi panelinde açar', (await text('[data-testid=event-title]')).trim() === "İstanbul'un Fethi");
  check('Olay kartı tarihi Türkçe', (await text('[data-testid=event-card] time')).includes('6 Nisan – 29 Mayıs 1453'));
  check('İşaretçi tıklaması da haritayı oynatmadı', sameCamera(baseCam, await camera()));
  check('İşaretçi tıklaması yeri sıfırlamadı', (await text('[data-testid=title-main]')).trim() === 'Ming Hanedanı');
  await page.screenshot({ path: join(OUT, '05-olay-detayi.png') });

  // Select Anatolia again, then a timeline node
  const anatolia2 = await pixelOf(35.5, 38.9);
  await page.mouse.click(anatolia2.x, anatolia2.y);
  await settle(600);
  check('Aralık 1450–1500 iken Anadolu → Osmanlı', (await text('[data-testid=title-main]')).trim() === 'Osmanlı İmparatorluğu');
  const node = page.locator('.tl-ev').first();
  const nodeId = await node.getAttribute('data-id');
  await node.click();
  await settle(500);
  const evId = await page.evaluate(() => window.__ayni.store.state.selectedEventId);
  check('Çizelge düğümü tıklaması olayı açar', evId === nodeId, nodeId);
  check('Çizelge tıklaması haritayı oynatmadı', sameCamera(baseCam, await camera()));

  // sea click
  const sea = await pixelOf(-40, 30);
  const before = await page.evaluate(() => JSON.stringify(window.__ayni.store.state.places));
  await page.mouse.click(sea.x, sea.y);
  await settle(400);
  check('Denize tıklamak seçimi değiştirmez, harita oynamaz', before === (await page.evaluate(() => JSON.stringify(window.__ayni.store.state.places))) && sameCamera(baseCam, await camera()));
  check('Deniz tıklaması kullanıcıya açıklanır', (await page.locator('#toast').isVisible()));

  /* ---- 5. time controls */
  console.log('\n5. Zaman denetimleri');
  await page.locator('.chip', { hasText: '25 yıl' }).click();
  await settle(500);
  const r5 = await page.evaluate(() => window.__ayni.store.state.range);
  check('"25 yıl" hazır ayarı aralığı 25 yıla getirir, merkezi korur', r5.to - r5.from + 1 === 25 && Math.abs((r5.from + r5.to) / 2 - 1475) <= 1, JSON.stringify(r5));
  await page.locator('[data-testid=handle-end]').focus();
  await page.keyboard.press('ArrowRight');
  await settle(300);
  const r6 = await page.evaluate(() => window.__ayni.store.state.range);
  check('Klavye: bitiş tutamacı +1 yıl', r6.to === r5.to + 1, JSON.stringify(r6));
  // drag the brush body
  const brush = await page.locator('[data-testid=brush]').boundingBox();
  // grab the brush a little inside its left edge: its centre belongs to the "borders year" marker
  const grabX = brush.x + 24;
  await page.mouse.move(grabX, brush.y + brush.height / 2);
  await page.mouse.down();
  await page.mouse.move(grabX + 120, brush.y + brush.height / 2, { steps: 6 });
  await page.mouse.up();
  await settle(500);
  const r7 = await page.evaluate(() => window.__ayni.store.state.range);
  check('Cetvelde fırçayı sürüklemek aralığı kaydırır, uzunluk korunur', r7.from > r6.from && r7.to - r7.from === r6.to - r6.from, JSON.stringify(r7));
  check('Zaman denetimleri haritayı oynatmadı', sameCamera(baseCam, await camera()));
  check('Adres çubuğu durumu taşır (#t=…&p=…)', await page.evaluate(() => /t=\d{4}-\d{4}/.test(location.hash) && /p=/.test(location.hash)));

  /* ---- 6. sanity: a real drag DOES move the camera (so "did not move" is meaningful) */
  console.log('\n6. Duyarlılık denetimi');
  const mid = await pixelOf(60, 40);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x - 140, mid.y + 40, { steps: 8 });
  await page.mouse.up();
  await settle(700);
  check('Kullanıcı sürüklemesi haritayı gerçekten hareket ettirir', !sameCamera(baseCam, await camera()));
  await page.mouse.wheel(0, -300);
  await settle(900);
  check('Fare tekerleği yakınlaştırır', (await camera()).zoom > baseCam.zoom);
  await page.screenshot({ path: join(OUT, '06-surukleme-sonrasi.png') });

  check('Sayfada konsol/sayfa hatası yok', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (err) {
  check('Senaryo hatasız tamamlandı', false, String(err.message ?? err).split('\n')[0]);
  await page.screenshot({ path: join(OUT, 'hata.png') }).catch(() => {});
} finally {
  await browser.close();
  server.stop();
}

/* ------------------------------------------------------------------ report */
const failed = results.filter((r) => !r.ok);
const lines = [
  '# Doğrulama raporu',
  '',
  `Çalıştırma: ${new Date().toISOString()} · Chromium (başsız) · 1440×900`,
  '',
  `**${results.length - failed.length}/${results.length} denetim geçti.**`,
  '',
  '| Durum | Denetim | Ayrıntı |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.ok ? '✓' : '✗'} | ${r.name} | ${r.detail ? r.detail.replace(/\|/g, '\\|') : ''} |`),
  '',
  '## Ekran görüntüleri',
  '',
  '- `01-acilis.png`: açılış durumu',
  '- `02-anadolu-1500.png`: 1500, Anadolu\'da bir nokta → Osmanlı vurgulu, çizelgede Osmanlı olayları',
  '- `03-cin-1500.png`: Çin\'de bir nokta → Ming vurgulu; harita aynı yerde',
  '- `04-aralik-1450-1500.png`: aralık 1450–1500 → haritadaki olaylar güncellendi',
  '- `05-olay-detayi.png`: işaretçi tıklaması → olay bilgi panelinde',
  '- `06-surukleme-sonrasi.png`: kullanıcı sürükleyip yakınlaştırdıktan sonra',
  '',
];
writeFileSync(join(OUT, 'RAPOR.md'), lines.join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} denetim geçti. Rapor: docs/verification/RAPOR.md`);
process.exit(failed.length ? 1 : 0);
