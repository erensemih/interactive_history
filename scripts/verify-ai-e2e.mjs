#!/usr/bin/env node
/**
 * End-to-end verification of the reading companion (the AI) and of the map-first layout, in a real (headless) Chromium.
 *
 *   npm run e2e:ai            # builds if needed, serves the build, runs the scenarios
 *
 * No Claude is available here, so the model is the scripted stand-in (`MockProvider`): it runs the very same
 * tool calls and streams the very same kind of text as a real answer, only with fixed content. The page
 * decides to use it by itself, because `window.claude` does not exist in this browser, and says so over the map.
 * One group (G) injects a fake artifact runtime instead, to drive the real `sample` adapter in the browser
 * (the instruction file as the first turn, the seven tools, the plan before the long texts).
 *
 * The brief of the map-first round:
 *   L. Layout: the map is almost the whole screen, a thin timeline at the bottom, the question box just above it,
 *      a small info card on the right that closes easily and steps aside by itself when something is asked.
 *   A, V. Watch: a multi-step narration moves step by step with its short caption in one fixed place, stepped by
 *      buttons or the arrow keys, with optional autoplay at a chosen speed; the ruler is its progress bar; Watch
 *      starts as soon as the plan is in, before the long texts are written.
 *   W. Read: the full text, beside the map or full screen with a small map in the corner showing the current step;
 *      switching between the views keeps the step; a question asked while reading updates the map behind.
 *   B. A short answer has no steps: a short text with at most one map scene.
 *
 * And what already worked (kept): each step owns the map (A), "Harita takibi" (A2–A4), events (C, C2), the subject
 * changing mid-conversation (D), one narrator (J), no label covering another (K), stopping, failing and settings
 * (E), the real `sample` adapter (G) and the phone (H).
 *
 * Writes screenshots (ai-*.png) and a Turkish report (AI-RAPOR.md) to docs/verification/.
 *   E2E_ONLY=A3,K  runs only those groups (the code before the first "." of a heading) while working on them;
 *   E2E_URL      reuses a server that is already running.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const lastAssistant = () => window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
const finalStatus = (page, timeout = 40000) =>
  page
    .waitForFunction(
      () => {
        const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
        return a && ['done', 'failed', 'stopped'].includes(a.status) ? a.status : false;
      },
      null,
      { timeout },
    )
    .then((h) => h.jsonValue());
const assistants = (page) =>
  page.evaluate(() => window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').length);
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
/** The state of the presentation (the view, the mode, the autoplay) and of the step on screen. */
const pres = (page) =>
  page.evaluate(() => {
    const p = window.__ayni.ai.presentation;
    const d = window.__ayni.ai.director;
    return {
      shown: p.shown,
      view: p.view,
      read: p.readMode,
      playing: p.playing,
      speed: p.speed,
      index: p.index,
      steps: p.steps.length,
      stepped: p.stepped,
      step: d.active?.n ?? null,
      narrating: p.narrating,
    };
  });
const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? e.getBoundingClientRect().toJSON() : null;
  }, sel);

/** The conversation is quiet: no call is running (an answer that was already final does not count as quiet). */
const idle = (page) => page.waitForFunction(() => !window.__ayni.ai.session.busy, null, { timeout: 40000 });

/** Runs something that starts a new answer, and waits until that answer (not an earlier one) has ended. */
async function answered(page, action) {
  const before = await assistants(page);
  await action();
  await page.waitForFunction(
    (n) => window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').length > n,
    before,
    { timeout: 10000 },
  );
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

/** Goes to a step through its point in Watch's controls, and waits until the camera has come to rest. */
async function showStep(page, n) {
  await page.click(`[data-testid=watch-pip][data-n="${n}"]`);
  await cameraRests(page);
}

/** Points the reader at a step in the text ("Haritada göster") and waits until the camera has come to rest. */
async function readShowStep(page, n) {
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
    const r = range.getBoundingClientRect();
    push('name', el.textContent.replace(/\n/g, ' '), r);
    // a name the edge of the map cuts off cannot be moved by anyone: it is not counted
    items.at(-1).cut =
      r.left < map.left - 1 || r.right > map.right + 1 || r.top < map.top - 1 || r.bottom > map.bottom + 1;
  }
  for (const el of document.querySelectorAll('.ai-pt')) push('diamond', 'işaret', el.getBoundingClientRect());
  for (const el of document.querySelectorAll('.ai-glyph, .ai-link .glyph'))
    push('glyph', 'simge', el.getBoundingClientRect());
  for (const el of document.querySelectorAll('.pin:not([hidden]) .pin-dot'))
    push('pin', 'yer noktası', el.getBoundingClientRect());
  const controls = [
    ...document.querySelectorAll(
      '.map-zoom, .legend, .map-stats:not([hidden]), [data-avoid]:not(.foot-guard):not([hidden])',
    ),
  ]
    .map((el) => ({ name: el.className || el.id, ...rel(el.getBoundingClientRect()) }))
    .filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0);
  const clash = [];
  const cover = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.75 && h > 0.75 ? { w, h, text: `${w.toFixed(0)}×${h.toFixed(0)}` } : null;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const kinds = `${a.kind}+${b.kind}`;
      // a name may lie over a border line and a marker's year hangs on its dot: those are not pairs of labels
      if (a.kind === 'marker' && b.kind === 'marker') continue;
      if (a.kind === 'name' && b.kind === 'name') continue;
      if (a.cut || b.cut) continue;
      if (a.kind === 'glyph' || b.kind === 'glyph') {
        if (kinds !== 'flag+glyph' && kinds !== 'glyph+flag' && kinds !== 'glyph+marker' && kinds !== 'marker+glyph')
          continue;
      }
      const c = cover(a, b);
      // the symbol in the middle of a line touching the edge of a marker's year (under 120 px²) does not cover it
      if (c && kinds.includes('glyph') && kinds.includes('marker') && c.w * c.h < 120) continue;
      if (c) clash.push(`${a.kind}:${a.name} × ${b.kind}:${b.name} (${c.text})`);
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
  // what the step puts on the map must not end up under the cards, the caption, the question box or the reader
  const overs = [
    ...document.querySelectorAll(
      '.map-zoom, .legend, .map-stats:not([hidden]), [data-avoid]:not(.foot-guard):not([hidden])',
    ),
  ]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  const covered = pts.filter(([lon, lat]) => {
    const p = map.project([lon, lat]);
    const x = box.left + p.x;
    const y = box.top + p.y;
    return overs.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
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
    covered,
  };
};
const mapState = (page) => page.evaluate(MAP_STATE);

/** A drag on the map with the mouse, symmetric about the middle of the map so it never leaves it. */
async function dragMap(page, dx, dy) {
  const r = await page.evaluate(() => document.querySelector('#map').getBoundingClientRect().toJSON());
  // a little above the middle: the zoom buttons and the stack at the foot of the map stay out of the way of the release
  const p = { x: r.x + r.width / 2 - dx / 2, y: r.y + r.height * 0.38 - dy / 2 };
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

/* ================================================================ L. layout */
section(
  'L. Düzen: harita neredeyse tam ekran, ince zaman çizelgesi, soru kutusu hemen üstünde, küçük ve kolay kapanan bilgi kartı',
);
await guard(async () => {
  const page = await open('#t=1500-1550');
  const g = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      return e ? e.getBoundingClientRect().toJSON() : null;
    };
    return {
      vw: innerWidth,
      vh: innerHeight,
      map: r('#map'),
      dock: r('.dock'),
      top: r('.topbar'),
      ask: r('[data-testid=ask]'),
      card: r('.card-host'),
      head: r('.map-head'),
      title: document.querySelector('[data-testid=title-main]')?.textContent.trim(),
      scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
    };
  });
  const share = (g.map.width * g.map.height) / (g.vw * g.vh);
  check(
    'Harita neredeyse tüm ekranı kaplıyor: genişlikte tamamı, ekranın %85’inden fazlası; sayfa kaymıyor',
    Math.abs(g.map.width - g.vw) < 1 && share > 0.85 && !g.scrolls,
    `%${(share * 100).toFixed(0)} · ${Math.round(g.map.width)}×${Math.round(g.map.height)} / ${g.vw}×${g.vh}`,
  );
  check(
    'Üstte tek ince çubuk (ad, yer ve yıl, atıf) var; harita ile zaman çizelgesi arasında başka bir şerit yok',
    g.top.height <= 48 &&
      g.head.top >= g.top.top - 1 &&
      g.head.bottom <= g.top.bottom + 1 &&
      Math.abs(g.map.top - g.top.bottom) <= 1 &&
      Math.abs(g.map.bottom - g.dock.top) <= 1,
    `çubuk ${Math.round(g.top.height)} px · başlık: ${g.title}`,
  );
  check(
    'Zaman çizelgesi ince: en çok 84 px (ekranın %10’undan az), altta',
    g.dock.height <= 84 && g.dock.height / g.vh < 0.1 && Math.abs(g.dock.bottom - g.vh) <= 1,
    `${Math.round(g.dock.height)} px`,
  );
  check(
    'Soru kutusu zaman çizelgesinin hemen üstünde ve ortada',
    g.ask.bottom <= g.dock.top &&
      g.dock.top - g.ask.bottom <= 24 &&
      Math.abs((g.ask.left + g.ask.right) / 2 - g.vw / 2) < 4,
    `aralık ${Math.round(g.dock.top - g.ask.bottom)} px`,
  );
  check(
    'Bilgi kartı sağda, eskisinden (410 px) küçük, haritanın yarısından az yer tutar; ekranın üst yarısında',
    g.card &&
      g.card.right >= g.vw - 24 &&
      g.card.width <= 340 &&
      g.card.height < g.map.height * 0.6 &&
      g.card.top < g.vh / 2,
    g.card ? `${Math.round(g.card.width)}×${Math.round(g.card.height)} px` : 'kart yok',
  );
  await shot(page, 'ai-0-yeni-duzen.png');

  // closing the introduction: one click, and it stays closed
  await page.click('[data-testid=intro-close]');
  await settle(page, 300);
  check('Tanıtım kartı ✕ ile kapanır ve sağ taraf boşalır', !(await visible(page, '.card-host')));

  // a place: the card comes back with the place; it closes with its cross, and the place is let go
  const ref0 = await pixelOf(page, 10, 45);
  const cam0 = await camera(page);
  const anatolia = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 500);
  const ref1 = await pixelOf(page, 10, 45);
  const card = await rectOf(page, '.card-host');
  check(
    'Yer seçilince küçük kart sağda açılır (Osmanlı İmparatorluğu); harita yerinden oynamaz',
    (await text(page, '[data-testid=place-title]')) === 'Osmanlı İmparatorluğu' &&
      card.width <= 340 &&
      Math.abs(ref0.x - ref1.x) < 0.5 &&
      Math.abs(ref0.y - ref1.y) < 0.5 &&
      sameCamera(cam0, await camera(page)),
  );
  const fold = await page.evaluate(() => ({
    more: !!document.querySelector('[data-testid=place-more]'),
    moreOpen: document.querySelector('[data-testid=place-more]')?.open,
    elsewhere: document.querySelector('[data-testid=elsewhere]')?.open,
    sum: document.querySelector('[data-testid=place-card] .prose')?.getBoundingClientRect().height,
  }));
  check(
    'Kart kısa tutuluyor: ayrıntılar ve “aynı sırada, başka yerlerde” listesi kapalı bölümlerde',
    fold.more && fold.moreOpen === false && fold.elsewhere === false && fold.sum < 130,
    `özet ${Math.round(fold.sum)} px`,
  );
  await page.click('[data-testid=elsewhere] summary');
  await settle(page, 200);
  check(
    'Kapalı liste açılınca olaylar satır satır orada (tıklanabilir)',
    (await count(page, '[data-testid=elsewhere] .row')) >= 5,
  );
  await page.click('[data-testid=elsewhere] summary');
  await page.click('[data-testid=place-close]');
  await settle(page, 300);
  check(
    'Karttaki ✕ kartı kapatır ve yer seçimini kaldırır (başlık “Dünya”)',
    (await count(page, '.pin:not([hidden])')) === 0 &&
      !(await visible(page, '.card-host')) &&
      /Dünya/.test(await text(page, '[data-testid=title-main]')),
  );
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 400);
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check('Esc de kartı kapatır', !(await visible(page, '.card-host')));

  // asking: the card steps aside by itself and the place stays
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 400);
  await page.fill('[data-testid=chat-input]', 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=card-tab]', { timeout: 5000 });
  const tab = await rectOf(page, '[data-testid=card-tab]');
  check(
    'Soru sorulunca kart kendiliğinden çekilir: yalnızca küçük bir sekme kalır; yer seçili kalır',
    !(await visible(page, '[data-testid=place-card]')) &&
      tab.width < 280 &&
      tab.height < 44 &&
      (await page.evaluate(() => window.__ayni.store.state.places.length)) === 1 &&
      (await count(page, '.pin:not([hidden])')) === 1,
    `${Math.round(tab.width)}×${Math.round(tab.height)} px`,
  );
  await finalStatus(page);
  await idle(page);
  const req = await lastRequest(page);
  check('Soru yine de o yerle ilgili: bağlamda yer var', /Seçili yer: Osmanlı İmparatorluğu/.test(req.last));
  await page.click('[data-testid=card-tab]');
  await settle(page, 400);
  check('Sekmeye tıklamak kartı geri getirir', await visible(page, '[data-testid=place-card]'));
  await page.click('[data-testid=watch-close]');
  await page.fill('[data-testid=chat-input]', 'Peki Venedik?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=card-tab]', { timeout: 5000 });
  await finalStatus(page);
  await page.click('[data-testid=watch-close]');
  await settle(page, 400);
  check(
    'Yanıt kapatılınca kart kendiliğinden geri gelir',
    (await visible(page, '[data-testid=place-card]')) && !(await visible(page, '[data-testid=card-tab]')),
  );
  await page.context().close();
});

/* ============================================================ A. Watch */
section('A. İzle: çok adımlı anlatım adım adım ilerler; her adım yalnızca kendi çizimini gösterir; kamera adımı izler');
await guard(async () => {
  const page = await open('#t=1500-1550');
  const anatolia = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 500);
  check(
    'Anadolu’daki nokta seçildi: Osmanlı İmparatorluğu; kartta “Bu yerin tarihini anlat” ve “Soru sor” var',
    (await text(page, '[data-testid=place-title]')) === 'Osmanlı İmparatorluğu' &&
      (await visible(page, '[data-testid=place-narrate]')) &&
      (await visible(page, '[data-testid=place-ask]')),
  );
  await shot(page, 'ai-0-yer-karti.png');
  const markersBefore = await markerIds(page);
  const camBefore = await camera(page);

  await page.click('[data-testid=place-narrate]');
  await page.waitForSelector('[data-testid=chat-thinking]', { timeout: 5000 });
  check(
    'Yanıt gelmeden önce haritanın üstünde “Düşünüyor…” ve Durdur var; soru kutusunda da Durdur düğmesi',
    (await visible(page, '[data-testid=chat-thinking]')) && (await visible(page, '[data-testid=chat-stop]')),
  );
  check(
    'Çağrı yapıldı: kart kenara çekildi (sekme), yer seçili kaldı',
    (await visible(page, '[data-testid=card-tab]')) && !(await visible(page, '[data-testid=place-card]')),
  );
  // Watch starts as soon as the plan (the tool round: captions and scenes) is in, before the long texts are written
  await page.waitForSelector('[data-testid=watch-caption]', { timeout: 20000 });
  const early = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      status: a.status,
      chars: a.text.length,
      writing: !!document.querySelector('[data-testid=watch-writing]'),
      count: document.querySelector('[data-testid=watch-count]').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  check(
    'İzle, uzun metinler bitmeden başladı: ilk adımın altyazısı var, metin hâlâ yazılıyor (“Metin yazılıyor…”)',
    early.status !== 'done' && early.writing && early.count === '1 / 6',
    `${early.status} · ${early.chars} karakter · ${early.count}`,
  );
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);

  check(
    'Metin bitince “Metin yazılıyor…” kalkar; adım sayısı 6; altyazılar ve başlıklar dolu',
    !(await visible(page, '[data-testid=watch-writing]')) &&
      (await count(page, '[data-testid=watch-pip]')) === 6 &&
      (await text(page, '[data-testid=watch-title]')).length > 3 &&
      (await text(page, '[data-testid=watch-caption]')).length > 40,
  );
  const cap1 = await text(page, '[data-testid=watch-caption]');
  const plan = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return a.plan.numbers().map((n) => ({ n, caption: a.plan.captionOf(n), title: a.plan.titleOf(n) }));
  });
  check(
    'Altyazı modelin step çağrısındaki altyazıdır, bir iki cümle (en çok ~200 karakter) ve metinden kısa',
    cap1 === plan[0].caption && cap1.length <= 220 && cap1.length > 40,
    `${cap1.length} karakter`,
  );
  const st0 = await page.evaluate(() => window.__ayni.store.state);
  check(
    'Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner)',
    st0.cursor === 0.5 && (await headYear(page)) === '1505',
    `başlıkta ${await headYear(page)}, imleç ${st0.cursor}`,
  );
  const markersChat = await markerIds(page);
  check(
    'Anlatım sürerken olay işaretçileri haritadan çekildi (çizelgede duruyorlar); yalnızca anlatılan olay haritada',
    markersBefore.length >= 5 && markersChat.join() === 'safevi-1501' && (await count(page, '.dock [data-id]')) >= 10,
    `${markersBefore.length} → ${markersChat.length} işaretçi`,
  );
  check(
    'Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)',
    /Deneme kipi/.test(await text(page, '[data-testid=ask-mock-note]')),
  );

  // --- every step shows only what it asks for, its caption is in the same place, and the camera brings it into view
  const states = {};
  const drawings = {};
  const cameras = [];
  const boxes = [];
  for (const exp of OTTOMAN) {
    if (exp.n !== 1) await showStep(page, exp.n);
    const state = await mapState(page);
    states[exp.n] = state;
    drawings[exp.n] = await drawing(page);
    cameras.push(state.camera);
    boxes.push(await rectOf(page, '[data-testid=watch]'));
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
    const cap = await text(page, '[data-testid=watch-caption]');
    check(
      `${exp.n}. adım: altyazı ve sayaç bu adımın (“${exp.n} / 6”, “${plan[exp.n - 1].title}”)`,
      cap === plan[exp.n - 1].caption &&
        (await text(page, '[data-testid=watch-count]')).replace(/\s+/g, ' ').trim() === `${exp.n} / 6` &&
        (await text(page, '[data-testid=watch-title]')) === plan[exp.n - 1].title,
    );
    check(
      `${exp.n}. adım: kamera çizimi görünür kıldı (${state.targets} nokta, görünüm dışında ${state.outside}) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (${state.covered})`,
      state.targets > 0 && state.outside === 0 && state.covered === 0,
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
    if (exp.n === 6) await shot(page, 'ai-1c-anlatim-adim6.png');
  }
  const fixed = boxes.every(
    (b) =>
      Math.abs(b.bottom - boxes[0].bottom) < 1.5 &&
      Math.abs(b.left - boxes[0].left) < 1 &&
      Math.abs(b.width - boxes[0].width) < 1,
  );
  check(
    'Altyazı sabit bir yerde: kutunun alt kenarı ve yatay konumu her adımda aynı (altyazı gibi)',
    fixed,
    boxes.map((b) => Math.round(b.bottom)).join(' '),
  );
  const camStart = camCompare(camBefore, cameras[0]);
  check(
    'Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı)',
    cameras[0].zoom > camBefore.zoom + 1 && camStart.moved,
    `${camBefore.zoom.toFixed(2)} → ${cameras[0].zoom.toFixed(2)}`,
  );
  const changes = cameras.slice(1).filter((c, i) => camCompare(cameras[i], c).moved).length;
  check(
    'Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı',
    changes >= 3,
    `${changes}/5 geçişte oynadı`,
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
  await showStep(page, 3);
  check(
    'Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor',
    ownYear === '1520' && (await headYear(page)) === '1517',
    `${ownYear} → ${await headYear(page)}`,
  );

  // --- closing the answer gives the map, the markers and the card back
  await page.click('[data-testid=watch-close]');
  await settle(page, 700);
  const markersClosed = await markerIds(page);
  check(
    'Anlatımı kapatmak (✕) yapay zekâ çizimini haritadan kaldırır; olay işaretçileri geri gelir; kart geri gelir',
    (await aiDom(page)).hidden &&
      (await aiIds(page)).length === 0 &&
      markersClosed.length >= 4 &&
      (await visible(page, '[data-testid=place-card]')) &&
      !(await visible(page, '[data-testid=watch]')),
    `${markersBefore.length} → ${markersChat.length} → ${markersClosed.length}`,
  );
  check(
    'Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)',
    (await headYear(page)) === '1520',
  );
  check(
    'Yazışma silinmedi: soru kutusundaki metin düğmesi duruyor, yanıt hâlâ okunabilir',
    await visible(page, '[data-testid=read-toggle]'),
  );
  await page.context().close();
});
/* ================================================= V. İzle'de gezinme */
const SPEED_FACTOR = { slow: 0.65, normal: 1, fast: 1.8 };
/** The wait the page keeps on a step when the narration plays by itself (the same rule as the page's). */
const dwell = (caption, speed) => {
  const words = caption.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(16_000, Math.max(4_500, 2_200 + words * 360)) / SPEED_FACTOR[speed]);
};
const countText = async (page) => (await text(page, '[data-testid=watch-count]')).replace(/\s+/g, ' ').trim();
const stepNow = async (page) => (await pres(page)).step;
const idsNow = async (page) => (await mapState(page)).ids.join();

/** The layout of the stage as it is now: which view, where the reader is, where the map is. */
const layout = (page) =>
  page.evaluate(() => {
    const rect = (s) => {
      const e = document.querySelector(s);
      if (!e || e.hidden) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? r.toJSON() : null;
    };
    const stage = document.querySelector('#stage');
    return {
      vw: innerWidth,
      vh: innerHeight,
      view: stage.dataset.view,
      read: stage.dataset.read,
      map: rect('#map'),
      wrap: rect('.map-wrap'),
      stage: rect('#stage'),
      readPanel: rect('#read'),
      scroll: rect('[data-testid=chat-scroll]'),
      ask: rect('[data-testid=ask]'),
      watch: rect('[data-testid=watch]'),
      card: rect('.card-host'),
      expand: rect('[data-testid=mini-expand]'),
    };
  });

/** Where a step of the text is, relative to the scroll area of the reader. */
const stepInText = (page, n) =>
  page.evaluate((k) => {
    const sc = document.querySelector('[data-testid=chat-scroll]');
    const el = sc?.querySelector(`[data-testid=chat-step][data-n="${k}"]`);
    if (!sc || !el) return null;
    const s = sc.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      top: r.top - s.top,
      bottom: r.bottom - s.top,
      height: s.height,
      active: el.dataset.active === 'true',
      live: !!el.querySelector('[data-testid=chat-step-live]'),
    };
  }, n);

section('V. İzle’de gezinme: düğmeler, ok tuşları, isteğe bağlı otomatik oynatma ve hız; çizelgede ilerleme çubuğu');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 1800);
  const p0 = await pres(page);
  check(
    'Otomatik oynatma isteğe bağlı: kendiliğinden başlamaz (yanıt bittikten sonra da 1. adımda, oynatma kapalı)',
    p0.stepped && p0.steps === 6 && p0.step === 1 && !p0.playing && p0.view === 'watch',
    `adım ${p0.step}/${p0.steps} · oynatma ${p0.playing}`,
  );
  const off = (id) => page.locator(`[data-testid=${id}]`).isDisabled();
  check('1. adımda “Önceki” kapalı, “Sonraki” açık', (await off('watch-prev')) && !(await off('watch-next')));
  await page.click('[data-testid=watch-next]');
  await cameraRests(page);
  check(
    '“Sonraki” 2. adıma geçirir: sayaç “2 / 6”, harita 2. adımın çizimi (Osmanlı + Safevî, savaş); “Önceki” açıldı',
    (await stepNow(page)) === 2 &&
      (await countText(page)) === '2 / 6' &&
      (await idsNow(page)) === OTTOMAN[1].ids &&
      !(await off('watch-prev')),
  );
  await page.click('[data-testid=watch-prev]');
  await cameraRests(page);
  check(
    '“Önceki” 1. adıma döndürür ve kendini yeniden kapatır',
    (await stepNow(page)) === 1 && (await countText(page)) === '1 / 6' && (await off('watch-prev')),
  );

  // --- the arrow keys
  await page.evaluate(() => document.activeElement?.blur?.());
  const key = async (k) => {
    await page.keyboard.press(k);
    await cameraRests(page);
  };
  await key('ArrowRight');
  const k1 = await stepNow(page);
  await key('ArrowRight');
  const k2 = await stepNow(page);
  await key('ArrowLeft');
  const k3 = await stepNow(page);
  check(
    'Ok tuşları: → sonraki, ← önceki adım (1 → 2 → 3 → 2)',
    k1 === 2 && k2 === 3 && k3 === 2,
    `${k1}, ${k2}, ${k3}`,
  );
  await key('End');
  const kEnd = { step: await stepNow(page), ids: await idsNow(page), next: await off('watch-next') };
  await key('Home');
  const kHome = { step: await stepNow(page), ids: await idsNow(page) };
  check(
    'End son adıma, Home ilk adıma götürür; harita her seferinde o adımın çizimini gösterir; son adımda “Sonraki” kapalı',
    kEnd.step === 6 && kEnd.ids === OTTOMAN[5].ids && kEnd.next && kHome.step === 1 && kHome.ids === OTTOMAN[0].ids,
    `${kEnd.ids} | ${kHome.ids}`,
  );
  await page.focus('[data-testid=chat-input]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('End');
  await settle(page, 400);
  check('Soru kutusundayken ok tuşları yazı imlecinindir: anlatım yerinde kalır', (await stepNow(page)) === 1);
  await page.evaluate(() => document.activeElement?.blur?.());
  await key('End');
  const camEnd = await camera(page);
  const focusedCanvas = await page.evaluate(() => {
    const c = document.querySelector('#map canvas');
    c?.focus();
    return !!c && document.activeElement === c;
  });
  await page.keyboard.press('ArrowRight');
  await settle(page, 800);
  check(
    'Harita odaktayken de oklar anlatımındır: haritayı kaydırmaz (son adımda → hiçbir şey yapmaz, kamera yerinde)',
    focusedCanvas && sameCamera(camEnd, await camera(page)) && (await stepNow(page)) === 6,
    `harita odakta: ${focusedCanvas}`,
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await key('Home');

  // --- the ruler as the progress bar: the steps are points at their dates
  await showStep(page, 3);
  const bar = await page.evaluate(() => {
    const track = document.querySelector('.ruler-track').getBoundingClientRect();
    const ext = window.__ayni.data.extent;
    const span = ext.to - ext.from + 1;
    const years = window.__ayni.ai.presentation.steps.map((s) => s.year);
    const pts = [...document.querySelectorAll('[data-testid=ruler-step]')].map((e) => {
      const r = e.getBoundingClientRect();
      const n = Number(e.dataset.n);
      return {
        n,
        label: e.textContent.trim(),
        on: e.classList.contains('is-on'),
        past: e.classList.contains('is-past'),
        cx: (r.left + r.right) / 2,
        top: r.top,
        bottom: r.bottom,
        want: track.left + ((years[n - 1] + 0.5 - ext.from) / span) * track.width,
        year: /· (\d{4})$/.exec(e.title)?.[1],
      };
    });
    const run = document.querySelector('.ruler-run')?.getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    return { pts, run: run ? { left: run.left, right: run.right } : null, dock: dock.toJSON(), track: track.toJSON() };
  });
  const gaps = bar.pts.slice(1).map((p, i) => p.cx - bar.pts[i].cx);
  check(
    'Çizelge ilerleme çubuğu: 6 adımın 6 noktası, 1’den 6’ya soldan sağa, tarihleriyle (1505, 1514, 1517, 1526, 1536, 1538)',
    bar.pts.length === 6 &&
      bar.pts.every((p, i) => p.label === String(i + 1) && p.year === OTTOMAN[i].year) &&
      gaps.every((g) => g > 0),
    bar.pts.map((p) => `${p.n}:${p.year}`).join(' '),
  );
  check(
    'Her nokta kendi yılının hizasında (yan yana düşenler en çok 26 px kaydırılmış) ve birbirine değmiyor (en az 14 px)',
    bar.pts.every((p) => p.cx - p.want > -2 && p.cx - p.want < 28) && gaps.every((g) => g >= 14),
    `en dar aralık ${Math.min(...gaps).toFixed(0)} px · kayma ${bar.pts.map((p) => (p.cx - p.want).toFixed(0)).join(', ')}`,
  );
  check(
    'Noktalar zaman çizelgesi bandının içinde ve band ince kalıyor (en çok 84 px)',
    bar.pts.every((p) => p.top >= bar.dock.top - 1 && p.bottom <= bar.dock.bottom + 1) && bar.dock.height <= 84,
    `${Math.round(bar.dock.height)} px`,
  );
  check(
    'İlerleme: 3. adımdayken 1–2 dolu (görüldü), 3 işaretli, 4–6 boş; çizgi birinci noktadan üçüncüye uzanıyor',
    bar.pts.map((p) => (p.on ? 'on' : p.past ? 'past' : '-')).join() === 'past,past,on,-,-,-' &&
      bar.run &&
      Math.abs(bar.run.left - bar.pts[0].cx) < 3 &&
      Math.abs(bar.run.right - bar.pts[2].cx) < 3,
    bar.pts.map((p) => (p.on ? 'on' : p.past ? 'past' : '-')).join(' '),
  );
  await shot(page, 'ai-v1-ilerleme-cubugu.png');
  const mine = await page.evaluate(() => ({
    range: window.__ayni.store.state.range,
    cursor: window.__ayni.store.state.cursor,
  }));
  await page.click('[data-testid=ruler-step][data-n="5"]');
  await cameraRests(page);
  const mine2 = await page.evaluate(() => ({
    range: window.__ayni.store.state.range,
    cursor: window.__ayni.store.state.cursor,
  }));
  check(
    'Çizelgedeki 5 numaralı noktaya tıklamak 5. adıma götürür (altyazı “5 / 6”, harita 5. adımın çizimi, başlıkta 1536)',
    (await stepNow(page)) === 5 &&
      (await countText(page)) === '5 / 6' &&
      (await idsNow(page)) === OTTOMAN[4].ids &&
      (await headYear(page)) === '1536',
  );
  check(
    'Bu tıklama okurun kendi aralığına ve imlecine dokunmaz (ilerleme çubuğu zaman seçimi değildir)',
    JSON.stringify(mine) === JSON.stringify(mine2),
    JSON.stringify(mine2),
  );

  // --- autoplay: optional, with a speed the reader chooses
  await showStep(page, 1);
  const speedUi = await page.evaluate(() => ({
    options: [...document.querySelectorAll('[data-testid=watch-speed] option')].map(
      (o) => `${o.value}:${o.textContent}`,
    ),
    value: document.querySelector('[data-testid=watch-speed]').value,
    pressed: document.querySelector('[data-testid=watch-play]').getAttribute('aria-pressed'),
    label: document.querySelector('[data-testid=watch-play]').innerText.trim(),
  }));
  check(
    'Oynat düğmesi basılı değil; hız seçici üç seçenek sunuyor (Yavaş, Normal, Hızlı), Normal seçili',
    speedUi.options.join() === 'slow:Yavaş,normal:Normal,fast:Hızlı' &&
      speedUi.value === 'normal' &&
      speedUi.pressed === 'false' &&
      /Oynat/.test(speedUi.label),
    speedUi.options.join(' '),
  );
  await page.selectOption('[data-testid=watch-speed]', 'fast');
  const afterSpeed = await pres(page);
  check(
    'Hızı değiştirmek tek başına oynatmaz',
    afterSpeed.speed === 'fast' && !afterSpeed.playing && afterSpeed.step === 1,
  );
  const cap1 = await text(page, '[data-testid=watch-caption]');
  const wantFast = dwell(cap1, 'fast');
  const t0 = Date.now();
  await page.click('[data-testid=watch-play]');
  await settle(page, 200);
  const pl = await page.evaluate(() => ({
    pressed: document.querySelector('[data-testid=watch-play]').getAttribute('aria-pressed'),
    label: document.querySelector('[data-testid=watch-play]').innerText.trim(),
    playing: window.__ayni.ai.presentation.playing,
  }));
  check(
    'Oynat’a basınca düğme “Duraklat” olur, basılı görünür ve anlatım oynar',
    pl.playing && pl.pressed === 'true' && /Duraklat/.test(pl.label),
  );
  await page.waitForFunction(() => window.__ayni.ai.presentation.index === 1, null, { timeout: wantFast + 6000 });
  const took = Date.now() - t0;
  check(
    `Hızlıda adım, altyazısının okunma süresi kadar (~${(wantFast / 1000).toFixed(1)} sn) kalıp kendiliğinden 2. adıma geçer`,
    took >= wantFast * 0.85 && took <= wantFast + 3000,
    `${took} ms`,
  );
  await cameraRests(page);
  check(
    'Oynarken 2. adımın çizimi haritada; oynatma sürüyor',
    (await idsNow(page)) === OTTOMAN[1].ids && (await pres(page)).playing,
  );
  // a slower speed measures the wait again: the time the fast speed would have taken passes and the step stays
  const cap2 = await text(page, '[data-testid=watch-caption]');
  await page.selectOption('[data-testid=watch-speed]', 'slow');
  await settle(page, dwell(cap2, 'fast') + 1500);
  const slow = await pres(page);
  check(
    'Hız “Yavaş” yapılınca bekleme yeniden ölçülür: hızlıda geçecek süre dolduğu hâlde adım hâlâ 2 ve oynatma sürüyor',
    slow.step === 2 && slow.playing && slow.speed === 'slow',
    `${slow.step}. adım`,
  );
  // pausing, and stepping by hand, both stop it
  await page.click('[data-testid=watch-play]');
  check('Duraklat oynatmayı durdurur', !(await pres(page)).playing);
  await page.selectOption('[data-testid=watch-speed]', 'fast');
  await page.click('[data-testid=watch-play]');
  await settle(page, 300);
  await page.click('[data-testid=watch-next]');
  await cameraRests(page);
  const manual = await pres(page);
  check(
    'Elle adım değiştirmek (Sonraki) oynatmayı durdurur: okur kontrolü alır',
    manual.step === 3 && !manual.playing,
    `${manual.step}. adım · oynatma ${manual.playing}`,
  );
  await settle(page, dwell(await text(page, '[data-testid=watch-caption]'), 'fast') + 800);
  check('Durdurulmuş anlatım, süre dolsa da yerinde kalır', (await stepNow(page)) === 3);
  // the end: it plays the last step's caption and stops there
  await showStep(page, 5);
  await page.click('[data-testid=watch-play]');
  await page.waitForFunction(() => window.__ayni.ai.presentation.index === 5, null, {
    timeout: dwell(await text(page, '[data-testid=watch-caption]'), 'fast') + 6000,
  });
  // the last step is given the time its caption takes, and then the narration stops there
  const lastCaption = await text(page, '[data-testid=watch-caption]');
  const reachedLast = await pres(page);
  await page.waitForFunction(() => !window.__ayni.ai.presentation.playing, null, {
    timeout: dwell(lastCaption, 'fast') + 5000,
  });
  await settle(page, 700);
  const end = await pres(page);
  check(
    'Oynatma son adımda biter: son adımın altyazısına da süre tanır, sonra 6. adımda durur (başa dönmez); düğme yeniden “Oynat”',
    reachedLast.step === 6 &&
      reachedLast.playing &&
      end.step === 6 &&
      !end.playing &&
      /Oynat/.test(await text(page, '[data-testid=watch-play]')),
    `${end.step}. adım · oynatma ${end.playing}`,
  );
  await page.click('[data-testid=watch-play]');
  await settle(page, 400);
  const again = await pres(page);
  check('Sonda yeniden Oynat’a basmak anlatımı baştan oynatır', again.step === 1 && again.playing);
  await page.click('[data-testid=watch-play]');

  // --- closing the answer takes the progress bar away
  await page.click('[data-testid=watch-close]');
  await settle(page, 500);
  check(
    'Anlatımı kapatmak çizelgedeki adım noktalarını kaldırır',
    (await count(page, '[data-testid=ruler-steps]')) === 0 && (await count(page, '[data-testid=ruler-step]')) === 0,
  );
  await page.context().close();
});

/* =================================================================== W. Oku */
section(
  'W. Oku: yan panel ve tam ekran (köşede küçük harita); Oku ↔ İzle geçişinde adım korunur; okurken sorulan soru haritayı arka planda günceller',
);
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);
  await showStep(page, 3);
  const w3 = await mapState(page);
  const L0 = await layout(page);
  check(
    'İzle’de harita tüm sahne; metin kapalı (Oku paneli yok), altyazı haritanın üstünde; soru kutusunda metin düğmesi basılı değil',
    L0.view === 'watch' &&
      L0.read === '' &&
      !L0.readPanel &&
      !!L0.watch &&
      Math.abs(L0.map.width - L0.vw) < 1 &&
      (await page.getAttribute('[data-testid=read-toggle]', 'aria-pressed')) === 'false',
  );
  await shot(page, 'ai-w1-izle-adim3.png');

  // --- Watch -> Read (beside the map) at step 3
  await page.click('[data-testid=watch-play]');
  check('(Hazırlık) 3. adımda otomatik oynatma açıldı', (await pres(page)).playing);
  await page.click('[data-testid=watch-read]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  await settle(page, 300);
  const side = await pres(page);
  const L1 = await layout(page);
  check(
    '“Metni oku”: metin yan panel olarak açıldı; harita hâlâ tüm sahne (panel haritanın üstünde, altyazı kalktı)',
    side.view === 'read' &&
      side.read === 'side' &&
      L1.read === 'side' &&
      !!L1.readPanel &&
      Math.abs(L1.readPanel.right - L1.vw) <= 1 &&
      L1.readPanel.width >= 320 &&
      L1.readPanel.width <= 560 &&
      Math.abs(L1.map.width - L1.vw) < 1 &&
      !L1.watch,
    `panel ${Math.round(L1.readPanel?.width ?? 0)}×${Math.round(L1.readPanel?.height ?? 0)} px`,
  );
  check('Görünüm değişince otomatik oynatma durur (okurun iki elinden biri metinde)', !side.playing && side.step === 3);
  const t3 = await stepInText(page, 3);
  check(
    'Adım korundu: metinde 3. adım etkin, “Haritada gösteriliyor” orada ve okuma konumunda (görünür)',
    side.step === 3 &&
      t3 &&
      t3.active &&
      t3.live &&
      t3.top >= -2 &&
      t3.top < t3.height * 0.6 &&
      (await count(page, '[data-testid=chat-step][data-active="true"]')) === 1,
    t3 ? `üstten ${Math.round(t3.top)} px / ${Math.round(t3.height)}` : 'adım yok',
  );
  const sideMap = await mapState(page);
  check(
    'Arkadaki harita 3. adımın çiziminde kaldı (Osmanlı + Memlûk, savaş, 1517) ve panelin altında kalan bir şey yok',
    sideMap.ids.join() === OTTOMAN[2].ids &&
      sideMap.year === '1517' &&
      sideMap.diamonds === 1 &&
      sideMap.outside === 0 &&
      sideMap.covered === 0,
    `görünüm dışı ${sideMap.outside}, örtülü ${sideMap.covered}`,
  );
  check(
    'Soru kutusu panelin soluna çekildi (örtüşmüyor); başlıkta yer ve aralık yazıyor',
    L1.ask.right <= L1.readPanel.left + 1 &&
      /Osmanlı İmparatorluğu · 1500–1550/.test(await text(page, '[data-testid=read-subject]')),
  );
  const lapSide = await overlapReport(page);
  check(
    'Yan panel açıkken etiketler birbirini ve işaretçileri örtmüyor',
    lapSide.clash.length === 0 && lapSide.out.length === 0 && lapSide.underControl.length === 0,
    [...lapSide.clash, ...lapSide.out, ...lapSide.underControl].join(' | '),
  );
  await shot(page, 'ai-w2-oku-yan-panel.png');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('ArrowRight');
  await settle(page, 400);
  check('Oku’dayken oklar metni kaydırır, anlatımı ilerletmez (adım 3’te kaldı)', (await stepNow(page)) === 3);

  // --- ... and back to Watch: the step is kept
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  await cameraRests(page, 8000);
  const back = await pres(page);
  check(
    'Oku → İzle: 3. adım korundu (altyazı “3 / 6”), metin kapandı, harita 3. adımda',
    back.view === 'watch' &&
      back.step === 3 &&
      (await countText(page)) === '3 / 6' &&
      !(await visible(page, '[data-testid=chat]')) &&
      (await idsNow(page)) === OTTOMAN[2].ids,
    `${back.view} · ${back.step}`,
  );

  // --- reading moves the map: the step under the reading line is the step on the map
  await page.click('[data-testid=watch-read]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  const sc = await rectOf(page, '[data-testid=chat-scroll]');
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  let reached = 3;
  for (let i = 0; i < 16 && reached < 5; i++) {
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(220);
    reached = await stepNow(page);
  }
  await cameraRests(page, 8000);
  await settle(page, 300);
  const read5 = await mapState(page);
  check(
    'Metni kaydırdıkça okuma çizgisindeki adım haritaya gelir (yukarı kaydırmadan 5. adıma ulaşıldı); etkin adım tek',
    reached >= 5 &&
      read5.ids.join() === OTTOMAN[reached - 1].ids &&
      (await count(page, '[data-testid=chat-step][data-active="true"]')) === 1 &&
      read5.outside === 0,
    `${reached}. adım · ${read5.ids.join('+')}`,
  );
  const keptStep = await stepNow(page);
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  await cameraRests(page, 8000);
  check(
    'Okurken ulaşılan adım İzle’ye taşınır (altyazı o adımın)',
    (await stepNow(page)) === keptStep && (await countText(page)) === `${keptStep} / 6`,
    `${keptStep}. adım`,
  );
  await showStep(page, 3);

  // --- the text button in the question box opens and closes the reader as well
  await page.click('[data-testid=read-toggle]');
  await settle(page, 500);
  const viaToggle = await pres(page);
  check(
    'Soru kutusundaki metin düğmesi okuyucuyu açar (basılı), bir daha basınca kapatır ve İzle’ye döner; adım korunur',
    viaToggle.view === 'read' &&
      viaToggle.step === 3 &&
      (await page.getAttribute('[data-testid=read-toggle]', 'aria-pressed')) === 'true',
  );
  await page.click('[data-testid=read-toggle]');
  await settle(page, 400);
  check('…kapatınca İzle’ye döner, 3. adım', (await pres(page)).view === 'watch' && (await stepNow(page)) === 3);

  // --- full screen: a small map in the corner showing the current step
  await page.click('[data-testid=watch-read]');
  await settle(page, 600);
  await page.click('[data-testid=read-size]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  await settle(page, 400);
  const full = await pres(page);
  const L2 = await layout(page);
  const mini = await mapState(page);
  check(
    'Tam ekran: metin sahneyi kapladı; harita köşede küçük bir pencere (sağ üst), tarayıcı penceresinin içinde',
    full.view === 'read' &&
      full.read === 'full' &&
      L2.read === 'full' &&
      L2.readPanel.width > L2.vw - 4 &&
      L2.map.width <= 360 &&
      L2.map.height <= 260 &&
      L2.map.width >= 200 &&
      L2.map.left > L2.vw * 0.6 &&
      L2.map.top < L2.vh * 0.4 &&
      L2.map.right <= L2.vw &&
      !L2.watch &&
      !L2.card,
    `pencere ${Math.round(L2.map.width)}×${Math.round(L2.map.height)} px, sağ üstte (${Math.round(L2.map.left)}, ${Math.round(L2.map.top)})`,
  );
  check(
    'Küçük harita o anki adımı gösteriyor: 3. adımın çizimi, tamamı pencerenin içinde ve hiçbir şeyin altında değil',
    full.step === 3 &&
      mini.ids.join() === OTTOMAN[2].ids &&
      mini.year === '1517' &&
      mini.targets > 0 &&
      mini.outside === 0 &&
      mini.covered === 0,
    `${mini.targets} nokta · görünüm dışı ${mini.outside} · örtülü ${mini.covered}`,
  );
  const t3full = await stepInText(page, 3);
  check(
    'Tam ekranda da adım korundu: metinde 3. adım etkin ve görünür; “Haritada gösteriliyor” orada',
    t3full && t3full.active && t3full.live && t3full.top >= -2 && t3full.top < t3full.height * 0.7,
  );
  const col = await page.evaluate(() => {
    const kids = [...document.querySelectorAll('[data-testid=chat-scroll] > *')].map(
      (e) => e.getBoundingClientRect().width,
    );
    const mapBox = document.querySelector('.map-wrap').getBoundingClientRect();
    const body = document.querySelector('.stage[data-read=full] .chat-body');
    const bodyBox = body?.getBoundingClientRect();
    const padR = body ? parseFloat(getComputedStyle(body).paddingRight) : 0;
    return { widest: Math.max(...kids), mapLeft: mapBox.left, textRight: bodyBox ? bodyBox.right - padR : 0 };
  });
  check(
    'Metin rahat bir sütun (en çok 720 px) ve küçük haritayla yan yana: ikisi birbirini örtmüyor',
    col.widest <= 721 && col.textRight <= col.mapLeft,
    `sütun ${Math.round(col.widest)} px`,
  );
  check(
    'Pencerede “Haritayı büyüt” düğmesi var',
    !!L2.expand && L2.expand.left >= L2.map.left && L2.expand.right <= L2.map.right + 1,
  );
  const lapMini = await overlapReport(page);
  check(
    'Küçük haritada çizimin ad etiketleri yok (pencereyi kalabalıklaştırmaz; metin yanında), çizim ve işaretçiler yerinde',
    lapMini.flags === 0 &&
      lapMini.clash.length === 0 &&
      mini.diamonds === 1 &&
      mini.links.join() === 'war' &&
      mini.markers.join() === 'ridaniye-1517',
    `${lapMini.flags} etiket · ${mini.links.join()} · ${mini.markers.join()}`,
  );
  await shot(page, 'ai-w3-oku-tam-ekran.png');

  // --- in full screen, another step on the text is another scene in the window
  await readShowStep(page, 5);
  const mini5 = await mapState(page);
  check(
    'Metindeki 5. adımda “Haritada göster”: küçük harita 5. adımın çizimine geçer (Osmanlı + Fransa, ittifak, 1536) ve onu tam gösterir',
    (await stepNow(page)) === 5 &&
      mini5.ids.join() === OTTOMAN[4].ids &&
      mini5.links.join() === 'alliance' &&
      mini5.year === '1536' &&
      mini5.outside === 0 &&
      mini5.covered === 0,
    `${mini5.ids.join('+')} · görünüm dışı ${mini5.outside}`,
  );
  // scrolling the text up moves the window's step too
  const sc2 = await rectOf(page, '[data-testid=chat-scroll]');
  await page.mouse.move(sc2.x + sc2.width / 3, sc2.y + sc2.height / 2);
  let up = 5;
  for (let i = 0; i < 16 && up > 3; i++) {
    await page.mouse.wheel(0, -340);
    await page.waitForTimeout(220);
    up = await stepNow(page);
  }
  await cameraRests(page, 8000);
  const miniUp = await mapState(page);
  check(
    'Tam ekranda metni yukarı kaydırmak küçük haritadaki adımı da geri götürür',
    up <= 3 && miniUp.ids.join() === OTTOMAN[up - 1].ids && miniUp.outside === 0,
    `${up}. adım`,
  );

  // --- the ways out of full screen
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const esc1 = await layout(page);
  const escStep = await stepNow(page);
  check(
    'Esc önce tam ekranı yan panele küçültür (harita yeniden tüm sahne), adım korunur',
    esc1.read === 'side' && Math.abs(esc1.map.width - esc1.vw) < 1 && escStep === up,
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const esc2 = await pres(page);
  check('Bir daha Esc metni kapatıp İzle’ye döner; adım hâlâ aynı', esc2.view === 'watch' && esc2.step === escStep);
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  await page.click('[data-testid=read-size]');
  await settle(page, 700);
  await page.click('[data-testid=mini-expand]');
  await settle(page, 600);
  await cameraRests(page, 8000);
  const L3 = await layout(page);
  const tagsBack = await overlapReport(page);
  const expandState = await pres(page);
  const lapBig = await overlapReport(page);
  const bigMap = await mapState(page);
  check(
    '“Haritayı büyüt”: harita yeniden tüm sahne, İzle’ye dönüldü, adım korundu ve çizim yine tam görünür',
    expandState.view === 'watch' &&
      expandState.step === escStep &&
      L3.read === '' &&
      Math.abs(L3.map.width - L3.vw) < 1 &&
      bigMap.outside === 0 &&
      bigMap.covered === 0 &&
      lapBig.clash.length === 0 &&
      tagsBack.flags >= 1,
    `${expandState.step}. adım · ${tagsBack.flags} ad etiketi geri geldi`,
  );

  // --- a question asked while reading updates the map in the background
  await showStep(page, 4);
  await page.click('[data-testid=watch-read]');
  await settle(page, 600);
  const reopened = await pres(page);
  check(
    'Okuyucu en son kullanılan kipte açılır (burada tam ekran) ve 4. adımda başlar',
    reopened.view === 'read' && reopened.read === 'full' && reopened.step === 4,
    `${reopened.read} · ${reopened.step}. adım`,
  );
  await page.click('[data-testid=read-size]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  const answersBefore = await count(page, '[data-testid=chat-answer]');
  await ask(page, 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?');
  await cameraRests(page, 12000);
  await settle(page, 500);
  const qSide = await pres(page);
  const qMap = await mapState(page);
  const lastAnswer = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-testid=chat-answer]')];
    const el = all.at(-1);
    const sc = document.querySelector('[data-testid=chat-scroll]').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { n: all.length, text: el.innerText, top: r.top - sc.top, bottom: r.bottom - sc.top, h: sc.height };
  });
  check(
    'Okurken soru: yanıt metne eklendi, okuyucu açık kaldı (yan panel); yeni yanıt adımsız, tek parça',
    qSide.view === 'read' &&
      qSide.read === 'side' &&
      !qSide.stepped &&
      lastAnswer.n === answersBefore + 1 &&
      /ittifak/i.test(lastAnswer.text) &&
      lastAnswer.top < lastAnswer.h &&
      lastAnswer.bottom > 0,
    `${lastAnswer.n} yanıt`,
  );
  check(
    'Arkadaki harita yeni soruya geçti (Osmanlı + Fransa, ittifak çizgisi, 1536) ve çizim paneli ile soru kutusunun dışında',
    qMap.ids.join() === 'ottoman-empire,kingdom-of-france' &&
      qMap.links.join() === 'alliance' &&
      qMap.year === '1536' &&
      qMap.outside === 0 &&
      qMap.covered === 0 &&
      qMap.markers.length === 0,
    `${qMap.ids.join('+')} · ${qMap.year}`,
  );
  await shot(page, 'ai-w4-oku-sirasinda-soru.png');
  // the same in full screen, in the little map
  await page.click('[data-testid=read-size]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  await ask(page, 'Peki Venedik?');
  await cameraRests(page, 12000);
  await settle(page, 500);
  const qFull = await pres(page);
  const qMini = await mapState(page);
  check(
    'Tam ekranda okurken soru: küçük harita yeni yanıtın sahnesine geçer (görünür, örtülü değil); okuyucu açık',
    qFull.view === 'read' &&
      qFull.read === 'full' &&
      !qFull.stepped &&
      qMini.diamonds + qMini.ids.length > 0 &&
      qMini.outside === 0 &&
      qMini.covered === 0,
    `${qMini.ids.join('+') || '—'} · işaret ${qMini.diamonds}`,
  );
  await page.click('[data-testid=mini-expand]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  check(
    'İzle’ye dönünce son yanıt kısa yanıt olarak haritanın üstünde (adım sayacı yok)',
    (await visible(page, '[data-testid=watch-short]')) && !(await visible(page, '[data-testid=watch-count]')),
  );
  await page.context().close();
});
/* ======================================== A2. following starts from the first step */
section('A2. Anlatımdan önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır');
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
    'Anlatımdan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz',
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
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const others = [
      '.map-zoom',
      '[data-testid=watch]',
      '[data-testid=ask]',
      '.card-host',
      '.map-stats:not([hidden])',
      '.legend',
    ]
      .map((s) => document.querySelector(s))
      .filter((el) => el && !el.hidden)
      .map((el) => [el.className || el.dataset.testid, el.getBoundingClientRect()])
      .filter(([, r]) => r.width > 0);
    const active = document.activeElement;
    return {
      w: card.width,
      h: card.height,
      share: (card.width * card.height) / (map.width * map.height),
      clash: others.filter(([, r]) => hit(card, r)).map(([name]) => name),
      focused: !!active && !!active.closest('[data-testid=follow-prompt]'),
      text: document.querySelector('[data-testid=follow-prompt]').innerText.replace(/\s+/g, ' '),
      live: document.querySelector('.follow-host').getAttribute('aria-live'),
      dialog: !!document.querySelector('[role=dialog], [role=alertdialog], dialog'),
    };
  });
  check(
    'Soru küçük ve sakin: haritanın %6’sından azını kaplar, kartı, altyazıyı, soru kutusunu ve yakınlaştırma düğmelerini örtmez, odağı çalmaz, iletişim kutusu değil',
    prompt.share < 0.06 && prompt.clash.length === 0 && !prompt.focused && !prompt.dialog && prompt.live === 'polite',
    `${Math.round(prompt.w)}×${Math.round(prompt.h)} px, %${(prompt.share * 100).toFixed(1)}${prompt.clash.length ? ` · örttüğü: ${prompt.clash.join(', ')}` : ''}`,
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
    hint: document.querySelector('[data-testid=chat-follow-row] small')?.textContent.replace(/\s+/g, ' '),
  }));
  check(
    'Ayarlar bağlantısı soru kutusunun ayarlarını açar, “Harita takibi” satırını işaretler ve anahtara odaklanır',
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
  await page.click('[data-testid=watch-pip][data-n="4"]');
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
  await showStep(page, 5);
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

/* ========================================================== B. a short answer */
section(
  'B. Kısa yanıt: adımsız, kısa bir metin ve en çok tek harita sahnesi (Osmanlı–Fransa ittifakı, 1536); metin haritanın üstünde, soru kutusunun hemen üzerinde',
);
let qaPage;
await guard(async () => {
  const page = await open('#t=1500-1550');
  const anatolia = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(anatolia.x, anatolia.y);
  await settle(page, 400);
  await page.click('[data-testid=place-ask]');
  await settle(page, 600);
  check(
    '“Soru sor” soru kutusuna odaklanır; ilk soru öncesi öneriler (Bu yerin tarihini anlat, …) çıkar',
    (await page.evaluate(() => document.activeElement?.dataset.testid === 'chat-input')) &&
      (await visible(page, '[data-testid=chat-suggest]')) &&
      (await visible(page, '[data-testid=chat-narrate]')),
  );
  const camBefore = await camera(page);
  await page.fill('[data-testid=chat-input]', 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?');
  await page.keyboard.press('Enter');
  await settle(page, 300);
  check(
    'Soru gönderilince kutu temizlendi; yanıt gelene kadar haritanın üstünde “Düşünüyor…” ve Durdur görünür',
    (await page.inputValue('[data-testid=chat-input]')) === '' &&
      (await visible(page, '[data-testid=chat-thinking]')) &&
      (await visible(page, '[data-testid=watch-stop]')),
  );
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 500);
  const camAfter = await camera(page);
  const sh = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=watch-short]');
    const ask = document.querySelector('[data-testid=ask]').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const t = document.querySelector('[data-testid=watch-text]');
    const q = (s) => !!document.querySelector(s);
    return {
      text: t.innerText,
      bottom: box.bottom,
      askTop: ask.top,
      steps: q('[data-testid=watch-count]') || q('[data-testid=watch-pip]') || q('[data-testid=watch-prev]'),
      auto: q('[data-testid=watch-play]') || q('[data-testid=watch-speed]'),
      ruler: document.querySelectorAll('[data-testid=ruler-step]').length,
      headings: /^#|^\d+\.\s/m.test(t.innerText),
      read: q('[data-testid=watch-read]'),
      close: q('[data-testid=watch-close]'),
    };
  });
  const pr = await pres(page);
  check(
    'Yanıt kısa yanıt olarak haritanın üstünde: adım sayacı, noktalar, önceki/sonraki, oynat ve hız yok; çizelgede adım noktaları yok',
    !!sh.text && !sh.steps && !sh.auto && sh.ruler === 0 && !sh.headings && !pr.stepped,
    `adımlı: ${pr.stepped}`,
  );
  check(
    'Metin kısa (en çok 3 paragraf, 1500 karakter), Fransa Kralı I. François’yı anlatıyor; “Metni oku” ve Kapat var',
    sh.text.length > 200 && sh.text.length <= 1500 && /François/.test(sh.text) && sh.read && sh.close,
    `${sh.text.length} karakter`,
  );
  check(
    'Metin soru kutusunun hemen üstünde (en çok 24 px aralık) ve kutuyu örtmüyor',
    sh.bottom <= sh.askTop && sh.askTop - sh.bottom <= 24,
    `aralık ${Math.round(sh.askTop - sh.bottom)} px`,
  );
  const state = await mapState(page);
  const dr = await drawing(page);
  check(
    'En çok tek sahne: iki devlet vurgulandı (Osmanlı ve Fransa), ikisi ittifak çizgisiyle bağlı; serbest işaret ve olay yok',
    state.ids.join() === 'ottoman-empire,kingdom-of-france' &&
      state.links.join() === 'alliance' &&
      state.flags.includes('İttifak, 1536') &&
      dr.marks.length === 0 &&
      dr.events.length === 0 &&
      pr.step === 1,
    `${state.ids.join('+')} · ${state.flags.join(', ')}`,
  );
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.plabel.is-ai')]
      .filter((e) => !e.classList.contains('is-hidden'))
      .map((e) => e.textContent.replace(/\s+/g, ' ')),
  );
  check('İki devletin adı da haritada mürekkep renginde, kalın', labels.length >= 2, labels.join(' | '));
  check('Harita sınırları 1536’ya getirildi', state.year === '1536');
  check(
    'Kamera ittifakın iki ucunu da görünür kıldı (Fransa’dan Osmanlı’ya), metnin ve soru kutusunun altında kalan bir şey yok; haritada olay işaretçisi yok',
    state.outside === 0 && state.covered === 0 && camCompare(camBefore, camAfter).moved && state.markers.length === 0,
    `yakınlaştırma ${camBefore.zoom.toFixed(2)} → ${camAfter.zoom.toFixed(2)} · örtülü ${state.covered}`,
  );
  const lap = await overlapReport(page);
  check(
    'Etiketler birbirini, işaretçileri ve metni örtmüyor',
    lap.clash.length === 0 && lap.out.length === 0 && lap.underControl.length === 0,
    [...lap.clash, ...lap.out, ...lap.underControl].join(' | '),
  );
  const tab = await visible(page, '[data-testid=card-tab]');
  check(
    'Soru sorulunca yer kartı kenara çekildi (sekme), yer seçili kaldı',
    tab && !(await visible(page, '[data-testid=place-card]')),
  );
  await shot(page, 'ai-2-kisa-yanit.png');

  // the full text of a short answer: the same words, one part, no numbers
  await page.click('[data-testid=watch-read]');
  await settle(page, 700);
  const rd = await page.evaluate(() => ({
    steps: document.querySelectorAll('[data-testid=chat-step]').length,
    numbers: document.querySelectorAll('.cs-n').length,
    live: !!document.querySelector('[data-testid=chat-step] [data-testid=chat-step-live]'),
    answer: document.querySelector('[data-testid=chat-answer]').innerText,
    rail: document.querySelectorAll('[data-testid=chat-step-show]').length,
  }));
  check(
    '“Metni oku”: tek parça, numarasız (adım numarası yok); haritadaki sahne “Haritada gösteriliyor”; aynı metin',
    rd.steps === 1 && rd.numbers === 0 && rd.live && /François/.test(rd.answer) && (await pres(page)).view === 'read',
    `${rd.steps} bölüm`,
  );
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  check(
    'İzle’ye dönünce yine kısa yanıt (sayaç yok)',
    (await visible(page, '[data-testid=watch-short]')) && !(await visible(page, '[data-testid=watch-count]')),
  );
  qaPage = page;
});

/* ============================================================ C. an event */
section('C. Olay: yanıt ekrandayken çizelgeden bir olaya tıklamak, kartı sağda açar ve işaretçisini haritaya getirir');
await guard(async () => {
  const page = qaPage;
  const id = 'mohac-1526';
  check(
    'Tıklamadan önce haritada olay işaretçisi yok; olaylar çizelgede',
    (await markerIds(page)).length === 0 && (await count(page, `.dock [data-id="${id}"]`)) >= 1,
  );
  const dot = page.locator(`.dock [data-id="${id}"]`).first();
  await dot.click({ timeout: 5000 });
  await settle(page, 900);
  check(
    'Olay kartı sağda açıldı (yer kartının yerinde); kısa yanıt ve soru kutusu yerinde',
    (await visible(page, '[data-testid=event-card]')) &&
      !(await visible(page, '[data-testid=card-tab]')) &&
      (await visible(page, '[data-testid=watch-short]')) &&
      (await visible(page, '[data-testid=ask]')),
  );
  check(
    'Tıklanan olay haritaya gelir: yalnızca onun işaretçisi, vurgulu',
    (await markerIds(page)).join() === id && (await count(page, '.marker-layer .evt.is-selected')) === 1,
    (await markerIds(page)).join(),
  );
  const geo = await page.evaluate(() => {
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = document.querySelector('.card-host').getBoundingClientRect();
    const others = ['[data-testid=watch-short]', '[data-testid=ask]'].map((s) =>
      document.querySelector(s).getBoundingClientRect(),
    );
    return { clash: others.some((r) => hit(card, r)), right: card.right, vw: innerWidth, width: card.width };
  });
  check(
    'Olay kartı küçük (en çok 340 px) ve sağ kenarda; yanıtın metnini ve soru kutusunu örtmez',
    !geo.clash && geo.width <= 340 && geo.right >= geo.vw - 24,
    `${Math.round(geo.width)} px`,
  );
  check(
    'Yer, kartın üstünde tek satır olarak duruyor; açık olay soru kutusunda bağlam olarak görünüyor',
    (await visible(page, '[data-testid=panel-context] .line')) &&
      /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-event-chip]')),
  );
  const lapOpen = await overlapReport(page);
  check(
    'Açık olayın adı ve işaretçisi başka etiketlerle çakışmıyor',
    lapOpen.clash.length === 0 && lapOpen.out.length === 0,
    lapOpen.clash.join(' | '),
  );
  await shot(page, 'ai-3a-olay-karti.png');

  await page.click('[data-testid=event-close]');
  await settle(page, 600);
  check(
    'Kartı kapatmak yanıtı yerinde bırakır; olayın işaretçisi haritadan çekilir; yer kartı sekmeye döner (önceki hâli)',
    !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=watch-short]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null &&
      (await markerIds(page)).length === 0 &&
      (await visible(page, '[data-testid=card-tab]')),
  );
  await dot.click({ timeout: 5000 });
  await settle(page, 500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc de olay kartını kapatır; yanıt ekranda kalır',
    !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=watch-short]')) &&
      (await page.evaluate(() => window.__ayni.ai.presentation.shown)),
  );

  await dot.click({ timeout: 5000 });
  await settle(page, 500);
  check('Olay kartında “Bunu sohbette sor” düğmesi var', await visible(page, '[data-testid=event-ask]'));
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await cameraRests(page, 12000);
  await settle(page, 600);
  check(
    'Düğme olayı soruya ekledi: kart kapandı, yer kartı sekmede; yeni yanıt kısa yanıt olarak ekranda',
    !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=card-tab]')) &&
      (await visible(page, '[data-testid=watch-short]')),
  );
  const req = await lastRequest(page);
  check(
    'Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)',
    req &&
      /Açık olay kartı: «Mohaç Muharebesi» \(kimlik: mohac-1526\)/.test(req.last) &&
      /\nİSTEK\n.*Mohaç Muharebesi/.test(req.last),
  );
  const state = await mapState(page);
  check(
    'Yanıtın haritası: olay kendi işaretiyle (adı yanında), taraflar vurgulu, olayın yılı; serbest işaret yok',
    state.markers.join() === id &&
      state.eventFlags.join() === id &&
      state.diamonds === 0 &&
      state.ids.includes('ottoman-empire') &&
      state.year === '1526' &&
      state.outside === 0 &&
      state.covered === 0,
    `${state.ids.join('+')} · ${state.markers.join()} · ${state.flags.join(', ')} · ${state.year} · işaret ${state.diamonds} · görünüm dışı ${state.outside} · örtülü ${state.covered}`,
  );
  await shot(page, 'ai-3b-bunu-sor.png');
  // the question, with the event it was about, is in the text
  await page.click('[data-testid=read-toggle]');
  await settle(page, 600);
  check(
    'Metinde kullanıcı mesajının altında olay çipi var (Mohaç Muharebesi)',
    /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-user-event]')),
  );
  await page.click('[data-testid=read-close]');
  await settle(page, 400);
});

section('C2. Olay: yanıt yokken kart sağda açılır; “Bunu sohbette sor”; çizelgeden; Esc sırası');
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  await page.locator('.marker-layer [data-id="mohac-1526"]').click({ timeout: 5000 });
  await settle(page, 600);
  check(
    'Yanıt yokken olay kartı sağdaki kartta açılır (altyazı, metin ya da sekme yok)',
    (await visible(page, '[data-testid=event-card]')) &&
      !(await visible(page, '[data-testid=watch-short]')) &&
      !(await visible(page, '[data-testid=chat]')) &&
      !(await visible(page, '[data-testid=card-tab]')),
  );
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await settle(page, 500);
  check(
    '“Bunu sohbette sor” olayı soruya ekler: yanıt haritanın üstünde, olay kartı kapandı, yer kartı sekmede',
    (await visible(page, '[data-testid=watch-short]')) &&
      !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=card-tab]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null,
  );
  const dock = page.locator('.dock [data-id="caldiran-1514"]').first();
  await dock.click({ timeout: 5000 });
  await settle(page, 700);
  check(
    'Çizelgedeki noktaya tıklamak da kartı sağda açar (Çaldıran); yanıt yerinde',
    (await visible(page, '[data-testid=event-card]')) &&
      /Çaldıran/.test(await text(page, '[data-testid=event-title]')) &&
      (await visible(page, '[data-testid=watch-short]')),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc önce olay kartını kapatır, yanıt ekranda kalır',
    !(await visible(page, '[data-testid=event-card]')) && (await visible(page, '[data-testid=watch-short]')),
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check(
    'Bir daha Esc yanıtı kapatır ve yer kartı geri gelir (yer seçili kalır, harita okurun)',
    !(await visible(page, '[data-testid=watch-short]')) &&
      (await visible(page, '[data-testid=place-card]')) &&
      (await page.evaluate(() => window.__ayni.store.state.places.length)) === 1 &&
      (await aiDom(page)).hidden,
  );
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Bir daha Esc yer seçimini kaldırır',
    (await page.evaluate(() => window.__ayni.store.state.places.length)) === 0 &&
      !(await visible(page, '[data-testid=place-card]')),
  );
  await page.context().close();
});

/* ========================================================= D. new subject */
section('D. Bağlam: yanıt sürerken seçili yer değişirse metin bunu gösterir');
await guard(async () => {
  const page = qaPage;
  await page.click('[data-testid=read-toggle]');
  await settle(page, 600);
  await cameraRests(page, 8000); // the map makes room for the reader before the next click is aimed at it
  await settle(page, 300);
  const before = await count(page, '[data-testid=chat-context-change]');
  check('Yer değişmeden ayırıcı yok', before === 0);
  await page.evaluate(() => (window.__origin = window.__ayni.store.state.places[0]));
  const france = await pixelOf(page, 2.2, 48.5);
  await page.mouse.click(france.x, france.y);
  await settle(page, 600);
  check(
    'Yer değişince metinde tek bir “Bağlam değişti” ayırıcısı çıkıyor',
    (await count(page, '[data-testid=chat-context-change]')) === 1,
  );
  const div = await text(page, '[data-testid=chat-context-change]');
  check(
    'Ayırıcı eski ve yeni konuyu söylüyor',
    /Osmanlı İmparatorluğu · 1500–1550/.test(div) && /Fransa Krallığı · 1500–1550/.test(div),
    div.replace(/\s+/g, ' '),
  );
  check('Üst çubuk yeni yeri gösteriyor', /Fransa Krallığı/.test(await text(page, '[data-testid=title-main]')));
  check(
    'Soru kutusu yeni yeri söylüyor',
    /Fransa Krallığı hakkında/.test(await page.getAttribute('[data-testid=chat-input]', 'placeholder')),
  );
  check(
    'Yeni yerin kartı sağda geri geldi (seçim kartı sekmeden çıktı)',
    (await visible(page, '[data-testid=place-card]')) &&
      /Fransa Krallığı/.test(await text(page, '[data-testid=place-title]')),
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
    'Ayırıcı metinde, değişiklikten sonraki sorunun önünde kalıyor',
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('[data-testid=chat-scroll] > *')].map((e) => e.dataset.testid);
      const i = items.lastIndexOf('chat-context-change');
      return i > -1 && items[i + 1] === 'chat-user';
    }),
  );
  await qaPage.context().close();
});
/* ====================================================== J. one narrator */
section(
  'J. Tek anlatıcı: yanıt ekrandayken olay işaretçileri haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir',
);
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  const before = await markerIds(page);
  const dockBefore = await count(page, '.dock [data-id]');
  const note0 = await text(page, '.map-stats');
  check(
    'Yanıt yokken hiçbir şey değişmedi: haritada olay işaretçileri ve “n / m olay haritada” notu var',
    before.length >= 5 && /\/\s*\d+ olay haritada/.test(note0) && !/gerisi çizelgede/.test(note0),
    `${before.length} işaretçi · ${note0.replace(/\s+/g, ' ')}`,
  );
  await page.click('[data-testid=place-ask]');
  await settle(page, 700);
  check(
    'Soru kutusuna geçmek haritaya dokunmaz: işaretçiler yerinde (anlatıcı, ekrana bir yanıt gelince başlar)',
    sameSet(await markerIds(page), before),
  );
  await ask(page, 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?');
  await cameraRests(page, 12000);
  await settle(page, 600);
  const note1 = await text(page, '.map-stats');
  check(
    'Yanıt ekrana gelince tüm olay işaretçileri haritadan çekilir, çizelgede aynen kalır',
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

  // an event the reader clicks comes to the map for as long as its card is open
  await page.locator('.dock [data-id="caldiran-1514"]').first().click({ timeout: 5000 });
  await settle(page, 900);
  check(
    'Çizelgeden tıklanan olay haritada belirir (yalnızca o) ve kartı açıktır',
    (await markerIds(page)).join() === 'caldiran-1514' && (await visible(page, '[data-testid=event-card]')),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check('Kart kapanınca olayın işaretçisi yeniden haritadan çekilir', (await markerIds(page)).length === 0);

  // closing the answer gives the map back exactly as it was
  await page.click('[data-testid=watch-close]');
  await settle(page, 900);
  const note2 = await text(page, '.map-stats');
  check(
    'Yanıtı kapatmak (✕) olay işaretçilerini haritaya geri getirir, yapay zekâ çizimi gider, eski not döner (kamera yerinde kalır)',
    (await markerIds(page)).length >= 5 &&
      (await aiDom(page)).hidden &&
      /\/\s*\d+ olay haritada/.test(note2) &&
      !/gerisi çizelgede/.test(note2),
    `${(await markerIds(page)).length} işaretçi · ${note2.replace(/\s+/g, ' ')}`,
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
  const before = await markerIds(page);
  await page.click('[data-testid=place-narrate]');
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
    'Anılan olayın işaretçisine tıklamak olay kartını sağda açar; altyazı yerinde kalır',
    (await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=watch]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === 'caldiran-1514',
  );
  const lapSel = await overlapReport(page);
  check(
    'Hem anılan hem açık olduğunda adı bir kez yazılı (açık olayın etiketi), çakışma yok',
    (await count(page, '.ai-flag.is-event:not([hidden])')) === 0 && lapSel.clash.length === 0,
    lapSel.clash.join(' | '),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
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

  // closing the answer takes the AI's drawing and its markers away and gives the map its markers back
  await page.click('[data-testid=watch-close]');
  await settle(page, 900);
  check(
    'Anlatım kapanınca anlatıcının işaretçileri ve çizimi gider, haritanın olayları geri gelir',
    (await aiDom(page)).hidden &&
      (await markerIds(page)).length >= before.length - 2 &&
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
    () => (window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1)?.text.length ?? 0) > 70,
    null,
    { timeout: 20000 },
  );
  await page.click('[data-testid=chat-stop]');
  const status = await finalStatus(page);
  await settle(page, 300);
  const partial = await page.evaluate(
    () => window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1).text.length,
  );
  check(
    'Durdur: yanıt hemen “durduruldu” olur; adımlar ve yazılan kısım kalır, altyazı ekranda',
    status === 'stopped' &&
      partial > 40 &&
      (await visible(page, '[data-testid=chat-stopped]')) &&
      (await visible(page, '[data-testid=watch-caption]')),
    `${partial} karakter`,
  );
  check(
    'Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez; “Yeniden dene” yalnızca okur basınca',
    (await visible(page, '[data-testid=chat-send]')) &&
      !(await page.evaluate(() => window.__ayni.ai.session.busy)) &&
      (await page.getByRole('button', { name: 'Yeniden dene' }).count()) >= 1,
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  const partialRead = await page.evaluate(() => document.querySelector('[data-testid=chat-answer]').innerText.length);
  check(
    'Metin okuyucuda da yarım kalan kısım ve “Durduruldu” notu var',
    partialRead > 40 && (await visible(page, '[data-testid=chat-stopped-read]')),
    `${partialRead} karakter`,
  );
  await page.click('[data-testid=read-watch]');

  await ask(page, 'deneme [hata:rate_limited]');
  await settle(page, 500);
  check(
    'rate_limited: hata yanıtın yerinde; yazılan metin kalır; yeniden dene düğmesi var',
    (await text(page, '[data-testid=chat-error]')).includes('Çok sık istek') &&
      (await visible(page, '[data-testid=chat-retry]')) &&
      (await text(page, '[data-testid=watch-text]')).includes('ilk cümlesi'),
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
    'not_granted: kalıcı uyarı soru kutusunun üstünde, kutu kapalı, izin paneli düğmesi',
    (await visible(page, '[data-testid=chat-blocked]')) &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      (await page.getByRole('button', { name: 'İzinleri aç' }).count()) >= 1,
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900');
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
  const menu = await rectOf(page, '[data-testid=chat-menu]');
  const askBox = await rectOf(page, '[data-testid=ask]');
  check(
    'Ayar menüsü soru kutusunun hemen üstünde açılır ve ekranın içinde kalır',
    menu.bottom <= askBox.top && menu.top >= 0 && menu.right <= 1440,
    `${Math.round(menu.width)}×${Math.round(menu.height)} px`,
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
  await ask(page, 'Fransa ile ittifak neydi?');
  check(
    'Yanıt var: haritada çizim, soru kutusunda metin düğmesi',
    !(await aiDom(page)).hidden && (await visible(page, '[data-testid=read-toggle]')),
  );
  await page.click('[data-testid=chat-settings]');
  await page.click('[data-testid=chat-new]');
  await settle(page, 400);
  check(
    '“Sohbeti temizle” yazışmayı, ekrandaki yanıtı ve haritadaki çizimi siler; metin düğmesi kalkar',
    (await page.evaluate(() => window.__ayni.ai.session.items.length)) === 0 &&
      (await aiDom(page)).hidden &&
      !(await page.evaluate(() => window.__ayni.ai.presentation.shown)) &&
      !(await visible(page, '[data-testid=watch-short]')) &&
      !(await visible(page, '[data-testid=read-toggle]')),
  );
  await page.context().close();
});

/* ============================================ G. the real `sample` adapter */
section('G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)');
const FAKE_RUNTIME = (opts = {}) => {
  window.__noTools = !!opts.noTools;
  window.__rejectWith = opts.rejectWith ?? null;
  window.__hold = !!opts.hold;
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
      stepSchema: (options.tools || []).find((t) => t.name === 'step')?.inputSchema ?? null,
      signal: !!options.signal,
      first: input[0].content,
      last: input[input.length - 1].content,
    });
    if (window.__rejectWith) throw window.__rejectWith;
    const ctx = { signal: options.signal };
    if (options.tools) {
      const by = Object.fromEntries(options.tools.map((t) => [t.name, t]));
      // the first round: no text, every call at once (as the instructions ask)
      window.__toolResults = await Promise.all([
        by.step.execute(
          {
            n: 1,
            title: 'İttifak',
            caption: 'Osmanlı ile Fransa, Habsburg çemberine karşı 1536 dolayında yakınlaştı.',
          },
          ctx,
        ),
        by.highlight.execute({ step: 1, polities: ['ottoman-empire', 'kingdom-of-france', 'atlantis'] }, ctx),
        by.connect.execute(
          { step: 1, from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'Gerçek yol' },
          ctx,
        ),
        by.set_year.execute({ step: 1, year: 1536 }, ctx),
        by.step.execute(
          { n: 2, title: 'Akdeniz', caption: "1538'de Preveze'de Osmanlı donanması üstünlüğü aldı." },
          ctx,
        ),
        by.highlight.execute({ step: 2, polities: ['ottoman-empire', 'republic-of-venice'] }, ctx),
        by.show_event.execute({ step: 2, event: 'preveze-1538' }, ctx),
        by.set_year.execute({ step: 2, year: 1538 }, ctx),
      ]);
    }
    // the long texts are written after the plan; a held call lets the page be looked at in between
    if (window.__hold) await new Promise((r) => (window.__release = r));
    await new Promise((r) => setTimeout(r, 80));
    const first = '## 1. İttifak\nBu yanıt sahte çalışma zamanından geldi';
    const full = `${first}, araçlarla birlikte.\n\n## 2. Akdeniz\nPreveze önünde donanmalar karşılaştı.`;
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
const INSTRUCTION_FILE = readFileSync(join(ROOT, 'instructions', 'okuma-arkadasi.txt'), 'utf8')
  .replace(/\r\n?/g, '\n')
  .trimEnd();
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', { init: FAKE_RUNTIME, initArg: { hold: true } });
  check(
    'Claude çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”',
    !(await visible(page, '[data-testid=ask-mock-note]')) &&
      (await page.evaluate(() => window.__ayni.ai.session.provider.kind)) === 'sample',
  );
  await page.fill('[data-testid=chat-input]', 'Fransa ile ittifak neydi?');
  await page.keyboard.press('Enter');
  // the tool round is in and the long texts are not yet: Watch starts
  await page.waitForSelector('[data-testid=watch-caption]', { timeout: 10000 });
  await cameraRests(page, 12000);
  await settle(page, 300);
  const early = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      status: a.status,
      chars: a.text.length,
      writing: !!document.querySelector('[data-testid=watch-writing]'),
      count: document.querySelector('[data-testid=watch-count]')?.textContent.replace(/\s+/g, ' ').trim(),
      caption: document.querySelector('[data-testid=watch-caption]')?.textContent,
    };
  });
  check(
    'Metin henüz yokken (araç turu bitti, uzun metin yazılmıyor) İzle başladı: 1. adımın altyazısı ve “Metin yazılıyor…”',
    early.chars === 0 &&
      early.status !== 'done' &&
      early.writing &&
      early.count === '1 / 2' &&
      /Habsburg çemberine karşı/.test(early.caption),
    `${early.status} · ${early.chars} karakter · ${early.count}`,
  );
  const mid = await mapState(page);
  check(
    'Haritada 1. adımın çizimi şimdiden var (iki devlet, ittifak çizgisi, 1536); tanınmayan devlet sessizce atlandı',
    mid.ids.join() === 'ottoman-empire,kingdom-of-france' &&
      mid.links.join() === 'alliance' &&
      mid.flags.includes('Gerçek yol') &&
      mid.year === '1536' &&
      mid.outside === 0,
    mid.ids.join('+'),
  );
  await page.click('[data-testid=watch-pip][data-n="2"]');
  await cameraRests(page);
  const mid2 = await mapState(page);
  check(
    'Metin yazılmadan 2. adıma da geçilebiliyor: Osmanlı + Venedik, Preveze işareti, 1538',
    (await stepNow(page)) === 2 &&
      mid2.ids.join() === 'ottoman-empire,republic-of-venice' &&
      mid2.markers.join() === 'preveze-1538' &&
      mid2.year === '1538',
    `${mid2.ids.join('+')} · ${mid2.markers.join()}`,
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  check(
    'Metin yazılmadan Oku açılırsa her adımın altyazısı yerinde duruyor (“yazılıyor” sürerken boş kalmaz)',
    (await count(page, '[data-testid=chat-step-pending]')) >= 1 || (await count(page, '[data-testid=chat-step]')) === 2,
  );
  await page.click('[data-testid=read-watch]');
  await page.evaluate(() => window.__release());
  await finalStatus(page);
  await settle(page, 400);
  check(
    'Metin gelince “Metin yazılıyor…” kalkar; oynatılan adım (2) yerinde kalır',
    !(await visible(page, '[data-testid=watch-writing]')) && (await stepNow(page)) === 2,
  );
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları',
    call.roles[0] === 'user' && call.roles.at(-1) === 'user' && call.tier === 'default' && call.signal && call.schemas,
    call.roles.join(),
  );
  check(
    'İlk tur, sahibin yönerge dosyasıyla BİREBİR başlıyor; arkasından uygulama notları geliyor',
    call.first.startsWith(INSTRUCTION_FILE) &&
      call.first.slice(INSTRUCTION_FILE.length).startsWith('\n\nUYGULAMA NOTLARI\n'),
    `${INSTRUCTION_FILE.length} karakter`,
  );
  check('Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)', call.hasCache === false);
  check(
    'Yedi araç, bu sırayla: step, highlight, connect, show_event, mark, set_year, focus',
    call.tools.join() === 'step,highlight,connect,show_event,mark,set_year,focus',
    call.tools.join(),
  );
  check(
    'Adım aracı iki metin ister: numara, başlık ve altyazı (caption)',
    call.stepSchema &&
      ['n', 'title', 'caption'].every((k) => k in call.stepSchema.properties) &&
      ['n', 'title', 'caption'].every((k) => call.stepSchema.required.includes(k)),
  );
  const results = await page.evaluate(() => window.__toolResults);
  check(
    'Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi',
    results[0] === 'tamam' && /atlantis/.test(results[1]) && results.every((r) => typeof r === 'string'),
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  check(
    'Metin akışla geldi ve tamamlandı: iki adımın tam metni okuyucuda',
    (await page.evaluate(() => document.querySelector('[data-testid=chat-answer]').innerText)).includes(
      'araçlarla birlikte.',
    ) && (await count(page, '[data-testid=chat-step]')) === 2,
  );
  await page.click('[data-testid=read-watch]');
  // the second question carries the first exchange (the model keeps nothing)
  await page.click('[data-testid=chat-settings]');
  await page.locator('[data-testid=chat-menu] label', { hasText: 'Derin' }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__hold = false;
  });
  await ask(page, 'Peki Venedik?');
  const second = await page.evaluate(() => window.__sampleCalls[1]);
  check(
    'İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”; yönergeler yine başta',
    second.roles.join() === 'user,user,assistant,user' &&
      second.tier === 'complex' &&
      /İSTEK\nPeki Venedik\?/.test(second.last) &&
      second.first.startsWith(INSTRUCTION_FILE),
    second.roles.join(),
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
  await settle(page, 400);
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; altyazının altında “yalnızca metin” notu görünür',
    call.tools.length === 0 && /yalnızca metin/.test(await text(page, '[data-testid=watch-note]')),
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 400);
  check('Aynı not okuyucuda da var', /yalnızca metin/.test(await text(page, '[data-testid=chat-note]')));
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
section(
  'H. Telefon: harita tüm sahne; kart üstte küçük bir sayfa; altyazı ve soru kutusu altta; metin her zaman tam ekran',
);
await guard(async () => {
  const page = await open('#t=1500-1550&p=35.500,38.900', { viewport: { width: 390, height: 844 }, mobile: true });
  const g0 = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      return e ? e.getBoundingClientRect().toJSON() : null;
    };
    return {
      vw: innerWidth,
      vh: innerHeight,
      map: r('#map'),
      card: r('.card-host'),
      ask: r('[data-testid=ask]'),
      dock: r('.dock'),
      top: r('.topbar'),
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    'Telefon: harita genişliğin tamamı ve dikeyde üst çubuk ile zaman çizelgesi arasındaki her yer; yatay taşma yok',
    Math.abs(g0.map.width - g0.vw) < 1 &&
      Math.abs(g0.map.top - g0.top.bottom) <= 1 &&
      Math.abs(g0.map.bottom - g0.dock.top) <= 1 &&
      g0.map.height > g0.vh * 0.6 &&
      !g0.overflowX,
    `${Math.round(g0.map.width)}×${Math.round(g0.map.height)} / ${g0.vw}×${g0.vh}`,
  );
  check(
    'Telefon: bilgi kartı haritanın üstünde küçük bir sayfa (genişlik ekrandan 16 px dar, yükseklik haritanın yarısından az); soru kutusu zaman çizelgesinin hemen üstünde',
    g0.card &&
      Math.abs(g0.card.width - (g0.vw - 16)) < 2 &&
      g0.card.height <= g0.map.height * 0.5 &&
      g0.ask.bottom <= g0.dock.top &&
      g0.dock.top - g0.ask.bottom <= 20 &&
      g0.ask.left >= 0 &&
      g0.ask.right <= g0.vw,
    g0.card ? `kart ${Math.round(g0.card.width)}×${Math.round(g0.card.height)} px` : 'kart yok',
  );
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 800);
  const m = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      return e ? e.getBoundingClientRect().toJSON() : null;
    };
    const watch = document.querySelector('[data-testid=watch]');
    const controls = [...watch.querySelectorAll('button, select')].map((e) => e.getBoundingClientRect());
    const w = watch.getBoundingClientRect();
    return {
      vw: innerWidth,
      vh: innerHeight,
      watch: w.toJSON(),
      ask: r('[data-testid=ask]'),
      dock: r('.dock'),
      card: r('.card-host'),
      tab: r('[data-testid=card-tab]'),
      stray: controls.filter((c) => c.left < w.left - 1 || c.right > w.right + 1 || c.top < w.top - 1).length,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      legend: (() => {
        const e = document.querySelector('.legend');
        return !!e && getComputedStyle(e).display !== 'none';
      })(),
      tiny: [...watch.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height < 30).length,
    };
  });
  check(
    'Telefon: altyazı soru kutusunun hemen üstünde, ikisi de ekranın içinde; denetimler altyazı kutusundan taşmıyor; yatay taşma yok',
    m.watch.bottom <= m.ask.top + 1 &&
      m.ask.bottom <= m.dock.top &&
      m.watch.left >= 0 &&
      m.watch.right <= m.vw &&
      m.stray === 0 &&
      !m.overflowX,
    `altyazı ${Math.round(m.watch.width)}×${Math.round(m.watch.height)} px`,
  );
  check(
    'Telefon: yer kartı kenara çekildi (küçük sekme); renk anahtarı anlatım sürerken gizli; altyazının düğmeleri en az 30 px',
    !!m.tab && !(await visible(page, '[data-testid=place-card]')) && m.tab.width < 280 && !m.legend && m.tiny === 0,
    m.tab ? `sekme ${Math.round(m.tab.width)}×${Math.round(m.tab.height)} px` : 'sekme yok',
  );
  const mm = await mapState(page);
  check(
    'Telefon: kamera 1. adımı altyazının ve soru kutusunun altında kalmayacak biçimde gösterdi',
    mm.targets > 0 && mm.outside === 0 && mm.covered === 0,
    `görünüm dışı ${mm.outside}, örtülü ${mm.covered}`,
  );
  await shot(page, 'ai-6-mobil.png');

  // the text: always full screen on a phone, with the small map under its head and the step kept
  await showStep(page, 3);
  await page.click('[data-testid=watch-read]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  await settle(page, 300);
  const r = await page.evaluate(() => {
    const rect = (s) => {
      const e = document.querySelector(s);
      return e && !e.hidden ? e.getBoundingClientRect().toJSON() : null;
    };
    const stage = document.querySelector('#stage');
    return {
      vw: innerWidth,
      vh: innerHeight,
      read: stage.dataset.read,
      readPanel: rect('#read'),
      map: rect('#map'),
      size: !!document.querySelector('[data-testid=read-size]'),
      ask: rect('[data-testid=ask]'),
      scrollTop: rect('[data-testid=chat-scroll]')?.top ?? null,
      activeStep: document.querySelector('[data-testid=chat-step][data-active="true"]')?.dataset.n,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const miniM = await mapState(page);
  check(
    'Telefon: “Metni oku” metni tam ekran açar (yan panel yok, boyut düğmesi yok); harita başlığın altında küçük bir pencere; 3. adım korunur',
    r.read === 'full' &&
      r.readPanel.width > r.vw - 2 &&
      !r.size &&
      r.map.width < r.vw * 0.55 &&
      r.map.height <= 140 &&
      r.activeStep === '3' &&
      !r.overflowX,
    `pencere ${Math.round(r.map.width)}×${Math.round(r.map.height)} px`,
  );
  check(
    'Telefon: küçük harita 3. adımı tam gösteriyor; metin pencerenin altından başlıyor, soru kutusu ekranda',
    miniM.ids.join() === OTTOMAN[2].ids &&
      miniM.outside === 0 &&
      r.scrollTop >= r.map.bottom - 2 &&
      r.ask.bottom <= r.vh &&
      r.ask.left >= 0 &&
      r.ask.right <= r.vw,
    `görünüm dışı ${miniM.outside} · metin ${Math.round(r.scrollTop)} px’de, pencere ${Math.round(r.map.bottom)} px’de biter`,
  );
  await shot(page, 'ai-6b-mobil-oku.png');
  await page.click('[data-testid=mini-expand]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  check(
    'Telefon: “Haritayı büyüt” İzle’ye döner, adım 3 kalır',
    (await pres(page)).view === 'watch' && (await stepNow(page)) === 3,
  );

  // a big move on the small map brings the question: it has to stay small there too
  await dragMap(page, 300, 0);
  const small = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = document.querySelector('[data-testid=follow-prompt]');
    if (!card) return null;
    const c = box(card);
    const map = box(document.querySelector('#map'));
    const others = ['.map-zoom', '.map-stats', '[data-testid=watch]', '[data-testid=card-tab]']
      .map((s) => document.querySelector(s))
      .filter((el) => el && !el.hidden);
    return {
      share: (c.width * c.height) / (map.width * map.height),
      inside: c.left >= map.left && c.right <= map.right && c.top >= map.top && c.bottom <= map.bottom,
      clash: others.some((el) => hit(c, box(el))),
      hint: /Ayarlar ⚙ → Harita takibi/.test(card.innerText),
    };
  });
  check(
    'Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini, sayacı, altyazıyı ve sekmeyi örtmez, haritanın %22’sinden azını kaplar',
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
  '# Okuma arkadaşı ve harita öncelikli düzen: doğrulama raporu',
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
  '- `ai-0-yeni-duzen.png`: harita neredeyse tam ekran; üstte ince çubuk, altta ince zaman çizelgesi, hemen üstünde soru kutusu, sağda küçük bilgi kartı',
  '- `ai-0-yer-karti.png`: bir yer seçilince küçük kart',
  '- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`: İzle; her adım yalnızca kendi çizimini gösterir, altyazı sabit yerde, kamera adımı izler',
  '- `ai-1f-tek-anlatici.png`: yanıt ekrandayken haritada yalnızca anılan ve tıklanan olayların işaretçileri',
  '- `ai-v1-ilerleme-cubugu.png`: zaman cetveli ilerleme çubuğu (adımlar tarihlerinde, görülenler dolu)',
  '- `ai-w1-izle-adim3.png`, `ai-w2-oku-yan-panel.png`, `ai-w3-oku-tam-ekran.png`: aynı adım (3) üç görünümde: İzle, Oku yan panel, Oku tam ekran (köşede küçük harita)',
  '- `ai-w4-oku-sirasinda-soru.png`: okurken sorulan soru, arkadaki haritayı günceller',
  '- `ai-2-kisa-yanit.png`: kısa yanıt (adımsız, tek sahne; Osmanlı–Fransa ittifakı)',
  '- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru',
  '- `ai-3a-olay-karti.png`, `ai-3b-bunu-sor.png`: yanıt ekrandayken olay kartı; “Bunu sohbette sor”',
  '- `ai-4-baglam-degisti.png`: seçili yer değişince metinde “Bağlam değişti”',
  '- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-6b-mobil-oku.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`',
  '',
);
writeFileSync(join(OUT, 'AI-RAPOR.md'), lines.join('\n'));
console.log(`\n${passed}/${results.length} denetim geçti. Rapor: docs/verification/AI-RAPOR.md`);
process.exit(passed === results.length ? 0 : 1);
