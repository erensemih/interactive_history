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
 * Plus: clicks (land, sea, marker) never move the camera, the map's content never depends on the selected
 * place, the layout never shifts, and the ruler works by pointer and keyboard.
 * And the second round of feedback: place title above (not on) the map, no blue polities, a bottom area of about a
 * third of its former height with hover-only timeline labels, one dot shape/size told apart by colour, a colour-only
 * legend, a selected event that is always visible (the map eases out just far enough), and an info panel driven by
 * selections (place = context, event = focus).
 *
 * Writes screenshots and a Turkish report to docs/verification/.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'verification');
const PORT = Number(process.env.E2E_PORT ?? 4173);
mkdirSync(OUT, { recursive: true });
rmSync(join(OUT, 'hata.png'), { force: true }); // a failure screenshot from an earlier run must not linger

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
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
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
const sameCamera = (a, b) =>
  a.lng === b.lng && a.lat === b.lat && a.zoom === b.zoom && a.bearing === b.bearing && a.pitch === b.pitch;
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
    return { head: r('.map-head'), dock: r('.dock'), map: r('.map-wrap'), panel: r('.panel') };
  });
const markerIds = () => page.evaluate(() => window.__ayni.visibleMarkerIds().sort());
/** Sets the range the way the ruler would (the ruler's own pointer and keyboard use is checked separately). */
const setRange = async (from, to) => {
  await page.evaluate(([f, t]) => window.__ayni.store.setRange({ from: f, to: t }), [from, to]);
  await settle(700);
};

/* ------------------------------------------------------------------ colours */
// OKLCH hue/chroma, to tell "blue-ish" (blue, teal, violet) from the warm tints. Same maths as tests/palette.test.ts.
const toLinear = (hex) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
const hueChroma = (hex) => {
  const [r, g, b] = toLinear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360, chroma: Math.hypot(a, bb) };
};
const isBlueish = (hex) => {
  const { hue, chroma } = hueChroma(hex);
  return chroma >= 0.02 && hue >= 180 && hue <= 310;
};
const rgbHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
/** The colour of rendered pixels at viewport points (the screenshot is decoded inside the page). */
const pixelsAt = async (pg, points) => {
  const b64 = (await pg.screenshot()).toString('base64');
  return pg.evaluate(
    async ([data, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)));
    },
    [b64, points],
  );
};
/** How many pixels inside `clip` are within `tol` (per channel) of `target`. */
const colourCount = async (pg, clip, target, tol = 40) => {
  const b64 = (await pg.screenshot({ clip })).toString('base64');
  return pg.evaluate(
    async ([data, want, limit]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4)
        if (
          Math.abs(px[i] - want[0]) <= limit &&
          Math.abs(px[i + 1] - want[1]) <= limit &&
          Math.abs(px[i + 2] - want[2]) <= limit
        )
          n++;
      return n;
    },
    [b64, target, tol],
  );
};
/** Records the camera on every frame for `ms`: lets a test see whether a move was eased or a jump. */
const trackCamera = (pg, ms) =>
  pg.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const m = window.__ayni.map;
        const t0 = performance.now();
        const out = [];
        const tick = () => {
          const c = m.getCenter();
          out.push({ t: Math.round(performance.now() - t0), z: m.getZoom(), lng: c.lng, lat: c.lat });
          if (performance.now() - t0 < duration) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      }),
    ms,
  );

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
  console.log("\n1. 1500 yılı, Anadolu'da bir nokta");
  await setRange(1500, 1500);
  check(
    'Aralık 1500–1500',
    JSON.stringify(await page.evaluate(() => window.__ayni.store.state.range)) === '{"from":1500,"to":1500}',
  );
  check('Haritadaki sınır yılı 1500', (await text('[data-testid=title-year]')) === '1500');

  let baseCam = await camera();
  const baseGeo = await geometry();
  const markersBefore = await markerIds();
  const mapEventsBefore = await page.evaluate(() =>
    window.__ayni
      .view()
      .mapEvents.map((e) => e.id)
      .sort(),
  );

  const anatolia = await pixelOf(35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await page.waitForFunction(
    () => document.querySelector('[data-testid=title-main]').textContent.trim() !== 'Dünya',
    null,
    { timeout: 8000 },
  );
  await settle(600);

  const t1 = (await text('[data-testid=title-main]')).trim();
  check('Başlık: Osmanlı İmparatorluğu', t1 === 'Osmanlı İmparatorluğu', t1);
  check(
    'Bilgi panelinde yer kartı Osmanlı',
    (await text('[data-testid=place-title]')).trim() === 'Osmanlı İmparatorluğu',
  );
  const hl = await page.evaluate(() => {
    const m = window.__ayni.map;
    return {
      filter: JSON.stringify(m.getFilter('polity-selected-line')),
      drawn: m.queryRenderedFeatures({ layers: ['polity-selected-line'] }).length,
    };
  });
  check(
    'Osmanlı poligonu vurgu katmanında çiziliyor',
    hl.filter.includes('ottoman-empire') && hl.drawn > 0,
    `${hl.drawn} parça`,
  );
  check(
    'Zaman çizelgesi başlığı Osmanlı',
    (await text('[data-testid=timeline-name]')).trim() === 'Osmanlı İmparatorluğu',
  );
  const tl1 = await page.$$eval('.tl-ev', (els) => els.map((e) => e.dataset.id));
  const ottomanIds = allEvents.filter((e) => e.parties.includes('ottoman-empire')).map((e) => e.id);
  check(
    'Çizelgede Osmanlı olayları var',
    tl1.length >= 3 && tl1.every((id) => ottomanIds.includes(id)),
    `${tl1.length} olay: ${tl1.join(', ')}`,
  );
  check('Yakın tarihli Osmanlı olayı (Sefarad göçü 1492) çizelgede', tl1.includes('sefarad-gocu-1492'));
  check('Küresel (Osmanlı dışı) olay çizelgede yok', !tl1.includes('kolomb-1492'));
  const cam1 = await camera();
  check('Harita HAREKET ETMEDİ (merkez, yakınlaştırma, açı)', sameCamera(baseCam, cam1), JSON.stringify(cam1));
  check(
    'Harita içeriği yere bağlı değil: işaretçiler aynı',
    JSON.stringify(await markerIds()) === JSON.stringify(markersBefore),
  );
  check(
    'Harita olay kümesi aynı',
    JSON.stringify(
      await page.evaluate(() =>
        window.__ayni
          .view()
          .mapEvents.map((e) => e.id)
          .sort(),
      ),
    ) === JSON.stringify(mapEventsBefore),
  );
  check(
    'Düzen kaymadı (harita/panel/alt bölüm aynı boyutta)',
    JSON.stringify(await geometry()) === JSON.stringify(baseGeo),
  );
  const pin = await page.locator('.pin:not([hidden])').boundingBox();
  check(
    'Seçilen noktada yer iğnesi var',
    !!pin && Math.abs(pin.x + pin.width / 2 - anatolia.x) < 3 && Math.abs(pin.y + pin.height / 2 - anatolia.y) < 3,
  );
  await page.screenshot({ path: join(OUT, '02-anadolu-1500.png') });

  /* ---- 2. China */
  console.log("\n2. Çin'de bir nokta");
  const china = await pixelOf(112.0, 33.0);
  await page.mouse.click(china.x, china.y);
  await page.waitForFunction(
    () => document.querySelector('[data-testid=title-main]').textContent.includes('Ming'),
    null,
    { timeout: 8000 },
  );
  await settle(600);
  const t2 = (await text('[data-testid=title-main]')).trim();
  check('Başlık: Ming Hanedanı', t2 === 'Ming Hanedanı', t2);
  const hl2 = await page.evaluate(() => JSON.stringify(window.__ayni.map.getFilter('polity-selected-line')));
  check('Ming poligonu vurgulandı', hl2.includes('ming-dynasty'));
  const tl2 = await page.$$eval('.tl-ev', (els) => els.map((e) => e.dataset.id));
  const mingIds = allEvents.filter((e) => e.parties.includes('ming-dynasty')).map((e) => e.id);
  check(
    'Çizelgede yalnızca Ming olayları var',
    tl2.length >= 2 && tl2.every((id) => mingIds.includes(id)),
    tl2.join(', '),
  );
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
  check('Sınır yılı aralığın ortası (1475)', (await text('[data-testid=title-year]')) === '1475');
  const expected = expectedMapEvents(allEvents, 1450, 1500).sort();
  const actual = await page.evaluate(() =>
    window.__ayni
      .view()
      .mapEvents.map((e) => e.id)
      .sort(),
  );
  check(
    'Haritanın olay kümesi, aralığa göre hesaplanan kümeyle birebir aynı',
    JSON.stringify(expected) === JSON.stringify(actual),
    `${actual.length} olay`,
  );
  check(
    "İstanbul'un Fethi (1453) ve Kolomb (1492) kümede",
    actual.includes('istanbul-fethi-1453') && actual.includes('kolomb-1492'),
  );
  check(
    'Aralık dışı olaylar (Luther 1517, Armada 1588) yok',
    !actual.includes('luther-95-tez-1517') && !actual.includes('armada-1588'),
  );
  const visible = await markerIds();
  check(
    'Görünen her işaretçi aralığın içinde',
    visible.every((id) => expected.includes(id)),
    `${visible.length} görünür`,
  );
  const listIds = await page.$$eval('.evlist .row', (els) => els.map((e) => e.dataset.id).sort());
  check(
    'Paneldeki "başka yerlerde" listesi aynı küme',
    JSON.stringify(listIds) === JSON.stringify(expected.filter((id) => !mingIds.includes(id)).sort()),
    `${listIds.length} satır`,
  );
  check('Seçili yer (Ming) korundu', (await text('[data-testid=title-main]')).trim() === 'Ming Hanedanı');
  const cam3 = await camera();
  check('Harita HAREKET ETMEDİ (aralık değişimi)', sameCamera(baseCam, cam3));
  await page.screenshot({ path: join(OUT, '04-aralik-1450-1500.png') });

  /* ---- 4. markers and timeline nodes */
  console.log('\n4. İşaretçi ve çizelge tıklamaları');
  const marker = page.locator('.evt[data-id="istanbul-fethi-1453"]');
  check(
    'İstanbul işaretçisi haritada görünür',
    (await marker.count()) === 1 && !(await marker.evaluate((el) => el.classList.contains('is-hidden'))),
  );
  await marker.click();
  await settle(500);
  check(
    'İşaretçi tıklaması olayı bilgi panelinde açar',
    (await text('[data-testid=event-title]')).trim() === "İstanbul'un Fethi",
  );
  check('Olay kartı tarihi Türkçe', (await text('[data-testid=event-date]')).includes('6 Nisan – 29 Mayıs 1453'));
  check('İşaretçi tıklaması da haritayı oynatmadı', sameCamera(baseCam, await camera()));
  check('İşaretçi tıklaması yeri sıfırlamadı', (await text('[data-testid=title-main]')).trim() === 'Ming Hanedanı');
  await page.screenshot({ path: join(OUT, '05-olay-detayi.png') });

  // Select Anatolia again, then a timeline dot
  const anatolia2 = await pixelOf(35.5, 38.9);
  await page.mouse.click(anatolia2.x, anatolia2.y);
  await settle(600);
  check(
    'Aralık 1450–1500 iken Anadolu → Osmanlı',
    (await text('[data-testid=title-main]')).trim() === 'Osmanlı İmparatorluğu',
  );

  // A dot on the timeline opens its event. When the event is already in sight the map stays exactly where it is.
  const sighted = await page.evaluate(() => {
    const vm = window.__ayni.view();
    const m = window.__ayni.map;
    const box = document.querySelector('#map').getBoundingClientRect();
    const covered = [...document.querySelectorAll('.map-zoom, .legend, .map-stats:not([hidden])')].map((el) =>
      el.getBoundingClientRect(),
    );
    const ev = vm.places[0].timeline.find((e) => {
      const p = m.project([e.location.lon, e.location.lat]);
      const x = box.left + p.x;
      const y = box.top + p.y;
      return (
        p.x > 80 &&
        p.x < box.width - 90 &&
        p.y > 70 &&
        p.y < box.height - 60 &&
        !covered.some((r) => x > r.left - 20 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 20)
      );
    });
    return ev ? ev.id : null;
  });
  await page.locator(`.tl-ev[data-id="${sighted}"]`).click();
  await settle(700);
  const evId = await page.evaluate(() => window.__ayni.store.state.selectedEventId);
  check('Çizelge noktası tıklaması olayı açar', evId === sighted, String(sighted));
  check('Zaten görünen bir olayı çizelgeden açmak haritayı oynatmaz', sameCamera(baseCam, await camera()));

  // A local event (importance < 3) is not in the map's own set. Opened from the timeline it is drawn anyway and stays visible.
  const local = await page.evaluate(() => {
    const vm = window.__ayni.view();
    const ev = window.__ayni.data.events.find(
      (e) => e.importance < 3 && vm.places[0].timeline.some((t) => t.id === e.id),
    );
    return ev ? { id: ev.id } : null;
  });
  check('Osmanlı çizelgesinde yerel (önem < 3) bir olay var', !!local);
  if (local) {
    const setBefore = await page.evaluate(() =>
      JSON.stringify(
        window.__ayni
          .view()
          .mapEvents.map((e) => e.id)
          .sort(),
      ),
    );
    await page.locator(`.tl-ev[data-id="${local.id}"]`).click();
    await settle(3300); // an event out of sight is eased into view, which takes up to ~2.6 s
    const st = await page.evaluate((id) => {
      const el = document.querySelector(`.evt[data-id="${id}"]`);
      const ev = window.__ayni.data.eventsById.get(id);
      const pt = window.__ayni.map.project([ev.location.lon, ev.location.lat]);
      const box = document.querySelector('#map').getBoundingClientRect();
      return {
        drawn: !!el && !el.classList.contains('is-hidden'),
        selected: !!el && el.classList.contains('is-selected'),
        inMapSet: window.__ayni.view().mapEvents.some((e) => e.id === id),
        inView: pt.x >= 0 && pt.y >= 0 && pt.x <= box.width && pt.y <= box.height,
      };
    }, local.id);
    check(
      'Haritanın kendi kümesinde olmayan yerel olay, çizelgeden açılınca işaretçiyle çizilir ve seçili görünür',
      st.drawn && st.selected && !st.inMapSet,
      local.id,
    );
    check('Yerel olayın yeri görünüm içinde', st.inView);
    check(
      'Haritanın olay kümesi (yalnızca zaman aralığına bağlı) bundan etkilenmez',
      setBefore ===
        (await page.evaluate(() =>
          JSON.stringify(
            window.__ayni
              .view()
              .mapEvents.map((e) => e.id)
              .sort(),
          ),
        )),
    );
    baseCam = await camera(); // opening an event that was out of sight may legitimately have eased the map out
  }

  // sea click
  const sea = await pixelOf(-40, 30);
  const before = await page.evaluate(() => JSON.stringify(window.__ayni.store.state.places));
  await page.mouse.click(sea.x, sea.y);
  await settle(400);
  check(
    'Denize tıklamak seçimi değiştirmez, harita oynamaz',
    before === (await page.evaluate(() => JSON.stringify(window.__ayni.store.state.places))) &&
      sameCamera(baseCam, await camera()),
  );
  check('Deniz tıklaması kullanıcıya açıklanır', await page.locator('#toast').isVisible());

  /* ---- 5. time controls: the ruler is the whole control */
  console.log('\n5. Zaman denetimi (yalnızca cetvel)');
  const removed = await page.evaluate(() => ({
    inputs: document.querySelectorAll('.dock input, .year-input').length,
    chips: document.querySelectorAll('.dock .chip, .dock .presets').length,
    row: document.querySelectorAll('.dock-controls, .dock-block, .dock-hint, .dock-funnel, .ruler-bins').length,
    words: /Haritadaki sınırlar|Uzunluk|Başlangıç yılı\s*–|1 yıl|5 yıl|25 yıl|100 yıl/.test(
      document.querySelector('.dock').innerText,
    ),
  }));
  check(
    'Kontrol satırı kalktı: yıl kutuları, 1/5/25/100 yıl düğmeleri, "Haritadaki sınırlar", ipucu satırı',
    removed.inputs === 0 && removed.chips === 0 && removed.row === 0 && !removed.words,
    JSON.stringify(removed),
  );
  await setRange(1450, 1474);
  const r5 = await page.evaluate(() => window.__ayni.store.state.range);
  check('Aralık cetvelin okunuşunda görünür (1450–1474)', (await text('[data-testid=range-readout]')) === '1450–1474');
  await page.locator('[data-testid=handle-end]').focus();
  await page.keyboard.press('ArrowRight');
  await settle(300);
  const r6 = await page.evaluate(() => window.__ayni.store.state.range);
  check('Klavye: bitiş tutamacı +1 yıl', r6.to === r5.to + 1, JSON.stringify(r6));
  // drag the brush body
  const brush = await page.locator('[data-testid=brush]').boundingBox();
  // grab the brush a little inside its left edge: its middle belongs to the "borders year" marker
  const grabX = brush.x + 24;
  await page.mouse.move(grabX, brush.y + brush.height / 2);
  await page.mouse.down();
  await page.mouse.move(grabX + 120, brush.y + brush.height / 2, { steps: 6 });
  await page.mouse.up();
  await settle(500);
  const r7 = await page.evaluate(() => window.__ayni.store.state.range);
  check(
    'Cetvelde aralık çubuğunu sürüklemek aralığı kaydırır, uzunluk korunur',
    r7.from > r6.from && r7.to - r7.from === r6.to - r6.from,
    JSON.stringify(r7),
  );
  // a drag on the brush's edge resizes the range
  const edge = await page.locator('[data-testid=handle-end]').boundingBox();
  await page.mouse.move(edge.x + 12, edge.y + 8);
  await page.mouse.down();
  await page.mouse.move(edge.x + 12 + 60, edge.y + 8, { steps: 5 });
  await page.mouse.up();
  await settle(400);
  const r8 = await page.evaluate(() => window.__ayni.store.state.range);
  check(
    'Çubuğun kenarını sürüklemek aralığı uzatır, başlangıç yerinde kalır',
    r8.from === r7.from && r8.to > r7.to,
    JSON.stringify(r8),
  );
  // the "borders year" marker moves the displayed year inside the range, without touching the range
  const beforeYear = await text('[data-testid=title-year]');
  const rangeBefore = await page.evaluate(() => JSON.stringify(window.__ayni.store.state.range));
  const cur = await page.locator('[data-testid=cursor]').boundingBox();
  await page.mouse.move(cur.x + cur.width / 2, cur.y + 8);
  await page.mouse.down();
  await page.mouse.move(cur.x + cur.width / 2 + 40, cur.y + 8, { steps: 5 });
  await page.mouse.up();
  await settle(500);
  check(
    'İşareti sürüklemek haritanın sınır yılını değiştirir (başlıktaki not güncellenir), aralığa dokunmaz',
    (await text('[data-testid=title-year]')) !== beforeYear &&
      rangeBefore === (await page.evaluate(() => JSON.stringify(window.__ayni.store.state.range))),
    `${beforeYear} → ${await text('[data-testid=title-year]')}`,
  );
  check('Zaman denetimleri haritayı oynatmadı', sameCamera(baseCam, await camera()));
  check(
    'Adres çubuğu durumu taşır (#t=…&p=…)',
    await page.evaluate(() => /t=\d{4}-\d{4}/.test(location.hash) && /p=/.test(location.hash)),
  );

  // Escape closes the event first, then the place
  await page.keyboard.press('Escape');
  await settle(300);
  const afterFirst = await page.evaluate(() => ({
    e: window.__ayni.store.state.selectedEventId,
    p: window.__ayni.store.state.places.length,
  }));
  await page.keyboard.press('Escape');
  await settle(400);
  const afterSecond = await page.evaluate(() => ({
    e: window.__ayni.store.state.selectedEventId,
    p: window.__ayni.store.state.places.length,
  }));
  check(
    'Esc önce olayı, sonra yeri kapatır',
    afterFirst.e === null &&
      afterFirst.p === 1 &&
      afterSecond.p === 0 &&
      (await text('[data-testid=title-main]')) === 'Dünya',
  );
  check('Seçimi kaldırmak haritayı oynatmadı', sameCamera(baseCam, await camera()));

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

  /* ---- 7. keyboard, accessibility and robustness (each on a fresh page load) */
  console.log('\n7. Klavye, erişilebilirlik ve sağlamlık');
  const open = async (hash = '', viewport = { width: 1440, height: 900 }, extra = {}) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error') errs.push(`console.error: ${m.text()}`);
    });
    await p.goto(server.url + hash);
    await p.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
    await p.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
    await p.waitForTimeout(900);
    return { ctx, p, errs };
  };
  const cameraOf = (p) =>
    p.evaluate(() => {
      const m = window.__ayni.map;
      const c = m.getCenter();
      return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
    });

  // 7a. a malformed or truncated link must not brick start-up
  {
    const { ctx, p, errs } = await open('#t=1500&p=10,100&e=bu-olay-yok&v=1//2&c=');
    const st = await p.evaluate(() => ({ ...window.__ayni.store.state }));
    check(
      'Bozuk bir bağlantı (p=10,100, bilinmeyen e=, v=1//2) uygulamayı çökertmez',
      st.places.length === 0 && st.selectedEventId === null && st.range.from === 1500 && errs.length === 0,
      errs[0] ?? '',
    );
    await ctx.close();
  }
  {
    const { ctx, p } = await open('#t=1500&p=32.85,');
    check(
      'Yarım kalmış p= sahte bir yer seçmez',
      (await p.evaluate(() => window.__ayni.store.state.places.length)) === 0,
    );
    await ctx.close();
  }

  // 7b. the camera enters the link only after the user has moved the map themselves
  {
    const { ctx, p } = await open('#t=1450-1500');
    await p.waitForTimeout(500);
    const before = await p.evaluate(() => location.hash);
    const r = await p.locator('#map').boundingBox();
    await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await p.mouse.down();
    await p.mouse.move(r.x + r.width / 2 - 90, r.y + r.height / 2 + 20, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(900);
    const after = await p.evaluate(() => location.hash);
    check(
      'Adres çubuğu kamerayı yalnızca kullanıcı haritayı oynattıktan sonra taşır',
      !before.includes('v=') && after.includes('v='),
      `${before} → ${after}`,
    );
    await ctx.close();
  }

  // 7c. markers: one Tab stop, arrow keys, hidden ones are unreachable, the tooltip survives pointer travel
  {
    const { ctx, p, errs } = await open('#t=1450-1500');
    const stops = await p.evaluate(() => [...document.querySelectorAll('.evt')].filter((e) => e.tabIndex === 0).length);
    const hiddenFocusable = await p.evaluate(
      () =>
        [...document.querySelectorAll('.evt.is-hidden')].filter(
          (e) => getComputedStyle(e).visibility !== 'hidden' || e.tabIndex === 0,
        ).length,
    );
    check('Haritadaki işaretçiler tek bir Tab durağıdır', stops === 1, `${stops} durak`);
    check('Gizlenen işaretçiler klavyeyle ve ekran okuyucuyla erişilemez', hiddenFocusable === 0);

    const cam0 = await cameraOf(p);
    await p.locator('.evt[tabindex="0"]').focus();
    const first = await p.evaluate(() => document.activeElement?.dataset.id);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    const second = await p.evaluate(() => document.activeElement?.dataset.id);
    check('Ok tuşları işaretçiler arasında gezinir', !!second && second !== first, `${first} → ${second}`);
    check('Ok tuşları haritayı kaydırmaz', sameCamera(cam0, await cameraOf(p)));
    check(
      'Odaklanan işaretçinin ipucu görünür',
      await p.evaluate(
        () => !document.querySelector('.tip').hidden && document.querySelector('.tip').textContent.length > 3,
      ),
    );
    await p.keyboard.press('Enter');
    await p.waitForTimeout(500);
    const focusedTitle = await p.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    check('Klavyeyle seçilen olayın kartına odak gider', focusedTitle === 'event-title', String(focusedTitle));
    check('Klavyeyle olay seçmek haritayı oynatmaz', sameCamera(cam0, await cameraOf(p)));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    check('Esc olay kartını kapatır', (await p.evaluate(() => window.__ayni.store.state.selectedEventId)) === null);

    // the pointer travelling from the map onto a marker keeps that marker's tooltip
    const target = await p.evaluate(() => {
      const el = document.querySelector('.evt:not(.is-hidden)');
      const r = el.querySelector('.evt-mark').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.dataset.id };
    });
    await p.mouse.move(target.x - 90, target.y + 70);
    await p.waitForTimeout(250);
    await p.mouse.move(target.x, target.y, { steps: 8 });
    await p.waitForTimeout(400);
    const tipShown = await p.evaluate(() => {
      const t = document.querySelector('.tip');
      return !t.hidden && t.querySelector('.tip-event') !== null;
    });
    check('İşaretçinin üstüne gelince ipucu kalıcı görünür (harita çıkışı onu gizlemez)', tipShown, target.id);
    check('Sayfa sürümünde konsol hatası yok (7)', errs.length === 0, errs[0] ?? '');
    await ctx.close();
  }

  // 7c2. timeline dots carry no permanent label: hovering one names it, and removing the hovered one clears the name
  {
    const { ctx, p, errs } = await open('#t=1490-1520&p=35.5,38.9');
    check(
      'Çizelgede kalıcı olay etiketi yok (seçili olay yokken)',
      (await p.locator('.tl-label, .tl-tag').count()) === 0,
    );
    const dotEl = p.locator('.tl-ev:not(.is-context)').first();
    const id = await dotEl.getAttribute('data-id');
    const title = await p.evaluate((i) => window.__ayni.data.eventsById.get(i).title, id);
    await dotEl.hover();
    await p.waitForTimeout(500);
    const shown = await p.evaluate((want) => {
      const tip = document.querySelector('.tip');
      return { text: tip.hidden ? '' : tip.textContent, hover: window.__ayni.store.state.hoverEventId === want };
    }, id);
    check(
      'Noktanın üstüne gelince olayın adı görünür (ipucu) ve nokta vurgulanır',
      shown.text.includes(title) && shown.hover,
      title,
    );
    await p.keyboard.press('Escape'); // Esc dismisses hover content and, with nothing open, deselects the place
    await p.mouse.move(5, 5);
    await p.waitForTimeout(900);
    check(
      'Üzerinde durulan nokta kaldırılınca ipucu ve vurgu temizlenir',
      await p.evaluate(() => document.querySelector('.tip').hidden && window.__ayni.store.state.hoverEventId === null),
    );
    check('Çizelge etkileşimlerinde konsol hatası yok', errs.length === 0, errs[0] ?? '');
    await ctx.close();
  }

  // 7d. ruler: a click on empty track near an end slides the window, it never shrinks it
  {
    const { ctx, p } = await open('#t=1450-1549');
    const track = await p.locator('.ruler-track').boundingBox();
    await p.mouse.click(track.x + track.width * 0.985, track.y + track.height - 6);
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => window.__ayni.store.state.range);
    check(
      'Cetvelde uca yakın boş yere tıklamak 100 yıllık pencereyi küçültmez',
      r.to - r.from + 1 === 100 && r.to === 1600,
      JSON.stringify(r),
    );
    await ctx.close();
  }

  // 7e. the ruler by keyboard: arrows slide the window, Shift moves by ten, the ends stop at the data
  {
    const { ctx, p } = await open('#t=1450-1500&p=35.5,38.9');
    const range = () => p.evaluate(() => window.__ayni.store.state.range);
    await p.locator('[data-testid=brush]').focus();
    await p.keyboard.press('ArrowRight');
    let r = await range();
    check('Cetvel: → aralığı 1 yıl kaydırır, uzunluk korunur', r.from === 1451 && r.to === 1501, JSON.stringify(r));
    await p.keyboard.press('Shift+ArrowRight');
    r = await range();
    check('Cetvel: Shift+→ aralığı 10 yıl kaydırır', r.from === 1461 && r.to === 1511, JSON.stringify(r));
    await p.keyboard.press('End');
    r = await range();
    check(
      'Cetvel: End aralığı verinin sonuna dayar, küçültmez',
      r.to === 1600 && r.to - r.from === 50,
      JSON.stringify(r),
    );
    await p.locator('[data-testid=handle-start]').focus();
    await p.keyboard.press('Home');
    r = await range();
    check('Cetvel: başlangıç tutamacı + Home → 1400', r.from === 1400 && r.to === 1600, JSON.stringify(r));
    check(
      'Cetvelin dört kaydırıcısı ekran okuyucuya adlarıyla görünür',
      (await p.locator('.dock [role=slider][aria-label]').count()) === 4,
    );
    await ctx.close();
  }

  // 7f. screen readers: no page-wide live region, one status line that says what changed
  {
    const { ctx, p } = await open('#t=1500');
    check('Kök öğe canlı bölge değil', (await p.locator('#app').getAttribute('aria-live')) === null);
    const anatolia = await p.evaluate(() => {
      const pt = window.__ayni.map.project([35.5, 38.9]);
      const r = document.querySelector('#map').getBoundingClientRect();
      return { x: r.left + pt.x, y: r.top + pt.y };
    });
    await p.mouse.click(anatolia.x, anatolia.y);
    await p.waitForTimeout(600);
    check(
      'Yer seçimi durum satırında duyurulur',
      (await p.locator('#sr-status').innerText()).includes('Osmanlı İmparatorluğu'),
      await p.locator('#sr-status').innerText(),
    );
    await ctx.close();
  }

  // 7g. a mouse in a narrow window still zooms with the wheel; a pasted link replaces the view
  {
    const { ctx, p } = await open('#t=1500', { width: 860, height: 800 });
    const z0 = (await cameraOf(p)).zoom;
    const r = await p.locator('#map').boundingBox();
    await p.mouse.move(r.x + r.width / 2, r.y + r.height / 3);
    await p.mouse.wheel(0, -300);
    await p.waitForTimeout(900);
    check('Dar pencerede de fare tekerleği haritayı yakınlaştırır', (await cameraOf(p)).zoom > z0);
    await p.evaluate(() => {
      location.hash = '#t=1550';
    });
    await p.waitForTimeout(600);
    const pasted = await p.evaluate(() => ({ from: window.__ayni.store.state.range.from, hash: location.hash }));
    check('Aynı sekmeye yapıştırılan bağlantı görünümü değiştirir', pasted.from === 1550, JSON.stringify(pasted));
    await ctx.close();
  }

  /* ---- 8. title above the map, no blue polities, the bottom area, one dot, the place pin, the legend */
  console.log('\n8. Başlık, renkler, alt bölüm, işaretçiler, yer noktası, lejant');
  {
    const { ctx, p, errs } = await open('#t=1490-1520&p=35.5,38.9');
    const toPx = (lon, lat) =>
      p.evaluate(
        ([lo, la]) => {
          const q = window.__ayni.map.project([lo, la]);
          const r = document.querySelector('#map').getBoundingClientRect();
          return [r.left + q.x, r.top + q.y];
        },
        [lon, lat],
      );

    // -- the place title
    const head = await p.evaluate(() => {
      const bar = document.querySelector('.map-head');
      const title = document.querySelector('[data-testid=title-main]');
      const mapEl = document.querySelector('.map-wrap');
      const b = bar.getBoundingClientRect();
      const t = title.getBoundingClientRect();
      const m = mapEl.getBoundingClientRect();
      const cs = getComputedStyle(title);
      return {
        size: parseFloat(cs.fontSize),
        family: cs.fontFamily,
        text: bar.innerText.replace(/\s+/g, ' ').trim(),
        eyebrow: !!bar.querySelector('.eyebrow'),
        insideMap: !!mapEl.querySelector('.title-main, .map-title, .eyebrow'),
        above: t.bottom <= m.top + 0.5 && b.bottom <= m.top + 0.5,
      };
    });
    check(
      'Başlık haritanın üstündeki şeritte; harita alanının içinde değil, yani hiçbir sınırı ya da işaretçiyi örtemez',
      head.above && !head.insideMap,
    );
    check('Başlık belirgin biçimde küçüldü (öncesi 42 px)', head.size <= 26 && head.size >= 18, `${head.size} px`);
    check('"SEÇİLİ YER" etiketi yok', !/seçili yer/i.test(head.text) && !head.eyebrow, head.text);
    check('Başlığın yazı tipi aynı kaldı (Newsreader, serif)', /Newsreader/.test(head.family), head.family);
    check('"1505 yılının sınırları" notu başlığın yanında', head.text.includes('1505 yılının sınırları'), head.text);
    await p.screenshot({ path: join(OUT, '07-baslik.png'), clip: { x: 0, y: 46, width: 1030, height: 150 } });

    // -- colours: no polity is blue
    const tints = await p.evaluate(() =>
      Array.from({ length: 9 }, (_, i) =>
        getComputedStyle(document.documentElement).getPropertyValue(`--tint-${i}`).trim(),
      ),
    );
    check(
      'Dokuz devlet tonunun hiçbiri mavi, turkuaz ya da mor değil',
      tints.every((h) => /^#[0-9a-f]{6}$/i.test(h) && !isBlueish(h)),
      tints.join(' '),
    );
    const paintColours = await p.evaluate(
      () =>
        JSON.stringify(window.__ayni.map.getPaintProperty('polity-fill', 'fill-color')).match(/#[0-9a-fA-F]{6}/g) ?? [],
    );
    check(
      'Haritanın devlet dolgusunda kullanılan renklerin hiçbiri mavi değil',
      paintColours.length >= 8 && paintColours.every((h) => !isBlueish(h)),
      `${paintColours.length} renk`,
    );
    const land = [
      [112, 33],
      [2.3, 47],
      [38, 56],
      [77.2, 28.6],
      [52, 32],
      [68, 48],
      [85, 45],
      [15, 62],
      [10, 51],
      [-3.7, 40.4],
    ];
    const pts = [];
    for (const [lo, la] of land) pts.push(await toPx(lo, la));
    const onPolity = await p.evaluate(
      (points) =>
        points.map(([x, y]) => {
          const r = document.querySelector('#map').getBoundingClientRect();
          return (
            window.__ayni.map.queryRenderedFeatures([x - r.left, y - r.top], { layers: ['polity-fill'] }).length > 0
          );
        }),
      pts,
    );
    const rendered = (await pixelsAt(p, pts)).map(rgbHex).filter((_, i) => onPolity[i]);
    check(
      'Haritada çizilen devlet piksellerinin hiçbiri mavi değil',
      rendered.length >= 6 && rendered.every((h) => !isBlueish(h)),
      rendered.join(' '),
    );
    const seaHex = rgbHex((await pixelsAt(p, [await toPx(-40, 30)]))[0]);
    check('Deniz hâlâ mavi (mavi yalnızca deniz ve göllere ayrılmış)', isBlueish(seaHex), seaHex);
    await p.screenshot({ path: join(OUT, '10-isaretciler-lejant.png') });

    // -- the bottom area
    const dock = await p.evaluate(() => {
      const d = document.querySelector('.dock').getBoundingClientRect();
      const plot = document.querySelector('.tl-plot').innerText;
      return {
        h: d.height,
        titles: window.__ayni.view().places[0].timeline.map((e) => e.title),
        plot,
        labels: document.querySelectorAll('.tl-label, .tl-tag').length,
      };
    });
    check(
      'Alt bölüm (cetvel + çizelge) eski yüksekliğin (286 px) yaklaşık üçte biri',
      dock.h >= 85 && dock.h <= 105,
      `${dock.h} px = %${Math.round((dock.h / 286) * 100)}`,
    );
    check(
      'Çizelgede hiçbir olay adı kalıcı yazılı değil (yalnızca üzerine gelince)',
      dock.labels === 0 && dock.titles.length >= 3 && dock.titles.every((t) => !dock.plot.includes(t)),
      `${dock.titles.length} olay`,
    );
    await p.screenshot({ path: join(OUT, '08-alt-bolum.png'), clip: { x: 0, y: 796, width: 1440, height: 104 } });

    // -- the selected place: a solid dot with a fading glow, no ring
    const pin = await p.evaluate(() => {
      const dotEl = document.querySelector('.pin:not([hidden]) .pin-dot');
      const glow = document.querySelector('.pin:not([hidden]) .pin-glow');
      const cd = getComputedStyle(dotEl);
      const cg = getComputedStyle(glow);
      const pseudo = (q) => {
        const c = getComputedStyle(dotEl.parentElement, q).content;
        return !!c && c !== 'none' && c !== 'normal';
      };
      return {
        bg: cd.backgroundColor,
        radius: cd.borderRadius,
        border: cd.borderTopWidth,
        outline: cd.outlineStyle,
        w: dotEl.getBoundingClientRect().width,
        glowW: glow.getBoundingClientRect().width,
        glowImage: cg.backgroundImage,
        glowBorder: cg.borderTopWidth,
        rings:
          document.querySelectorAll('.pin:not([hidden]) i:not(.pin-dot)').length +
          (pseudo('::before') || pseudo('::after') ? 1 : 0),
      };
    });
    check(
      'Seçili yer: dolu kırmızı nokta, halka yok',
      pin.bg === 'rgb(207, 58, 33)' &&
        pin.radius.includes('50%') &&
        pin.border === '0px' &&
        pin.outline === 'none' &&
        pin.rings === 0,
      JSON.stringify({ bg: pin.bg, border: pin.border, rings: pin.rings }),
    );
    check(
      'Noktanın çevresinde yarıçapsal sönen yumuşak kırmızı ışıma var (nokta ana öğe, ışıma geniş ve silik)',
      /radial-gradient/.test(pin.glowImage) && pin.glowW >= pin.w * 4 && pin.glowBorder === '0px',
      `${pin.w}px nokta, ${pin.glowW}px ışıma`,
    );

    // -- every event dot is the same shape and size, told apart by colour alone
    const dots = await p.evaluate(() => {
      const info = (sel) =>
        [...document.querySelectorAll(sel)].map((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        });
      const radius = [...document.querySelectorAll('.dot')].map((el) => getComputedStyle(el).borderRadius);
      const visible = [...document.querySelectorAll('.evt:not(.is-hidden)')].map((el) => el.dataset.id);
      const importances = [...new Set(visible.map((id) => window.__ayni.data.eventsById.get(id).importance))];
      const legendColour = Object.fromEntries(
        [...document.querySelectorAll('.legend li')].map((li) => [
          li.dataset.category,
          getComputedStyle(li.querySelector('.dot')).backgroundColor,
        ]),
      );
      const wrong = visible.filter((id) => {
        const el = document.querySelector(`.evt[data-id="${id}"] .dot`);
        return getComputedStyle(el).backgroundColor !== legendColour[window.__ayni.data.eventsById.get(id).category];
      });
      return {
        map: info('.evt:not(.is-hidden) .dot'),
        timeline: info('.tl-ev .dot'),
        legend: info('.legend .dot'),
        panel: info('.panel .dot'),
        radius: [...new Set(radius)],
        importances,
        colours: Object.values(legendColour),
        wrong,
        shapes: document.querySelectorAll('.evt svg, .tl-ev svg, .legend svg, .row-mark svg, svg.mk').length,
        importanceUi: document.querySelectorAll('[data-importance], .importance, .ruler-bins, .bin').length,
      };
    });
    const sizes = new Set([...dots.map, ...dots.timeline, ...dots.legend, ...dots.panel]);
    check(
      'Tüm olay noktaları (harita, çizelge, lejant, panel) aynı şekil ve boyutta',
      sizes.size === 1 &&
        dots.map.length >= 5 &&
        dots.timeline.length >= 3 &&
        dots.legend.length === 6 &&
        dots.radius.length === 1 &&
        dots.radius[0].includes('50%') &&
        dots.shapes === 0,
      `${[...sizes].join(',')} · harita ${dots.map.length}, çizelge ${dots.timeline.length}, lejant ${dots.legend.length}, panel ${dots.panel.length}`,
    );
    check(
      'İşaretçi boyutu önemle değişmez (haritada birden çok önem düzeyi var, boyut tek)',
      dots.importances.length >= 2 && new Set(dots.map).size === 1,
      `önem düzeyleri: ${dots.importances.join(',')}`,
    );
    check(
      'Türler yalnızca renkle ayrışır: 6 ayrı renk, haritadaki her işaretçi lejanttaki türünün rengini taşır',
      new Set(dots.colours).size === 6 && dots.wrong.length === 0,
      dots.wrong.join(',') || dots.colours.join(' '),
    );
    check('Arayüzde önem göstergesi kalmadı (nokta boyutu, kart bloğu, cetvel histogramı)', dots.importanceUi === 0);

    // -- the legend: untitled, always there, colours only
    const legend = await p.evaluate(() => {
      const lg = document.querySelector('.legend');
      const map = document.querySelector('.map-wrap').getBoundingClientRect();
      const r = lg.getBoundingClientRect();
      return {
        items: [...lg.querySelectorAll('li')].map((li) => li.innerText.trim()),
        cats: window.__ayni.data.categories.map((c) => c.label),
        details: document.querySelectorAll('details, summary').length,
        heading: !!lg.querySelector('h1, h2, h3, h4, p, legend, summary, .eyebrow'),
        text: lg.innerText,
        inside: r.width > 0 && r.left >= map.left && r.right <= map.right && r.top >= map.top && r.bottom <= map.bottom,
        corner: r.left - map.left <= 20 && map.bottom - r.bottom <= 20,
        height: r.height,
      };
    });
    check(
      'Lejant başlıksız, açılır-kapanır değil, haritanın köşesinde her zaman görünür',
      legend.details === 0 && !legend.heading && legend.inside && legend.corner,
      `${Math.round(legend.height)} px yüksek`,
    );
    check(
      'Lejant yalnızca renkleri açıklar: 6 olay türü, adlar veriyle aynı; "Okuma kılavuzu", boyut, şekil, önem yok',
      legend.items.length === 6 &&
        legend.items.every((t, i) => t === legend.cats[i]) &&
        !/önem|boyut|şekil|kılavuz/i.test(legend.text),
      legend.items.join(' · '),
    );

    // -- hover texts that replaced the permanent ones
    const noData = await toPx(-100, 45);
    await p.mouse.move(noData[0], noData[1]);
    await p.waitForTimeout(500);
    check(
      'Sınır verisi olmayan karanın üstünde ipucu açıklar (lejanttan çıkan "noktalı zemin" bilgisi burada)',
      await p.evaluate(
        () =>
          !document.querySelector('.tip').hidden &&
          /sınır verisi yok/i.test(document.querySelector('.tip').textContent),
      ),
    );
    const mingAt = await toPx(112, 33);
    await p.mouse.move(mingAt[0], mingAt[1]);
    await p.waitForTimeout(500);
    check(
      'Bir devletin üstünde ipucu devletin adını söyler',
      await p.evaluate(
        () => !document.querySelector('.tip').hidden && /Ming/.test(document.querySelector('.tip').textContent),
      ),
    );
    await p.locator('.tl-seg').first().hover();
    await p.waitForTimeout(400);
    check(
      'Çizelgenin renkli şeridinin üstünde ipucu o noktanın egemenini söyler',
      await p.evaluate(
        () =>
          !document.querySelector('.tip').hidden &&
          /Osmanlı İmparatorluğu/.test(document.querySelector('.tip').textContent),
      ),
    );
    check('Bu sayfada konsol hatası yok (8)', errs.length === 0, errs[0] ?? '');
    await ctx.close();
  }
  {
    // crisp crops for the report (the checks above run at 1×)
    const { ctx, p } = await open('#t=1490-1520&p=35.5,38.9', { width: 1440, height: 900 }, { deviceScaleFactor: 2 });
    await p.mouse.move(700, 300);
    const at = await p.evaluate(() => {
      const r = document.querySelector('.pin:not([hidden]) .pin-dot').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await p.screenshot({
      path: join(OUT, '09-yer-noktasi.png'),
      clip: { x: at.x - 90, y: at.y - 65, width: 180, height: 130 },
    });
    await ctx.close();
  }

  /* ---- 9. an event opened from the timeline: always on the map; the map eases out just far enough; the panel follows */
  console.log('\n9. Zaman çizelgesinden olay seçimi (Mohaç, 1526)');
  {
    const { ctx, p, errs } = await open('#t=1515-1535&p=35.5,38.9');
    await p.evaluate(() => window.__ayni.map.jumpTo({ center: [112, 33], zoom: 4.6 })); // the user has zoomed into China
    await p.waitForTimeout(1500);
    const snapshot = () =>
      p.evaluate(() => {
        const m = window.__ayni.map;
        const b = m.getBounds();
        const box = document.querySelector('#map').getBoundingClientRect();
        const ev = window.__ayni.data.eventsById.get('mohac-1526');
        const q = m.project([ev.location.lon, ev.location.lat]);
        const rects = [...document.querySelectorAll('.map-zoom, .legend, .map-stats:not([hidden])')].map((el) =>
          el.getBoundingClientRect(),
        );
        const x = box.left + q.x;
        const y = box.top + q.y;
        const el = document.querySelector('.evt[data-id="mohac-1526"]');
        return {
          z: m.getZoom(),
          minZoom: m.getMinZoom(),
          bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          W: box.width,
          H: box.height,
          x: q.x,
          y: q.y,
          dx: q.x - box.width / 2,
          dy: q.y - box.height / 2,
          behindControl: rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom),
          drawn: !!el && !el.classList.contains('is-hidden'),
        };
      });
    const pre = await snapshot();
    check(
      "Çin'e yakınlaşılmış; Mohaç şu an görünümün dışında ve haritada çizili değil",
      pre.z > 4 && !pre.drawn,
      `yakınlaştırma ${pre.z.toFixed(2)}`,
    );
    check(
      'Mohaç, Osmanlı çizelgesinde bir nokta olarak duruyor',
      (await p.locator('.tl-ev[data-id="mohac-1526"]').count()) === 1,
    );
    await p.screenshot({ path: join(OUT, '11-mohac-once-cin.png') });

    const tracking = trackCamera(p, 4200);
    await p.locator('.tl-ev[data-id="mohac-1526"]').click();
    const samples = await tracking;
    const z0 = samples[0].z;
    const zEnd = samples[samples.length - 1].z;
    const total = z0 - zEnd;
    const maxStep = Math.max(...samples.slice(1).map((s, i) => Math.abs(s.z - samples[i].z)));
    const between = new Set(samples.filter((s) => s.z < z0 - 0.03 && s.z > zEnd + 0.03).map((s) => s.z.toFixed(2)))
      .size;
    const firstMove = samples.find((s) => Math.abs(s.z - z0) > 0.005)?.t ?? 0;
    const lastMove = [...samples].reverse().find((s) => Math.abs(s.z - zEnd) > 0.005)?.t ?? 0;
    check('Harita uzaklaştı (en az bir yakınlaştırma düzeyi)', total > 1, `${total.toFixed(2)} düzey`);
    check(
      'Hareket yumuşak: atlama yok, ara kareler var (tek karede en çok %45 yol)',
      maxStep < 0.45 * total && between >= 5,
      `${between} ara kare, en büyük adım ${maxStep.toFixed(2)} / ${total.toFixed(2)}`,
    );
    check(
      'Hareket takip edilebilecek kadar uzun sürer (≥ 0,8 sn)',
      lastMove - firstMove >= 800,
      `${lastMove - firstMove} ms`,
    );
    check(
      'Yalnızca uzaklaşır: hareket sırasında geri yakınlaşma yok',
      samples.every((s, i) => i === 0 || s.z <= samples[i - 1].z + 1e-6),
    );

    await p.waitForTimeout(300);
    const post = await snapshot();
    check(
      'Mohaç artık görünümde: kenarlardan uzakta, kontrollerin arkasında değil, işaretçisi çizili',
      post.drawn &&
        post.x >= 30 &&
        post.x <= post.W - 50 &&
        post.y >= 40 &&
        post.y <= post.H - 30 &&
        !post.behindControl,
      `${Math.round(post.x)},${Math.round(post.y)} / ${Math.round(post.W)}×${Math.round(post.H)}`,
    );
    const [pw, ps, pe, pn] = pre.bounds;
    const [qw, qs, qe, qn] = post.bounds;
    check(
      'Önceki görünüm yeni görünümün içinde kalır (Çin hâlâ ekranda)',
      qw <= pw + 0.01 && qs <= ps + 0.01 && qe >= pe - 0.01 && qn >= pn - 0.01,
      `[${pre.bounds.map((v) => v.toFixed(0))}] ⊂ [${post.bounds.map((v) => v.toFixed(0))}]`,
    );
    // "just enough": the least zoom-out that brings Mohaç inside the margins (the same margins the app keeps clear)
    const margin = { top: 44, right: 60, bottom: 36, left: 36 };
    let need = Infinity;
    for (let L = 0; L <= 12; L += 0.01) {
      const k = 2 ** -L;
      const x = pre.W / 2 + pre.dx * k;
      const y = pre.H / 2 + pre.dy * k;
      if (x >= margin.left && x <= pre.W - margin.right && y >= margin.top && y <= pre.H - margin.bottom) {
        need = L;
        break;
      }
    }
    const used = pre.z - post.z;
    check(
      'Harita yalnızca gerektiği kadar uzaklaştı (en az gereken düzey + küçük pay)',
      Math.abs(used - need) <= 0.25 && post.z > post.minZoom + 0.2,
      `kullanılan ${used.toFixed(2)} düzey, gereken ${need.toFixed(2)}`,
    );

    // the highlight on the map marker
    const mk = await p.evaluate(() => {
      const el = document.querySelector('.evt[data-id="mohac-1526"]');
      const mark = el.querySelector('.evt-mark');
      const ring = getComputedStyle(mark, '::after');
      const glow = getComputedStyle(mark, '::before');
      const callout = getComputedStyle(el, '::after');
      const other = [...document.querySelectorAll('.evt:not(.is-hidden):not(.is-selected)')][0];
      const otherRing = other ? getComputedStyle(other.querySelector('.evt-mark'), '::after') : null;
      const r = mark.getBoundingClientRect();
      return {
        selected: el.classList.contains('is-selected'),
        pressed: el.getAttribute('aria-pressed'),
        ringW: parseFloat(ring.borderTopWidth),
        ringColour: ring.borderTopColor,
        ringOpacity: Number(ring.opacity),
        glowOpacity: Number(glow.opacity),
        callout: callout.display !== 'none' ? callout.content.replace(/^"|"$/g, '') : '',
        otherOpacity: otherRing ? Number(otherRing.opacity) : null,
        centre: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      };
    });
    check(
      'Mohaç işaretçisi belirgin biçimde vurgulu: ≥ 3 px vurgu halkası, ışıma, adı yanında',
      mk.selected &&
        mk.pressed === 'true' &&
        mk.ringW >= 3 &&
        mk.ringColour === 'rgb(207, 58, 33)' &&
        mk.ringOpacity === 1 &&
        mk.glowOpacity === 1 &&
        mk.callout === 'Mohaç Muharebesi',
      JSON.stringify({ ring: mk.ringW, colour: mk.ringColour, callout: mk.callout }),
    );
    check(
      'Vurgu yalnızca seçili olayda: diğer işaretçilerde halka yok',
      mk.otherOpacity === 0,
      String(mk.otherOpacity),
    );
    const reds = await colourCount(
      p,
      { x: mk.centre.x - 34, y: mk.centre.y - 34, width: 68, height: 68 },
      [207, 58, 33],
      48,
    );
    check('Vurgu gözle de seçilir: işaretçinin çevresinde yüzlerce vurgu rengi pikseli', reds >= 120, `${reds} piksel`);
    await p.mouse.move(700, 20); // off the timeline: the screenshot should not show the hover tooltip
    await p.waitForTimeout(400);
    await p.screenshot({ path: join(OUT, '12-mohac-sonra.png') });

    // the same event on the timeline
    const tl = await p.evaluate(() => {
      const d = document.querySelector('.tl-ev[data-id="mohac-1526"]');
      const tag = document.querySelector('.tl-tag');
      const t = tag ? tag.getBoundingClientRect() : null;
      return {
        selected: d.classList.contains('is-selected'),
        tag: tag ? tag.textContent.replace(/\s+/g, ' ').trim() : '',
        covers: t
          ? [...document.querySelectorAll('.tl-ev:not(.is-selected)')].filter((o) => {
              const r = o.querySelector('.dot').getBoundingClientRect();
              return r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
            }).length
          : -1,
      };
    });
    check(
      'Çizelgede seçili nokta vurgulu ve adı yanında kalır (seçili olayın etiketi görünür kalabilir)',
      tl.selected && tl.tag.includes('Mohaç Muharebesi') && tl.tag.includes('1526'),
      tl.tag,
    );
    check('Ad etiketi başka bir noktayı örtmez', tl.covers === 0, String(tl.covers));

    // the panel: the event is the focus, the place folds into one line
    const panel = await p.evaluate(() => ({
      line: document.querySelector('[data-testid=place-line]')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      event: !!document.querySelector('[data-testid=event-card]'),
      placeCard: !!document.querySelector('[data-testid=place-card]'),
      lineHeight: document.querySelector('[data-testid=place-line]')?.getBoundingClientRect().height ?? 0,
    }));
    check(
      'Panel: olay odakta (tam kart); yer tek satırlık başlığa küçüldü (ad + aralık), yer kartı gizli',
      panel.event &&
        !panel.placeCard &&
        !!panel.line &&
        panel.line.includes('Osmanlı İmparatorluğu') &&
        panel.line.includes('1515–1535') &&
        panel.lineHeight <= 56,
      `${panel.line} (${Math.round(panel.lineHeight)} px)`,
    );

    // back to the place: by the header, by the close button, by Esc
    const camBefore = await cameraOf(p);
    await p.locator('[data-testid=place-line]').click();
    await p.waitForTimeout(600);
    const back = await p.evaluate(() => ({
      event: window.__ayni.store.state.selectedEventId,
      placeCard: !!document.querySelector('[data-testid=place-card]'),
      eventCard: !!document.querySelector('[data-testid=event-card]'),
      line: !!document.querySelector('[data-testid=place-line]'),
      selectedMarker: document.querySelectorAll('.evt.is-selected').length,
      title: document.querySelector('[data-testid=place-title]')?.textContent.trim(),
    }));
    check(
      'Başlığa tıklamak yer görünümüne döndürür: olay kapanır, yer kartı tam boyutta, işaretçi vurgusu kalkar',
      back.event === null &&
        back.placeCard &&
        !back.eventCard &&
        !back.line &&
        back.selectedMarker === 0 &&
        back.title === 'Osmanlı İmparatorluğu',
      JSON.stringify(back),
    );
    check('Yer görünümüne dönmek haritayı oynatmaz', sameCamera(camBefore, await cameraOf(p)));
    await p.screenshot({ path: join(OUT, '13-olay-kapaninca.png') });

    await p.locator('.tl-ev[data-id="mohac-1526"]').click();
    await p.waitForTimeout(700);
    await p.locator('[data-testid=event-card] button[aria-label="Olayı kapat"]').click();
    await p.waitForTimeout(500);
    check(
      'Olay kartının kapatma düğmesi de yer görünümüne döndürür',
      await p.evaluate(
        () =>
          !!document.querySelector('[data-testid=place-card]') &&
          !document.querySelector('[data-testid=event-card]') &&
          window.__ayni.store.state.selectedEventId === null,
      ),
    );
    await p.locator('.tl-ev[data-id="mohac-1526"]').click();
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    check(
      'Esc de olayı kapatır; yer seçili kalır ve panel yer görünümüne döner',
      await p.evaluate(
        () => !!document.querySelector('[data-testid=place-card]') && window.__ayni.store.state.places.length === 1,
      ),
    );
    check('Bu senaryoda konsol hatası yok (9)', errs.length === 0, errs[0] ?? '');
    await ctx.close();
  }
  {
    // an event the zoom budget would hide is drawn anyway while it is open
    const { ctx, p } = await open('#t=1400-1600&p=35.5,38.9');
    const hidden = await p.evaluate(() => {
      const vm = window.__ayni.view();
      const shown = new Set(window.__ayni.visibleMarkerIds());
      const onTimeline = new Set(vm.places[0].timeline.map((e) => e.id));
      return vm.mapEvents.filter((e) => onTimeline.has(e.id) && !shown.has(e.id)).map((e) => e.id);
    });
    check(
      'Geniş aralıkta, yakınlaştırma bütçesi yüzünden haritada çizilmeyen olaylar var',
      hidden.length >= 2,
      `${hidden.length} olay`,
    );
    for (const id of hidden.slice(0, 2)) {
      await p.locator(`.tl-ev[data-id="${id}"]`).click();
      await p.waitForTimeout(3300);
      const st = await p.evaluate((eid) => {
        const el = document.querySelector(`.evt[data-id="${eid}"]`);
        return {
          drawn: !!el && !el.classList.contains('is-hidden'),
          selected: !!el && el.classList.contains('is-selected'),
        };
      }, id);
      check(`Seçilince çizilir (bütçe ve önem süzgeci aşılır): ${id}`, st.drawn && st.selected);
    }
    await ctx.close();
  }

  /* ---- 10. narrow screens, touch, reduced motion */
  console.log('\n10. Dar ekran, dokunmatik, azaltılmış hareket');
  {
    const { ctx, p, errs } = await open(
      '#t=1500&p=35.5,38.9',
      { width: 390, height: 844 },
      { hasTouch: true, isMobile: true },
    );
    const m = await p.evaluate(() => {
      const map = document.querySelector('.map-wrap').getBoundingClientRect();
      const head = document.querySelector('.map-head').getBoundingClientRect();
      const lg = document.querySelector('.legend').getBoundingClientRect();
      const st = document.querySelector('.map-stats:not([hidden])')?.getBoundingClientRect();
      const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        above: head.bottom <= map.top + 0.5,
        dock: document.querySelector('.dock').getBoundingClientRect().height,
        legendInside: lg.left >= map.left && lg.right <= map.right && lg.bottom <= map.bottom,
        legendClash: st ? meets(lg, st) : false,
      };
    });
    check(
      'Telefon: yatay taşma yok, başlık haritanın üstünde, alt bölüm ≈ 100 px',
      !m.overflow && m.above && m.dock >= 85 && m.dock <= 105,
      `${m.dock} px`,
    );
    check('Telefon: lejant haritanın içinde ve sayaçla çakışmıyor', m.legendInside && !m.legendClash);
    await p.screenshot({ path: join(OUT, '14-mobil.png') });
    const dotEl = p.locator('.tl-ev:not(.is-context)').first();
    const id = await dotEl.getAttribute('data-id');
    const title = await p.evaluate((i) => window.__ayni.data.eventsById.get(i).title, id);
    await dotEl.tap();
    await p.waitForTimeout(700);
    const tapped = await p.evaluate(() => ({
      open: window.__ayni.store.state.selectedEventId,
      tag: document.querySelector('.tl-tag')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      tipHidden: document.querySelector('.tip').hidden,
    }));
    check(
      'Dokunmatik: noktaya dokununca olay açılır ve adı çizelgede görünür',
      tapped.open === id && tapped.tag.includes(title),
      `${title} → ${tapped.tag}`,
    );
    check('Dokunmatik: dokunuştan sonra ekranda takılı kalan bir ipucu yok', tapped.tipHidden);
    check('Telefonda konsol hatası yok', errs.length === 0, errs[0] ?? '');
    await ctx.close();
  }
  {
    const { ctx, p } = await open(
      '#t=1515-1535&p=35.5,38.9',
      { width: 1440, height: 900 },
      { reducedMotion: 'reduce' },
    );
    await p.evaluate(() => window.__ayni.map.jumpTo({ center: [112, 33], zoom: 4.6 }));
    await p.waitForTimeout(1200);
    const z0 = (await cameraOf(p)).zoom;
    await p.locator('.tl-ev[data-id="mohac-1526"]').click();
    await p.waitForTimeout(500);
    const z1 = (await cameraOf(p)).zoom;
    const seen = await p.evaluate(() => {
      const m = window.__ayni.map;
      const ev = window.__ayni.data.eventsById.get('mohac-1526');
      const q = m.project([ev.location.lon, ev.location.lat]);
      const box = document.querySelector('#map').getBoundingClientRect();
      return q.x > 0 && q.y > 0 && q.x < box.width && q.y < box.height;
    });
    check(
      '"Hareketi azalt" tercihinde görünüm animasyonsuz değişir ve olay yine görünür olur',
      z1 < z0 - 1 && seen,
      `${z0.toFixed(2)} → ${z1.toFixed(2)}`,
    );
    await ctx.close();
  }

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
  '- `01-acilis.png`: açılış durumu (başlık haritanın üstündeki şeritte, alt bölüm tek ince satır çifti)',
  "- `02-anadolu-1500.png`: 1500, Anadolu'da bir nokta → Osmanlı vurgulu, çizelgede Osmanlı olayları",
  "- `03-cin-1500.png`: Çin'de bir nokta → Ming vurgulu; harita aynı yerde",
  '- `04-aralik-1450-1500.png`: aralık 1450–1500 → haritadaki olaylar güncellendi',
  '- `05-olay-detayi.png`: işaretçi tıklaması → olay bilgi panelinde (yer tek satırlık başlıkta)',
  '- `06-surukleme-sonrasi.png`: kullanıcı sürükleyip yakınlaştırdıktan sonra',
  '- `07-baslik.png`: yer başlığı: küçük, etiketsiz, haritanın üstünde; yanında "… yılının sınırları" notu',
  '- `08-alt-bolum.png`: alt bölüm (≈ 100 px): cetvel + çizelge; olay adları yok; seçili olayın adı yanında',
  '- `09-yer-noktasi.png`: seçili yer: dolu kırmızı nokta ve yarıçapsal sönen ışıma, halka yok',
  '- `10-isaretciler-lejant.png`: aynı şekil ve boyutta işaretçiler, yalnızca renkleri açıklayan lejant, mavisiz devlet renkleri',
  "- `11-mohac-once-cin.png`: Çin'e yakınlaşılmış görünüm (Mohaç'tan önce)",
  '- `12-mohac-sonra.png`: çizelgeden Mohaç seçildikten sonra: harita yumuşakça uzaklaştı, işaretçi vurgulu, panelde olay odakta',
  '- `13-olay-kapaninca.png`: olay kapatılınca (ya da yer başlığına tıklanınca) panel yer görünümüne döner',
  '- `14-mobil.png`: telefon genişliği (390 px)',
  '',
];
writeFileSync(join(OUT, 'RAPOR.md'), lines.join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} denetim geçti. Rapor: docs/verification/RAPOR.md`);
process.exit(failed.length ? 1 : 0);
