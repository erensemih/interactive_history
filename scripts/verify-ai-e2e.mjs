#!/usr/bin/env node
/**
 * End-to-end verification of the reading companion (the AI chat) in a real (headless) Chromium.
 *
 *   npm run e2e:ai            # builds if needed, serves the build, runs the scenarios
 *
 * No Claude is available here, so the model is the scripted stand-in (`MockProvider`): it runs the very same
 * tool calls and streams the very same kind of text as a real answer, only with fixed content. The page
 * decides to use it by itself, because `window.claude` does not exist in this browser, and says so in the chat.
 * One group (G) injects a fake artifact runtime instead, to drive the real `sample` adapter in the browser.
 *
 * The four checks of the brief:
 *   1. A point in Anatolia, range 1500–1550, chat open, narration asked: steps appear, the map follows the step.
 *   2. The Ottoman–French alliance (1536) asked: both polities highlighted and connected, brought into view.
 *   3. An event clicked while the chat is open: its card opens over the chat, closing returns to the chat,
 *      "Bunu sohbette sor" sends the event into the conversation.
 *   4. The selected place changed mid-conversation: the chat shows the change.
 *
 * And the feedback round after the first real use:
 *   5. Each step owns the map: a multi-step narration where every step shows only its own drawings, and going back
 *      to an earlier step brings exactly that step's drawings back.
 *   6. "Harita takibi": the camera pans and zooms to each step's drawings; small moves of the map by the reader do not
 *      turn it off; a substantial one brings up a small question that points at the setting.
 *   7. One narrator: with the chat open no event marker is on the map except the opened one and the ones the AI talks
 *      about (the timeline keeps them all); an event of the data is shown by its own marker, never by a mark.
 *   8. No label covers another label or a marker: measured on the page for every step, at several cameras.
 *
 * Writes screenshots (ai-*.png) and a Turkish report (AI-RAPOR.md) to docs/verification/.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'verification');
const PORT = Number(process.env.E2E_PORT ?? 4174);
mkdirSync(OUT, { recursive: true });

const results = [];
const sections = [];
let currentSection = '';
function section(title) {
  currentSection = title;
  sections.push({ title, from: results.length });
  console.log(`\n${title}`);
}
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail !== '' ? `  (${detail})` : ''}`);
}

/**
 * Runs one scenario. An unexpected error (an element that never appeared, a timeout) is a failed check of that
 * scenario, and the next scenario still runs: one broken step must not hide what the others found.
 */
const ONLY = process.env.E2E_ONLY?.split(',').map((x) => x.trim());
async function guard(run) {
  // E2E_ONLY=A3,K runs just those scenarios (while working on them); scenarios that lean on an earlier one then fail.
  if (ONLY && !ONLY.includes(currentSection.split('.')[0])) return;
  try {
    await run();
  } catch (err) {
    check(
      `${currentSection.split(':')[0]}: senaryo beklenmedik biçimde durdu`,
      false,
      String(err.message).split('\n')[0],
    );
  }
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

/* ---------------------------------------------------------------- the browser */
const server = await startServer();
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

/** A fresh page with the app loaded (the hash may already describe a range and a place). */
async function open(
  hash = '#t=1500-1550',
  { viewport = { width: 1440, height: 900 }, init, initArg, mobile = false } = {},
) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  if (init) await page.addInitScript(init, initArg);
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  await page.goto(server.url + hash);
  await page.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  return page;
}

const camera = (page) =>
  page.evaluate(() => {
    const m = window.__ayni.map;
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
  });
const sameCamera = (a, b) => a.lng === b.lng && a.lat === b.lat && a.zoom === b.zoom;
const pixelOf = (page, lon, lat) =>
  page.evaluate(
    ([lo, la]) => {
      const p = window.__ayni.map.project([lo, la]);
      const r = document.querySelector('#map').getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lon, lat],
  );
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const text = (page, sel) => page.locator(sel).first().innerText();
const count = (page, sel) => page.locator(sel).count();
const visible = (page, sel) =>
  page
    .locator(sel)
    .first()
    .isVisible()
    .catch(() => false);
const finalStatus = (page, timeout = 40000) =>
  page
    .waitForFunction(
      () => {
        const a = [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1);
        return a && ['done', 'failed', 'stopped'].includes(a.dataset.status) ? a.dataset.status : false;
      },
      null,
      { timeout },
    )
    .then((h) => h.jsonValue());
const aiIds = (page) =>
  page.evaluate(() => {
    try {
      return window.__ayni.map.getFilter('ai-line')[3][2][1].filter((x) => x !== '\u0000none');
    } catch {
      return [];
    }
  });
const drawing = (page) =>
  page.evaluate(() => {
    const d = window.__ayni.ai.director.drawing;
    return d ? JSON.parse(JSON.stringify(d)) : null;
  });
const active = (page) => page.evaluate(() => window.__ayni.ai.director.active);
const aiDom = (page) =>
  page.evaluate(() => ({
    links: [...document.querySelectorAll('.ai-layer .ai-link')].map((e) => e.dataset.relation),
    flags: [...document.querySelectorAll('.ai-layer .ai-flag')].filter((e) => !e.hidden).map((e) => e.textContent),
    marks: document.querySelectorAll('.ai-layer .ai-pt').length,
    hidden: document.querySelector('.ai-layer')?.hidden ?? true,
  }));
const headYear = (page) => text(page, '[data-testid=title-year]');
const lastRequest = (page) =>
  page.evaluate(() => {
    const p = window.__ayni.ai.session.provider;
    const r = p?.requests?.at(-1);
    return r
      ? {
          tier: r.tier,
          tools: r.tools.map((t) => t.name),
          last: r.turns.at(-1).content,
          roles: r.turns.map((t) => t.role),
        }
      : null;
  });
const geometry = (page) =>
  page.evaluate(() => {
    const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width);
    return { panel: w('aside.panel'), map: w('.map-wrap') };
  });

/** Samples the panel and the map every frame while `action` runs, for `ms`. */
async function recordTransition(page, action, ms = 1100, during) {
  await page.evaluate(() => {
    window.__resizes = 0;
    if (!window.__resizeHooked) {
      window.__resizeHooked = true;
      window.__ayni.map.on('resize', () => window.__resizes++);
    }
    window.__samples = [];
    const t0 = performance.now();
    const tick = () => {
      const panel = document.querySelector('aside.panel').getBoundingClientRect();
      const map = document.querySelector('.map-wrap').getBoundingClientRect();
      const zoom = document.querySelector('.map-zoom').getBoundingClientRect();
      const pt = window.__ayni.map.project([10, 45]);
      window.__samples.push({
        t: performance.now() - t0,
        panel: panel.width,
        left: panel.left,
        map: map.width,
        zoomRight: zoom.right,
        x: pt.x,
        y: pt.y,
      });
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  const mid = during ? await during() : undefined;
  await page.waitForTimeout(ms);
  const out = await page.evaluate(() => ({ samples: window.__samples, resizes: window.__resizes }));
  return { ...out, mid };
}

/** The conversation is quiet: no call is running (an answer that was already final does not count as quiet). */
const idle = (page) => page.waitForFunction(() => !window.__ayni.ai.session.busy, null, { timeout: 40000 });

/** Runs something that starts a new answer, and waits until that answer (not an earlier one) has ended. */
async function answered(page, action) {
  const before = await page.locator('[data-testid=chat-answer]').count();
  await action();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid=chat-answer]').length > n, before, {
    timeout: 10000,
  });
  const status = await finalStatus(page);
  await idle(page);
  return status;
}

/** Types a question and waits for its answer. */
const ask = (page, question) =>
  answered(page, async () => {
    await page.fill('[data-testid=chat-input]', question);
    await page.keyboard.press('Enter');
  });

const shot = (page, name, full = false) => page.screenshot({ path: join(OUT, name), fullPage: full });

const markerIds = (page) => page.evaluate(() => window.__ayni.visibleMarkerIds());
const mapMoving = (page) => page.evaluate(() => window.__ayni.map.isMoving());

/** Waits until a camera move the page started has ended. */
async function cameraRests(page, timeout = 8000) {
  await page.waitForTimeout(120);
  await page.waitForFunction(() => !window.__ayni.map.isMoving(), null, { timeout });
  await page.waitForTimeout(150);
}

/** Points the reader at a step ("Haritada göster") and waits until the camera has come to rest. */
async function showStep(page, n) {
  await page.click(`[data-testid=chat-step][data-n="${n}"] [data-testid=chat-step-show]`);
  await cameraRests(page);
}

const following = (page) => page.evaluate(() => window.__ayni.ai.director.following);
const asking = (page) => page.evaluate(() => window.__ayni.ai.director.askingToRelease);

/** Every label-like thing on the map and every pair of them that covers one another, in map pixels. */
const OVERLAPS = () => {
  const map = document.querySelector('#map').getBoundingClientRect();
  const rel = (r) => ({
    left: r.left - map.left,
    top: r.top - map.top,
    right: r.right - map.left,
    bottom: r.bottom - map.top,
  });
  const items = [];
  const push = (kind, name, r) => items.push({ kind, name, ...rel(r) });
  for (const el of document.querySelectorAll('.ai-flag')) {
    const r = el.getBoundingClientRect();
    if (!el.hidden && r.width) push('flag', el.textContent, r);
  }
  for (const el of document.querySelectorAll('.evt:not(.is-hidden)')) {
    push('marker', el.dataset.id, el.querySelector('.evt-mark').getBoundingClientRect());
    const y = el.querySelector('.evt-year');
    if (y) push('marker', `${el.dataset.id} yıl`, y.getBoundingClientRect());
  }
  for (const el of document.querySelectorAll('.plabel:not(.is-hidden):not(.is-yielded)')) {
    if (getComputedStyle(el).opacity === '0') continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    push('name', el.textContent.replace(/\n/g, ' '), range.getBoundingClientRect());
  }
  for (const el of document.querySelectorAll('.ai-pt')) push('diamond', 'işaret', el.getBoundingClientRect());
  for (const el of document.querySelectorAll('.ai-glyph, .ai-link .glyph'))
    push('glyph', 'simge', el.getBoundingClientRect());
  for (const el of document.querySelectorAll('.pin:not([hidden]) .pin-dot'))
    push('pin', 'yer noktası', el.getBoundingClientRect());
  const controls = [...document.querySelectorAll('.map-zoom, .legend, .map-stats:not([hidden])')]
    .map((el) => ({ name: el.className, ...rel(el.getBoundingClientRect()) }))
    .filter((r) => r.right - r.left > 0);
  const clash = [];
  const cover = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.75 && h > 0.75 ? `${w.toFixed(0)}×${h.toFixed(0)}` : null;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const kinds = `${a.kind}+${b.kind}`;
      // a name may lie over a border line and a marker's year hangs on its dot: those are not pairs of labels
      if (a.kind === 'marker' && b.kind === 'marker') continue;
      if (a.kind === 'name' && b.kind === 'name') continue;
      if (a.kind === 'glyph' || b.kind === 'glyph') {
        if (kinds !== 'flag+glyph' && kinds !== 'glyph+flag' && kinds !== 'glyph+marker' && kinds !== 'marker+glyph')
          continue;
      }
      const c = cover(a, b);
      if (c) clash.push(`${a.kind}:${a.name} × ${b.kind}:${b.name} (${c})`);
    }
  }
  const flags = items.filter((i) => i.kind === 'flag');
  const out = flags
    .filter((f) => f.left < 0 || f.top < 0 || f.right > map.width || f.bottom > map.height)
    .map((f) => f.name);
  const underControl = [];
  for (const f of flags) for (const c of controls) if (cover(f, c)) underControl.push(`${f.name} × ${c.name}`);
  return { count: items.length, flags: flags.length, clash, out, underControl };
};
const overlapReport = (page) => page.evaluate(OVERLAPS);

/** Everything one step shows on the map, read from the page in one go. */
const MAP_STATE = () => {
  const { map, ai, data } = window.__ayni;
  const d = ai.director.drawing;
  const year = ai.director.year ?? window.__ayni.view().year;
  const r = ai.session.resolver;
  const box = document.querySelector('#map').getBoundingClientRect();
  const pts = [];
  if (d) {
    for (const id of d.highlights) {
      const b = r.boundsAt(id, year);
      if (b) pts.push([b[0], b[1]], [b[2], b[3]], [b[0], b[3]], [b[2], b[1]]);
    }
    for (const m of d.marks) pts.push([m.point.lon, m.point.lat]);
    for (const id of d.events) {
      const e = data.eventsById.get(id);
      pts.push([e.location.lon, e.location.lat]);
    }
    for (const l of d.links) {
      for (const id of [l.from, l.to]) {
        const a = r.anchorAt(id, year);
        if (a) pts.push([a.lon, a.lat]);
      }
    }
  }
  const outside = pts.filter(([lon, lat]) => {
    const p = map.project([lon, lat]);
    return !(p.x >= 0 && p.y >= 0 && p.x <= box.width && p.y <= box.height);
  }).length;
  const c = map.getCenter();
  let ids = [];
  try {
    ids = map.getFilter('ai-line')[3][2][1].filter((x) => x !== '\u0000none');
  } catch {
    /* no layer yet */
  }
  return {
    ids,
    links: [...document.querySelectorAll('.ai-layer .ai-link')].map((e) => e.dataset.relation),
    flags: [...document.querySelectorAll('.ai-layer .ai-flag')].filter((e) => !e.hidden).map((e) => e.textContent),
    eventFlags: [...document.querySelectorAll('.ai-layer .ai-flag.is-event')]
      .filter((e) => !e.hidden)
      .map((e) => e.dataset.event),
    diamonds: document.querySelectorAll('.ai-layer .ai-pt').length,
    markers: window.__ayni.visibleMarkerIds(),
    year: document.querySelector('[data-testid=title-year]')?.textContent,
    camera: { lng: c.lng, lat: c.lat, zoom: map.getZoom() },
    targets: pts.length,
    outside,
  };
};
const mapState = (page) => page.evaluate(MAP_STATE);

/** A drag on the map with the mouse, symmetric about the middle of the map so it never leaves it. */
async function dragMap(page, dx, dy) {
  const r = await page.evaluate(() => document.querySelector('#map').getBoundingClientRect().toJSON());
  const p = { x: r.x + r.width / 2 - dx / 2, y: r.y + r.height / 2 - dy / 2 };
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 5 });
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 5 });
  await page.waitForTimeout(160); // stop before letting go, so the map does not coast on
  await page.mouse.up();
  await page.waitForTimeout(900);
}

/** The Ottoman narration of the mock, step by step: what each step asks for (and so what it alone shows). */
const OTTOMAN = [
  { n: 1, ids: 'ottoman-empire,safavid-dynasty', links: '', events: ['safevi-1501'], marks: 0, year: '1505' },
  { n: 2, ids: 'ottoman-empire,safavid-dynasty', links: 'war', events: ['caldiran-1514'], marks: 0, year: '1514' },
  { n: 3, ids: 'ottoman-empire,mamluk-sultanate', links: 'war', events: ['ridaniye-1517'], marks: 1, year: '1517' },
  {
    n: 4,
    ids: 'ottoman-empire,kingdom-of-hungary,habsburg-monarchy',
    links: 'war',
    events: ['mohac-1526', 'viyana-1529'],
    marks: 0,
    year: '1526',
  },
  { n: 5, ids: 'ottoman-empire,kingdom-of-france', links: 'alliance', events: [], marks: 0, year: '1536' },
  {
    n: 6,
    ids: 'ottoman-empire,republic-of-venice,papal-states',
    links: 'war',
    events: ['preveze-1538'],
    marks: 0,
    year: '1538',
  },
];
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const camCompare = (a, b) => ({
  moved: Math.abs(a.zoom - b.zoom) > 0.02 || Math.hypot(a.lng - b.lng, a.lat - b.lat) > 0.05,
});

/* ============================================================ A. narration */
section('A. Anlatım: Anadolu’da bir nokta, 1500–1550, sohbet açık; her adım haritanın sahibi, kamera adımı izliyor');
await guard(async () => {
  const page = await open('#t=1500-1550');
  const start = await page.evaluate(() => window.__ayni.store.state);
  check(
    'Aralık 1500–1550',
    start.range.from === 1500 && start.range.to === 1550,
    `${start.range.from}–${start.range.to}`,
  );
  const anatolia = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 500);
  check(
    'Anadolu’daki nokta seçildi: Osmanlı İmparatorluğu',
    (await text(page, '[data-testid=place-title]')) === 'Osmanlı İmparatorluğu',
  );
  check(
    'Yer kartında “Bu yerin tarihini anlat” ve “Soru sor” var',
    (await visible(page, '[data-testid=place-narrate]')) && (await visible(page, '[data-testid=place-ask]')),
  );
  await shot(page, 'ai-0-yer-karti.png');

  // --- opening the chat: the panel widens in one smooth move and nothing on the map moves
  const markersBefore = await markerIds(page);
  const camBefore = await camera(page);
  const geo0 = await geometry(page);
  const ref0 = await pixelOf(page, 10, 45);
  const rec = await recordTransition(page, () => page.click('[data-testid=place-ask]'), 1200);
  const geo1 = await geometry(page);
  const ref1 = await pixelOf(page, 10, 45);
  const camAfter = await camera(page);

  check(
    'Sohbet açıldı; panel yer kartı yerine sohbeti gösteriyor',
    (await visible(page, '[data-testid=chat]')) && !(await visible(page, '[data-testid=place-card]')),
  );
  const header = await page.evaluate(() => {
    const line = document.querySelector('[data-testid=panel-context] .line');
    return { h: Math.round(line.getBoundingClientRect().height), text: line.innerText.replace(/\s+/g, ' ').trim() };
  });
  check(
    'Yer, aynı tek satırlık başlığa (ad + aralık) küçüldü',
    header.h <= 48 && /Osmanlı İmparatorluğu.*1500–1550/.test(header.text),
    `${header.text} (${header.h} px)`,
  );
  check(
    'Panel sohbet için genişledi (410 → 540 px), harita o kadar daraldı',
    geo0.panel === 410 && geo1.panel >= 500 && geo1.panel <= 560 && geo0.map - geo1.map === geo1.panel - geo0.panel,
    `${geo0.panel} → ${geo1.panel} px; harita ${geo0.map} → ${geo1.map}`,
  );
  check(
    'Harita yerinden oynamadı: aynı enlem-boylam aynı pikselde (sol kenar sabit)',
    Math.abs(ref0.x - ref1.x) < 0.5 && Math.abs(ref0.y - ref1.y) < 0.5 && camAfter.zoom === camBefore.zoom,
    `Δ = ${Math.abs(ref0.x - ref1.x).toFixed(2)} px`,
  );
  const widths = rec.samples.map((s) => s.panel);
  const growing = widths.every((w, i) => i === 0 || w >= widths[i - 1] - 0.01);
  const frames = widths.filter((w) => w > 412 && w < 538).length;
  check(
    'Genişleme tek ve yumuşak bir hareket: genişlik yalnızca artar, ara kareler var',
    growing && frames >= 6 && widths.at(-1) === geo1.panel,
    `${frames} ara kare`,
  );
  const first = rec.samples[0];
  const moved = rec.samples.some((s) => Math.abs(s.x - first.x) > 0.5 || Math.abs(s.y - first.y) > 0.5);
  check('Hareket boyunca haritanın içeriği hiçbir karede kaymadı', !moved);
  check('Harita tek kez yeniden boyutlandı (hareket sırasında değil, sonunda)', rec.resizes === 1, `${rec.resizes}`);
  const sliding = rec.samples.filter((s) => s.panel > 412 && s.panel < 538);
  check(
    'Haritanın sağ kenarındaki denetimler panelin kenarıyla birlikte kayıyor, sonda sıçramıyor',
    sliding.length > 0 && sliding.every((s) => Math.abs(s.zoomRight - (s.left - 12)) < 1.5),
  );
  check(
    'Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)',
    /Deneme kipi/.test(await text(page, '[data-testid=chat-mock-notice]')),
  );

  // --- the AI is the narrator: the event markers leave the map (they stay on the timeline)
  const markersChat = await markerIds(page);
  check(
    'Sohbet açılınca olay işaretçileri haritadan çekildi (çizelgede duruyorlar)',
    markersBefore.length >= 5 && markersChat.length === 0 && (await count(page, '.dock [data-id]')) >= 10,
    `${markersBefore.length} → ${markersChat.length} işaretçi`,
  );

  // --- the narration
  const camChat = await camera(page);
  await page.click('[data-testid=chat-narrate]');
  await page.waitForSelector('[data-testid=chat-thinking]', { timeout: 5000 });
  check(
    'Yanıt gelmeden önce “Düşünüyor…” ve Durdur düğmesi var',
    (await visible(page, '[data-testid=chat-thinking]')) && (await visible(page, '[data-testid=chat-stop]')),
  );
  await page.waitForSelector('[data-testid=chat-step]', { timeout: 20000 });
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);

  const steps = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=chat-step]')].map((s) => ({
      n: s.dataset.n,
      active: s.dataset.active,
      title: s.querySelector('[data-testid=chat-step-title]')?.textContent ?? '',
    })),
  );
  check(
    'Yanıt numaralı adımlara bölünmüş (6 adım, hepsinin başlığı var)',
    steps.length === 6 && steps.every((s) => s.title.length > 3),
    steps.map((s) => s.n).join(','),
  );
  check(
    'İlk adım etkin, diğerleri değil',
    steps[0].active === 'true' && steps.slice(1).every((s) => s.active === 'false'),
  );
  check(
    'Etkin adımda “Haritada gösteriliyor”, diğerlerinde “Haritada göster”',
    (await count(page, '[data-testid=chat-step-live]')) === 1 &&
      (await count(page, '[data-testid=chat-step-show]')) === 5,
  );
  const st = await page.evaluate(() => window.__ayni.store.state);
  check(
    'Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner)',
    st.cursor === 0.5 && (await headYear(page)) === '1505',
    `başlıkta ${await headYear(page)}, imleç ${st.cursor}`,
  );

  // --- every step shows only what it asks for, and the camera brings it into view
  const states = {};
  const drawings = {};
  const cameras = [];
  for (const exp of OTTOMAN) {
    if (exp.n !== 1) await showStep(page, exp.n);
    const state = await mapState(page);
    states[exp.n] = state;
    drawings[exp.n] = await drawing(page);
    cameras.push(state.camera);
    const expected = exp.events;
    check(
      `${exp.n}. adım yalnızca kendi çizimini gösteriyor: ${exp.ids.split(',').length} devlet, ${exp.links || 'bağlantı yok'}, ${expected.length} olay işareti, ${exp.marks} serbest işaret, ${exp.year}`,
      state.ids.join() === exp.ids &&
        state.links.join() === exp.links &&
        sameSet(state.markers, expected) &&
        sameSet(state.eventFlags, expected) &&
        state.diamonds === exp.marks &&
        state.year === exp.year,
      `${state.ids.length} devlet · işaretçiler: ${state.markers.join(', ') || '—'} · ${state.flags.join(' | ')}`,
    );
    check(
      `${exp.n}. adım: kamera çizimi görünür kıldı (${state.targets} nokta, görünüm dışında ${state.outside})`,
      state.targets > 0 && state.outside === 0,
      `merkez ${state.camera.lng.toFixed(1)}, ${state.camera.lat.toFixed(1)} · yakınlaştırma ${state.camera.zoom.toFixed(2)}`,
    );
    const lap = await overlapReport(page);
    check(
      `${exp.n}. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (${lap.count} öğe)`,
      lap.clash.length === 0 && lap.out.length === 0 && lap.underControl.length === 0,
      [...lap.clash, ...lap.out, ...lap.underControl].join(' | '),
    );
    if (exp.n === 1) await shot(page, 'ai-1a-anlatim-adim1.png');
    if (exp.n === 2) await shot(page, 'ai-1b-anlatim-adim2.png');
    if (exp.n === 3) await shot(page, 'ai-1d-anlatim-adim3.png');
    if (exp.n === 4) await shot(page, 'ai-1e-anlatim-adim4.png');
  }
  const camStart = camCompare(camChat, cameras[0]);
  check(
    'Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı)',
    cameras[0].zoom > camChat.zoom + 1 && camStart.moved,
    `${camChat.zoom.toFixed(2)} → ${cameras[0].zoom.toFixed(2)}`,
  );
  const changes = cameras.slice(1).filter((c, i) => camCompare(cameras[i], c).moved).length;
  check(
    'Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı',
    changes >= 3,
    `${changes}/5 geçişte oynadı`,
  );

  // --- the map follows the reader's scrolling, without a click
  await page.mouse.move(1150, 450);
  const seq = [];
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -500);
    await settle(page, 80);
  }
  await settle(page, 500);
  seq.push((await active(page)).n);
  for (let i = 0; i < 44 && !(seq.length > 3 && seq.slice(-3).every((n) => n === 6)); i++) {
    await page.mouse.wheel(0, 110);
    await settle(page, 230);
    seq.push((await active(page)).n);
  }
  const monotone = seq.every((n, i) => i === 0 || n >= seq[i - 1]);
  check(
    'Okurken harita adımı izliyor: kaydırdıkça etkin adım 1’den 6’ya sırayla ilerliyor',
    monotone && seq[0] === 1 && seq.at(-1) === 6 && new Set(seq).size === 6,
    seq.join(' '),
  );
  await cameraRests(page);
  const last = await mapState(page);
  check(
    'Son adımda harita son adımın durumunda (1538, Preveze olayı kendi işaretiyle) ve kamera onu görünür kıldı',
    last.year === '1538' && last.markers.join() === 'preveze-1538' && last.outside === 0,
  );
  await shot(page, 'ai-1c-anlatim-adim6.png');
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -300);
    await settle(page, 120);
  }
  await cameraRests(page);
  await settle(page, 400);
  const back = await drawing(page);
  check(
    'Geri dönülünce 1. adımın harita durumu aynen geri geliyor',
    (await active(page)).n === 1 &&
      JSON.stringify(back) === JSON.stringify(drawings[1]) &&
      (await headYear(page)) === '1505',
  );

  // --- going back to any earlier step brings exactly that step's drawings back, and nothing of the others
  let exact = true;
  const diffs = [];
  for (const n of [4, 2, 6, 3, 5, 1]) {
    await showStep(page, n);
    const again = await mapState(page);
    const before = states[n];
    const same =
      JSON.stringify(await drawing(page)) === JSON.stringify(drawings[n]) &&
      again.ids.join() === before.ids.join() &&
      again.links.join() === before.links.join() &&
      sameSet(again.markers, before.markers) &&
      sameSet(again.flags, before.flags) &&
      again.diamonds === before.diamonds &&
      again.year === before.year &&
      again.outside === 0;
    if (!same) {
      exact = false;
      diffs.push(`${n}`);
    }
  }
  check(
    'Önceki adımlara dönmek (4, 2, 6, 3, 5, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor',
    exact,
    diffs.length ? `farklı: ${diffs.join(',')}` : '',
  );

  // --- the reader takes the time cursor: the AI's year steps aside until the next step
  await page.evaluate(() => window.__ayni.store.setDisplayYear(1520));
  await settle(page, 500);
  const ownYear = await headYear(page);
  await page.click('[data-testid=chat-step][data-n="3"] [data-testid=chat-step-show]');
  await settle(page, 700);
  check(
    'Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor',
    ownYear === '1520' && (await headYear(page)) === '1517',
    `${ownYear} → ${await headYear(page)}`,
  );
  await cameraRests(page);

  // --- back to the place card and into the chat again: nothing is lost
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  const refC0 = await pixelOf(page, 10, 45);
  const closing = await recordTransition(page, () => page.click('[data-testid=panel-context] .line'), 1200);
  const refC1 = await pixelOf(page, 10, 45);
  const markersClosed = await markerIds(page);
  check(
    'Başlığa tıklamak yer kartına döndürür; sohbet kapanınca yapay zekâ çizimi haritadan kalkar',
    (await visible(page, '[data-testid=place-card]')) &&
      !(await visible(page, '[data-testid=chat]')) &&
      (await aiDom(page)).hidden &&
      (await aiIds(page)).length === 0,
  );
  check(
    'Sohbet kapanınca olay işaretçileri haritaya geri döner (anlatıcı yalnızca sohbet açıkken)',
    markersClosed.length >= 4,
    `${markersBefore.length} → ${markersChat.length} → ${markersClosed.length}`,
  );
  check(
    'Panel eski genişliğine döndü; harita yine yerinden oynamadı; kapanış da tek yeniden boyutlandırma',
    (await geometry(page)).panel === 410 && Math.abs(refC0.x - refC1.x) < 0.5 && closing.resizes === 1,
    `Δ = ${Math.abs(refC0.x - refC1.x).toFixed(2)} px`,
  );
  check(
    'Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)',
    (await headYear(page)) === '1520',
  );
  await page.click('[data-testid=place-ask]');
  await settle(page, 900);
  const scrollAfter = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  check(
    'Sohbet geri açılınca yazışma ve okuma konumu aynen duruyor',
    (await count(page, '[data-testid=chat-step]')) === 6 &&
      Math.abs(scrollAfter - scrollBefore) <= 2 &&
      (await active(page)).n === 3,
    `kaydırma ${scrollBefore} → ${scrollAfter}`,
  );
  check(
    'Çizim yeniden haritada (etkin adımın durumu) ve olay işaretçileri yine yalnızca anlatılan olay',
    (await aiDom(page)).links.join() === 'war' &&
      (await headYear(page)) === '1517' &&
      (await markerIds(page)).join() === 'ridaniye-1517',
  );
  await page.context().close();
});

section('A2. Sohbetten önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  const from = await pixelOf(page, 20, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => {
    window.__ayni.map.jumpTo({ zoom: 4.2 }); // (not returned: the map object is far too big to hand back to the script)
  });
  await settle(page, 500);
  const camPlay = await camera(page);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);
  check(
    'Sohbet açılmadan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz',
    (await following(page)) && !(await asking(page)) && !(await visible(page, '[data-testid=chat-follow-off]')),
  );
  const first = await mapState(page);
  check(
    'İlk adım açılınca kamera çizimi görünür kıldı (okurun kendi gezdiği görünümden)',
    first.outside === 0 && camCompare(camPlay, first.camera).moved,
    `${camPlay.zoom.toFixed(2)} → ${first.camera.zoom.toFixed(2)}`,
  );
  await showStep(page, 2);
  const second = await mapState(page);
  const inView = await page.evaluate(() => {
    const m = window.__ayni.map;
    const box = document.querySelector('#map').getBoundingClientRect();
    return [
      [33.2, 39.2],
      [58.5, 32.8],
    ].every(([lon, lat]) => {
      const p = m.project([lon, lat]);
      return p.x > 0 && p.y > 0 && p.x < box.width && p.y < box.height;
    });
  });
  check(
    '2. adım: harita iki devleti de görünür kılıyor (Osmanlı ve Safevî)',
    inView && second.outside === 0,
    `yakınlaştırma ${first.camera.zoom.toFixed(2)} → ${second.camera.zoom.toFixed(2)}`,
  );
  await page.context().close();
});

/* ============================================== A3. "Harita takibi" and the question */
section('A3. Harita takibi: küçük hareketler kapatmaz, büyük hareketten sonra küçük bir soru çıkar');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 500);
  await showStep(page, 3);
  const framed = await mapState(page);
  check('Başlangıç: takip açık, soru yok, “serbest” uyarısı yok', (await following(page)) && !(await asking(page)));

  // a short drag (about a seventh of the map) and one click of + are only looking around
  await dragMap(page, 60, 40);
  check(
    'Kısa bir sürükleme takibi kapatmaz ve soru çıkarmaz',
    (await following(page)) && !(await asking(page)) && !(await visible(page, '[data-testid=follow-prompt]')),
  );
  await page.click('.zoom-btn[aria-label="Yakınlaştır"]');
  await settle(page, 800);
  check(
    'Bir kez + düğmesi (bir yakınlaştırma düzeyi) de takibi kapatmaz ve soru çıkarmaz',
    (await following(page)) && !(await visible(page, '[data-testid=follow-prompt]')),
  );

  // the second click makes it two levels: a substantial move
  await page.click('.zoom-btn[aria-label="Yakınlaştır"]');
  await settle(page, 900);
  check(
    'Önemli bir hareketten (iki düzey yakınlaşma) sonra küçük bir soru çıkıyor; takip kendiliğinden kapanmıyor',
    (await visible(page, '[data-testid=follow-prompt]')) && (await following(page)) && (await asking(page)),
  );
  const prompt = await page.evaluate(() => {
    const card = document.querySelector('[data-testid=follow-prompt]').getBoundingClientRect();
    const map = document.querySelector('#map').getBoundingClientRect();
    const zoom = document.querySelector('.map-zoom').getBoundingClientRect();
    const active = document.activeElement;
    return {
      w: card.width,
      h: card.height,
      share: (card.width * card.height) / (map.width * map.height),
      zoomClash: card.left < zoom.right && zoom.left < card.right && card.top < zoom.bottom && zoom.top < card.bottom,
      focused: !!active && !!active.closest('[data-testid=follow-prompt]'),
      text: document.querySelector('[data-testid=follow-prompt]').innerText.replace(/\s+/g, ' '),
      live: document.querySelector('.follow-host').getAttribute('aria-live'),
      dialog: !!document.querySelector('[role=dialog], [role=alertdialog], dialog'),
    };
  });
  check(
    'Soru küçük ve sakin: haritanın %6’sından azını kaplar, yakınlaştırma düğmelerini örtmez, odağı çalmaz, iletişim kutusu değil',
    prompt.share < 0.06 && !prompt.zoomClash && !prompt.focused && !prompt.dialog && prompt.live === 'polite',
    `${Math.round(prompt.w)}×${Math.round(prompt.h)} px, %${(prompt.share * 100).toFixed(1)}`,
  );
  check(
    'Soru neyi sorduğunu ve ayarın nerede durduğunu söylüyor (Ayarlar ⚙ → Harita takibi)',
    /Haritayı kendiniz gezdiniz/.test(prompt.text) &&
      /bıraksın mı/.test(prompt.text) &&
      /Ayarlar ⚙ → Harita takibi/.test(prompt.text),
    prompt.text,
  );
  await shot(page, 'ai-9-harita-takibi-sorusu.png');
  await settle(page, 2500);
  check('Soru birkaç saniye içinde kendiliğinden kaybolmuyor (okunacak kadar kalıyor)', await asking(page));

  // the hint leads to the setting, and the setting is marked
  await page.click('[data-testid=follow-settings]');
  await settle(page, 400);
  const menu = await page.evaluate(() => ({
    open: !!document.querySelector('[data-testid=chat-menu]'),
    pointed: !!document.querySelector('[data-testid=chat-follow-row].is-pointed'),
    focused: document.activeElement?.dataset?.testid,
    label: document.querySelector('[data-testid=chat-follow-row] b')?.textContent,
    hint: document.querySelector('[data-testid=chat-follow-row] small')?.textContent,
  }));
  check(
    'Ayarlar bağlantısı sohbet ayarlarını açar, “Harita takibi” satırını işaretler ve anahtara odaklanır',
    menu.open && menu.pointed && menu.focused === 'chat-follow' && menu.label === 'Harita takibi',
    `${menu.label}`,
  );
  check(
    'Ayarın açıklaması küçük kaydırmaların kapatmadığını söyler',
    /Küçük kaydırmalar/.test(menu.hint ?? '') && /çizimlerini görünür/.test(menu.hint ?? ''),
  );
  await shot(page, 'ai-9b-harita-takibi-ayari.png');
  await page.keyboard.press('Escape');
  await settle(page, 300);

  // "Bıraksın": the camera is the reader's; steps keep changing the drawing
  await page.click('[data-testid=follow-release]');
  await settle(page, 400);
  check(
    '“Bıraksın”: takip kapandı, “Harita takibi kapalı” çipi çıktı, kapandığı ve nerede açılacağı söyleniyor',
    !(await following(page)) &&
      !(await asking(page)) &&
      (await visible(page, '[data-testid=chat-follow-off]')) &&
      /Harita takibi kapalı/.test(await text(page, '[data-testid=chat-follow-off]')) &&
      /Ayarlar ⚙ → Harita takibi/.test(await text(page, '[data-testid=follow-released]')),
  );
  const camFree = await camera(page);
  await page.click('[data-testid=chat-step][data-n="4"] [data-testid=chat-step-show]');
  await settle(page, 2500);
  const afterFree = await mapState(page);
  check(
    'Takip kapalıyken adım değişince çizim değişir ama kamera oynamaz (okurla savaşmaz)',
    sameCamera(camFree, afterFree.camera) && afterFree.ids.join() === OTTOMAN[3].ids && afterFree.year === '1526',
  );
  await shot(page, 'ai-9c-harita-takibi-kapali.png');

  // switching it back on brings the active step into view at once
  await page.click('[data-testid=chat-follow-off]');
  await cameraRests(page, 8000);
  const refollow = await mapState(page);
  check(
    'Çiple yeniden açılınca etkin adım hemen görünür kılınır; çip kalkar',
    (await following(page)) && !(await visible(page, '[data-testid=chat-follow-off]')) && refollow.outside === 0,
  );

  // a far drag while following asks again; "İzlemeye devam" settles it for the conversation
  await dragMap(page, 380, 120);
  check(
    'Haritanın üçte biri kadar sürüklemek (önemli hareket) soruyu yeniden getirir',
    (await asking(page)) && (await following(page)),
  );
  await page.click('[data-testid=follow-keep]');
  await settle(page, 300);
  check(
    '“İzlemeye devam”: soru kalkar, takip açık kalır',
    !(await asking(page)) && (await following(page)) && !(await visible(page, '[data-testid=follow-prompt]')),
  );
  await dragMap(page, -380, 100);
  check('“İzlemeye devam” denildikten sonra aynı sohbette soru bir daha sorulmaz', !(await asking(page)));
  await page.click('[data-testid=chat-step][data-n="5"] [data-testid=chat-step-show]');
  await cameraRests(page, 8000);
  const reframed = await mapState(page);
  check(
    'Takip açıkken sonraki adım haritayı yeniden çizime getirir (okurun uzak gezintisi geri alınır)',
    reframed.outside === 0 && reframed.ids.join() === OTTOMAN[4].ids,
  );

  // the setting in the menu is the same switch
  await page.click('[data-testid=chat-settings]');
  await settle(page, 200);
  const sw = page.locator('[data-testid=chat-follow]');
  check('Ayarlardaki anahtar açık', await sw.isChecked());
  await sw.uncheck();
  const off1 = !(await following(page));
  await sw.check();
  await cameraRests(page, 8000);
  check('Ayarlardaki anahtar takibi kapatıp açıyor', off1 && (await following(page)));
  await page.keyboard.press('Escape');

  // a new conversation starts following again, and may ask again
  await page.click('[data-testid=chat-settings]');
  await page.click('[data-testid=chat-new]');
  await settle(page, 400);
  check('Yeni sohbet takibi yeniden açar', await following(page));
  await page.context().close();
});

section('A4. Soru zaman aşımına uğrar ve “Geri aç” çalışır');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await dragMap(page, 420, 60);
  check('Büyük sürükleme soruyu getirdi', await asking(page));
  await page.evaluate(() => window.__ayni.ai.director.dismissQuestion());
  await settle(page, 300);
  check(
    'Cevaplanmayan soru kendiliğinden kalkınca hiçbir şeye karar vermez: takip açık, “serbest” çipi yok, soru yok',
    !(await asking(page)) &&
      (await following(page)) &&
      !(await visible(page, '[data-testid=follow-prompt]')) &&
      !(await visible(page, '[data-testid=chat-follow-off]')),
  );
  await dragMap(page, -300, -60);
  check('Başka bir büyük hareketten sonra soru yeniden çıkar', await asking(page));
  await page.click('[data-testid=follow-release]');
  await settle(page, 300);
  await page.click('[data-testid=follow-undo]');
  await cameraRests(page, 8000);
  check(
    '“Geri aç”: takip yeniden açık ve çizim görünür',
    (await following(page)) && (await mapState(page)).outside === 0,
  );
  await page.context().close();
});

/* ========================================================== B. a question */
section('B. Soru: Osmanlı–Fransa ittifakı (1536) — her yanıtın tek harita durumu var, kamera onu görünür kılar');
let qaPage;
await guard(async () => {
  const page = await open('#t=1500-1550');
  const anatolia = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 400);
  await page.click('[data-testid=place-ask]');
  await settle(page, 800);
  check(
    '“Soru sor” sohbeti açar; yeni sohbette tanıtım ve öneriler var',
    (await visible(page, '[data-testid=chat-empty]')) && (await visible(page, '[data-testid=chat-narrate]')),
  );
  check(
    'Tanıtım yeni davranışı anlatıyor: her adımın kendi çizimi, Harita takibi, olay işaretleri çizelgede',
    /her adım/i.test(await text(page, '[data-testid=chat-empty]')) &&
      /Harita takibi/.test(await text(page, '[data-testid=chat-empty]')) &&
      /çizelgede/.test(await text(page, '[data-testid=chat-empty]')),
  );
  check('Soru kutusuna odak gitti', await page.evaluate(() => document.activeElement?.dataset.testid === 'chat-input'));
  await shot(page, 'ai-0-bos-sohbet.png');
  const camBefore = await camera(page);
  await page.fill('[data-testid=chat-input]', 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?');
  await page.keyboard.press('Enter');
  await settle(page, 300);
  check(
    'Soru gönderilince kutu temizlendi, “Düşünüyor…” görünür',
    (await page.inputValue('[data-testid=chat-input]')) === '' && (await visible(page, '[data-testid=chat-thinking]')),
  );
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 500);
  const camAfter = await camera(page);
  check(
    'Soru yanıtı tek adım: numarasız, tek bölüm',
    (await count(page, '[data-testid=chat-step]')) === 1 && (await count(page, '.cs-n')) === 0,
  );
  const state = await mapState(page);
  check(
    'Her iki devlet de vurgulandı (Osmanlı ve Fransa)',
    state.ids.join() === 'ottoman-empire,kingdom-of-france',
    state.ids.join('+'),
  );
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.plabel.is-ai')]
      .filter((e) => !e.classList.contains('is-hidden'))
      .map((e) => e.textContent.replace(/\s+/g, ' ')),
  );
  check('İki devletin adı da haritada mürekkep renginde, kalın', labels.length >= 2, labels.join(' | '));
  check(
    'İkisi ittifak çizgisiyle bağlandı: “İttifak, 1536”',
    state.links.join() === 'alliance' && state.flags.includes('İttifak, 1536'),
    state.flags.join(', '),
  );
  check('Harita sınırları 1536’ya getirildi', state.year === '1536');
  check(
    'Kamera ittifakın iki ucunu da görünür kıldı (Fransa’dan Osmanlı’ya) ve haritada hiç olay işaretçisi yok',
    state.outside === 0 && camCompare(camBefore, camAfter).moved && state.markers.length === 0,
    `yakınlaştırma ${camBefore.zoom.toFixed(2)} → ${camAfter.zoom.toFixed(2)}`,
  );
  const lap = await overlapReport(page);
  check(
    'Etiketler birbirini ve işaretçileri örtmüyor',
    lap.clash.length === 0 && lap.out.length === 0 && lap.underControl.length === 0,
    [...lap.clash, ...lap.out, ...lap.underControl].join(' | '),
  );
  await shot(page, 'ai-2-ittifak-sorusu.png');
  qaPage = page;
});

/* ============================================================ C. an event */
section(
  'C. Olay: sohbet açıkken çizelgeden bir olaya tıklamak, kartı sohbetin üstünde açar ve işaretçisini haritaya getirir',
);
await guard(async () => {
  const page = qaPage;
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  const id = 'mohac-1526';
  check(
    'Tıklamadan önce haritada olay işaretçisi yok; olaylar çizelgede',
    (await markerIds(page)).length === 0 && (await count(page, `.dock [data-id="${id}"]`)) >= 1,
  );
  const dot = page.locator(`.dock [data-id="${id}"]`).first();
  await dot.click({ timeout: 5000 });
  await settle(page, 900);
  check(
    'Olay kartı sohbetin üstünde açıldı (sohbet altta duruyor, kart onu örtüyor)',
    (await visible(page, '[data-testid=event-sheet] [data-testid=event-card]')) &&
      (await count(page, '[data-testid=chat]')) === 1,
  );
  check(
    'Tıklanan olay haritaya gelir: yalnızca onun işaretçisi, vurgulu',
    (await markerIds(page)).join() === id && (await count(page, '.marker-layer .evt.is-selected')) === 1,
    (await markerIds(page)).join(),
  );
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('[data-testid=event-sheet]').getBoundingClientRect();
    const input = document.querySelector('[data-testid=chat-input]').getBoundingClientRect();
    return {
      top: s.top,
      bottom: s.bottom,
      inputTop: input.top,
      inert: document.querySelector('[data-testid=chat-scroll]').inert,
    };
  });
  check(
    'Kart soru kutusunu örtmüyor; arkadaki sohbet erişilemez (inert) ve ekran okuyuculardan gizli',
    sheet.bottom <= sheet.inputTop + 1 && sheet.inert,
  );
  check(
    'Yer, başlıkta tek satır olarak kalıyor ve açık olay soru kutusunda bağlam olarak görünüyor',
    (await visible(page, '[data-testid=panel-context] .line')) &&
      /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-event-chip]')),
  );
  const lapOpen = await overlapReport(page);
  check(
    'Açık olayın adı ve işaretçisi başka etiketlerle çakışmıyor',
    lapOpen.clash.length === 0 && lapOpen.out.length === 0,
    lapOpen.clash.join(' | '),
  );
  await shot(page, 'ai-3a-olay-sohbetin-ustunde.png');

  await page.click('[data-testid=event-sheet] button[aria-label="Olayı kapat"]');
  await settle(page, 600);
  const scrollMid = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  check(
    'Kartı kapatmak sohbete döndürür; okuma konumu aynı; olayın işaretçisi haritadan yeniden çekilir',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      (await visible(page, '[data-testid=chat-input]')) &&
      Math.abs(scrollMid - scrollBefore) <= 1 &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null &&
      (await markerIds(page)).length === 0,
  );
  await dot.click({ timeout: 5000 });
  await settle(page, 500);
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc de kartı kapatır; sohbet açık kalır',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      (await visible(page, '[data-testid=chat]')) &&
      (await page.evaluate(() => window.__ayni.store.state.chatOpen)),
  );

  await dot.click({ timeout: 5000 });
  await settle(page, 500);
  check('Olay kartında “Bunu sohbette sor” düğmesi var', await visible(page, '[data-testid=event-ask]'));
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await cameraRests(page, 12000);
  await settle(page, 600);
  check(
    'Düğme olayı sohbete gönderdi: kart kapandı, kullanıcı mesajında olay çipi var',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-user-event]')),
  );
  const req = await lastRequest(page);
  check(
    'Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)',
    req &&
      /Açık olay kartı: «Mohaç Muharebesi» \(kimlik: mohac-1526\)/.test(req.last) &&
      /İSTEK \[SORU\]/.test(req.last),
  );
  const state = await mapState(page);
  check(
    'Yanıtın haritası: olay kendi işaretiyle (adı yanında), taraflar vurgulu, olayın yılı; serbest işaret yok',
    state.markers.join() === id &&
      state.eventFlags.join() === id &&
      state.diamonds === 0 &&
      state.ids.includes('ottoman-empire') &&
      state.year === '1526' &&
      state.outside === 0,
    `${state.flags.join(', ')} · ${state.year}`,
  );
  await shot(page, 'ai-3b-bunu-sohbette-sor.png');
});

section('C2. Olay: kart sohbet kapalıyken açılırsa; çizelgeden; Esc');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.locator('.marker-layer [data-id="mohac-1526"]').click({ timeout: 5000 });
  await settle(page, 600);
  check(
    'Sohbet kapalıyken olay kartı normal panelde açılır (sohbet yok)',
    (await visible(page, '[data-testid=event-card]')) &&
      !(await visible(page, '[data-testid=chat]')) &&
      !(await visible(page, '[data-testid=event-sheet]')),
  );
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await settle(page, 500);
  check(
    '“Bunu sohbette sor” sohbeti açar ve olayı gönderir',
    (await visible(page, '[data-testid=chat]')) &&
      (await page.evaluate(() => window.__ayni.store.state.chatOpen)) &&
      /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-user-event]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null,
  );
  const dock = page.locator('.dock [data-id="caldiran-1514"]').first();
  await dock.click({ timeout: 5000 });
  await settle(page, 700);
  check(
    'Çizelgedeki noktaya tıklamak da kartı sohbetin üstünde açar',
    (await visible(page, '[data-testid=event-sheet] [data-testid=event-card]')) &&
      /Çaldıran/.test(await text(page, '[data-testid=event-sheet] [data-testid=event-title]')),
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc önce olay kartını kapatır, sohbet açık kalır',
    !(await visible(page, '[data-testid=event-sheet]')) && (await visible(page, '[data-testid=chat]')),
  );
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check(
    'Bir daha Esc sohbeti kapatır ve yer kartına döner (yer seçili kalır)',
    !(await visible(page, '[data-testid=chat]')) && (await visible(page, '[data-testid=place-card]')),
  );
  await page.context().close();
});

/* ========================================================= D. new subject */
section('D. Bağlam: sohbet sürerken seçili yer değişirse sohbet bunu gösterir');
await guard(async () => {
  const page = qaPage;
  const before = await count(page, '[data-testid=chat-context-change]');
  check('Yer değişmeden ayırıcı yok', before === 0);
  await page.evaluate(() => (window.__origin = window.__ayni.store.state.places[0]));
  const france = await pixelOf(page, 2.2, 48.5);
  await page.mouse.click(france.x, france.y);
  await settle(page, 600);
  check(
    'Yer değişince sohbette tek bir “Bağlam değişti” ayırıcısı çıkıyor',
    (await count(page, '[data-testid=chat-context-change]')) === 1,
  );
  const div = await text(page, '[data-testid=chat-context-change]');
  check(
    'Ayırıcı eski ve yeni konuyu söylüyor',
    /Osmanlı İmparatorluğu · 1500–1550/.test(div) && /Fransa Krallığı · 1500–1550/.test(div),
    div.replace(/\s+/g, ' '),
  );
  check('Başlık yeni yeri gösteriyor', /Fransa Krallığı/.test(await text(page, '[data-testid=panel-context] .line')));
  check(
    'Soru kutusu yeni yeri söylüyor',
    /Fransa Krallığı hakkında/.test(await page.getAttribute('[data-testid=chat-input]', 'placeholder')),
  );
  await shot(page, 'ai-4-baglam-degisti.png');

  await page.evaluate(() => window.__ayni.store.setRange({ from: 1500, to: 1520 }));
  await settle(page, 600);
  check(
    'Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)',
    (await count(page, '[data-testid=chat-context-change]')) === 1 &&
      /Fransa Krallığı · 1500–1520/.test(await text(page, '[data-testid=chat-context-to]')),
  );
  await page.evaluate(() => window.__ayni.store.setRange({ from: 1500, to: 1550 }));
  // back to the very place the conversation is about (the camera has moved since: the same point, not the same pixel)
  await page.evaluate(() => window.__ayni.store.selectPlace(window.__origin));
  await settle(page, 600);
  check('Okur konuya dönerse ayırıcı kalkıyor', (await count(page, '[data-testid=chat-context-change]')) === 0);

  const f2 = await pixelOf(page, 2.2, 48.5);
  await page.mouse.click(f2.x, f2.y);
  await settle(page, 400);
  await ask(page, 'Burada o yıllarda ne oluyordu?');
  await settle(page, 400);
  const req = await lastRequest(page);
  check(
    'Model bağlamın değiştiğini söylendi (“Konu değişti”)',
    req && /Konu değişti/.test(req.last) && /Fransa Krallığı/.test(req.last),
    '',
  );
  check(
    'Ayırıcı yazışmada, değişiklikten sonraki sorunun önünde kalıyor',
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.chat-scroll > *')].map((e) => e.dataset.testid);
      const i = items.lastIndexOf('chat-context-change');
      return i > -1 && items[i + 1] === 'chat-user';
    }),
  );
  await qaPage.context().close();
});

/* ====================================================== J. one narrator */
section(
  'J. Tek anlatıcı: sohbet açıkken olay işaretçileri haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir',
);
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  const before = await markerIds(page);
  const dockBefore = await count(page, '.dock [data-id]');
  const note0 = await text(page, '.map-stats');
  check(
    'Sohbet kapalıyken hiçbir şey değişmedi: haritada olay işaretçileri ve “n / m olay haritada” notu var',
    before.length >= 5 && /\/\s*\d+ olay haritada/.test(note0) && !/gerisi çizelgede/.test(note0),
    `${before.length} işaretçi · ${note0.replace(/\s+/g, ' ')}`,
  );
  await page.click('[data-testid=place-ask]');
  await settle(page, 900);
  const note1 = await text(page, '.map-stats');
  check(
    'Sohbet açılınca tüm olay işaretçileri haritadan çekilir, çizelgede aynen kalır',
    (await markerIds(page)).length === 0 &&
      (await count(page, '.marker-layer .evt:not(.is-hidden)')) === 0 &&
      (await count(page, '.dock [data-id]')) === dockBefore,
    `harita ${before.length} → 0 · çizelge ${dockBefore} → ${await count(page, '.dock [data-id]')}`,
  );
  check(
    'Not nedenini söylüyor: “0 olay haritada · gerisi çizelgede”',
    /0\s*olay haritada/.test(note1) && /gerisi çizelgede/.test(note1),
    note1.replace(/\s+/g, ' '),
  );

  // closing the chat without anything asked gives the map back exactly as it was
  await page.click('[data-testid=panel-context] .line');
  await settle(page, 900);
  check(
    'Hiçbir şey sorulmadan sohbeti kapatmak haritayı birebir eski hâline getirir (aynı işaretçiler)',
    sameSet(await markerIds(page), before),
  );
  await page.click('[data-testid=place-ask]');
  await settle(page, 900);

  // an event the reader clicks comes to the map for as long as its card is open
  await page.locator('.dock [data-id="caldiran-1514"]').first().click({ timeout: 5000 });
  await settle(page, 900);
  check(
    'Çizelgeden tıklanan olay haritada belirir (yalnızca o) ve kartı açıktır',
    (await markerIds(page)).join() === 'caldiran-1514' && (await visible(page, '[data-testid=event-sheet]')),
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check('Kart kapanınca olayın işaretçisi yeniden haritadan çekilir', (await markerIds(page)).length === 0);

  // an event the AI talks about comes to the map in its own marker, with its name
  await page.click('[data-testid=chat-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await showStep(page, 2);
  const s2 = await mapState(page);
  const named = await page.evaluate(() => document.querySelector('.ai-flag.is-event')?.textContent);
  check(
    '2. adım Çaldıran’dan söz ediyor: haritada Çaldıran’ın kendi işaretçisi ve adı var, başka olay yok',
    s2.markers.join() === 'caldiran-1514' && named === 'Çaldıran Muharebesi' && s2.diamonds === 0,
    `${s2.markers.join()} · ${named}`,
  );
  const dotLook = await page.evaluate(() => {
    const el = document.querySelector('.evt[data-id="caldiran-1514"]');
    return {
      year: el.querySelector('.evt-year')?.textContent,
      selected: el.classList.contains('is-selected'),
      color: getComputedStyle(el.querySelector('.evt-mark svg, .evt-mark i, .evt-mark')).fill,
      button: el.tagName,
    };
  });
  check(
    'Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil)',
    dotLook.year === '1514' && !dotLook.selected && dotLook.button === 'BUTTON',
  );
  // clicking that marker opens its card like any other
  await page.locator('.marker-layer [data-id="caldiran-1514"]').click({ timeout: 5000 });
  await settle(page, 700);
  check(
    'Anılan olayın işaretçisine tıklamak olay kartını sohbetin üstünde açar',
    (await visible(page, '[data-testid=event-sheet] [data-testid=event-card]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === 'caldiran-1514',
  );
  const lapSel = await overlapReport(page);
  check(
    'Hem anılan hem açık olduğunda adı bir kez yazılı (açık olayın etiketi), çakışma yok',
    (await count(page, '.ai-flag.is-event:not([hidden])')) === 0 && lapSel.clash.length === 0,
    lapSel.clash.join(' | '),
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check(
    'Kart kapanınca olay yine anlatılan olay olarak haritada kalır',
    (await markerIds(page)).join() === 'caldiran-1514' && (await count(page, '.ai-flag.is-event:not([hidden])')) === 1,
  );

  // a mark for something the data has an event for is shown as that event; a place the data does not know stays a mark
  await showStep(page, 4);
  const calls = await page.evaluate(() => {
    const req = window.__ayni.ai.session.provider.requests.at(-1);
    const mark = req.tools.find((t) => t.name === 'mark');
    return [
      mark.execute({ step: 4, lon: 20.45, lat: 44.82, label: 'Belgrad' }),
      mark.execute({ step: 4, lon: 32.48, lat: 37.87, label: 'Konya' }),
    ];
  });
  await cameraRests(page, 8000);
  await settle(page, 400);
  const s4 = await mapState(page);
  check(
    'Model verideki bir olay (Belgrad’ın fethi) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez',
    /^tamam/.test(calls[0]) &&
      /olay kaydı/.test(calls[0]) &&
      s4.markers.includes('belgrad-1521') &&
      s4.eventFlags.includes('belgrad-1521'),
    `${calls[0]}`,
  );
  check(
    'Verinin bilmediği bir yer (Konya) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi',
    calls[1] === 'tamam' && s4.diamonds === 1 && s4.flags.includes('Konya'),
    `${s4.flags.join(', ')}`,
  );
  const lap4 = await overlapReport(page);
  check(
    'Bu kalabalık adımda da (3 olay + 1 işaret + bağlantı) etiketler birbirini ve işaretçileri örtmüyor',
    lap4.clash.length === 0 && lap4.out.length === 0 && lap4.underControl.length === 0,
    [...lap4.clash, ...lap4.out, ...lap4.underControl].join(' | '),
  );
  await shot(page, 'ai-1f-tek-anlatici.png');

  // closing the chat takes the AI's drawing and its markers away and gives the map its markers back
  await page.click('[data-testid=panel-context] .line');
  await settle(page, 900);
  check(
    'Sohbet kapanınca anlatıcının işaretçileri ve çizimi gider, haritanın olayları geri gelir',
    (await aiDom(page)).hidden &&
      (await markerIds(page)).length >= 3 &&
      !(await markerIds(page)).includes('belgrad-1521'),
    (await markerIds(page)).join(', '),
  );
  await page.context().close();
});

/* =============================================== K. no label covers another */
section('K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor');
for (const vp of [
  { name: '1440×900', viewport: { width: 1440, height: 900 } },
  { name: '1180×760', viewport: { width: 1180, height: 760 } },
])
  await guard(async () => {
    const page = await open('#t=1500-1550&p=35.500,38.900', { viewport: vp.viewport });
    await page.click('[data-testid=place-narrate]');
    await finalStatus(page);
    await cameraRests(page, 12000);
    let cases = 0;
    let labels = 0;
    const bad = [];
    for (const exp of OTTOMAN) {
      if (exp.n !== 1) await showStep(page, exp.n);
      for (const dz of [0, 0.9, -0.9]) {
        if (dz) {
          await page.evaluate((d) => {
            window.__ayni.map.jumpTo({ zoom: window.__ayni.map.getZoom() + d });
          }, dz);
          await settle(page, 350);
        }
        const lap = await overlapReport(page);
        cases++;
        labels += lap.flags;
        const found = [...lap.clash, ...lap.out, ...lap.underControl];
        if (found.length) bad.push(`adım ${exp.n}, yakınlaştırma ${dz >= 0 ? '+' : ''}${dz}: ${found.join('; ')}`);
        if (dz) {
          await page.evaluate((d) => {
            window.__ayni.map.jumpTo({ zoom: window.__ayni.map.getZoom() - d });
          }, dz);
          await settle(page, 250);
        }
      }
    }
    check(
      `${vp.name}: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = ${cases} durumda ${labels} yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor`,
      bad.length === 0,
      bad.slice(0, 3).join(' | '),
    );
    await page.context().close();
  });

/* ============================================ E. stopping and failing, settings */
section('E. Durdurma, hatalar, ayarlar');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-narrate]');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid=chat-step] .prose')?.textContent.length ?? 0) > 70,
    null,
    { timeout: 20000 },
  );
  await page.click('[data-testid=chat-stop]');
  const status = await finalStatus(page);
  await settle(page, 300);
  const partial = await page.evaluate(() => document.querySelector('[data-testid=chat-answer]').innerText.length);
  check(
    'Durdur: yanıt hemen “durduruldu” olur, yazılan kısım kalır',
    status === 'stopped' && partial > 40 && (await visible(page, '[data-testid=chat-stopped]')),
    `${partial} karakter`,
  );
  check(
    'Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez',
    (await visible(page, '[data-testid=chat-send]')) && !(await page.evaluate(() => window.__ayni.ai.session.busy)),
  );

  await ask(page, 'deneme [hata:rate_limited]');
  await settle(page, 500);
  check(
    'rate_limited: hata yazışmada, yazıldığı yerde; yazılan metin kalır; yeniden dene düğmesi var',
    (await text(page, '[data-testid=chat-error]')).includes('Çok sık istek') &&
      (await visible(page, '[data-testid=chat-retry]')) &&
      (await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1).innerText.includes('ilk cümlesi'),
      )),
  );
  check(
    'rate_limited sohbeti kilitlemez; kendiliğinden yeniden denemez (tek istek)',
    (await page.evaluate(
      () => window.__ayni.ai.session.provider.requests.filter((r) => /rate_limited/.test(r.meta.question)).length,
    )) === 1 && !(await page.locator('[data-testid=chat-input]').isDisabled()),
  );
  await shot(page, 'ai-5-hata.png');
  const requestsBefore = await page.evaluate(() => window.__ayni.ai.session.provider.requests.length);
  await page.click('[data-testid=chat-retry]');
  await page.waitForFunction((n) => window.__ayni.ai.session.provider.requests.length > n, requestsBefore);
  await idle(page);
  await settle(page, 300);
  check(
    '“Yeniden dene” yalnızca okur basınca ve bir kez soruyor',
    (await page.evaluate(
      () => window.__ayni.ai.session.provider.requests.filter((r) => /rate_limited/.test(r.meta.question)).length,
    )) === 2,
  );

  await ask(page, 'deneme [hata:not_granted]');
  await settle(page, 400);
  check(
    'not_granted: kalıcı uyarı, soru kutusu kapalı, izin paneli düğmesi',
    (await visible(page, '[data-testid=chat-blocked]')) &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      (await page.getByRole('button', { name: 'İzinleri aç' }).count()) >= 1,
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-ask]');
  await settle(page, 600);
  await page.click('[data-testid=chat-settings]');
  await settle(page, 300);
  check(
    'Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; model adı yok',
    (await page.locator('[data-testid=chat-menu] input[name=tier]').count()) === 3 &&
      (
        await page
          .locator('[data-testid=chat-menu] input[name=tier]:checked')
          .evaluate((e) => e.parentElement.innerText)
      ).includes('Dengeli') &&
      !/claude|gpt|sonnet|opus|haiku/i.test(await text(page, '[data-testid=chat-menu]')),
  );
  await shot(page, 'ai-7-ayarlar.png');
  await page.locator('[data-testid=chat-menu] label', { hasText: 'Hızlı' }).click();
  await page.keyboard.press('Escape');
  await ask(page, 'Fransa ile ittifak neydi?');
  check('Seçilen hız modele gidiyor (quick)', (await lastRequest(page)).tier === 'quick');
  check(
    'Seçim tarayıcıda saklanıyor',
    (await page.evaluate(() => localStorage.getItem('ayni-zamanda.tier'))) === 'quick',
  );
  await page.reload();
  await page.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  check('Yenilenince seçim korunuyor', (await page.evaluate(() => window.__ayni.ai.session.tier)) === 'quick');
  await page.click('[data-testid=place-ask]').catch(() => {});
  await settle(page, 500);
  await ask(page, 'Fransa ile ittifak neydi?');
  await page.click('[data-testid=chat-settings]');
  await page.click('[data-testid=chat-new]');
  await settle(page, 400);
  check(
    '“Sohbeti temizle” yazışmayı ve haritadaki çizimi siler',
    (await count(page, '[data-testid=chat-user]')) === 0 && (await aiDom(page)).hidden,
  );
  await page.context().close();
});

/* ============================================ G. the real `sample` adapter */
section('G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)');
const FAKE_RUNTIME = (opts = {}) => {
  window.__noTools = !!opts.noTools;
  window.__rejectWith = opts.rejectWith ?? null;
  window.__sampleCalls = [];
  window.__permissionsOpened = 0;
  const sample = async (input, options = {}) => {
    window.__sampleCalls.push({
      roles: input.map((t) => t.role),
      tier: options.modelTier,
      hasCache: 'cache' in options,
      tools: (options.tools || []).map((t) => t.name),
      schemas: (options.tools || []).every(
        (t) => t.inputSchema && t.inputSchema.type === 'object' && t.description.length <= 1024,
      ),
      signal: !!options.signal,
      last: input[input.length - 1].content,
    });
    if (window.__rejectWith) throw window.__rejectWith;
    const ctx = { signal: options.signal };
    if (options.tools) {
      const by = Object.fromEntries(options.tools.map((t) => [t.name, t]));
      window.__toolResults = await Promise.all([
        by.step.execute({ n: 1, title: 'İttifak' }, ctx),
        by.highlight.execute({ step: 1, polities: ['ottoman-empire', 'kingdom-of-france', 'atlantis'] }, ctx),
        by.connect.execute(
          { step: 1, from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'Gerçek yol' },
          ctx,
        ),
        by.set_year.execute({ step: 1, year: 1536 }, ctx),
      ]);
    }
    await new Promise((r) => setTimeout(r, 80));
    const first = '## 1. İttifak\nBu yanıt sahte çalışma zamanından geldi';
    const full = `${first}, araçlarla birlikte.`;
    options.onText?.({ text: first, delta: first });
    await new Promise((r) => setTimeout(r, 80));
    options.onText?.({ text: full, delta: full.slice(first.length) });
    return { text: full, truncated: false, modelTierApplied: options.modelTier };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: window.__noTools ? undefined : { maxCount: 12 } });
  window.claude = {
    use: async (name) =>
      name === 'sample'
        ? sample
        : name === 'permissions'
          ? { manage: async () => void window.__permissionsOpened++ }
          : null,
  };
};
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', { init: FAKE_RUNTIME });
  await page.click('[data-testid=place-ask]');
  await settle(page, 700);
  check(
    'Claude çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”',
    !(await visible(page, '[data-testid=chat-mock-notice]')) &&
      (await page.evaluate(() => window.__ayni.ai.session.provider.kind)) === 'sample',
  );
  await page.fill('[data-testid=chat-input]', 'Fransa ile ittifak neydi?');
  await page.keyboard.press('Enter');
  await finalStatus(page);
  await settle(page, 500);
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları',
    call.roles[0] === 'user' && call.roles.at(-1) === 'user' && call.tier === 'default' && call.signal && call.schemas,
    call.roles.join(),
  );
  check('Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)', call.hasCache === false);
  check(
    'Altı araç: step, highlight, connect, show_event, mark, set_year (focus ve clear yok: her adım haritanın sahibi, kamera okurun ayarı)',
    call.tools.join() === 'step,highlight,connect,show_event,mark,set_year',
  );
  const results = await page.evaluate(() => window.__toolResults);
  check(
    'Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi',
    results[0] === 'tamam' && /atlantis/.test(results[1]),
  );
  const ids = await aiIds(page);
  const dom = await aiDom(page);
  check(
    'Harita: iki devlet vurgulu, bağlantı çizili, yıl 1536',
    ids.join() === 'ottoman-empire,kingdom-of-france' &&
      dom.links.join() === 'alliance' &&
      dom.flags.includes('Gerçek yol') &&
      (await headYear(page)) === '1536',
  );
  check(
    'Metin akışla geldi ve tamamlandı',
    (await page.evaluate(() => document.querySelector('[data-testid=chat-answer]').innerText)).includes(
      'araçlarla birlikte.',
    ),
  );
  // the second question carries the first exchange (the model keeps nothing)
  await page.click('[data-testid=chat-settings]');
  await page.locator('[data-testid=chat-menu] label', { hasText: 'Derin' }).click();
  await page.keyboard.press('Escape');
  await ask(page, 'Peki Venedik?');
  const second = await page.evaluate(() => window.__sampleCalls[1]);
  check(
    'İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”',
    second.roles.join() === 'user,user,assistant,user' &&
      second.tier === 'complex' &&
      /İSTEK \[SORU\]\nPeki Venedik\?/.test(second.last),
  );
  check(
    'Yeni çağrının bağlamında önceki çizimler söyleniyor',
    /Haritada şu an senin çizdiklerin var/.test(second.last),
  );
  await shot(page, 'ai-8-gercek-sample.png');
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', { init: FAKE_RUNTIME, initArg: { noTools: true } });
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; sohbet “yalnızca metin” notunu gösterir',
    call.tools.length === 0 && /yalnızca metin/.test(await text(page, '[data-testid=chat-note]')),
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', {
    init: FAKE_RUNTIME,
    initArg: { rejectWith: { code: 'not_granted', message: 'declined' } },
  });
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await settle(page, 300);
  check(
    'Gerçek not_granted: izin verilmedi uyarısı, kutu kapalı, bir istek',
    (await visible(page, '[data-testid=chat-blocked]')) &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      (await page.evaluate(() => window.__sampleCalls.length)) === 1,
  );
  await page.getByRole('button', { name: 'İzinleri aç' }).first().click();
  await settle(page, 200);
  check(
    '“İzinleri aç” yalnızca düğmeyle, platformun izin panelini açar (permissions.manage)',
    (await page.evaluate(() => window.__permissionsOpened)) === 1,
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', {
    init: FAKE_RUNTIME,
    initArg: { rejectWith: { code: 'rate_limited', message: 'slow', text: 'Yarım' } },
  });
  await page.click('[data-testid=place-ask]');
  await page.fill('[data-testid=chat-input]', 'Soru');
  await page.keyboard.press('Enter');
  await finalStatus(page);
  await settle(page, 300);
  check(
    'Gerçek rate_limited: hata gösterilir, e.text korunur, kilit yok, otomatik yeniden deneme yok',
    (await text(page, '[data-testid=chat-error]')).includes('Çok sık') &&
      (await page.evaluate(() => window.__sampleCalls.length)) === 1 &&
      !(await page.locator('[data-testid=chat-input]').isDisabled()),
  );
  await page.context().close();
});

/* ============================================================== H. mobile */
section('H. Telefon: harita yukarıda kalır, sohbet kalan yeri doldurur');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', { viewport: { width: 390, height: 844 }, mobile: true });
  await page.locator('[data-testid=place-narrate]').scrollIntoViewIfNeeded();
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await settle(page, 1200);
  const m = await page.evaluate(() => {
    const col = document.querySelector('.map-col').getBoundingClientRect();
    const input = document.querySelector('[data-testid=chat-input]').getBoundingClientRect();
    const panel = document.querySelector('aside.panel').getBoundingClientRect();
    return {
      colTop: col.top,
      colBottom: col.bottom,
      inputBottom: input.bottom,
      vh: innerHeight,
      panelTop: panel.top,
      sticky: getComputedStyle(document.querySelector('.map-col')).position,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    'Telefon: harita üstte yapışık, sohbet haritanın hemen altında',
    m.sticky === 'sticky' && m.colTop === 0 && Math.abs(m.panelTop - m.colBottom) < 2,
    `harita ${Math.round(m.colBottom)} px, panel ${Math.round(m.panelTop)} px`,
  );
  check(
    'Telefon: soru kutusu ekranın içinde, yatay taşma yok',
    m.inputBottom <= m.vh + 1 && !m.overflowX,
    `${Math.round(m.inputBottom)} / ${m.vh}`,
  );
  await shot(page, 'ai-6-mobil.png');

  // a big move on the small map brings the question: it has to stay small there too
  await dragMap(page, 300, 0);
  const small = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = document.querySelector('[data-testid=follow-prompt]');
    if (!card) return null;
    const c = box(card);
    const map = box(document.querySelector('#map'));
    const others = ['.map-zoom', '.map-stats'].map((s) => document.querySelector(s)).filter((el) => el && !el.hidden);
    return {
      share: (c.width * c.height) / (map.width * map.height),
      inside: c.left >= map.left && c.right <= map.right && c.top >= map.top && c.bottom <= map.bottom,
      clash: others.some((el) => hit(c, box(el))),
      hint: /Ayarlar ⚙ → Harita takibi/.test(card.innerText),
    };
  });
  check(
    'Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini ve sayacı örtmez, haritanın %22’sinden azını kaplar',
    !!small && small.inside && !small.clash && small.share < 0.22 && small.hint,
    small ? `%${(small.share * 100).toFixed(1)}` : 'soru çıkmadı',
  );
  await shot(page, 'ai-9d-harita-takibi-telefon.png');
  await page.context().close();
});

/* ================================================================ finish */
section('I. Genel');
check('Hiçbir sayfada konsol ya da sayfa hatası yok', problems.length === 0, problems.slice(0, 3).join(' | '));

await browser.close();
server.stop();

/* ------------------------------------------------------------------ report */
const passed = results.filter((r) => r.ok).length;
const lines = [
  '# Sohbet arkadaşı: doğrulama raporu',
  '',
  `${passed}/${results.length} denetim geçti (\`npm run e2e:ai\`). Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek \`sample\` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.`,
  '',
];
for (const [i, s] of sections.entries()) {
  const slice = results.slice(s.from, sections[i + 1]?.from ?? results.length);
  lines.push(`## ${s.title}`, '');
  for (const r of slice) lines.push(`- ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  lines.push('');
}
lines.push(
  '## Ekran görüntüleri',
  '',
  '- `ai-0-yer-karti.png`, `ai-0-bos-sohbet.png`: yer kartı ve açılan sohbet',
  '- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`: anlatım; her adım yalnızca kendi çizimini gösterir, kamera adımı izler',
  '- `ai-1f-tek-anlatici.png`: sohbet açıkken haritada yalnızca anılan ve tıklanan olayların işaretçileri',
  '- `ai-2-ittifak-sorusu.png`: Osmanlı–Fransa ittifakı sorusu (iki devlet vurgulu ve bağlı, kamera ikisini de görünür kıldı)',
  '- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru',
  '- `ai-3a-olay-sohbetin-ustunde.png`, `ai-3b-bunu-sohbette-sor.png`: olay kartı sohbetin üstünde; “Bunu sohbette sor”',
  '- `ai-4-baglam-degisti.png`: seçili yer değişince sohbette “Bağlam değişti”',
  '- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`',
  '',
);
writeFileSync(join(OUT, 'AI-RAPOR.md'), lines.join('\n'));
console.log(`\n${passed}/${results.length} denetim geçti. Rapor: docs/verification/AI-RAPOR.md`);
process.exit(passed === results.length ? 0 : 1);
