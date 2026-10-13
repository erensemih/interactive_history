#!/usr/bin/env node
/**
 * End-to-end verification of the reading companion (the AI), of the map-first layout and of the cleaner map, in a real
 * (headless) Chromium, on the period the app opens with: 1800–2000, at the Second World War (the range 1939–1945, with
 * the borders of 1942).
 *
 *   npm run e2e:ai            # builds if needed, serves the build, runs the scenarios
 *
 * No Claude is available here, so the model is the scripted stand-in (`MockProvider`): it runs the very same
 * tool calls and streams the very same kind of text as a real answer, only with fixed content. The page
 * decides to use it by itself, because `window.claude` does not exist in this browser, and says so over the map.
 * One group (G) injects a fake artifact runtime instead, to drive the real `sample` adapter in the browser
 * (the instruction file as the first turn, the five tools, the plan before the long texts, the whole conversation).
 *
 * The scenarios count what the data holds (events, rows, the place timeline) in the page instead of fixed numbers. The
 * example place is a free point in Germany (Hamburg): "Nazi Almanyası" with the borders of 1942, narrated in eight
 * steps (from 1939 to Berlin in 1945; Barbarossa in the fourth, Stalingrad and El Alamein in the sixth).
 *
 * The round about a cleaner map ("the model decides WHAT to show, the app decides HOW it looks"):
 *   P. Colours: the colours the map really shows (read from screenshots) are never grey or blue and neighbours differ; in a
 *      narration the lit polities are solid and vivid and the rest is faded.
 *   A, J. A place selected (or the AI narrating) takes the world's events off the map; one narrator at a time. In a step
 *      only what it names is drawn: the event by its kind (a war is one unit: marker and line), no name boxes beside
 *      markers, the camera fits all of it above the caption and the question box.
 *   R. The names of events in captions and texts are links that do what a click on the event in the timeline does.
 *   T. The place timeline shows the selected range and nothing beyond it; the ruler's step points do not overlap
 *      each other or the range's writing.
 *   F. The end of a text is not under the question box (full screen, beside the map, small windows, phones).
 *   G, E. The whole conversation reaches the model (and "Sohbeti temizle" always works).
 *
 * The map-first round before it:
 *   L. Layout: the map is almost the whole screen, a thin timeline at the bottom, the question box just above it,
 *      a small info card on the right that closes easily and steps aside by itself when something is asked.
 *   S. Borders come with the year window: at the start and after every change of year (a far range, a pasted link, the
 *      ruler, quick changes) the "· yükleniyor…" note goes away and the borders drawn are those of the year shown.
 *   A, V. Watch: a multi-step narration moves step by step with its short caption in one fixed place, stepped by
 *      buttons or the arrow keys, with optional autoplay at a chosen speed; the ruler is its progress bar; Watch
 *      starts as soon as the plan is in, before the long texts are written.
 *   W. Read: the full text, beside the map or full screen with a small map in the corner showing the current step;
 *      switching between the views keeps the step; a question asked while reading updates the map behind.
 *   B. Every answer has a short caption and a full text: a question about one thing gets a one-step answer (the caption
 *      over the map, no step controls, "Devamını oku" opens the full text, the map shows its one scene); a model that
 *      answers in plain text gets the first sentences of its text as the caption.
 *
 * And what already worked (kept): each step owns the map (A), "Harita takibi" (A2–A4), events (C, C2), the subject
 * changing mid-conversation (D), no label covering another (K), stopping, failing and settings (E), the real `sample`
 * adapter (G) and the phone (H).
 *
 * Switches (all optional):
 *   E2E_SUITE=smoke  (or --smoke) the quick pass: only the scenarios marked `guard.smoke` (a few minutes in all);
 *   E2E_ONLY=A3,K    runs only those groups (the code before the first "." of a heading) while working on them;
 *   E2E_MOTION=full  animate the camera and the panels everywhere. By default every page asks for reduced motion (a
 *                    camera move is then instant, which removes most of the waiting); the scenarios about the
 *                    animation itself open their page with `animated: true`;
 *   E2E_SHOTS=1      also writes the screenshots (ai-*.png) and a Turkish report (AI-RAPOR.md) to docs/verification/;
 *   E2E_TIMES=1      prints how long every scenario took (the sections' totals are always printed);
 *   E2E_VERBOSE=1    prints the whole error of a scenario that stopped;
 *   E2E_URL          reuses a server that is already running.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'verification');
const PORT = Number(process.env.E2E_PORT ?? 4174);
const SHOTS = process.env.E2E_SHOTS === '1';
const SMOKE = process.env.E2E_SUITE === 'smoke' || process.argv.includes('--smoke');
const MOTION = process.env.E2E_MOTION === 'full' ? 'no-preference' : 'reduce';
const T_START = Date.now();
if (SHOTS) mkdirSync(OUT, { recursive: true });

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
const guardTimes = [];
async function guard(run, { smoke = false } = {}) {
  // E2E_ONLY=A3,K runs just those scenarios (while working on them); scenarios that lean on an earlier one then fail.
  if (ONLY && !ONLY.includes(currentSection.split('.')[0])) return;
  // E2E_SUITE=smoke runs only the scenarios marked with guard.smoke(…)
  if (SMOKE && !smoke) return;
  const t0 = Date.now();
  const first = results.length;
  try {
    await run();
  } catch (err) {
    if (process.env.E2E_VERBOSE) console.log(err.stack ?? err.message);
    check(
      `${currentSection.split(':')[0]}: senaryo beklenmedik biçimde durdu`,
      false,
      String(err.message).split('\n')[0],
    );
  }
  guardTimes.push({
    section: currentSection,
    ms: Date.now() - t0,
    checks: results.length - first,
    first: results[first]?.name ?? '',
  });
}
/** A scenario that belongs to the quick pass (E2E_SUITE=smoke) as well as to the full run. */
guard.smoke = (run) => guard(run, { smoke: true });

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

/**
 * The border rows are given to the map in a window of years around the shown year (about ±10), so after a long step in time
 * the header says "· yükleniyor…" for a moment. Settled = the shown year's rows are on the map (`bordersReady`) and that note is
 * gone, polled for up to `timeout` ms (software GL is slow). It never throws: the scenario that needs the borders checks `ok`.
 */
async function bordersSettled(page, timeout = 15000) {
  const t0 = Date.now();
  // a change of year reaches the map on a later frame: look only after it has
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      ),
  );
  let ok = true;
  try {
    await page.waitForFunction(
      () => window.__ayni.bordersReady() && !document.querySelector('[data-testid=borders-loading]'),
      null,
      { timeout },
    );
  } catch {
    ok = false;
  }
  return { ok, ms: Date.now() - t0 };
}

/** A fresh page with the app loaded (the hash may already describe a range and a place). */
async function open(
  hash = '#t=1939-1945',
  { viewport = { width: 1440, height: 900 }, init, initArg, mobile = false, animated = false } = {},
) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: animated ? 'no-preference' : MOTION,
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
  // the first year's borders are on the map and the header is not stuck on "yükleniyor…" (scenario S and L look at this)
  page.bordersAtBoot = await bordersSettled(page);
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
    wars: document.querySelectorAll('.ai-layer .ai-war').length,
    flags: [...document.querySelectorAll('.ai-layer .ai-flag')].filter((e) => !e.hidden).map((e) => e.textContent),
    marks: document.querySelectorAll('.ai-layer .ai-pt').length,
    hidden: document.querySelector('.ai-layer')?.hidden ?? true,
  }));
/** The spotlight: the veil over the rest of the map, the polities lit, the names faded and lit. */
const spotlight = (page) =>
  page.evaluate(() => {
    const m = window.__ayni.map;
    let ids = [];
    try {
      ids = m.getFilter('ai-fill')[3][2][1].filter((x) => x !== '\u0000none');
    } catch {
      /* no layer yet */
    }
    const names = [...document.querySelectorAll('.plabel:not(.is-hidden)')];
    return {
      veil: Number(m.getPaintProperty('ai-veil', 'background-opacity')),
      solid: m.getPaintProperty('ai-fill', 'fill-opacity'),
      ids,
      faded: names.filter((e) => e.classList.contains('is-faded')).length,
      lit: names.filter((e) => e.classList.contains('is-ai')).length,
      unfaded: names.filter((e) => !e.classList.contains('is-faded') && !e.classList.contains('is-ai')).length,
      hatch: !!m.getLayer('ai-hatch'),
    };
  });
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

/** A screenshot for the report: taken only when the run was asked for them (E2E_SHOTS=1). */
const shot = (page, name, full = false) =>
  SHOTS ? page.screenshot({ path: join(OUT, name), fullPage: full }) : undefined;

/**
 * True when `fn` (run in the page) holds within `timeout` ms. For what the page draws a frame or two after its state has changed
 * (a conversation divider in the reader, say), which takes longer when the machine is busy: a fixed wait would be a coin toss.
 */
const eventually = (page, fn, arg, timeout = 5000) =>
  page.waitForFunction(fn, arg, { timeout }).then(
    () => true,
    () => false,
  );

const markerIds = (page) => page.evaluate(() => window.__ayni.visibleMarkerIds());
const mapMoving = (page) => page.evaluate(() => window.__ayni.map.isMoving());

/** Waits until a camera move the page started has ended. */
async function cameraRests(page, timeout = 8000) {
  await page.waitForTimeout(120);
  await page.waitForFunction(() => !window.__ayni.map.isMoving(), null, { timeout });
  await page.waitForTimeout(150);
}

/** Goes to a step through its point on the ruler (the narration's progress bar), and waits until the camera has come to rest. */
async function showStep(page, n) {
  await page.click(`[data-testid=ruler-step][data-n="${n}"]`);
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
  let ids = [];
  try {
    ids = map.getFilter('ai-line')[3][2][1].filter((x) => x !== '\u0000none');
  } catch {
    /* no layer yet */
  }
  // What the step shows comes in two kinds. What it names (the events, the model's own marks, the ends of its own lines) is a
  // handful of points: every one must be in view. A polity is a whole box (its four corners). The map's own limits (±179.9°,
  // −60°…82°) cut a box that reaches the antimeridian or the Arctic (the Soviet Union ends at 180°, Greenland at 83.6°N), and
  // when the camera cannot step back any further (the world already fills the map's width: a step that lights the Soviet Union
  // and the United States together) a box that does not fit is cut wherever the camera puts it: there the corners are not
  // asked for, but every lit polity must still be mostly in view (`boxShare`).
  const strict = [];
  const corners = [];
  const boxes = [];
  for (const id of ids) {
    const b = r.boundsAt(id, year);
    if (!b) continue;
    corners.push([b[0], b[1]], [b[2], b[3]], [b[0], b[3]], [b[2], b[1]]);
    boxes.push(b);
  }
  if (d) {
    for (const m of d.marks) strict.push([m.point.lon, m.point.lat]);
    for (const id of d.events) {
      const e = data.eventsById.get(id);
      strict.push([e.location.lon, e.location.lat]);
    }
    for (const l of d.links) {
      for (const id of [l.from, l.to]) {
        const a = r.anchorAt(id, year);
        if (a) strict.push([a.lon, a.lat]);
      }
    }
  }
  const SLACK = 2; // px: a fraction of a pixel at the edge of the map is not a cut
  const limit = ([lon, lat]) => [Math.min(179.9, Math.max(-179.9, lon)), Math.min(82, Math.max(-60, lat))];
  const at = (pt) => map.project(limit(pt));
  const widest = map.getZoom() <= Math.max(map.getMinZoom(), Math.log2(map.getCanvas().clientWidth / 511.7)) + 0.03;
  const asked = widest ? strict : [...strict, ...corners];
  const outside = asked.filter((pt) => {
    const p = at(pt);
    return !(p.x >= -SLACK && p.y >= -SLACK && p.x <= box.width + SLACK && p.y <= box.height + SLACK);
  }).length;
  // the foot of the screen (the caption, and the question box): the step is shown above it
  const foot = document.querySelector('#bottom').getBoundingClientRect();
  const belowFoot = asked.filter((pt) => box.top + at(pt).y > foot.top).length;
  const warEnds = [...document.querySelectorAll('.ai-layer .ai-war .end')].map((e) => e.getBoundingClientRect());
  const warOutside = warEnds.filter(
    (e) => e.left < box.left || e.right > box.right || e.top < box.top || e.bottom > foot.top,
  ).length;
  // what the step puts on the map must not end up under the cards, the caption, the question box or the reader
  const overs = [
    ...document.querySelectorAll(
      '.map-zoom, .legend, .map-stats:not([hidden]), [data-avoid]:not(.foot-guard):not([hidden])',
    ),
  ]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  const covered = asked.filter((pt) => {
    const p = at(pt);
    const x = box.left + p.x;
    const y = box.top + p.y;
    return overs.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  }).length;
  // how much of each lit polity's box is in view, above the foot (the least of them)
  const share = (b) => {
    const a = map.project([Math.max(-179.9, b[0]), Math.min(82, b[3])]);
    const c = map.project([Math.min(179.9, b[2]), Math.max(-60, b[1])]);
    const whole = (c.x - a.x) * (c.y - a.y);
    const seen =
      Math.max(0, Math.min(c.x, box.width) - Math.max(a.x, 0)) *
      Math.max(0, Math.min(c.y, foot.top - box.top) - Math.max(a.y, 0));
    return whole > 0 ? seen / whole : 1;
  };
  const boxShare = boxes.length ? Math.min(...boxes.map(share)) : 1;
  const c = map.getCenter();
  return {
    ids,
    links: [...document.querySelectorAll('.ai-layer .ai-link')].map((e) => e.dataset.relation),
    wars: document.querySelectorAll('.ai-layer .ai-war').length,
    flags: [...document.querySelectorAll('.ai-layer .ai-flag')].filter((e) => !e.hidden).map((e) => e.textContent),
    eventFlags: [...document.querySelectorAll('.ai-layer .ai-flag.is-event')]
      .filter((e) => !e.hidden)
      .map((e) => e.dataset.event),
    diamonds: document.querySelectorAll('.ai-layer .ai-pt').length,
    markers: window.__ayni.visibleMarkerIds(),
    year: document.querySelector('[data-testid=title-year]')?.textContent,
    camera: { lng: c.lng, lat: c.lat, zoom: map.getZoom() },
    targets: strict.length + corners.length,
    outside,
    belowFoot,
    warOutside,
    covered,
    widest,
    boxShare,
  };
};
const mapState = (page) => page.evaluate(MAP_STATE);

/**
 * What Watch shows of an answer that is ONE step (the answer to a plain question): its parts, the controls for stepping it must not
 * have, and the text behind it. "Devamını oku" is always in the page for such an answer (the box keeps its height) and is
 * invisible until the text has more than the caption, so what counts is whether it is shown, not whether it is there.
 */
const ONE_STEP = () => {
  const q = (s) => document.querySelector(s);
  const n = (s) => document.querySelectorAll(s).length;
  const rect = (e) => (e ? e.getBoundingClientRect().toJSON() : null);
  const watch = q('[data-testid=watch]');
  const more = q('[data-testid=watch-more]');
  const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
  const p = window.__ayni.ai.presentation;
  return {
    steps: watch?.dataset.steps ?? null,
    title: q('[data-testid=watch-title]')?.textContent ?? null,
    caption: q('[data-testid=watch-caption]')?.innerText ?? null,
    refs: [...document.querySelectorAll('[data-testid=watch-caption] button.evt-ref')].map((b) => b.dataset.event),
    more: more
      ? {
          text: more.textContent.trim(),
          shown: getComputedStyle(more).visibility !== 'hidden' && more.getBoundingClientRect().width > 0,
        }
      : null,
    moreRect: rect(more),
    controls: ['watch-count', 'watch-prev', 'watch-next', 'watch-play', 'watch-speed', 'watch-read'].filter(
      (id) => n(`[data-testid=${id}]`) > 0,
    ),
    ruler: n('[data-testid=ruler-step]'),
    close: n('[data-testid=watch-close]'),
    captionRect: rect(q('[data-testid=watch-caption]')),
    watchRect: rect(watch),
    askRect: rect(q('[data-testid=ask]')),
    text: a.text,
    planCaption: a.plan.captionOf(1),
    planTitle: a.plan.titleOf(1),
    planEmpty: a.plan.empty,
    pres: {
      stepped: p.stepped,
      steps: p.steps.length,
      step: p.step?.n ?? null,
      hasScene: p.step?.hasScene ?? null,
      hasText: p.step?.hasText ?? null,
    },
  };
};
/**
 * Records, frame by frame, the foot of the screen (the top of the stack of the caption and the question box), the height of the
 * caption box (and of the caption itself) and whether "Devamını oku" is shown. The camera brings a step into view once, above that foot: the box must not
 * change its height afterwards (it did, once, when the row appeared after the camera had gone).
 */
const RECORD_FOOT = () => {
  window.__feet = [];
  const tick = () => {
    const w = document.querySelector('[data-testid=watch]');
    const c = document.querySelector('[data-testid=watch-caption]');
    const more = document.querySelector('[data-testid=watch-more]');
    window.__feet.push({
      foot: Math.round(document.querySelector('#bottom').getBoundingClientRect().top * 10) / 10,
      watch: w ? Math.round(w.getBoundingClientRect().height * 10) / 10 : null,
      cap: c ? Math.round(c.getBoundingClientRect().height * 10) / 10 : null,
      more: more ? (getComputedStyle(more).visibility === 'hidden' ? 'hidden' : 'shown') : 'none',
    });
    if (window.__feet.length < 6000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
/** The caption the page makes of a text that came without one: its first one or two sentences, as many as fit in about 220 characters. */
const firstSentences = (text, max = 220, most = 2) => {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9«“"'(])/);
  let out = '';
  for (const s of sentences.slice(0, most)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  return out;
};
/** The caption of the mock's answer to the Stalingrad question, as the reader sees it (the event's name is a link). */
const STALINGRAD_CAPTION =
  "Stalingrad Muharebesi'nde Alman 6. Ordusu kuşatılıp teslim oldu; doğu cephesinde inisiyatif Sovyetlere geçti.";

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

/** The point of the suite, and the range it opens on: Germany at war. */
const WAR = '#t=1939-1945';
/**
 * A land point in Germany (Hamburg) under which no event marker lies at any view of this suite (Berlin lies exactly under the
 * marker of Wannsee): Nazi Germany from 1939 to 1944. `AT_HAMBURG` is the same point as a link.
 */
const HAMBURG = { lon: 10.0, lat: 53.5 };
const AT_HAMBURG = `${WAR}&p=10.000,53.500`;
/** The questions the stand-in has an answer for: a relation the data has no event for, an event, a reply that is plain text. */
const AXIS_QUESTION = 'Almanya ile İtalya arasındaki ittifak neydi?';
/** London: the United Kingdom, a second place for the scenarios that change the subject. */
const LONDON = { lon: -0.13, lat: 51.5 };
const STALINGRAD_QUESTION = 'Stalingrad neden önemliydi?';
const PLAIN_QUESTION = 'Hava gücü hakkında düz metin ver.';
const JAPAN_QUESTION = 'Peki Japonya?';
/**
 * The "Germany at war" narration of the mock, step by step: what each step asks for (and so what it alone shows). The model only
 * names the events and the polities that stand out; the app lights the events' parties (so `ids` is the spotlight: the model's
 * highlights, then the parties of its events) and draws every war as one line through its marker (`wars`). `year` is the border
 * year the step shows: the earliest of its events' years; the Battle of Berlin is a 1945 event but the dataset's Nazi Germany ends
 * in 1944, so the last step shows 1944 (`Resolver.showYearOf`). Of the Battle of France's sides only Britain has borders in 1940
 * (France is German or Vichy then), so its line joins Germany and Britain.
 */
const GERMANY = [
  {
    n: 1,
    title: 'Polonya’ya saldırı',
    ids: 'nazi-germany,second-polish-republic',
    links: '',
    wars: 1,
    events: ['polonya-isgali-1939'],
    marks: 0,
    year: '1939',
  },
  {
    n: 2,
    title: 'Batıda yıldırım savaşı',
    ids: 'nazi-germany,kingdom-of-great-britain,vichy-france',
    links: '',
    wars: 1,
    events: ['fransa-muharebesi-1940', 'compiegne-ateskesi-1940'],
    marks: 0,
    year: '1940',
  },
  {
    n: 3,
    title: 'Britanya direniyor',
    ids: 'kingdom-of-great-britain,nazi-germany',
    links: '',
    wars: 1,
    events: ['britanya-muharebesi-1940'],
    marks: 0,
    year: '1940',
  },
  {
    n: 4,
    title: 'Doğuya saldırı',
    ids: 'nazi-germany,union-of-soviet-socialist-republics,republic-of-finland',
    links: '',
    wars: 2,
    events: ['barbarossa-1941', 'leningrad-kusatmasi-1941'],
    marks: 0,
    year: '1941',
  },
  {
    n: 5,
    title: 'Berlin’de verilen karar',
    ids: 'nazi-germany',
    links: '',
    wars: 0,
    events: ['wannsee-1942'],
    marks: 0,
    year: '1942',
  },
  {
    n: 6,
    title: 'Dönüm noktası: Stalingrad',
    ids: 'union-of-soviet-socialist-republics,nazi-germany,kingdom-of-great-britain,kingdom-of-egypt,kingdom-of-italy',
    links: '',
    wars: 2,
    events: ['stalingrad-1942', 'el-alamein-1942'],
    marks: 0,
    year: '1942',
  },
  {
    n: 7,
    title: 'İkinci cephe',
    ids: 'united-states-of-america,kingdom-of-great-britain,free-french,nazi-germany,union-of-soviet-socialist-republics',
    links: '',
    wars: 2,
    events: ['normandiya-1944', 'bagration-1944'],
    marks: 0,
    year: '1944',
  },
  {
    n: 8,
    title: 'Berlin ve teslim',
    ids: 'union-of-soviet-socialist-republics,nazi-germany,united-states-of-america,kingdom-of-great-britain,free-french',
    links: '',
    wars: 1,
    events: ['berlin-muharebesi-1945', 'almanya-teslimi-1945'],
    marks: 0,
    year: '1944',
  },
];
/** A caption as the reader sees it: the names of events are links, but the words are the same. */
const plainCaption = (text) => text.replace(/\[([^\]]+)\]\(olay:[A-Za-z0-9_-]+\)/g, '$1');
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const camCompare = (a, b) => ({
  moved: Math.abs(a.zoom - b.zoom) > 0.02 || Math.hypot(a.lng - b.lng, a.lat - b.lat) > 0.05,
});

/* ---- shared code of the ported groups */
// (shared code of part-jkp.mjs)
//   (none: the helpers of K and P are declared in their groups, right after the banners, as in the original)

// (shared code of part-rtf.mjs)
//   (nothing: every helper the groups R, T and F need beyond the base snapshot is defined inside its group, below its
//    section() line: eventState, evtRef* (R), timelineState, timelineChecks (T))

/* ================================================================ L. layout */
section(
  'L. Düzen: harita neredeyse tam ekran, ince zaman çizelgesi, soru kutusu hemen üstünde, küçük ve kolay kapanan bilgi kartı',
);
await guard(async () => {
  const page = await open(WAR);
  const boot = await page.evaluate(() => ({
    year: document.querySelector('[data-testid=title-year]')?.textContent,
    ready: window.__ayni.bordersReady(),
    loading: document.querySelectorAll('[data-testid=borders-loading]').length,
    range: window.__ayni.store.state.range,
    cursor: window.__ayni.store.state.cursor,
  }));
  check(
    'Açılış: aralık 1939–1945, sınır yılı (aralığın ortası) 1942; başlıkta “· yükleniyor…” yok ve 1942’nin sınırları haritada',
    boot.range.from === 1939 &&
      boot.range.to === 1945 &&
      boot.cursor === 0.5 &&
      boot.year === '1942' &&
      page.bordersAtBoot.ok &&
      boot.ready &&
      boot.loading === 0,
    `yıl ${boot.year} · sınırlar ${page.bordersAtBoot.ms} ms’de hazır`,
  );
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
  const hamburg = await pixelOf(page, HAMBURG.lon, HAMBURG.lat);
  // the point carries no event marker (Berlin lies exactly under that of Wannsee): the click is a click on the land
  const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [hamburg.x, hamburg.y]);
  check(
    'Seçilen nokta (Hamburg, 10°D 53,5°K) boş kara: üstünde olay işaretçisi ya da başka bir öğe yok, yalnızca harita tuvali',
    under === 'CANVAS',
    String(under),
  );
  await page.mouse.click(hamburg.x, hamburg.y);
  await settle(page, 500);
  const ref1 = await pixelOf(page, 10, 45);
  const card = await rectOf(page, '.card-host');
  check(
    'Yer seçilince küçük kart sağda açılır (Nazi Almanyası); harita yerinden oynamaz',
    (await text(page, '[data-testid=place-title]')) === 'Nazi Almanyası' &&
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
  const mapBox = await rectOf(page, '#map');
  check(
    'Kart kısa tutuluyor: ayrıntılar ve “aynı sırada, başka yerlerde” listesi kapalı bölümlerde; özet en çok ~7 satır (180 px), kartın tamamı haritanın %60’ından az',
    fold.more &&
      fold.moreOpen === false &&
      fold.elsewhere === false &&
      fold.sum < 180 &&
      card.height < mapBox.height * 0.6,
    `özet ${Math.round(fold.sum)} px · kart ${Math.round(card.height)} px`,
  );
  await page.click('[data-testid=elsewhere] summary');
  await settle(page, 200);
  const rowsN = await count(page, '[data-testid=elsewhere] .row');
  const shown = await page.evaluate(() => ({
    elsewhere: window.__ayni.view().elsewhere.length,
    badge: Number(document.querySelector('[data-testid=elsewhere] .count')?.textContent),
  }));
  check(
    'Kapalı liste açılınca olaylar satır satır orada (tıklanabilir): satır sayısı rozetle ve veriyle (aralığın küresel olaylarından Almanya’yı ilgilendirmeyenler) aynı',
    rowsN >= 5 && rowsN === shown.elsewhere && rowsN === shown.badge,
    `${rowsN} satır`,
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
  await page.mouse.click(hamburg.x, hamburg.y);
  await settle(page, 400);
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check('Esc de kartı kapatır', !(await visible(page, '.card-host')));

  // asking: the card steps aside by itself and the place stays
  await page.mouse.click(hamburg.x, hamburg.y);
  await settle(page, 400);
  await page.fill('[data-testid=chat-input]', AXIS_QUESTION);
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
  check('Soru yine de o yerle ilgili: bağlamda yer var', /Seçili yer: Nazi Almanyası/.test(req.last));
  await page.click('[data-testid=card-tab]');
  await settle(page, 400);
  check('Sekmeye tıklamak kartı geri getirir', await visible(page, '[data-testid=place-card]'));
  await page.click('[data-testid=watch-close]');
  await page.fill('[data-testid=chat-input]', JAPAN_QUESTION);
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

/* =========================================================== S. the window of border years */
/**
 * What the page says of the borders at a point, in three voices: the polities the MAP draws there (read back from what it has
 * rendered), the polities the app's own rows say cover that point in the shown year (point in polygon, from the data the app
 * holds), and the header. A window of years that is stale shows in the first.
 */
const SEEN = ([lon, lat]) => {
  const { map, data } = window.__ayni;
  const p = map.project([lon, lat]);
  const view = window.__ayni.view();
  const inRing = (ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const covering = new Set();
  for (const row of data.rows) {
    if (row.from > view.year || row.to < view.year) continue;
    if (lon < row.box[0] || lon > row.box[2] || lat < row.box[1] || lat > row.box[3]) continue;
    if (row.polys.some((poly) => inRing(poly[0]) && !poly.slice(1).some(inRing))) covering.add(row.id);
  }
  return {
    year: document.querySelector('[data-testid=title-year]')?.textContent,
    wanted: String(view.year),
    ready: window.__ayni.bordersReady(),
    loading: document.querySelectorAll('[data-testid=borders-loading]').length,
    drawn: [...new Set(map.queryRenderedFeatures([p.x, p.y], { layers: ['polity-fill'] }).map((f) => f.properties.id))],
    covering: [...covering],
    outline: map.queryRenderedFeatures({ layers: ['polity-selected-line'] }).length,
    filter: JSON.stringify(map.getFilter('polity-fill')),
  };
};
/** Waits until the map has drawn everything it has been given (a frame is asked for, then the map says it is idle). */
const mapIdle = (page, timeout = 15000) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const m = window.__ayni.map;
        const t = setTimeout(() => resolve(false), ms);
        m.once('idle', () => {
          clearTimeout(t);
          resolve(true);
        });
        m.triggerRepaint();
      }),
    timeout,
  );
section(
  'S. Sınırlar yıl penceresiyle gelir: açılışta ve her yıl değişiminden sonra (uzak bir aralık, yapıştırılan bir bağlantı, cetvel, art arda değişiklikler) başlıkta “· yükleniyor…” takılı kalmaz; ekrandaki sınırlar gösterilen yılındır',
);
await guard(async () => {
  // Paris: well inside its polities (a point near a border may be on one side of the exact polygon and the other of the simplified
  // one the map draws: Warsaw in 1800 is the Habsburg Monarchy for the app's rows and Prussia on the screen)
  const PARIS = [2.35, 48.86];
  const AT_PARIS = '&p=2.350,48.860';
  const page = await open(`#t=1990-1996${AT_PARIS}`);
  const seen = async () => {
    const idle = await mapIdle(page);
    return { ...(await page.evaluate(SEEN, PARIS)), idle };
  };
  /** The borders on the screen are the shown year's: right year in the header and in the map's filter, ready, nothing stuck, and the map draws exactly the polities the rows say cover the point (and the selected place's outline). */
  const right = (r) =>
    r.idle &&
    r.year === r.wanted &&
    r.ready &&
    r.loading === 0 &&
    r.filter.includes(r.wanted) &&
    r.covering.length > 0 &&
    sameSet(r.drawn, r.covering) &&
    r.outline > 0;
  let r = await seen();
  check(
    'Açılış uzak bir yılda (#t=1990-1996): sınır yılı 1993; başlıkta “· yükleniyor…” yok, harita hazır; Paris’te haritanın çizdiği devlet verinin dediği devlet, seçili yerin çizgisi çizili',
    page.bordersAtBoot.ok && r.wanted === '1993' && right(r),
    `${r.year} · çizilen ${r.drawn.join('+')} · veri ${r.covering.join('+')} · ${page.bordersAtBoot.ms} ms`,
  );

  // a long step in time (the reader drags the brush a long way): the window is fetched, the header may say so for a moment
  const took = [];
  const jump = async (label, name, action, year) => {
    await action();
    const first = await page.evaluate(() => ({
      loading: document.querySelectorAll('[data-testid=borders-loading]').length,
      ready: window.__ayni.bordersReady(),
    }));
    const t = await bordersSettled(page);
    r = await seen();
    took.push(`${name} ${t.ms} ms`);
    check(
      label,
      t.ok && right(r) && (year === null || r.wanted === year),
      `${r.year} · çizilen ${r.drawn.join('+')} · veri ${r.covering.join('+')} · ${t.ms} ms · ilk anda ${first.loading ? 'yükleniyor yazıyordu' : first.ready ? 'pencere yetti' : 'hazır değildi'}`,
    );
  };
  await jump(
    'Uzun sıçrama (1993 → 1942, aralık 1939–1945 yeniden): pencere gelir, en çok 15 sn içinde başlıkta “· yükleniyor…” kalkar, harita hazır; ekrandaki sınırlar 1942’nin (Paris Nazi Almanyası’nda)',
    'sıçrama',
    () => page.evaluate(() => window.__ayni.store.setRange({ from: 1939, to: 1945 })),
    '1942',
  );
  check('…ve haritanın çizdiği o yılın devleti Nazi Almanyası', r.drawn.includes('nazi-germany'), r.drawn.join('+'));
  await jump(
    'Pencerenin içinde yıl değiştirmek (imleç 1939’a): sınırlar 1939’un (Paris Fransa Üçüncü Cumhuriyeti’nde), başlıkta “yükleniyor…” yok',
    'imleç',
    () => page.evaluate(() => window.__ayni.store.setDisplayYear(1939)),
    '1939',
  );
  check(
    '…ve haritanın çizdiği devlet Fransa Üçüncü Cumhuriyeti',
    r.drawn.includes('french-third-republic'),
    r.drawn.join('+'),
  );
  await jump(
    'Çok daha eski bir aralığa geçmek (1900–1906, yıl 1903): pencere gelir, “yükleniyor…” kalkar; ekrandaki sınırlar 1903’ün',
    'eski aralık',
    () =>
      page.evaluate(() => {
        window.__ayni.store.setRange({ from: 1900, to: 1906 });
        window.__ayni.store.setDisplayYear(1903);
      }),
    '1903',
  );
  await shot(page, 'ai-s1-sinir-penceresi.png');
  // a pasted link (the address changed from outside): the same, for the year the link names
  await jump(
    'Yapıştırılan bağlantı (#t=1960-1966): yıl 1963; pencere gelir, başlıkta “yükleniyor…” kalmaz; ekrandaki sınırlar 1963’ün',
    'bağlantı',
    () =>
      page.evaluate((at) => {
        location.hash = `#t=1960-1966${at}`;
      }, AT_PARIS),
    '1963',
  );
  // the ruler itself: a click on the empty track recentres the range there (here 1850)
  await jump(
    'Cetvelde boş yere tıklamak aralığı oraya taşır (1850): pencere gelir, başlıkta “yükleniyor…” kalmaz; ekrandaki sınırlar gösterilen yılın',
    'cetvel',
    async () => {
      const at = await page.evaluate(() => {
        const t = document.querySelector('.ruler-track').getBoundingClientRect();
        const ext = window.__ayni.data.extent;
        return { x: t.left + ((1850 + 0.5 - ext.from) / (ext.to - ext.from + 1)) * t.width, y: t.top + t.height / 2 };
      });
      await page.mouse.click(at.x, at.y);
    },
    null,
  );
  check(
    '…ve gösterilen yıl tıklanan yılın çevresinde (1847–1853 içinde)',
    Number(r.year) >= 1847 && Number(r.year) <= 1853,
    r.year,
  );
  // changes in a rush (the reader drags): only the last year's window counts, and it is the one on the screen
  await jump(
    'Art arda hızlı değişiklikler (1810, 1860, 1910, 1960, 1985; 60 ms arayla): son yılın (1985) penceresi gelir, başlıkta “yükleniyor…” takılı kalmaz; ekrandaki sınırlar 1985’in',
    'art arda',
    () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const years = [1810, 1860, 1910, 1960, 1985];
            let i = 0;
            const next = () => {
              window.__ayni.store.setRange({ from: years[i] - 3, to: years[i] + 3 });
              window.__ayni.store.setDisplayYear(years[i]);
              if (++i < years.length) setTimeout(next, 60);
              else resolve();
            };
            next();
          }),
      ),
    '1985',
  );
  // the two ends of the data
  await jump(
    'Verinin son yılı (2000) gösterilir: pencere gelir, başlıkta “yükleniyor…” yok; ekrandaki sınırlar 2000’in',
    'son yıl',
    () => page.evaluate(() => window.__ayni.store.setRange({ from: 2000, to: 2000 })),
    '2000',
  );
  await jump(
    'İlk yıl (1800): pencere gelir; ekrandaki sınırlar 1800’ün',
    'ilk yıl',
    () => page.evaluate(() => window.__ayni.store.setRange({ from: 1800, to: 1800 })),
    '1800',
  );
  check(
    'Hiçbir değişiklikten sonra başlıkta “· yükleniyor…” takılı kalmadı (hepsi en çok 15 sn içinde yerleşti)',
    (await count(page, '[data-testid=borders-loading]')) === 0 &&
      (await page.evaluate(() => window.__ayni.bordersReady())),
    took.join(' · '),
  );
  await page.context().close();
});

/* ============================================================ A. Watch */
section(
  'A. İzle: Almanya, 1942 (kullanıcının örneği): çok adımlı anlatım adım adım ilerler; her adım yalnızca kendi çizimini gösterir; savaş olayları doğru görünür; kamera adımı izler',
);
await guard.smoke(async () => {
  const page = await open(WAR);
  const germany = await pixelOf(page, HAMBURG.lon, HAMBURG.lat);
  await page.click('[data-testid=intro-close]').catch(() => undefined);
  const markersWorld = await markerIds(page);
  await page.mouse.click(germany.x, germany.y);
  await settle(page, 500);
  const drawn = await page.evaluate(
    ([lon, lat]) => {
      const m = window.__ayni.map;
      const p = m.project([lon, lat]);
      return [...new Set(m.queryRenderedFeatures([p.x, p.y], { layers: ['polity-fill'] }).map((f) => f.properties.id))];
    },
    [HAMBURG.lon, HAMBURG.lat],
  );
  check(
    'Almanya’daki nokta seçildi: kartta ve haritanın üstündeki başlıkta Nazi Almanyası, 1942’nin sınırları (haritada o noktada çizilen devlet de o); kartta “Bu yerin tarihini anlat” ve “Soru sor” var',
    (await text(page, '[data-testid=place-title]')) === 'Nazi Almanyası' &&
      (await text(page, '[data-testid=title-main]')).trim() === 'Nazi Almanyası' &&
      (await headYear(page)) === '1942' &&
      drawn.join() === 'nazi-germany' &&
      (await visible(page, '[data-testid=place-narrate]')) &&
      (await visible(page, '[data-testid=place-ask]')),
    `${await headYear(page)} · ${drawn.join()}`,
  );
  await shot(page, 'ai-0-yer-karti.png');
  const markersBefore = await markerIds(page);
  const placeNote = (await text(page, '.map-stats').catch(() => '')).replace(/\s+/g, ' ').trim();
  const dockDots = await count(page, '.dock [data-id]');
  const timelineN = await page.evaluate(() => window.__ayni.view().places[0].timeline.length);
  check(
    'Yer seçilince dünya olayları haritadan çekilir (hiçbiri çizilmez); hiçbir şey seçili değilken ' +
      `${markersWorld.length} olay işaretçisi vardı; not: “Yer seçili · dünya olayları haritadan çekildi”; çizelge yerin olaylarıyla dolu`,
    markersWorld.length >= 5 &&
      markersBefore.length === 0 &&
      /Yer seçili.*haritadan çekildi/.test(placeNote) &&
      dockDots >= 10 &&
      dockDots === timelineN,
    `${markersWorld.length} → ${markersBefore.length} · not: “${placeNote}” · çizelgede ${dockDots} olay`,
  );
  const camBefore = await camera(page);

  await page.evaluate(RECORD_FOOT);
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
    early.status !== 'done' && early.writing && early.count === '1 / 8',
    `${early.status} · ${early.chars} karakter · ${early.count}`,
  );
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);

  check(
    'Metin bitince “Metin yazılıyor…” kalkar; adım sayısı 8; altyazılar ve başlıklar dolu',
    !(await visible(page, '[data-testid=watch-writing]')) &&
      (await count(page, '[data-testid=ruler-step]')) === 8 &&
      (await text(page, '[data-testid=watch-count]')).replace(/\s+/g, ' ').trim() === '1 / 8' &&
      (await text(page, '[data-testid=watch-title]')).length > 3 &&
      (await text(page, '[data-testid=watch-caption]')).length > 40,
  );
  const feet = (await page.evaluate(() => window.__feet)).filter((f) => f.watch !== null);
  const feetHeights = [...new Set(feet.map((f) => f.watch))];
  const feetTops = [...new Set(feet.map((f) => f.foot))];
  check(
    'Çok adımlı İzle’de “Devamını oku” satırı yok (tam metin için “Metni oku” var), adım denetimleri (önceki, sonraki, oynat, hız) görünür; kutunun yüksekliği ve ekranın dibindeki sütun, metin yazılırken ve bitince de aynı',
    (await count(page, '[data-testid=watch-more]')) === 0 &&
      (await visible(page, '[data-testid=watch][data-steps="8"]')) &&
      (await visible(page, '[data-testid=watch-read]')) &&
      (await visible(page, '[data-testid=watch-prev]')) &&
      (await visible(page, '[data-testid=watch-next]')) &&
      (await visible(page, '[data-testid=watch-play]')) &&
      (await visible(page, '[data-testid=watch-speed]')) &&
      feet.length > 0 &&
      feetHeights.length === 1 &&
      feetTops.length === 1,
    `${feet.length} kare · kutu ${feetHeights.join('/')} px · sütunun üstü ${feetTops.join('/')} px`,
  );
  const cap1 = await text(page, '[data-testid=watch-caption]');
  const plan = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return a.plan.numbers().map((n) => ({ n, caption: a.plan.captionOf(n), title: a.plan.titleOf(n) }));
  });
  check(
    'Altyazı modelin step çağrısındaki altyazıdır, bir iki cümle (en çok ~220 karakter) ve metinden kısa',
    cap1 === plainCaption(plan[0].caption) && cap1.length <= 220 && cap1.length > 40,
    `${cap1.length} karakter`,
  );
  const st0 = await page.evaluate(() => window.__ayni.store.state);
  check(
    'Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner)',
    st0.cursor === 0.5 && (await headYear(page)) === '1939',
    `başlıkta ${await headYear(page)}, imleç ${st0.cursor}`,
  );
  const markersChat = await markerIds(page);
  check(
    'Anlatım sürerken dünya olayları haritada yok (çizelgede duruyorlar); yalnızca anlatılan olay haritada',
    markersWorld.length >= 5 &&
      markersChat.join() === 'polonya-isgali-1939' &&
      (await count(page, '.dock [data-id]')) === timelineN,
    `${markersWorld.length} → ${markersBefore.length} → ${markersChat.length} işaretçi`,
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
  for (const exp of GERMANY) {
    if (exp.n !== 1) await showStep(page, exp.n);
    const state = await mapState(page);
    states[exp.n] = state;
    drawings[exp.n] = await drawing(page);
    cameras.push(state.camera);
    boxes.push(await rectOf(page, '[data-testid=watch]'));
    const expected = exp.events;
    check(
      `${exp.n}. adım yalnızca kendi çizimini gösteriyor: ${exp.ids.split(',').length} devlet öne çıkar, ${exp.wars} savaş çizgisi, ${exp.links || 'kendi çizgisi yok'}, ${expected.length} olay işareti, ${exp.marks} serbest işaret, ${exp.year}`,
      state.ids.join() === exp.ids &&
        state.links.join() === exp.links &&
        state.wars === exp.wars &&
        sameSet(state.markers, expected) &&
        state.eventFlags.length === 0 &&
        state.diamonds === exp.marks &&
        state.year === exp.year,
      `${state.ids.length} devlet · işaretçiler: ${state.markers.join(', ') || '—'} · ${state.flags.join(' | ')}`,
    );
    const spot = await spotlight(page);
    check(
      `${exp.n}. adım spot ışığı: öne çıkan ${spot.ids.length} devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü ${spot.veil}), öne çıkmayan adlar soluk, tarama yok`,
      spot.ids.join() === exp.ids &&
        spot.veil > 0.5 &&
        spot.solid === 1 &&
        spot.faded > 3 &&
        spot.lit >= 1 &&
        spot.unfaded === 0 &&
        !spot.hatch,
      `soluk ad ${spot.faded} · öne çıkan ad ${spot.lit} · soluk olmayan ${spot.unfaded}`,
    );
    const names = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.ai-layer .ai-flag.is-event, .evt-label, .evt-name').length,
      callouts: [...document.querySelectorAll('.evt')].filter((e) => getComputedStyle(e, '::after').display !== 'none')
        .length,
    }));
    check(
      `${exp.n}. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür)`,
      names.boxes === 0 && names.callouts === 0,
      `${names.boxes} kutu · ${names.callouts} açık olay adı`,
    );
    if (exp.wars > 0) {
      const unit = await page.evaluate(() => {
        const out = [];
        for (const g of document.querySelectorAll('.ai-layer .ai-war')) {
          const path = g.querySelector('path.line');
          const ring = g.querySelector('circle.ring').getBoundingClientRect();
          const ringC = { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 };
          const svg = path.ownerSVGElement.getBoundingClientRect();
          // the marker whose centre is nearest the ring
          let best = null;
          for (const e of document.querySelectorAll('.evt:not(.is-hidden) .evt-mark')) {
            const r = e.getBoundingClientRect();
            const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            const d = Math.hypot(c.x - ringC.x, c.y - ringC.y);
            if (!best || d < best.d) best = { d, c };
          }
          // how far the marker's centre is from the line itself
          let off = Infinity;
          const len = path.getTotalLength();
          for (let i = 0; i <= 200; i++) {
            const pt = path.getPointAtLength((len * i) / 200);
            off = Math.min(off, Math.hypot(svg.left + pt.x - best.c.x, svg.top + pt.y - best.c.y));
          }
          out.push({
            markerToRing: best.d,
            markerToLine: off,
            ringR: ring.width / 2,
            width: parseFloat(getComputedStyle(path).strokeWidth),
          });
        }
        return out;
      });
      check(
        `${exp.n}. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px)`,
        unit.length === exp.wars && unit.every((u) => u.markerToLine <= 2 && u.markerToRing <= 1 && u.ringR >= 10),
        unit.map((u) => `çizgi ${u.markerToLine.toFixed(1)} · halka ${u.markerToRing.toFixed(1)}`).join(' | '),
      );
    }
    const cap = await text(page, '[data-testid=watch-caption]');
    check(
      `${exp.n}. adım: altyazı, başlık ve sayaç bu adımın (“${exp.n} / 8”, “${exp.title}”)`,
      cap === plainCaption(plan[exp.n - 1].caption) &&
        (await text(page, '[data-testid=watch-count]')).replace(/\s+/g, ' ').trim() === `${exp.n} / 8` &&
        (await text(page, '[data-testid=watch-title]')) === plan[exp.n - 1].title &&
        plan[exp.n - 1].title === exp.title,
    );
    check(
      `${exp.n}. adım: kamera adımın gösterdiği her şeyi (${state.targets} nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında ${state.outside}, ekranın dibindeki sütunun altında ${state.belowFoot}, savaş çizgisi uçları dışarıda ${state.warOutside}, örtülen ${state.covered}, devlet kutularının en az görünen payı %${Math.round(state.boxShare * 100)}`,
      state.targets > 0 &&
        state.outside === 0 &&
        state.belowFoot === 0 &&
        state.warOutside === 0 &&
        state.covered === 0 &&
        state.boxShare >= 0.75,
      `merkez ${state.camera.lng.toFixed(1)}, ${state.camera.lat.toFixed(1)} · yakınlaştırma ${state.camera.zoom.toFixed(2)}${state.widest ? ' · en geniş görünüm' : ''}`,
    );
    const lap = await overlapReport(page);
    check(
      `${exp.n}. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (${lap.count} öğe)`,
      lap.clash.length === 0 && lap.out.length === 0 && lap.underControl.length === 0,
      [...lap.clash, ...lap.out, ...lap.underControl].join(' | '),
    );
    // --- a war of the Second World War shows right: its own marker, the line between its two sides, the sides lit, the year's borders
    if (exp.n === 4 || exp.n === 6 || exp.n === 8) {
      const war = await page.evaluate(
        ([id, sides]) => {
          const m = window.__ayni.map;
          const box = document.querySelector('#map').getBoundingClientRect();
          const el = document.querySelector(`.evt[data-id="${id}"]`);
          const mark = el.querySelector('.evt-mark').getBoundingClientRect();
          const c = { x: mark.left + mark.width / 2, y: mark.top + mark.height / 2 };
          // the war line whose ring lies on this event's marker, and the polity under each of its two ends (as the map draws them)
          const lines = [...document.querySelectorAll('.ai-layer .ai-war')].map((g) => {
            const ring = g.querySelector('circle.ring').getBoundingClientRect();
            const d = Math.hypot(ring.left + ring.width / 2 - c.x, ring.top + ring.height / 2 - c.y);
            const ends = [...g.querySelectorAll('circle.end')].map((e) => {
              const r = e.getBoundingClientRect();
              const x = r.left + r.width / 2 - box.left;
              const y = r.top + r.height / 2 - box.top;
              return [
                ...new Set(m.queryRenderedFeatures([x, y], { layers: ['polity-fill'] }).map((f) => f.properties.id)),
              ];
            });
            return { d, ends };
          });
          const mine = lines.sort((a, b) => a.d - b.d)[0];
          const names = [...document.querySelectorAll('.plabel.is-ai:not(.is-hidden)')].map((e) =>
            e.textContent.replace(/\s+/g, ' ').trim(),
          );
          const joins = (a, b) =>
            !!mine &&
            mine.d <= 1 &&
            mine.ends.length === 2 &&
            ((mine.ends[0].includes(a) && mine.ends[1].includes(b)) ||
              (mine.ends[0].includes(b) && mine.ends[1].includes(a)));
          return {
            there: !!el,
            tag: el.tagName,
            selected: el.classList.contains('is-selected'),
            year: el.querySelector('.evt-year')?.textContent,
            joined: sides.map(([a, b]) => joins(a, b)).some(Boolean),
            ends: mine?.ends.map((e) => e.join('+')).join(' ↔ '),
            names,
          };
        },
        {
          4: ['barbarossa-1941', [['nazi-germany', 'union-of-soviet-socialist-republics']]],
          6: ['stalingrad-1942', [['union-of-soviet-socialist-republics', 'nazi-germany']]],
          8: ['berlin-muharebesi-1945', [['union-of-soviet-socialist-republics', 'nazi-germany']]],
        }[exp.n],
      );
      const label = { 4: 'Barbarossa', 6: 'Stalingrad', 8: 'Berlin Muharebesi' }[exp.n];
      const want = { 4: '1941', 6: '1942', 8: '1945' }[exp.n];
      check(
        `${exp.n}. adım, ${label}: olayın kendi işareti haritada (düğme, yılı ${want}, seçili değil: yalnızca anlatılan olay), çizgisi iki tarafı (Sovyetler Birliği ile Nazi Almanyası) birleştiriyor: uçları o iki devletin içinde`,
        war.there && war.tag === 'BUTTON' && war.year === want && !war.selected && war.joined,
        `${war.year} · ${war.ends}`,
      );
    }
    if (exp.n === 4) {
      const lit = await page.evaluate(() =>
        [...document.querySelectorAll('.plabel.is-ai:not(.is-hidden)')].map((e) =>
          e.textContent.replace(/\s+/g, ' ').trim(),
        ),
      );
      check(
        '4. adım: Sovyetler Birliği ve Nazi Almanyası öne çıkarılmış (canlı renk, adları mürekkep renginde) ve sınırlar 1941’in',
        lit.some((n) => /Sovyetler Birliği/i.test(n)) &&
          lit.some((n) => /Nazi Almanyası/i.test(n)) &&
          state.ids.includes('nazi-germany') &&
          state.ids.includes('union-of-soviet-socialist-republics') &&
          state.year === '1941',
        lit.join(' | '),
      );
    }
    if (exp.n === 6) {
      const alamein = await page.evaluate(() => {
        const el = document.querySelector('.evt[data-id="el-alamein-1942"]');
        return {
          there: !!el,
          year: el?.querySelector('.evt-year')?.textContent,
          selected: el?.classList.contains('is-selected'),
        };
      });
      check(
        '6. adım, El Alamein: Stalingrad’ın yanında El Alamein de kendi işaretiyle (1942, seçili değil); iki olay iki savaş çizgisi; sınırlar 1942’nin',
        alamein.there && alamein.year === '1942' && !alamein.selected && state.wars === 2 && state.year === '1942',
        `${alamein.year}`,
      );
    }
    if (exp.n === 8) {
      const end = await page.evaluate(() => {
        const r = window.__ayni.ai.session.resolver;
        const year = (id) => document.querySelector(`.evt[data-id="${id}"] .evt-year`)?.textContent;
        return {
          germany1944: !!r.rowAt('nazi-germany', 1944),
          germany1945: !!r.rowAt('nazi-germany', 1945),
          soviet1945: !!r.rowAt('union-of-soviet-socialist-republics', 1945),
          berlin: year('berlin-muharebesi-1945'),
          surrender: year('almanya-teslimi-1945'),
          drawing: window.__ayni.ai.director.drawing?.year,
        };
      });
      check(
        '8. adım, Berlin 1945: iki olay 1945’in olayı (işaret yılları 1945) ama veri setindeki Nazi Almanyası 1944’te biter (1945’te sınırı yok), bu yüzden sınır yılı 1944’e döner (başlıkta 1944); savaşın iki tarafı da 1944’te var',
        end.berlin === '1945' &&
          end.surrender === '1945' &&
          end.germany1944 &&
          !end.germany1945 &&
          end.soviet1945 &&
          end.drawing === 1944 &&
          state.year === '1944',
        `işaretler ${end.berlin}, ${end.surrender} · sınır yılı ${state.year}`,
      );
    }
    if (exp.n === 1) await shot(page, 'ai-1a-anlatim-adim1.png');
    if (exp.n === 2) await shot(page, 'ai-1b-anlatim-adim2.png');
    if (exp.n === 3) await shot(page, 'ai-1d-anlatim-adim3.png');
    if (exp.n === 4) await shot(page, 'ai-1e-anlatim-adim4.png');
    if (exp.n === 6) await shot(page, 'ai-1c-anlatim-adim6.png');
    if (exp.n === 8) await shot(page, 'ai-1g-anlatim-adim8.png');
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
    changes >= 4,
    `${changes}/7 geçişte oynadı`,
  );

  // --- going back to any earlier step brings exactly that step's drawings back, and nothing of the others
  let exact = true;
  const diffs = [];
  for (const n of [4, 2, 7, 3, 8, 5, 6, 1]) {
    await showStep(page, n);
    const again = await mapState(page);
    const before = states[n];
    const same =
      JSON.stringify(await drawing(page)) === JSON.stringify(drawings[n]) &&
      again.ids.join() === before.ids.join() &&
      again.links.join() === before.links.join() &&
      again.wars === before.wars &&
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
    'Önceki adımlara dönmek (4, 2, 7, 3, 8, 5, 6, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor',
    exact,
    diffs.length ? `farklı: ${diffs.join(',')}` : '',
  );

  // --- the reader takes the time cursor: the AI's year steps aside until the next step
  await page.evaluate(() => window.__ayni.store.setDisplayYear(1943));
  await settle(page, 500);
  const ownYear = await headYear(page);
  await showStep(page, 3);
  check(
    'Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor',
    ownYear === '1943' && (await headYear(page)) === '1940',
    `${ownYear} → ${await headYear(page)}`,
  );

  // --- closing the answer gives the map, the markers and the card back
  await page.click('[data-testid=watch-close]');
  await settle(page, 700);
  const markersClosed = await markerIds(page);
  check(
    'Anlatımı kapatmak (✕) yapay zekâ çizimini ve spot ışığını kaldırır; yer hâlâ seçili olduğundan dünya olayları dönmez; kart geri gelir',
    (await aiDom(page)).hidden &&
      (await aiIds(page)).length === 0 &&
      (await spotlight(page)).veil === 0 &&
      markersClosed.length === 0 &&
      (await visible(page, '[data-testid=place-card]')) &&
      !(await visible(page, '[data-testid=watch]')),
    `${markersWorld.length} → ${markersChat.length} → ${markersClosed.length}`,
  );
  check(
    'Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)',
    (await headYear(page)) === '1943',
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
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 1800);
  const p0 = await pres(page);
  check(
    'Otomatik oynatma isteğe bağlı: kendiliğinden başlamaz (yanıt bittikten sonra da 1. adımda, oynatma kapalı)',
    p0.stepped && p0.steps === 8 && p0.step === 1 && !p0.playing && p0.view === 'watch',
    `adım ${p0.step}/${p0.steps} · oynatma ${p0.playing}`,
  );
  const off = (id) => page.locator(`[data-testid=${id}]`).isDisabled();
  check('1. adımda “Önceki” kapalı, “Sonraki” açık', (await off('watch-prev')) && !(await off('watch-next')));
  await page.click('[data-testid=watch-next]');
  await cameraRests(page);
  check(
    '“Sonraki” 2. adıma geçirir: sayaç “2 / 8”, harita 2. adımın çizimi (Nazi Almanyası, Birleşik Krallık ve Vichy Fransası, Fransa Muharebesi’nin savaş çizgisi); “Önceki” açıldı',
    (await stepNow(page)) === 2 &&
      (await countText(page)) === '2 / 8' &&
      (await idsNow(page)) === GERMANY[1].ids &&
      !(await off('watch-prev')),
  );
  await page.click('[data-testid=watch-prev]');
  await cameraRests(page);
  check(
    '“Önceki” 1. adıma döndürür ve kendini yeniden kapatır',
    (await stepNow(page)) === 1 && (await countText(page)) === '1 / 8' && (await off('watch-prev')),
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
    kEnd.step === 8 && kEnd.ids === GERMANY[7].ids && kEnd.next && kHome.step === 1 && kHome.ids === GERMANY[0].ids,
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
    focusedCanvas && sameCamera(camEnd, await camera(page)) && (await stepNow(page)) === 8,
    `harita odakta: ${focusedCanvas}`,
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await key('Home');

  // --- the whole narration step by step: "Sonraki" from 1 to 8, then the arrow keys back from 8 to 1. Each step has its own
  // counter, title, caption, drawing and border year, and the buttons give out at the two ends.
  const planNow = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return a.plan.numbers().map((n) => ({ caption: a.plan.captionOf(n), title: a.plan.titleOf(n) }));
  });
  const here = async () => ({
    step: await stepNow(page),
    count: await countText(page),
    title: await text(page, '[data-testid=watch-title]'),
    caption: await text(page, '[data-testid=watch-caption]'),
    ids: await idsNow(page),
    year: await headYear(page),
    prev: !(await off('watch-prev')),
    next: !(await off('watch-next')),
  });
  const rightOf = (h, n) => {
    const [canPrev, canNext] = [n > 1, n < 8];
    return (
      h.step === n &&
      h.count === `${n} / 8` &&
      h.title === GERMANY[n - 1].title &&
      h.caption === plainCaption(planNow[n - 1].caption) &&
      h.ids === GERMANY[n - 1].ids &&
      h.year === GERMANY[n - 1].year &&
      h.prev === canPrev &&
      h.next === canNext
    );
  };
  const forward = [await here()];
  for (let n = 2; n <= 8; n++) {
    await page.click('[data-testid=watch-next]');
    await cameraRests(page);
    forward.push(await here());
  }
  check(
    '“Sonraki” ile 1’den 8’e: her adımda sayaç, başlık, altyazı, harita çizimi ve sınır yılı o adımın; “Önceki” yalnızca 1’de, “Sonraki” yalnızca 8’de kapalı',
    forward.every((h, i) => rightOf(h, i + 1)),
    forward.map((h) => `${h.step}:${h.year}`).join(' '),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  const backward = [await here()];
  for (let n = 7; n >= 1; n--) {
    await key('ArrowLeft');
    backward.push(await here());
  }
  check(
    '← ile 8’den 1’e: her adımda yine o adımın sayacı, başlığı, altyazısı, çizimi ve sınır yılı',
    backward.every((h, i) => rightOf(h, 8 - i)),
    backward.map((h) => `${h.step}:${h.year}`).join(' '),
  );
  const forwardKeys = [];
  for (let n = 2; n <= 8; n++) {
    await key('ArrowRight');
    forwardKeys.push(await here());
  }
  check(
    '→ ile 1’den 8’e de aynı: her adım kendi altyazısı ve çiziminde; sonda → bir şey yapmaz',
    forwardKeys.every((h, i) => rightOf(h, i + 2)) && (await stepNow(page)) === 8,
    forwardKeys.map((h) => `${h.step}`).join(' '),
  );
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
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        want: track.left + ((years[n - 1] + 0.5 - ext.from) / span) * track.width,
        year: /· (\d{4})$/.exec(e.title)?.[1],
      };
    });
    const run = document.querySelector('.ruler-run')?.getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const label = document.querySelector('.brush-label');
    return {
      pts,
      run: run ? { left: run.left, right: run.right } : null,
      dock: dock.toJSON(),
      track: track.toJSON(),
      label: label ? getComputedStyle(label).display : 'yok',
      labelRect: label ? label.getBoundingClientRect().toJSON() : null,
    };
  });
  const gaps = bar.pts.slice(1).map((p, i) => p.cx - bar.pts[i].cx);
  check(
    'Çizelge ilerleme çubuğu: 8 adımın 8 noktası, 1’den 8’e soldan sağa, tarihleriyle (1939, 1940, 1940, 1941, 1942, 1942, 1944, 1944)',
    bar.pts.length === 8 &&
      bar.pts.every((p, i) => p.label === String(i + 1) && p.year === GERMANY[i].year) &&
      gaps.every((g) => g > 0),
    bar.pts.map((p) => `${p.n}:${p.year}`).join(' '),
  );
  const touching = [];
  for (let i = 0; i < bar.pts.length; i++)
    for (let j = i + 1; j < bar.pts.length; j++) {
      const a = bar.pts[i];
      const b = bar.pts[j];
      if (a.left < b.right && b.left < a.right) touching.push(`${a.n}×${b.n}`);
    }
  // eight points over six years (a year is about 6 px of the ruler) cannot stand at their years: the least that keeps them 22 px apart
  // is to spread them about those years, so the points as a whole stay where their years are and none strays further than half the chain
  const shifts = bar.pts.map((p) => p.cx - p.want);
  const meanShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
  const reach = ((bar.pts.length - 1) * 22) / 2 + 3;
  check(
    'Adım noktaları birbirine değmiyor (etkin olanın büyütülmüş hâli de: merkezler en az 22 px arayla) ve yıllarının çevresinde yayılıyor: sekiz nokta altı yıla sığmaz, en az kaymayla açılırlar (ortalama kayma ≤ 4 px, hiçbiri yılından zincirin yarısından fazla uzakta değil)',
    touching.length === 0 &&
      gaps.every((g) => g >= 21.5) &&
      Math.abs(meanShift) <= 4 &&
      shifts.every((s) => Math.abs(s) <= reach),
    `en dar aralık ${Math.min(...gaps).toFixed(0)} px · kayma ${shifts.map((s) => s.toFixed(0)).join(', ')} (ortalama ${meanShift.toFixed(1)})${touching.length ? ` · değenler ${touching.join()}` : ''}`,
  );
  check(
    'Noktalar aralık yazısının üstüne binmiyor: fırçanın kendi yazısı noktalar varken gizli (aralık, cetvelin yanındaki büyük yazıda duruyor)',
    bar.label === 'none' && /\d{4}/.test(await text(page, '[data-testid=range-readout]')),
    `fırça yazısı: ${bar.label}`,
  );
  check(
    'Noktalar zaman çizelgesi bandının içinde ve band ince kalıyor (en çok 84 px)',
    bar.pts.every((p) => p.top >= bar.dock.top - 1 && p.bottom <= bar.dock.bottom + 1) && bar.dock.height <= 84,
    `${Math.round(bar.dock.height)} px`,
  );
  check(
    'İlerleme: 3. adımdayken 1–2 dolu (görüldü), 3 işaretli, 4–8 boş; çizgi birinci noktadan üçüncüye uzanıyor',
    bar.pts.map((p) => (p.on ? 'on' : p.past ? 'past' : '-')).join() === 'past,past,on,-,-,-,-,-' &&
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
    'Çizelgedeki 5 numaralı noktaya tıklamak 5. adıma götürür (altyazı “5 / 8”, harita 5. adımın çizimi, başlıkta 1942)',
    (await stepNow(page)) === 5 &&
      (await countText(page)) === '5 / 8' &&
      (await idsNow(page)) === GERMANY[4].ids &&
      (await headYear(page)) === '1942',
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
  // a slower speed measures the wait again: the time the fast speed would have taken passes and the step stays. (The speed is
  // changed at once: a caption of two lines is read in about four seconds at the fast speed, which is what the camera needs
  // to arrive and the checks to run, so a late change would find the step already gone.)
  const cap2 = await text(page, '[data-testid=watch-caption]');
  await page.selectOption('[data-testid=watch-speed]', 'slow');
  const slowAt = Date.now();
  await cameraRests(page);
  check(
    'Oynarken 2. adımın çizimi haritada; oynatma sürüyor',
    (await idsNow(page)) === GERMANY[1].ids && (await pres(page)).playing,
  );
  await settle(page, Math.max(0, dwell(cap2, 'fast') + 1500 - (Date.now() - slowAt)));
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
  await showStep(page, 7);
  await page.click('[data-testid=watch-play]');
  await page.waitForFunction(() => window.__ayni.ai.presentation.index === 7, null, {
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
    'Oynatma son adımda biter: son adımın altyazısına da süre tanır, sonra 8. adımda durur (başa dönmez); düğme yeniden “Oynat”',
    reachedLast.step === 8 &&
      reachedLast.playing &&
      end.step === 8 &&
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
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await settle(page, 400);
  await showStep(page, 1);
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
  await shot(page, 'ai-w1-izle-adim1.png');

  // --- Watch -> Read (beside the map) at step 1
  await page.click('[data-testid=watch-play]');
  check('(Hazırlık) 1. adımda otomatik oynatma açıldı', (await pres(page)).playing);
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
  check('Görünüm değişince otomatik oynatma durur (okurun iki elinden biri metinde)', !side.playing && side.step === 1);
  const t1 = await stepInText(page, 1);
  check(
    'Adım korundu: metinde 1. adım etkin, “Haritada gösteriliyor” orada ve okuma konumunda (görünür)',
    side.step === 1 &&
      t1 &&
      t1.active &&
      t1.live &&
      t1.top >= -2 &&
      t1.top < t1.height * 0.6 &&
      (await count(page, '[data-testid=chat-step][data-active="true"]')) === 1,
    t1 ? `üstten ${Math.round(t1.top)} px / ${Math.round(t1.height)}` : 'adım yok',
  );
  const sideMap = await mapState(page);
  check(
    'Arkadaki harita 1. adımın çiziminde kaldı (Almanya + Polonya, Polonya’nın işgalinin savaş çizgisi, 1939) ve panelin altında kalan bir şey yok',
    sideMap.ids.join() === GERMANY[0].ids &&
      sideMap.year === '1939' &&
      sideMap.wars === 1 &&
      sameSet(sideMap.markers, GERMANY[0].events) &&
      sideMap.outside === 0 &&
      sideMap.covered === 0 &&
      sideMap.boxShare >= 0.75,
    `görünüm dışı ${sideMap.outside}, örtülü ${sideMap.covered}`,
  );
  check(
    'Soru kutusu panelin soluna çekildi (örtüşmüyor); başlıkta yer ve aralık yazıyor',
    L1.ask.right <= L1.readPanel.left + 1 &&
      /Nazi Almanyası · 1939–1945/.test(await text(page, '[data-testid=read-subject]')),
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
  check('Oku’dayken oklar metni kaydırır, anlatımı ilerletmez (adım 1’de kaldı)', (await stepNow(page)) === 1);

  // --- ... and back to Watch: the step is kept
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  await cameraRests(page, 8000);
  const back = await pres(page);
  check(
    'Oku → İzle: 1. adım korundu (altyazı “1 / 8”), metin kapandı, harita 1. adımda',
    back.view === 'watch' &&
      back.step === 1 &&
      (await countText(page)) === '1 / 8' &&
      !(await visible(page, '[data-testid=chat]')) &&
      (await idsNow(page)) === GERMANY[0].ids,
    `${back.view} · ${back.step}`,
  );

  // --- reading moves the map: the step under the reading line is the step on the map
  await page.click('[data-testid=watch-read]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  const sc = await rectOf(page, '[data-testid=chat-scroll]');
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  let reached = 1;
  for (let i = 0; i < 16 && reached < 5; i++) {
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(220);
    reached = await stepNow(page);
  }
  await cameraRests(page, 8000);
  await settle(page, 500);
  // (a flick goes on scrolling by itself for a moment: the step is read again once the text has come to rest, before and after the map)
  const stepBefore = await stepNow(page);
  const read5 = await mapState(page);
  reached = await stepNow(page);
  check(
    'Metni kaydırdıkça okuma çizgisindeki adım haritaya gelir (aşağı kaydırarak 5. adıma ya da ötesine ulaşıldı); etkin adım tek',
    reached >= 5 &&
      stepBefore === reached &&
      read5.ids.join() === GERMANY[reached - 1].ids &&
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
    (await stepNow(page)) === keptStep && (await countText(page)) === `${keptStep} / 8`,
    `${keptStep}. adım`,
  );
  await showStep(page, 1);

  // --- the text button in the question box opens and closes the reader as well
  await page.click('[data-testid=read-toggle]');
  await settle(page, 500);
  const viaToggle = await pres(page);
  check(
    'Soru kutusundaki metin düğmesi okuyucuyu açar (basılı), bir daha basınca kapatır ve İzle’ye döner; adım korunur',
    viaToggle.view === 'read' &&
      viaToggle.step === 1 &&
      (await page.getAttribute('[data-testid=read-toggle]', 'aria-pressed')) === 'true',
  );
  await page.click('[data-testid=read-toggle]');
  await settle(page, 400);
  check('…kapatınca İzle’ye döner, 1. adım', (await pres(page)).view === 'watch' && (await stepNow(page)) === 1);

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
    'Küçük harita o anki adımı gösteriyor: 1. adımın çizimi (Almanya + Polonya, 1939), tamamı pencerenin içinde (ya da pencere dünyanın en geniş görünümündeyse her devletin kutusunun çoğu) ve hiçbir şeyin altında değil',
    full.step === 1 &&
      mini.ids.join() === GERMANY[0].ids &&
      mini.year === '1939' &&
      mini.targets > 0 &&
      mini.outside === 0 &&
      mini.covered === 0 &&
      mini.boxShare >= 0.75,
    `${mini.targets} nokta · görünüm dışı ${mini.outside} · örtülü ${mini.covered} · kutu payı %${Math.round(mini.boxShare * 100)}${mini.widest ? ' · en geniş görünüm' : ''}`,
  );
  const t1full = await stepInText(page, 1);
  check(
    'Tam ekranda da adım korundu: metinde 1. adım etkin ve görünür; “Haritada gösteriliyor” orada',
    t1full && t1full.active && t1full.live && t1full.top >= -2 && t1full.top < t1full.height * 0.7,
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
    'Küçük haritada çizimin ad etiketleri yok (pencereyi kalabalıklaştırmaz; metin yanında); savaş tek parça (işaret + çizgi), serbest işaret ve kendi çizgisi yok',
    lapMini.flags === 0 &&
      lapMini.clash.length === 0 &&
      mini.diamonds === 0 &&
      mini.wars === 1 &&
      mini.links.length === 0 &&
      mini.markers.join() === 'polonya-isgali-1939',
    `${lapMini.flags} etiket · ${mini.wars} savaş · ${mini.markers.join()}`,
  );
  await shot(page, 'ai-w3-oku-tam-ekran.png');

  // --- in full screen, another step on the text is another scene in the window
  await readShowStep(page, 5);
  const mini5 = await mapState(page);
  check(
    'Metindeki 5. adımda “Haritada göster”: küçük harita 5. adımın çizimine geçer (Nazi Almanyası, Wannsee Konferansı, 1942) ve onu tam gösterir',
    (await stepNow(page)) === 5 &&
      mini5.ids.join() === GERMANY[4].ids &&
      sameSet(mini5.markers, GERMANY[4].events) &&
      mini5.year === '1942' &&
      mini5.outside === 0 &&
      mini5.covered === 0 &&
      mini5.boxShare >= 0.75,
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
    up <= 3 && miniUp.ids.join() === GERMANY[up - 1].ids && miniUp.outside === 0 && miniUp.boxShare >= 0.75,
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
      tagsBack.flags === 0 &&
      bigMap.wars === GERMANY[escStep - 1].wars &&
      sameSet(bigMap.markers, GERMANY[escStep - 1].events),
    `${expandState.step}. adım · ${bigMap.wars} savaş · işaretçi ${bigMap.markers.join() || '—'} · ${tagsBack.flags} ad kutusu`,
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
  await ask(page, JAPAN_QUESTION);
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
    'Okurken soru: yanıt metne eklendi, okuyucu açık kaldı (yan panel); yeni yanıt tek adımlı (adım sayacı, oynatma yok)',
    qSide.view === 'read' &&
      qSide.read === 'side' &&
      !qSide.stepped &&
      lastAnswer.n === answersBefore + 1 &&
      /Japonya/.test(lastAnswer.text) &&
      lastAnswer.top < lastAnswer.h &&
      lastAnswer.bottom > 0,
    `${lastAnswer.n} yanıt`,
  );
  check(
    'Arkadaki harita yeni soruya geçti (yerin devleti Nazi Almanyası öne çıkar, yerin noktası serbest işaretle ve adıyla; yanıt olay da yıl da vermediği için okurun kendi yılı, 1942) ve çizim paneli ile soru kutusunun dışında',
    qMap.ids.join() === 'nazi-germany' &&
      qMap.diamonds === 1 &&
      qMap.flags.includes('Nazi Almanyası') &&
      qMap.markers.length === 0 &&
      qMap.year === '1942' &&
      qMap.outside === 0 &&
      qMap.covered === 0 &&
      qMap.boxShare >= 0.75,
    `${qMap.ids.join('+')} · ${qMap.year}`,
  );
  await shot(page, 'ai-w4-oku-sirasinda-soru.png');
  // the same in full screen, in the little map
  await page.click('[data-testid=read-size]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  // (another place, so that the new answer's scene is not the one the map already shows: London, the United Kingdom)
  await page.evaluate((pt) => window.__ayni.store.selectPlace(pt), LONDON);
  await settle(page, 500);
  await ask(page, JAPAN_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 500);
  const qFull = await pres(page);
  const qMini = await mapState(page);
  check(
    'Tam ekranda okurken soru: küçük harita yeni yanıtın sahnesine geçer (yeni yerin devleti Birleşik Krallık ve serbest işareti; adı kutusu yok; görünür, örtülü değil); okuyucu açık',
    qFull.view === 'read' &&
      qFull.read === 'full' &&
      !qFull.stepped &&
      qMini.ids.join() === 'kingdom-of-great-britain' &&
      qMini.diamonds === 1 &&
      qMini.flags.length === 0 &&
      qMini.outside === 0 &&
      qMini.covered === 0 &&
      qMini.boxShare >= 0.75,
    `${qMini.ids.join('+') || '—'} · işaret ${qMini.diamonds} · kutu payı %${Math.round(qMini.boxShare * 100)}`,
  );
  await page.click('[data-testid=mini-expand]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  check(
    'İzle’ye dönünce son yanıt tek adımlı: altyazısı haritanın üstünde, “Devamını oku” altında; adım sayacı yok',
    (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await visible(page, '[data-testid=watch-more]')) &&
      !(await visible(page, '[data-testid=watch-count]')),
  );
  await page.context().close();
});
/* ======================================== A2. following starts from the first step */
section('A2. Anlatımdan önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır');
await guard(async () => {
  const page = await open(AT_HAMBURG);
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
  await showStep(page, 4);
  const second = await mapState(page);
  const inView = await page.evaluate(() => {
    const m = window.__ayni.map;
    const box = document.querySelector('#map').getBoundingClientRect();
    return [
      [13.4, 52.52],
      [37.62, 55.75],
    ].every(([lon, lat]) => {
      const p = m.project([lon, lat]);
      return p.x > 0 && p.y > 0 && p.x < box.width && p.y < box.height;
    });
  });
  check(
    '4. adım: harita iki devleti de görünür kılıyor (Almanya’nın başkenti Berlin ve Sovyetler Birliği’nin başkenti Moskova)',
    inView && second.outside === 0,
    `yakınlaştırma ${first.camera.zoom.toFixed(2)} → ${second.camera.zoom.toFixed(2)}`,
  );
  await page.context().close();
});

/* ============================================== A3. "Harita takibi" and the question */
section('A3. Harita takibi: küçük hareketler kapatmaz, büyük hareketten sonra küçük bir soru çıkar');
await guard(async () => {
  const page = await open(AT_HAMBURG);
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
  await page.click('[data-testid=ruler-step][data-n="4"]');
  await settle(page, 2500);
  const afterFree = await mapState(page);
  check(
    'Takip kapalıyken adım değişince çizim değişir ama kamera oynamaz (okurla savaşmaz)',
    sameCamera(camFree, afterFree.camera) && afterFree.ids.join() === GERMANY[3].ids && afterFree.year === '1941',
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

  // a far drag while following asks again; "İzlemeye devam" settles it for the conversation. (At the widest views the world is hardly
  // wider than the map, which meets its limit (±179.9°) before a drag of a third of its size is through; the page is zoomed in first, by
  // a program, which it takes for its own move)
  await page.evaluate(() => window.__ayni.map.jumpTo({ zoom: window.__ayni.map.getZoom() + 1.5 }));
  await settle(page, 700);
  const camBeforeFar = await camera(page);
  await dragMap(page, 380, 120);
  const camAfterFar = await camera(page);
  check(
    'Haritanın üçte biri kadar sürüklemek (önemli hareket) soruyu yeniden getirir',
    (await asking(page)) && (await following(page)),
    `kamera ${camBeforeFar.lng.toFixed(1)}, ${camBeforeFar.lat.toFixed(1)}, ${camBeforeFar.zoom.toFixed(2)} → ${camAfterFar.lng.toFixed(1)}, ${camAfterFar.lat.toFixed(1)}, ${camAfterFar.zoom.toFixed(2)} · takip ${await following(page)} · soru ${await asking(page)}`,
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
    reframed.outside === 0 && reframed.ids.join() === GERMANY[4].ids,
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
  await page.click('[data-testid=chat-new]');
  await settle(page, 400);
  check('Yeni sohbet takibi yeniden açar', await following(page));
  await page.context().close();
});

section('A4. Soru zaman aşımına uğrar ve “Geri aç” çalışır');
await guard(async () => {
  const page = await open(AT_HAMBURG);
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

/* ========================================================== B. one-step answers */
section(
  'B. Her yanıtın kısa bir altyazısı ve tam bir metni var: tek şeyi soran soru tek adımlı yanıt alır (altyazı haritanın üstünde, adım denetimi yok, “Devamını oku” tam metni açar); düz metin yazan modelde de altyazı metnin tamamı değildir',
);
let qaPage;
// B1: a relation the data has no event for (the Pact of Steel): the answer is one step with a line of the model's own
await guard(async () => {
  const page = await open(WAR);
  const germany = await pixelOf(page, HAMBURG.lon, HAMBURG.lat);
  await page.mouse.click(germany.x, germany.y);
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
  await page.evaluate(RECORD_FOOT);
  await page.fill('[data-testid=chat-input]', AXIS_QUESTION);
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
  const one = await page.evaluate(ONE_STEP);
  const frames = (await page.evaluate(() => window.__feet)).filter((f) => f.watch !== null);
  const pr = await pres(page);
  check(
    'Yanıt tek adımlı: İzle’de [data-steps="1"]; adım sayacı, önceki/sonraki, oynat, hız ve “Metni oku” yok; çizelgede adım noktaları yok; kapat düğmesi var',
    one.steps === '1' &&
      one.controls.length === 0 &&
      one.ruler === 0 &&
      one.close === 1 &&
      !pr.stepped &&
      pr.steps === 1 &&
      pr.step === 1,
    `adımlı: ${pr.stepped} · olan denetimler: ${one.controls.join() || '—'}`,
  );
  check(
    'Her yanıtın altyazısı var: modelin kendi altyazısı (bir iki cümle, en çok 220 karakter), başlığı “Almanya ve İtalya” ve tam metnin (iki paragraf) çok altında; olay adı (Üçlü Pakt) bağlantı',
    one.title === 'Almanya ve İtalya' &&
      one.caption === plainCaption(one.planCaption) &&
      one.caption.length > 40 &&
      one.caption.length <= 220 &&
      one.caption.length < one.text.length * 0.4 &&
      one.refs.join() === 'uclu-pakt-1940',
    `altyazı ${one.caption.length} karakter · metin ${one.text.length} karakter`,
  );
  check(
    '“Devamını oku” altyazının hemen altında görünür (düğme, kutunun içinde)',
    !!one.more &&
      one.more.shown &&
      one.more.text === 'Devamını oku' &&
      one.moreRect.top >= one.captionRect.bottom - 1 &&
      one.moreRect.bottom <= one.watchRect.bottom + 1,
    one.more ? `${one.more.text} · ${one.more.shown ? 'görünür' : 'gizli'}` : 'yok',
  );
  const seenHidden = frames.some((f) => f.more === 'hidden');
  const seenShown = frames.some((f) => f.more === 'shown');
  const heights = [...new Set(frames.map((f) => f.watch))];
  const tops = [...new Set(frames.map((f) => f.foot))];
  check(
    'Altyazı kutusunun yüksekliği yanıt boyunca değişmez: “Devamını oku” satırı baştan yerinde (metin gelene dek görünmez, gelince görünür), ekranın dibindeki sütunun üstü hiç oynamaz (kamera sahneyi bir kez, bu sütunun üstüne sığdırır)',
    seenHidden && seenShown && heights.length === 1 && tops.length === 1,
    `${frames.length} kare · kutu ${heights.join('/')} px · sütunun üstü ${tops.join('/')} px`,
  );
  check(
    'Altyazı soru kutusunun hemen üstünde (en çok 24 px aralık) ve kutuyu örtmüyor',
    one.watchRect.bottom <= one.askRect.top && one.askRect.top - one.watchRect.bottom <= 24,
    `aralık ${Math.round(one.askRect.top - one.watchRect.bottom)} px`,
  );
  const state = await mapState(page);
  const dr = await drawing(page);
  check(
    'Haritada o yanıtın tek sahnesi: Nazi Almanyası ile İtalya ittifak çizgisiyle bağlı (“Çelik Pakt, 1939”, modelin kendi çizgisi), Üçlü Pakt’ın taraflarıyla (Japonya da) öne çıkarılmış ve işareti konmuş; adımın adını koyduğu 1939’un sınırları; serbest işaret yok',
    state.ids.join() === 'nazi-germany,kingdom-of-italy,empire-of-japan' &&
      state.links.join() === 'alliance' &&
      state.flags.includes('Çelik Pakt, 1939') &&
      state.markers.join() === 'uclu-pakt-1940' &&
      state.year === '1939' &&
      dr.marks.length === 0 &&
      dr.events.length === 1 &&
      pr.step === 1,
    `${state.ids.join('+')} · ${state.flags.join(', ')} · ${state.year}`,
  );
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.plabel.is-ai')]
      .filter((e) => !e.classList.contains('is-hidden'))
      .map((e) => e.textContent.replace(/\s+/g, ' ')),
  );
  check(
    'Öne çıkan devletlerin adları haritada mürekkep renginde, kalın (Nazi Almanyası ve İtalya Krallığı dahil)',
    labels.length >= 2 && labels.some((n) => /Nazi Almanyası/.test(n)) && labels.some((n) => /İtalya Krallığı/.test(n)),
    labels.join(' | '),
  );
  check(
    'Kamera sahnenin her şeyini (ittifakın iki ucu, Üçlü Pakt’ın işareti, devletlerin kutuları) altyazının ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında yok, örtülen yok; harita yerinden oynadı',
    state.outside === 0 &&
      state.belowFoot === 0 &&
      state.covered === 0 &&
      state.boxShare >= 0.75 &&
      camCompare(camBefore, camAfter).moved,
    `yakınlaştırma ${camBefore.zoom.toFixed(2)} → ${camAfter.zoom.toFixed(2)} · görünüm dışı ${state.outside} · altta ${state.belowFoot} · örtülü ${state.covered}`,
  );
  const lap = await overlapReport(page);
  check(
    'Etiketler birbirini, işaretçileri ve altyazıyı örtmüyor',
    lap.clash.length === 0 && lap.out.length === 0 && lap.underControl.length === 0,
    [...lap.clash, ...lap.out, ...lap.underControl].join(' | '),
  );
  const tab = await visible(page, '[data-testid=card-tab]');
  check(
    'Soru sorulunca yer kartı kenara çekildi (sekme), yer seçili kaldı',
    tab && !(await visible(page, '[data-testid=place-card]')),
  );
  await shot(page, 'ai-2-kisa-yanit.png');

  // "Devamını oku": the full text of the one step, in Read, the same words, one part, no numbers; closing returns
  await page.click('[data-testid=watch-more]');
  await settle(page, 700);
  const rd = await page.evaluate(() => {
    const ans = [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1);
    return {
      steps: ans.querySelectorAll('[data-testid=chat-step]').length,
      numbers: ans.querySelectorAll('.cs-n').length,
      live: !!ans.querySelector('[data-testid=chat-step] [data-testid=chat-step-live]'),
      text: ans.innerText,
      paras: ans.querySelectorAll('p.prose').length,
      view: window.__ayni.ai.presentation.view,
    };
  });
  check(
    '“Devamını oku” tam metni Oku’da açar: tek bölüm, numarasız (adım numarası yok); haritadaki sahne “Haritada gösteriliyor”; iki paragrafın ikisi de orada (Mihver, Çelik Pakt ve Üçlü Pakt) ve altyazıdan çok daha uzun',
    rd.view === 'read' &&
      rd.steps === 1 &&
      rd.numbers === 0 &&
      rd.live &&
      rd.paras === 2 &&
      /Roma–Berlin Mihveri/.test(rd.text) &&
      /Sistem 27 Eylül 1940/.test(rd.text) &&
      rd.text.length > one.caption.length * 3,
    `${rd.steps} bölüm · ${rd.paras} paragraf`,
  );
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  const back = await page.evaluate(ONE_STEP);
  check(
    'İzle’ye dönünce yine tek adımlı yanıt: altyazı ve “Devamını oku” yerinde, adım sayacı yok; harita aynı sahnede',
    back.steps === '1' &&
      back.controls.length === 0 &&
      !!back.more &&
      back.more.shown &&
      back.caption === one.caption &&
      (await mapState(page)).ids.join() === state.ids.join(),
  );
  qaPage = page;
});

// B2: an event of the data: the real Stalingrad answer is one step, with the one-sentence caption over the map and the long text in Read
await guard.smoke(async () => {
  const page = await open(AT_HAMBURG);
  const camBefore = await camera(page);
  await page.evaluate(RECORD_FOOT);
  await ask(page, STALINGRAD_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 500);
  const camAfter = await camera(page);
  const one = await page.evaluate(ONE_STEP);
  const frames = (await page.evaluate(() => window.__feet)).filter((f) => f.watch !== null);
  const pr = await pres(page);
  check(
    'Stalingrad sorusunun yanıtı tek adımlı: İzle’de [data-steps="1"], başlığı “Stalingrad”, altyazısı tek cümle ve olay adı (Stalingrad Muharebesi) bağlantı; adım denetimi yok',
    one.steps === '1' &&
      one.controls.length === 0 &&
      one.ruler === 0 &&
      !pr.stepped &&
      one.title === 'Stalingrad' &&
      one.caption === STALINGRAD_CAPTION &&
      one.refs.join() === 'stalingrad-1942',
    one.caption,
  );
  check(
    'Altyazı kısa (tek cümle) ve uzun metnin yerine geçmiyor: metin iki paragraf, altyazının en az dört katı; “Devamını oku” altında görünür',
    one.caption.length < 160 &&
      one.text.length > one.caption.length * 4 &&
      one.text.split(/\n\s*\n/).length === 2 &&
      !!one.more &&
      one.more.shown &&
      one.more.text === 'Devamını oku',
    `altyazı ${one.caption.length} · metin ${one.text.length} karakter`,
  );
  const heights = [...new Set(frames.map((f) => f.watch))];
  const tops = [...new Set(frames.map((f) => f.foot))];
  check(
    'Kutu yüksekliği ve ekranın dibindeki sütun yanıt boyunca değişmez (“Devamını oku” belirince kamera çerçevesi bozulmaz)',
    frames.some((f) => f.more === 'hidden') &&
      frames.some((f) => f.more === 'shown') &&
      heights.length === 1 &&
      tops.length === 1,
    `${frames.length} kare · kutu ${heights.join('/')} px · sütunun üstü ${tops.join('/')} px`,
  );
  const state = await mapState(page);
  check(
    'Haritada olayın sahnesi: Stalingrad’ın kendi işareti (1942, yalnızca o), iki tarafı (Sovyetler Birliği, Nazi Almanyası) öne çıkarılmış ve aralarında tek savaş çizgisi; modelin kendi çizgisi ve serbest işareti yok',
    state.ids.join() === 'union-of-soviet-socialist-republics,nazi-germany' &&
      state.markers.join() === 'stalingrad-1942' &&
      state.wars === 1 &&
      state.links.length === 0 &&
      state.diamonds === 0 &&
      state.eventFlags.length === 0 &&
      state.year === '1942',
    `${state.ids.join('+')} · ${state.markers.join()} · ${state.year}`,
  );
  check(
    'Kamera sahneyi altyazının ve soru kutusunun ÜSTÜNDEKİ alana sığdırdı (savaş çizgisinin uçları, işaret, iki devletin kutuları): görünüm dışında yok, altında ve örtülen yok; harita yerinden oynadı',
    state.outside === 0 &&
      state.belowFoot === 0 &&
      state.warOutside === 0 &&
      state.covered === 0 &&
      state.boxShare >= 0.75 &&
      camCompare(camBefore, camAfter).moved,
    `görünüm dışı ${state.outside} · altta ${state.belowFoot} · örtülü ${state.covered} · yakınlaştırma ${camAfter.zoom.toFixed(2)}`,
  );
  await shot(page, 'ai-2b-stalingrad-yaniti.png');
  await page.click('[data-testid=watch-more]');
  await settle(page, 700);
  const rd = await page.evaluate(() => {
    const ans = [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1);
    return {
      steps: ans.querySelectorAll('[data-testid=chat-step]').length,
      numbers: ans.querySelectorAll('.cs-n').length,
      title: ans.querySelector('[data-testid=chat-step-title]')?.textContent,
      text: ans.innerText,
      paras: ans.querySelectorAll('p.prose').length,
      refs: [...ans.querySelectorAll('button.evt-ref')].map((b) => b.dataset.event),
      view: window.__ayni.ai.presentation.view,
    };
  });
  check(
    'Oku’da uzun metin: tek bölüm (“Stalingrad”), iki paragrafın ikisi de (kuşatma ve sonuçları), olay adı bağlantı; uzun metin altyazının birkaç katı',
    rd.view === 'read' &&
      rd.steps === 1 &&
      rd.numbers === 0 &&
      rd.title === 'Stalingrad' &&
      rd.paras === 2 &&
      /Ağustos 1942’de Volga|Ağustos 1942'de Volga/.test(rd.text) &&
      /Yenilginin önemi sayılarda değil/.test(rd.text) &&
      rd.refs.join() === 'stalingrad-1942' &&
      rd.text.length > one.caption.length * 4,
    `${rd.paras} paragraf · ${rd.text.length} karakter`,
  );
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  check('Geri dönünce altyazı aynı tek cümle', (await page.evaluate(ONE_STEP)).caption === STALINGRAD_CAPTION);
  await page.context().close();
});

// B3: a model that writes plain text and nothing else (no steps, no caption, no map calls): the page makes the caption itself
await guard.smoke(async () => {
  const page = await open(AT_HAMBURG);
  await page.evaluate(RECORD_FOOT);
  await ask(page, PLAIN_QUESTION);
  await settle(page, 600);
  const one = await page.evaluate(ONE_STEP);
  const frames = (await page.evaluate(() => window.__feet)).filter((f) => f.watch !== null);
  const pr = await pres(page);
  const want = firstSentences(one.text);
  const plain = one.text.replace(/\s+/g, ' ').trim();
  check(
    'Düz metin yazan modelde de yanıt bir adım: araç çağrısı ve başlık yok (plan boş), İzle’de [data-steps="1"] ve adım denetimi yok; haritada yapay zekâ çizimi yok',
    one.planEmpty &&
      !/^#/m.test(one.text) &&
      one.steps === '1' &&
      one.controls.length === 0 &&
      one.ruler === 0 &&
      !pr.stepped &&
      pr.step === 1 &&
      one.pres.hasScene === false &&
      (await aiDom(page)).hidden &&
      (await aiIds(page)).length === 0,
    `plan boş: ${one.planEmpty} · sahne: ${one.pres.hasScene}`,
  );
  check(
    'Güvenlik ağı: sayfa altyazıyı kendisi çıkarır, metnin tamamını altyazıya koymaz: ilk bir iki cümle (en çok ~220 karakter, burada ilk cümle), metnin bir önekidir ve cümle sonunda biter; metnin yarısından kısa',
    one.caption === want &&
      one.caption.length <= 220 &&
      plain.startsWith(one.caption) &&
      /[.!?…]$/.test(one.caption) &&
      one.caption.length < one.text.length * 0.5 &&
      one.caption.length < plain.length,
    `altyazı ${one.caption.length} · metin ${one.text.length} karakter`,
  );
  // (the page makes the caption of a text with no plan from the text as it arrives, so the caption itself, and with it the box,
  // changes while it streams: what is asked here is that the rest of the box, the row of "Devamını oku" included, never changes
  // height (the box minus its caption), and that the box is settled once the answer is in)
  const rest = [...new Set(frames.map((f) => Math.round((f.watch - f.cap) * 10) / 10))];
  const settledHeights = [...new Set(frames.slice(-10).map((f) => f.watch))];
  check(
    '“Devamını oku” altyazının altında görünür (kalan metin Oku’da); kutunun altyazı dışındaki kısmı (satır dahil) yanıt boyunca aynı yükseklikte; yanıt bitince kutu yerleşik',
    !!one.more &&
      one.more.shown &&
      one.more.text === 'Devamını oku' &&
      one.moreRect.top >= one.captionRect.bottom - 1 &&
      frames.length > 0 &&
      rest.length === 1 &&
      settledHeights.length === 1,
    `${frames.length} kare · kutu ${[...new Set(frames.map((f) => f.watch))].join('/')} px · altyazı dışı ${rest.join('/')} px · satır önce ${frames.some((f) => f.more === 'hidden') ? 'gizliydi' : 'görülmedi'}`,
  );
  await shot(page, 'ai-2c-duz-metin.png');
  await page.click('[data-testid=watch-more]');
  await settle(page, 700);
  const rd = await page.evaluate(() => {
    const ans = [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1);
    return {
      steps: ans.querySelectorAll('[data-testid=chat-step]').length,
      numbers: ans.querySelectorAll('.cs-n').length,
      show: ans.querySelectorAll('[data-testid=chat-step-show], [data-testid=chat-step-live]').length,
      text: ans.innerText.replace(/\s+/g, ' ').trim(),
      paras: ans.querySelectorAll('p.prose').length,
      view: window.__ayni.ai.presentation.view,
    };
  });
  check(
    'Oku’da metnin tamamı: üç paragrafın üçü de (hava gücü, bombardıman, atom bombaları), tek bölüm, numarasız; haritada gösterecek sahne olmadığı için “Haritada göster” yok',
    rd.view === 'read' &&
      rd.steps === 1 &&
      rd.numbers === 0 &&
      rd.show === 0 &&
      rd.paras === 3 &&
      rd.text.includes(plain.slice(0, 120)) &&
      /Dresden ve Hamburg/.test(rd.text) &&
      /Hiroşima ve Nagasaki/.test(rd.text) &&
      rd.text.length >= plain.length,
    `${rd.paras} paragraf · ${rd.text.length} karakter`,
  );
  await page.click('[data-testid=read-watch]');
  await settle(page, 500);
  const again = await page.evaluate(ONE_STEP);
  check(
    'İzle’ye dönünce altyazı yine yalnızca ilk cümle ve “Devamını oku” duruyor',
    again.caption === want && !!again.more && again.more.shown,
  );
  await page.context().close();
});

/* ============================================================ C. an event */
section('C. Olay: yanıt ekrandayken çizelgeden bir olaya tıklamak, kartı sağda açar ve işaretçisini haritaya getirir');
await guard(async () => {
  const page = qaPage;
  const id = 'barbarossa-1941';
  const own = 'uclu-pakt-1940'; // what the answer on screen talks about: its own marker is on the map
  check(
    'Tıklamadan önce haritada yalnızca yanıtın anlattığı olayın işaretçisi var (Üçlü Pakt); dünya olayları çizelgede, Barbarossa da orada',
    (await markerIds(page)).join() === own && (await count(page, `.dock [data-id="${id}"]`)) >= 1,
    (await markerIds(page)).join(),
  );
  const dot = page.locator(`.dock [data-id="${id}"]`).first();
  await dot.click({ timeout: 5000 });
  await settle(page, 900);
  check(
    'Olay kartı sağda açıldı (yer kartının yerinde); tek adımlı yanıtın altyazısı ve soru kutusu yerinde',
    (await visible(page, '[data-testid=event-card]')) &&
      !(await visible(page, '[data-testid=card-tab]')) &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await visible(page, '[data-testid=ask]')),
  );
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('.marker-layer .evt.is-selected')].map((e) => e.dataset.id),
  );
  check(
    'Tıklanan olay haritaya gelir: işaretçisi vurgulu (tek seçili); yanıtın kendi olayının işaretçisi de yerinde kalır',
    sameSet(await markerIds(page), [own, id]) && selected.join() === id,
    `${(await markerIds(page)).join()} · seçili ${selected.join()}`,
  );
  const geo = await page.evaluate(() => {
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = document.querySelector('.card-host').getBoundingClientRect();
    const others = ['[data-testid=watch]', '[data-testid=ask]'].map((s) =>
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
      /Barbarossa Harekâtı/.test(await text(page, '[data-testid=chat-event-chip]')),
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
    'Kartı kapatmak yanıtı yerinde bırakır; tıklanan olayın işaretçisi haritadan çekilir (yanıtın kendi olayınınki kalır); yer kartı sekmeye döner (önceki hâli)',
    !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null &&
      (await markerIds(page)).join() === own &&
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
      (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await page.evaluate(() => window.__ayni.ai.presentation.shown)),
  );

  await dot.click({ timeout: 5000 });
  await settle(page, 500);
  check('Olay kartında “Bunu sohbette sor” düğmesi var', await visible(page, '[data-testid=event-ask]'));
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await cameraRests(page, 12000);
  await settle(page, 600);
  check(
    'Düğme olayı soruya ekledi: kart kapandı, yer kartı sekmede; yeni yanıt tek adımlı altyazı olarak ekranda, “Devamını oku” altında',
    !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=card-tab]')) &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await visible(page, '[data-testid=watch-more]')),
  );
  const req = await lastRequest(page);
  check(
    'Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)',
    req &&
      /Açık olay kartı: «Barbarossa Harekâtı» \(kimlik: barbarossa-1941\)/.test(req.last) &&
      /\nİSTEK\n.*Barbarossa Harekâtı/.test(req.last),
  );
  const state = await mapState(page);
  check(
    'Yanıtın haritası: yalnızca olay söylendi; uygulama onu kendi işaretiyle (ad kutusu yok), tarafları öne çıkarılmış ve savaş çizgisiyle çizdi; olayın yılı; serbest işaret yok',
    state.markers.join() === id &&
      state.eventFlags.length === 0 &&
      state.wars === 1 &&
      state.links.length === 0 &&
      state.diamonds === 0 &&
      state.ids.join() === 'nazi-germany,union-of-soviet-socialist-republics' &&
      state.year === '1941' &&
      state.outside === 0 &&
      state.belowFoot === 0 &&
      state.covered === 0 &&
      state.boxShare >= 0.75,
    `${state.ids.join('+')} · ${state.markers.join()} · ${state.flags.join(', ')} · ${state.year} · işaret ${state.diamonds} · görünüm dışı ${state.outside} · örtülü ${state.covered}`,
  );
  await shot(page, 'ai-3b-bunu-sor.png');
  // the question, with the event it was about, is in the text
  await page.click('[data-testid=read-toggle]');
  await settle(page, 600);
  check(
    'Metinde kullanıcı mesajının altında olay çipi var (Barbarossa Harekâtı)',
    /Barbarossa Harekâtı/.test(await text(page, '[data-testid=chat-user-event]')),
  );
  await page.click('[data-testid=read-close]');
  await settle(page, 400);
});

section('C2. Olay: yanıt yokken kart sağda açılır; “Bunu sohbette sor”; çizelgeden; Esc sırası');
await guard(async () => {
  const page = await open(AT_HAMBURG);
  // (a place is selected, so the world's events are not on the map: the event is opened from the place's timeline)
  await page.locator('.dock [data-id="barbarossa-1941"]').first().click({ timeout: 5000 });
  await settle(page, 600);
  check(
    'Yanıt yokken olay kartı sağdaki kartta açılır (altyazı, metin ya da sekme yok)',
    (await visible(page, '[data-testid=event-card]')) &&
      !(await visible(page, '[data-testid=watch]')) &&
      !(await visible(page, '[data-testid=chat]')) &&
      !(await visible(page, '[data-testid=card-tab]')),
  );
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await settle(page, 500);
  check(
    '“Bunu sohbette sor” olayı soruya ekler: yanıt haritanın üstünde (tek adımlı), olay kartı kapandı, yer kartı sekmede',
    (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      !(await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=card-tab]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null,
  );
  const dock = page.locator('.dock [data-id="wannsee-1942"]').first();
  await dock.click({ timeout: 5000 });
  await settle(page, 700);
  check(
    'Çizelgedeki noktaya tıklamak da kartı sağda açar (Wannsee Konferansı); yanıt yerinde',
    (await visible(page, '[data-testid=event-card]')) &&
      /Wannsee/.test(await text(page, '[data-testid=event-title]')) &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc önce olay kartını kapatır, yanıt ekranda kalır',
    !(await visible(page, '[data-testid=event-card]')) && (await visible(page, '[data-testid=watch][data-steps="1"]')),
  );
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check(
    'Bir daha Esc yanıtı kapatır ve yer kartı geri gelir (yer seçili kalır, harita okurun)',
    !(await visible(page, '[data-testid=watch]')) &&
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
  const moscow = await pixelOf(page, 37.62, 55.75);
  await page.mouse.click(moscow.x, moscow.y);
  await settle(page, 600);
  const dividers = await page.evaluate(() =>
    window.__ayni.ai.session.items.filter((i) => i.kind === 'context').map((i) => `${i.from} → ${i.to}`),
  );
  check(
    'Yer değişince metinde tek bir “Bağlam değişti” ayırıcısı çıkıyor',
    await eventually(page, () => document.querySelectorAll('[data-testid=chat-context-change]').length === 1),
    `${await count(page, '[data-testid=chat-context-change]')} ayırıcı · ${dividers.join(' | ')}`,
  );
  const div = await text(page, '[data-testid=chat-context-change]');
  check(
    'Ayırıcı eski ve yeni konuyu söylüyor',
    /Nazi Almanyası · 1939–1945/.test(div) && /Sovyetler Birliği · 1939–1945/.test(div),
    div.replace(/\s+/g, ' '),
  );
  check('Üst çubuk yeni yeri gösteriyor', /Sovyetler Birliği/.test(await text(page, '[data-testid=title-main]')));
  check(
    'Soru kutusu yeni yeri söylüyor',
    /Sovyetler Birliği/.test(await page.getAttribute('[data-testid=chat-input]', 'placeholder')),
    `“${await page.getAttribute('[data-testid=chat-input]', 'placeholder')}” · kutu ${await page.evaluate(() => document.querySelector('[data-testid=chat-input]').clientWidth)} px`,
  );
  check(
    'Yeni yerin kartı sağda geri geldi (seçim kartı sekmeden çıktı)',
    (await visible(page, '[data-testid=place-card]')) &&
      /Sovyetler Birliği/.test(await text(page, '[data-testid=place-title]')),
  );
  await shot(page, 'ai-4-baglam-degisti.png');

  await page.evaluate(() => window.__ayni.store.setRange({ from: 1939, to: 1941 }));
  await settle(page, 600);
  check(
    'Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)',
    (await eventually(page, () =>
      /Sovyetler Birliği · 1939–1941/.test(document.querySelector('[data-testid=chat-context-to]')?.textContent ?? ''),
    )) && (await count(page, '[data-testid=chat-context-change]')) === 1,
  );
  await page.evaluate(() => window.__ayni.store.setRange({ from: 1939, to: 1945 }));
  // back to the very place the conversation is about (the camera has moved since: the same point, not the same pixel)
  await page.evaluate(() => window.__ayni.store.selectPlace(window.__origin));
  await settle(page, 600);
  const dividers2 = await page.evaluate(() =>
    window.__ayni.ai.session.items.filter((i) => i.kind === 'context').map((i) => `${i.from} → ${i.to}`),
  );
  check(
    'Okur konuya dönerse ayırıcı kalkıyor',
    await eventually(page, () => document.querySelectorAll('[data-testid=chat-context-change]').length === 0),
    `${dividers2.length} ayırıcı · ${dividers2.join(' | ')} · yer ${await page.evaluate(() => JSON.stringify(window.__ayni.store.state.places))}`,
  );

  const r2 = await pixelOf(page, 37.62, 55.75);
  await page.mouse.click(r2.x, r2.y);
  await settle(page, 400);
  await ask(page, 'Burada o yıllarda ne oluyordu?');
  await settle(page, 400);
  const req = await lastRequest(page);
  check(
    'Model bağlamın değiştiğini söylendi (“Konu değişti”)',
    req && /Konu değişti/.test(req.last) && /Sovyetler Birliği/.test(req.last),
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
  'J. Tek anlatıcı: yer seçiliyken ya da yanıt ekrandayken dünya olayları haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir',
);
// J1: nothing selected, the AI narrates
await guard(async () => {
  const page = await open(WAR);
  await page.click('[data-testid=intro-close]').catch(() => undefined);
  const before = await markerIds(page);
  // the world's events of the range, as the page holds them (the markers are some of them: the zoom budget thins a
  // crowded map)
  const world = await page.evaluate(() => window.__ayni.view().mapEvents.map((e) => e.id));
  const note0 = await text(page, '.map-stats');
  const count0 = /(\d+)\s*\/\s*(\d+) olay haritada/.exec(note0);
  check(
    'Hiçbir şey seçili değilken dünya olayları haritada: işaretçiler (hepsi aralığın dünya olaylarından) ve “n / m olay haritada” notu',
    before.length >= 5 &&
      before.every((id) => world.includes(id)) &&
      count0 !== null &&
      Number(count0[1]) === before.length &&
      Number(count0[2]) === world.length &&
      !/gerisi/.test(note0),
    `${before.length} işaretçi, aralığın ${world.length} dünya olayından · ${note0.replace(/\s+/g, ' ')}`,
  );
  // an answer that names one event of the data leaves that event alone on the map: Stalingrad is one of the world's own
  // markers (the answer keeps it and takes the others away), the Tripartite Pact (named by the answer about the
  // alliance of Germany and Italy) is not among them (the answer brings it)
  let after = [];
  for (const [name, question] of [
    ['Stalingrad yanıtı', STALINGRAD_QUESTION],
    ['Almanya–İtalya ittifakı yanıtı', AXIS_QUESTION],
  ]) {
    await ask(page, question);
    await cameraRests(page, 12000);
    await settle(page, 600);
    const told = (await drawing(page))?.events ?? [];
    const alone = await markerIds(page);
    const note1 = await text(page, '.map-stats');
    check(
      `${name} ekrana gelince (anlatıcı yapay zekâ) dünya olayları haritadan çekilir: yalnızca yanıtın andığı olay kalır; not nedenini söyler`,
      told.length === 1 &&
        sameSet(alone, told) &&
        before.length > alone.length &&
        new RegExp(`(^|\\s)${told.length}\\s*olay haritada`).test(note1) &&
        /gerisi/.test(note1),
      `${before.length} → ${alone.length} (${alone.join()}; dünya işaretçileri arasında ${before.includes(told[0]) ? 'vardı' : 'yoktu'}) · ${note1.replace(/\s+/g, ' ')}`,
    );
    await page.click('[data-testid=watch-close]');
    await settle(page, 900);
    const note2 = await text(page, '.map-stats');
    after = await markerIds(page);
    check(
      `${name} kapatılınca (✕) dünya olayları haritaya geri gelir (kamera yanıtın çerçevesinde kaldığı için küme o görünüme göre), yapay zekâ çizimi gider, eski not döner`,
      after.length >= 5 &&
        after.every((id) => world.includes(id)) &&
        (await aiDom(page)).hidden &&
        /\/\s*\d+ olay haritada/.test(note2) &&
        !/gerisi/.test(note2),
      `${after.length} işaretçi · ${note2.replace(/\s+/g, ' ')}`,
    );
  }
  // an answer that draws nothing (a question about no place and no event) is a narrator too: nothing at all is left on
  // the map
  await ask(page, 'Bu dönemde dünyada neler oluyordu?');
  await cameraRests(page, 12000);
  await settle(page, 600);
  const none = await markerIds(page);
  const note3 = await text(page, '.map-stats');
  check(
    'Hiçbir şey çizmeyen bir yanıt da anlatıcıdır: dünya olaylarının hiçbiri haritada kalmaz, not “0 olay haritada · gerisi yanıt kapanınca döner” der',
    ((await drawing(page))?.events ?? []).length === 0 &&
      none.length === 0 &&
      /(^|\s)0\s*olay haritada/.test(note3) &&
      /gerisi/.test(note3),
    `${after.length} → ${none.length} · ${note3.replace(/\s+/g, ' ')}`,
  );
  await page.click('[data-testid=watch-close]');
  await settle(page, 900);
  check(
    'Bu yanıtı kapatmak da dünya olaylarını haritaya geri getirir',
    (await markerIds(page)).length >= 5 && (await aiDom(page)).hidden,
    `${(await markerIds(page)).length} işaretçi`,
  );
  await page.context().close();
});

// J2: a place is selected: it is the narrator, the world's events leave the map
await guard(async () => {
  const page = await open(WAR);
  await page.click('[data-testid=intro-close]').catch(() => undefined);
  const world = await markerIds(page);
  const cam0 = await camera(page);
  const hamburg = await pixelOf(page, HAMBURG.lon, HAMBURG.lat);
  await page.mouse.click(hamburg.x, hamburg.y);
  await settle(page, 700);
  const note = await text(page, '.map-stats');
  const dock = await count(page, '.dock [data-id]');
  const timelineN = await page.evaluate(() => window.__ayni.view().places[0].timeline.length);
  check(
    'Bir yer seçilince dünya olaylarının hiçbiri haritada kalmaz (anlatıcı yer); çizelge o yerin olaylarıyla dolu; not: “Yer seçili”',
    world.length >= 5 &&
      (await markerIds(page)).length === 0 &&
      (await count(page, '.marker-layer .evt:not(.is-hidden)')) === 0 &&
      dock >= 8 &&
      dock === timelineN &&
      /Yer seçili/.test(note),
    `${world.length} → 0 işaretçi · çizelgede ${dock} olay · ${note.replace(/\s+/g, ' ')}`,
  );
  await shot(page, 'ai-j2-yer-secili-olaylar-cekildi.png');
  // an event the reader opens (from the place's timeline, or the card's "elsewhere" list) is drawn: only that one
  await page.click('[data-testid=elsewhere] summary');
  await settle(page, 300);
  const row = page.locator('[data-testid=elsewhere] .row').first();
  const rowId = await row.evaluate((e) => e.dataset.id ?? e.closest('[data-id]')?.dataset.id ?? '');
  await row.click({ timeout: 5000 });
  await cameraRests(page, 8000);
  await settle(page, 900);
  const opened = await markerIds(page);
  check(
    'Kartın “başka yerlerde” listesinden ya da çizelgeden açılan olay haritaya gelir (yalnızca o), kartı açıktır',
    opened.length === 1 && (await visible(page, '[data-testid=event-card]')) && (!rowId || opened[0] === rowId),
    `${opened.join()} (${rowId})`,
  );
  await page.click('[data-testid=event-close]');
  await settle(page, 500);
  check('Olay kartı kapanınca işaretçisi haritadan yine çekilir', (await markerIds(page)).length === 0);

  // an event of the place that is not among the world's (a local one, importance 2) is brought to the map the same way:
  // it is drawn because it is open, whatever the world's set holds
  const local = await page.evaluate(() => {
    const v = window.__ayni.view();
    const worldIds = new Set(v.mapEvents.map((e) => e.id));
    return v.places[0].timeline.filter((e) => !worldIds.has(e.id)).map((e) => ({ id: e.id, importance: e.importance }));
  });
  if (local.length) {
    await page.click(`.dock [data-id="${local[0].id}"]`);
    await cameraRests(page, 8000);
    await settle(page, 700);
    const own = await markerIds(page);
    check(
      'Çizelgeden açılan yerel olay (dünya olayları arasında olmayan, önemi düşük) da haritaya gelir: yalnızca o, kartı açık',
      own.length === 1 && own[0] === local[0].id && (await visible(page, '[data-testid=event-card]')),
      `${own.join()} (önem ${local[0].importance}) · yerin çizelgesinde ${local.length} yerel olay`,
    );
    await page.click('[data-testid=event-close]');
    await settle(page, 500);
    check('Yerel olayın kartı kapanınca onun işaretçisi de çekilir', (await markerIds(page)).length === 0);
  } else {
    check('Yerin çizelgesinde dünya olaylarından başka (yerel) bir olay var', false, 'bulunamadı');
  }
  await page.click('[data-testid=place-close]').catch(() => undefined);
  await page.keyboard.press('Escape');
  await settle(page, 800);
  // (an event that lay out of sight would have moved the camera to show it: the markers are the same where the camera
  // is the same)
  const moved = camCompare(cam0, await camera(page)).moved;
  if (moved) {
    await page.evaluate((c) => window.__ayni.map.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom }), cam0);
    await settle(page, 600);
  }
  const back = await markerIds(page);
  check(
    'Seçim kalkınca dünya olayları haritaya döner (aynı kamerada aynı küme) ve not eski hâline gelir',
    back.length >= 5 && sameSet(back, world) && /\/\s*\d+ olay haritada/.test(await text(page, '.map-stats')),
    `${back.length} işaretçi${moved ? ' (açılan olay kamerayı oynatmıştı; eski yerine alındıktan sonra)' : ''}`,
  );
  await page.context().close();
});

// J3: a place is selected and the AI narrates it: only what the step talks about is on the map
await guard(async () => {
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  await showStep(page, 3);
  const s3 = await mapState(page);
  const battle = GERMANY[2].events[0];
  const title = await page.evaluate((id) => window.__ayni.data.eventsById.get(id).title, battle);
  const year = await page.evaluate((id) => String(window.__ayni.data.eventsById.get(id).year), battle);
  check(
    '3. adım Britanya Muharebesi’nden söz ediyor: haritada onun kendi işaretçisi var (yanında ad kutusu yok), başka olay yok',
    s3.markers.join() === battle && s3.eventFlags.length === 0 && s3.diamonds === 0,
    `${s3.markers.join()}`,
  );
  // (a place is selected and its answer is on screen: the answer is the narrator, and the rest of the world is on the
  // place's timeline)
  const note3 = (await text(page, '.map-stats')).replace(/\s+/g, ' ');
  check(
    'Yer seçiliyken de yanıt ekrandaysa anlatan yapay zekâdır: not “n olay haritada · gerisi çizelgede” der (n = anlatılan olay sayısı)',
    new RegExp(`(^|\\s)${s3.markers.length}\\s*olay haritada`).test(note3) && /gerisi çizelgede/.test(note3),
    note3,
  );
  const dotLook = await page.evaluate((id) => {
    const el = document.querySelector(`.evt[data-id="${id}"]`);
    return {
      year: el.querySelector('.evt-year')?.textContent,
      selected: el.classList.contains('is-selected'),
      button: el.tagName,
    };
  }, battle);
  check(
    'Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil)',
    dotLook.year === year && !dotLook.selected && dotLook.button === 'BUTTON',
    `${dotLook.year}`,
  );
  // the name is on hover, like every marker's
  await page.hover(`.evt[data-id="${battle}"] .evt-mark`);
  await settle(page, 300);
  check(
    'Olay işaretinin adı üstüne gelince görünür (ipucu)',
    (await text(page, '.tip').catch(() => '')).includes(title),
    title,
  );
  await page.mouse.move(5, 5);
  // clicking that marker opens its card like any other
  await page.locator(`.marker-layer [data-id="${battle}"]`).click({ timeout: 5000 });
  await settle(page, 700);
  check(
    'Anılan olayın işaretçisine tıklamak olay kartını sağda açar; altyazı yerinde kalır',
    (await visible(page, '[data-testid=event-card]')) &&
      (await visible(page, '[data-testid=watch]')) &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === battle,
  );
  const lapSel = await overlapReport(page);
  check(
    'Hem anılan hem açık olduğunda yapay zekâ tarafında ad kutusu yok (açık olayın kendi adı kartta ve işaretinde), çakışma yok',
    (await count(page, '.ai-flag.is-event')) === 0 && lapSel.clash.length === 0,
    lapSel.clash.join(' | '),
  );
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Escape');
  await settle(page, 500);
  check(
    'Kart kapanınca olay yine anlatılan olay olarak haritada kalır (ad kutusu yok)',
    (await markerIds(page)).join() === battle && (await count(page, '.ai-flag.is-event')) === 0,
  );

  // a mark for something the data has an event for is shown as that event; a place the data does not know stays a mark
  await showStep(page, 4);
  const calls = await page.evaluate(() => {
    const req = window.__ayni.ai.session.provider.requests.at(-1);
    const mark = req.tools.find((t) => t.name === 'mark');
    return [
      mark.execute({ step: 4, lon: 20.46, lat: 44.82, label: 'Belgrad' }),
      mark.execute({ step: 4, lon: 32.04, lat: 54.78, label: 'Smolensk' }),
    ];
  });
  await cameraRests(page, 8000);
  await settle(page, 400);
  const s4 = await mapState(page);
  // the data's own event for Belgrade (the invasion of Yugoslavia and Greece, a war: so it brings its own line too)
  const known = await page.evaluate(() =>
    window.__ayni.data.events.filter((e) => e.location.name === 'Belgrad').map((e) => ({ id: e.id, title: e.title })),
  );
  check(
    `Model verideki bir olay (${known[0]?.title}) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez`,
    known.length === 1 &&
      /^tamam/.test(calls[0]) &&
      /olay kaydı/.test(calls[0]) &&
      sameSet(s4.markers, [...GERMANY[3].events, known[0].id]) &&
      !s4.flags.includes('Belgrad') &&
      s4.eventFlags.length === 0 &&
      s4.wars === GERMANY[3].wars + 1,
    `${calls[0]} · ${s4.wars} savaş çizgisi`,
  );
  check(
    'Verinin bilmediği bir yer (Smolensk) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi',
    calls[1] === 'tamam' && s4.diamonds === 1 && s4.flags.includes('Smolensk'),
    `${s4.flags.join(', ')}`,
  );
  const lap4 = await overlapReport(page);
  check(
    'Bu kalabalık adımda da (3 olay + 1 işaret) etiketler birbirini ve işaretçileri örtmüyor',
    lap4.clash.length === 0 && lap4.out.length === 0 && lap4.underControl.length === 0,
    [...lap4.clash, ...lap4.out, ...lap4.underControl].join(' | '),
  );
  await shot(page, 'ai-1f-tek-anlatici.png');

  // closing the answer takes the AI's drawing and its markers away and gives the map its markers back
  await page.click('[data-testid=watch-close]');
  await settle(page, 900);
  check(
    'Anlatım kapanınca anlatıcının işaretçileri ve çizimi gider; yer hâlâ seçili olduğundan dünya olayları dönmez',
    (await aiDom(page)).hidden && (await markerIds(page)).length === 0,
    (await markerIds(page)).join(', '),
  );
  await page.context().close();
});

/* =============================================== K. no label covers another */
section('K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor');
/** The camera of the narration's frame, zoomed in a little and zoomed out a little: what the metric is read at. */
const K_ZOOMS = [0, 0.9, -0.9];
/**
 * The place of this group: Schleswig, in the north of Nazi Germany (9.5°E 54.5°N). Hamburg's pin is covered in the
 * narrow window, where the narration is at its widest: by the year of the Battle of Britain's marker (step 3) and by
 * the marker of the Battle of Berlin (step 8); nothing in the app keeps a pin and a marker apart. This point is clear
 * of every marker, year and mark of the eight steps at the three cameras of both window sizes (measured from the pages'
 * own geometry, not guessed).
 */
const K_PLACE = `${WAR}&p=9.500,54.500`;
/** Reads the overlap metric of the scene on screen at each camera; the camera is put back as it was after each one. */
async function kReadOverlaps(page, label) {
  const rows = [];
  for (const dz of K_ZOOMS) {
    if (dz) {
      await page.evaluate((d) => {
        window.__ayni.map.jumpTo({ zoom: window.__ayni.map.getZoom() + d });
      }, dz);
      await settle(page, 350);
    }
    const lap = await overlapReport(page);
    const found = [...lap.clash, ...lap.out, ...lap.underControl];
    rows.push({
      count: lap.count,
      flags: lap.flags,
      bad: found.length ? `${label}, yakınlaştırma ${dz >= 0 ? '+' : ''}${dz}: ${found.join('; ')}` : '',
    });
    if (dz) {
      await page.evaluate((d) => {
        window.__ayni.map.jumpTo({ zoom: window.__ayni.map.getZoom() - d });
      }, dz);
      await settle(page, 250);
    }
  }
  return rows;
}
for (const vp of [
  { name: '1440×900', viewport: { width: 1440, height: 900 } },
  { name: '1180×760', viewport: { width: 1180, height: 760 } },
])
  await guard(async () => {
    const page = await open(K_PLACE, { viewport: vp.viewport });
    await page.click('[data-testid=place-narrate]');
    await finalStatus(page);
    await cameraRests(page, 12000);
    // the narration: every step at three cameras. Its steps draw no name boxes of their own (the events are only
    // named), so what is measured is every label-like thing there: the polities' names, the event marks with their
    // years, the place's pin
    const rows = [];
    for (const exp of GERMANY) {
      if (exp.n !== 1) await showStep(page, exp.n);
      rows.push(...(await kReadOverlaps(page, `adım ${exp.n}`)));
    }
    const things = rows.reduce((t, r) => t + r.count, 0);
    check(
      `${vp.name}: ${GERMANY.length} adım × 3 kamera (çerçeve, +0,9, −0,9) = ${rows.length} durumda ${things} öğe (devlet adları, olay işaretleri ve yılları, yer noktası) hiçbir etiketi ya da işaretçiyi örtmüyor`,
      rows.every((r) => !r.bad) && things > 0,
      rows
        .filter((r) => r.bad)
        .slice(0, 3)
        .map((r) => r.bad)
        .join(' | '),
    );
    // the crowded step of J (3 events, the war lines of two of them, and a free mark with its label), at three cameras
    // too: the label of a mark the data knows nothing of keeps clear of the markers, the names and the war lines' ends
    await showStep(page, 4);
    await page.evaluate(() => {
      const mark = window.__ayni.ai.session.provider.requests.at(-1).tools.find((t) => t.name === 'mark');
      mark.execute({ step: 4, lon: 20.46, lat: 44.82, label: 'Belgrad' });
      mark.execute({ step: 4, lon: 32.04, lat: 54.78, label: 'Smolensk' });
    });
    await cameraRests(page, 8000);
    await settle(page, 400);
    const crowded = await kReadOverlaps(page, 'kalabalık 4. adım');
    check(
      `${vp.name}: kalabalık 4. adım (${GERMANY[3].events.length + 1} olay, ${GERMANY[3].wars + 1} savaş çizgisi, serbest işaret ve etiketi) × 3 kamera = ${crowded.length} durumda ${crowded.reduce((t, r) => t + r.flags, 0)} yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor`,
      crowded.every((r) => !r.bad) && crowded[0].flags === 1,
      crowded.some((r) => r.bad)
        ? crowded
            .filter((r) => r.bad)
            .slice(0, 3)
            .map((r) => r.bad)
            .join(' | ')
        : `kamera başına etiket: ${crowded.map((r) => r.flags).join(' / ')}`,
    );
    // the answer with a line of its own: the Pact of Steel has the label "Çelik Pakt, 1939" and the symbol of an
    // alliance in the middle of its line, and the event it names has a marker: the AI's own labels and what they must
    // keep clear of
    await ask(page, AXIS_QUESTION);
    await cameraRests(page, 12000);
    await settle(page, 400);
    const axis = await kReadOverlaps(page, 'Çelik Pakt yanıtı');
    const own = axis.reduce((t, r) => t + r.flags, 0);
    // (zoomed in, the line's two ends leave the map and its label with them: a label that names nothing on screen is
    // not shown)
    check(
      `${vp.name}: Çelik Pakt yanıtı × 3 kamera = ${axis.length} durumda ${own} yapay zekâ etiketi (bağlantı etiketi; çerçevede var) hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor`,
      axis.every((r) => !r.bad) && axis[0].flags === 1,
      axis.some((r) => r.bad)
        ? axis
            .filter((r) => r.bad)
            .slice(0, 3)
            .map((r) => r.bad)
            .join(' | ')
        : `kamera başına etiket: ${axis.map((r) => r.flags).join(' / ')}`,
    );
    await page.context().close();
  });

/* =================================================== P. the colours the map really shows */
/**
 * What the map really shows, read from a screenshot and not from the style: everything above the map's canvas is hidden,
 * the screenshot is sampled on a grid, and under each sample lies the one polity found there (a sample on a border, or
 * where two polities overlap, is left out). With `lit` (the polities of a narration step) the colours are judged against
 * the spotlight instead: the lit ones solid and vivid, all the rest veiled with paper.
 */
const SAMPLE = async ({ b64, lit }) => {
  const m = window.__ayni.map;
  const box = document.querySelector('#map').getBoundingClientRect();
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  const px = cx.getImageData(0, 0, bmp.width, bmp.height).data;
  const sc = bmp.width / innerWidth;
  const rgbAt = (x, y) => {
    const i = (Math.round((box.top + y) * sc) * bmp.width + Math.round((box.left + x) * sc)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const css = getComputedStyle(document.documentElement);
  const hex = (name) => {
    const v = css.getPropertyValue(name).trim();
    return [1, 3, 5].map((k) => parseInt(v.slice(k, k + 2), 16));
  };
  const tints = [...Array(9).keys()].map((i) => hex(`--tint-${i}`));
  const vivid = [...Array(9).keys()].map((i) => hex(`--vivid-${i}`));
  const paper = hex('--paper');
  const veil = lit ? Number(m.getPaintProperty('ai-veil', 'background-opacity')) : 0;
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lab = (c) => {
    const [r, g, b] = c.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s,
    ];
  };
  const dE = (a, b) => {
    const x = lab(a);
    const y = lab(b);
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  const chroma = (c) => Math.hypot(lab(c)[1], lab(c)[2]);
  const hue = (c) => ((Math.atan2(lab(c)[2], lab(c)[1]) * 180) / Math.PI + 360) % 360;
  const blend = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

  const STEP = 12;
  const cols = Math.floor(box.width / STEP);
  const rows = Math.floor(box.height / STEP);
  const grid = new Map();
  for (let j = 1; j < rows; j++)
    for (let i = 1; i < cols; i++) {
      const fs = m.queryRenderedFeatures([i * STEP, j * STEP], { layers: ['polity-fill'] });
      if (!fs.length || new Set(fs.map((f) => f.properties.id)).size !== 1) continue;
      const f = fs[0].properties;
      // well inside its polity: the borders and their casing (a few pixels wide) are not what the colour statistics judge
      const inside = [
        [-5, -5],
        [5, -5],
        [-5, 5],
        [5, 5],
      ].every(([dx, dy]) => {
        const near = m.queryRenderedFeatures([i * STEP + dx, j * STEP + dy], { layers: ['polity-fill'] });
        return near.length > 0 && near.every((g) => g.properties.id === f.id);
      });
      grid.set(`${i},${j}`, {
        i,
        j,
        id: f.id,
        tint: f.tint,
        inside,
        rgb: rgbAt(i * STEP, j * STEP),
        lit: !!lit && lit.includes(f.id),
      });
    }
  const everything = [...grid.values()];
  const want = (s) => (s.lit ? vivid[s.tint] : blend(tints[s.tint], paper, veil));
  for (const s of everything) s.dev = dE(s.rgb, want(s));
  const samples = everything.filter((s) => s.inside);
  const good = samples.filter((s) => s.dev <= 3);

  const byPolity = new Map();
  for (const s of good) if (!byPolity.has(s.id)) byPolity.set(s.id, s.rgb);
  const greys = [];
  const blues = [];
  let minChroma = Infinity;
  for (const [id, c] of byPolity) {
    const ch = chroma(c);
    minChroma = Math.min(minChroma, ch);
    if (ch < 0.07) greys.push(id);
    if (ch >= 0.02 && hue(c) >= 180 && hue(c) <= 310) blues.push(id);
  }
  // neighbours: two samples one step apart (right, below) in different polities with nothing but those two between them
  // (a thin third polity, a bay or a strait in between would make them strangers)
  const idsAt = (x, y) =>
    new Set(m.queryRenderedFeatures([x, y], { layers: ['polity-fill'] }).map((f) => f.properties.id));
  const touching = (s, o) => {
    for (let k = 1; k < 6; k++) {
      const ids = idsAt(s.i * STEP + ((o.i - s.i) * STEP * k) / 6, s.j * STEP + ((o.j - s.j) * STEP * k) / 6);
      if (ids.size === 0 || [...ids].some((id) => id !== s.id && id !== o.id)) return false;
    }
    return true;
  };
  // Neighbours are the polities that meet somewhere. The colour of a polity is the one it shows well inside (the
  // samples at its edge may blend a little of the border beside them: within the tolerance above, but not the polity's
  // own colour).
  const meets = new Set();
  for (const s of everything)
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      const o = grid.get(`${s.i + di},${s.j + dj}`);
      if (o && o.id !== s.id && touching(s, o)) meets.add([s.id, o.id].sort().join(' | '));
    }
  const pairs = new Map();
  for (const key of meets) {
    const [a, b] = key.split(' | ');
    if (byPolity.has(a) && byPolity.has(b)) pairs.set(key, dE(byPolity.get(a), byPolity.get(b)));
  }
  const close = [...pairs].filter(([, d]) => d < 8).map(([k, d]) => `${k} ${d.toFixed(1)}`);
  const weakest = [...pairs].sort((x, y) => x[1] - y[1])[0];
  const mean = (a, f) => a.reduce((t, s) => t + f(s.rgb), 0) / (a.length || 1);
  const litS = good.filter((s) => s.lit);
  const restS = good.filter((s) => !s.lit);
  // what the palette itself allows: the two colours of the eight in use that lie nearest to each other
  let paletteMin = Infinity;
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) paletteMin = Math.min(paletteMin, dE(tints[a], tints[b]));
  return {
    year: document.querySelector('[data-testid=title-year]')?.textContent,
    paletteMin,
    n: samples.length,
    good: good.length,
    polities: byPolity.size,
    greys,
    blues,
    minChroma,
    pairs: pairs.size,
    minDE: weakest ? weakest[1] : null,
    weakest: weakest ? weakest[0] : '',
    close,
    nLit: samples.filter((s) => s.lit).length,
    nRest: samples.filter((s) => !s.lit).length,
    litOff: samples.filter((s) => s.lit && s.dev > 3).length,
    restOff: samples.filter((s) => !s.lit && s.dev > 3).length,
    chromaLit: mean(litS, chroma),
    chromaRest: mean(restS, chroma),
    lightLit: mean(litS, (c) => lab(c)[0]),
    lightRest: mean(restS, (c) => lab(c)[0]),
  };
};
async function sampleMap(page, lit = null) {
  await page.addStyleTag({
    content:
      '.sample-hide .maplibregl-marker, .sample-hide .plabel, .sample-hide .evt, .sample-hide .pin, .sample-hide .ai-layer, ' +
      '.sample-hide .map-chrome, .sample-hide .map-zoom, .sample-hide [data-avoid], .sample-hide .maplibregl-ctrl ' +
      '{ visibility: hidden !important; }',
  });
  await page.evaluate(() => document.documentElement.classList.add('sample-hide'));
  await page.waitForTimeout(250);
  const png = await page.screenshot();
  await page.evaluate(() => document.documentElement.classList.remove('sample-hide'));
  return page.evaluate(SAMPLE, { b64: png.toString('base64'), lit });
}

section(
  'P. Devlet renkleri: ekranda görünen renkler gri/grimsi ya da mavi değil, komşular birbirinden ayrışıyor; spot ışığında öne çıkanlar canlı, gerisi soluk',
);
await guard(async () => {
  const views = [
    { name: 'dünya, 1939–1945', hash: '#t=1939-1945', cam: null, shot: 'ai-p1-renkler-dunya.png' },
    {
      name: 'Avrupa, 1939–1945',
      hash: '#t=1939-1945',
      cam: { center: [14, 48], zoom: 3.7 },
      shot: 'ai-p2-renkler-avrupa.png',
    },
    { name: 'Doğu Asya, 1939–1945', hash: '#t=1939-1945', cam: { center: [105, 36], zoom: 3.2 } },
    { name: 'Hindistan ve İran, 1939–1945', hash: '#t=1939-1945', cam: { center: [72, 28], zoom: 3.6 } },
    // other times of the data, where other neighbours meet: the old continent before the First World War, the
    // decolonised Africa, the Eurasia of the post-Soviet states
    { name: 'Avrupa, 1910–1916', hash: '#t=1910-1916', cam: { center: [14, 48], zoom: 3.7 } },
    { name: 'Afrika, 1960–1966', hash: '#t=1960-1966', cam: { center: [18, 3], zoom: 2.7 } },
    { name: 'Avrasya, 1990–1996', hash: '#t=1990-1996', cam: { center: [60, 48], zoom: 2.4 } },
  ];
  const got = [];
  for (const v of views) {
    const page = await open(v.hash);
    await page.click('[data-testid=intro-close]').catch(() => undefined);
    if (v.cam) {
      await page.evaluate((cam) => window.__ayni.map.jumpTo(cam), v.cam);
      await settle(page, 1800);
    }
    if (v.shot) await shot(page, v.shot);
    got.push({ ...v, ...(await sampleMap(page)) });
    await page.context().close();
  }
  const total = (k) => got.reduce((t, g) => t + g[k], 0);
  const all = (f) => got.every(f);
  const fmt = (g) => `${g.name} (sınırlar ${g.year}): ${g.polities} devlet, ${g.good}/${g.n} örnek`;
  check(
    `Ekran görüntüsünden okunan renkler (${got.length} görünüm, ${total('polities')} devlet): her görünümde en az 10 devlet, iç örneklerin %97’sinden fazlası stilin istediği renkte`,
    all((g) => g.polities >= 10 && g.good / g.n > 0.97),
    got.map(fmt).join(' · '),
  );
  const minChroma = Math.min(...got.map((g) => g.minChroma));
  check(
    `Hiçbir devlet gri ya da grimsi değil: en soluk devletin doygunluğu (OKLCH C) ${minChroma.toFixed(3)} (en az 0,07; kum rengi “veri yok” zemini gibi görünen yok)`,
    all((g) => g.greys.length === 0) && minChroma >= 0.07,
    got.flatMap((g) => g.greys).join(', '),
  );
  check(
    'Hiçbir devlet mavi, turkuaz ya da mor değil (ton 180°–310° dışında; mavi yalnızca deniz ve göllerin)',
    all((g) => g.blues.length === 0),
    got.flatMap((g) => g.blues).join(', '),
  );
  const minDE = Math.min(...got.map((g) => g.minDE ?? 99));
  const weakest = got.find((g) => g.minDE === minDE)?.weakest;
  check(
    `Komşu devletler belirgin ayrışıyor: ${total('pairs')} komşu çiftte (her devletin kendi içinde gösterdiği renk) en küçük renk farkı ΔE ${minDE.toFixed(1)} (en az 8)`,
    all((g) => g.pairs >= 8) && minDE >= 8,
    got.some((g) => g.close.length)
      ? got
          .flatMap((g) => g.close)
          .slice(0, 6)
          .join(' · ')
      : `en yakın çift: ${weakest}; paletin birbirine en yakın iki rengi ΔE ${got[0].paletteMin.toFixed(1)}`,
  );
});

await guard(async () => {
  // the spotlight, from the pixels: the polities a step lights are solid in their vivid colour, everything else is faded
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  const rows = [];
  for (const exp of GERMANY) {
    if (exp.n !== 1) await showStep(page, exp.n);
    await settle(page, 800); // the veil fades in over a third of a second
    const spot = await spotlight(page);
    rows.push({ ...(await sampleMap(page, spot.ids)), step: exp.n, lit: spot.ids });
  }
  const fmt = (r) =>
    `${r.step}. adım: ${r.nLit} öne çıkan örnek (renk sapması ${r.litOff}), ${r.nRest} soluk örnek (sapma ${r.restOff}), doygunluk ${r.chromaLit.toFixed(2)} → ${r.chromaRest.toFixed(2)}`;
  check(
    'Spot ışığı, ekran görüntüsünden: her adımda öne çıkan devletlerin pikselleri kendi canlı renginde (tam dolgun, saydam değil), haritanın geri kalanı kâğıt örtüyle solmuş renkte',
    rows.every((r) => r.nLit >= 15 && r.nRest >= 100 && r.litOff / r.nLit < 0.05 && r.restOff / r.nRest < 0.05),
    rows.map(fmt).join(' · '),
  );
  check(
    'Öne çıkanlar belirgin ayrışıyor: canlı devletlerin doygunluğu soluk devletlerinkinin en az iki katı, soluk olanlar daha açık',
    rows.every((r) => r.chromaLit >= 2 * r.chromaRest && r.lightRest > r.lightLit + 0.04),
    rows
      .map(
        (r) =>
          `${r.step}: ${(r.chromaLit / r.chromaRest).toFixed(1)}× · açıklık ${r.lightLit.toFixed(2)} / ${r.lightRest.toFixed(2)}`,
      )
      .join(' · '),
  );
  const vividGrey = rows.filter((r) => r.chromaLit < 0.1).map((r) => r.step);
  const vividBlue = rows.flatMap((r) => r.blues.map((id) => `${r.step}. adım: ${id}`));
  check(
    'Canlı renkler de gri ya da mavi değil: öne çıkan devletlerin ortalama doygunluğu en az 0,10 ve hiçbir devletin tonu (canlı ya da soluk) 180°–310° arasında değil',
    vividGrey.length === 0 && vividBlue.length === 0,
    vividBlue.length ? vividBlue.join(', ') : rows.map((r) => `${r.step}: ${r.chromaLit.toFixed(2)}`).join(' · '),
  );
  await page.context().close();
});

/* ================================================== R. the names of events in captions and texts */
section('R. Olay adları: altyazıda ve metinde tıklanabilir bağlantı; çizelgedeki bir olaya tıklamakla aynı şeyi yapar');
/** Everything a click on an event changes, read in one go (to compare one way of opening an event with another). */
const eventState = (page) =>
  page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const shown = (sel) => {
      const e = q(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    };
    const rect = (sel) => {
      const e = q(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    };
    return {
      event: window.__ayni.store.state.selectedEventId,
      card: shown('[data-testid=event-card]'),
      cardRect: rect('[data-testid=event-card]'),
      title: q('[data-testid=event-title]')?.textContent.trim() ?? null,
      selectedMarker: [...document.querySelectorAll('.marker-layer .evt.is-selected')].map((e) => e.dataset.id),
      markers: window.__ayni.visibleMarkerIds().sort(),
      chip: q('[data-testid=chat-event-chip]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      step: window.__ayni.ai.director.active?.n ?? null,
      view: window.__ayni.ai.presentation.view,
      read: window.__ayni.ai.presentation.readMode,
    };
  });
/**
 * Two event states are the same when everything is except what depends on where the camera happens to stand (which markers
 * fit the view, where the card sits): in the small map of the full-screen reader a far event lies a few pixels outside the
 * view, and whether its marker still counts as shown depends on those pixels.
 */
const sameEventState = (a, b) => {
  const plain = ({ markers, cardRect, ...rest }) => JSON.stringify(rest);
  return plain(a) === plain(b);
};
/** The events a text names as `[words](olay:id)`, in the order it names them (the checks follow the words the mock writes). */
const evtRefIds = (words) => [...words.matchAll(/\]\(olay:([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]);
/** One step's part of an answer's full text (the mock writes "## 6. Title" before each step). */
const evtRefStepPart = (all, n) => all.split(/^## /m).find((p) => p.startsWith(`${n}. `)) ?? '';
/** The event links inside an element, with how they look (dotted underline, pointer) and which event each one opens. */
const evtRefLinks = (page, scope) =>
  page.evaluate(
    (s) =>
      [...document.querySelectorAll(`${s} button.evt-ref`)].map((b) => {
        const cs = getComputedStyle(b);
        return {
          id: b.dataset.event,
          text: b.textContent.trim(),
          cursor: cs.cursor,
          line: cs.textDecorationLine,
          style: cs.textDecorationStyle,
        };
      }),
    scope,
  );
/** What the last answer says (its raw words, with the link marks) and each step's caption as the page holds it. */
const evtRefSaid = (page) =>
  page.evaluate(() => ({
    text: window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1).text,
    captions: window.__ayni.ai.presentation.steps.map((s) => s.caption),
  }));
await guard(async () => {
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await cameraRests(page, 12000);
  const said = await evtRefSaid(page);

  // --- the caption of every step: the names of events in it are links, with the events its words mark
  const perStep = [];
  for (let n = 1; n <= GERMANY.length; n++) {
    await showStep(page, n);
    perStep.push({
      n,
      want: evtRefIds(said.captions[n - 1]),
      got: (await evtRefLinks(page, '[data-testid=watch-caption]')).map((l) => l.id),
      shown: await text(page, '[data-testid=watch-caption]'),
    });
  }
  const badCaption = perStep.filter(
    (st) => st.want.length === 0 || st.got.join() !== st.want.join() || /[[\]]|olay:/.test(st.shown),
  );
  check(
    `Her adımın altyazısında olay adları bağlantı: 1’den ${GERMANY.length}’e hepsinde, altyazının işaretlediği olay kimlikleriyle (4. adımda Barbarossa, 6. adımda Stalingrad ve El Alamein, 7. adımda Normandiya ve Bagration…); görünen yazıda işaret yok`,
    badCaption.length === 0 &&
      perStep[3].got.join() === 'barbarossa-1941' &&
      perStep[5].got.join() === 'stalingrad-1942,el-alamein-1942' &&
      perStep[6].got.join() === 'normandiya-1944,bagration-1944',
    perStep.map((st) => `${st.n}: ${st.got.length}`).join(' · '),
  );
  await showStep(page, 6);
  const captionIds = evtRefIds(said.captions[5]);
  const textIds = evtRefIds(evtRefStepPart(said.text, 6));

  // --- in the caption of the step on screen
  const refs = await evtRefLinks(page, '[data-testid=watch-caption]');
  check(
    '6. adımın altyazısında Stalingrad ve El Alamein birer bağlantı (olay kimlikleriyle): noktalı alt çizgili, işaretçi imleçli; cümlenin içinde düz yazı gibi duruyor',
    refs.map((r) => r.id).join() === captionIds.join() &&
      captionIds.join() === GERMANY[5].events.join() &&
      refs.every((r) => r.cursor === 'pointer' && r.line.includes('underline') && r.style === 'dotted'),
    refs.map((r) => `“${r.text}”`).join(' '),
  );
  const captionText = await text(page, '[data-testid=watch-caption]');
  check(
    'Altyazının görünen yazısında bağlantı işaretleri yok (köşeli ayraç, “olay:” görünmüyor); sözcükler aynı',
    !/[[\]]|olay:/.test(captionText) && captionText.trim() === plainCaption(said.captions[5]),
    captionText.slice(0, 80),
  );

  // the name of an event on the map shows on hover (there is no name box beside the marker)
  await page.hover('.evt[data-id="stalingrad-1942"] .evt-mark');
  await settle(page, 500);
  const hoverTip = await page.evaluate(() => {
    const t = document.querySelector('.tip');
    return {
      shown: !!t && !t.hidden,
      text: t?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      flags: [...document.querySelectorAll('.ai-layer .ai-flag')].filter((e) => !e.hidden).length,
    };
  });
  check(
    'Haritadaki olay işaretçisinin adı üzerine gelince görünür (yanında kalıcı bir ad kutusu yok): “Stalingrad Muharebesi”',
    hoverTip.shown && /Stalingrad Muharebesi/.test(hoverTip.text) && hoverTip.flags === 0,
    hoverTip.text.slice(0, 70),
  );
  await page.mouse.move(300, 420);
  await settle(page, 300);

  // what a click on the event in the timeline does: the baseline
  await page.locator('.dock [data-id="stalingrad-1942"]').first().click();
  await settle(page, 700);
  const viaTimeline = await eventState(page);
  await page.click('[data-testid=event-close]');
  await settle(page, 500);
  await page.mouse.move(300, 420); // the pointer leaves the timeline dot
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 700);
  const viaCaption = await eventState(page);
  check(
    'Altyazıdaki “Stalingrad”, çizelgedeki Stalingrad noktasına tıklamakla aynı şeyi yapar: aynı olay açık, aynı kart (aynı yerde, aynı başlık), aynı işaretçiler, soru kutusunda aynı çip; adım ve görünüm yerinde',
    JSON.stringify(viaCaption) === JSON.stringify(viaTimeline) &&
      viaCaption.event === 'stalingrad-1942' &&
      viaCaption.card &&
      /Stalingrad/.test(viaCaption.title) &&
      viaCaption.selectedMarker.join() === 'stalingrad-1942' &&
      /Stalingrad/.test(viaCaption.chip ?? '') &&
      viaCaption.step === 6 &&
      viaCaption.view === 'watch',
    JSON.stringify(viaCaption),
  );
  await shot(page, 'ai-r1-altyazida-olay-adi.png');

  // the other name in the same caption: the card moves to it; the same name again closes it (as the timeline's dot does)
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 600);
  const second = await eventState(page);
  check(
    'Aynı altyazıdaki “El Alamein” kartı o olaya çevirir (tek kart, açık olay El Alamein, işaretçisi vurgulu); altyazı ve 6. adım yerinde',
    second.event === 'el-alamein-1942' &&
      second.card &&
      /El Alamein/.test(second.title) &&
      second.selectedMarker.join() === 'el-alamein-1942' &&
      second.step === 6 &&
      (await visible(page, '[data-testid=watch]')) &&
      (await count(page, '[data-testid=event-card]')) === 1,
    `${second.title}`,
  );
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 500);
  const toggled = await eventState(page);
  check(
    'Aynı bağlantıya bir daha tıklamak olayı kapatır (çizelgedeki nokta gibi); yer kartı sekmeye döner, adım yerinde',
    toggled.event === null && !toggled.card && (await visible(page, '[data-testid=card-tab]')) && toggled.step === 6,
  );

  // --- in the text beside the map
  await page.click('[data-testid=watch-read]');
  await settle(page, 900);
  const readRefs = await page.evaluate(() => ({
    steps: [...document.querySelectorAll('[data-testid=chat-step]')].map((st) => ({
      n: Number(st.dataset.n),
      ids: [...st.querySelectorAll('button.evt-ref')].map((b) => b.dataset.event),
    })),
    all: document.querySelectorAll('[data-testid=chat-scroll] button.evt-ref').length,
    raw: /olay:|\]\(/.test(document.querySelector('[data-testid=chat-scroll]').innerText),
  }));
  const allIds = evtRefIds(said.text);
  const badText = readRefs.steps.filter((st) => st.ids.join() !== evtRefIds(evtRefStepPart(said.text, st.n)).join());
  check(
    `Okuyucudaki metinde de olay adları bağlantı: her adımın metninde yazının işaretlediği olaylar (4. adımda Barbarossa ve Leningrad, 6. adımda Stalingrad ve El Alamein), tüm metinde ${allIds.length} bağlantı, her biri bir düğme; işaret sözdizimi görünmüyor`,
    readRefs.steps.length === GERMANY.length &&
      badText.length === 0 &&
      readRefs.steps[3].ids.join() === GERMANY[3].events.join() &&
      readRefs.steps[5].ids.join() === textIds.join() &&
      textIds.join() === GERMANY[5].events.join() &&
      allIds.length >= GERMANY.length &&
      readRefs.all === allIds.length &&
      !readRefs.raw,
    `${readRefs.all} bağlantı · ${readRefs.steps.map((st) => st.ids.length).join(' ')}`,
  );
  await page.locator('.dock [data-id="stalingrad-1942"]').first().click();
  await settle(page, 700);
  const readTimeline = await eventState(page);
  await page.click('[data-testid=event-close]');
  await settle(page, 400);
  await page.mouse.move(300, 420);
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 800);
  const readSide = await eventState(page);
  const reader = await rectOf(page, '#read');
  // where the opened event's own marker lies: the card is put beside the reader, and the scene may lie behind either
  const where = await page.evaluate(() => window.__ayni.data.eventsById.get('stalingrad-1942').location);
  const markerPx = await pixelOf(page, where.lon, where.lat);
  const behind =
    markerPx.x >= reader.left
      ? 'okuyucunun altında'
      : markerPx.x >= readSide.cardRect.left &&
          markerPx.y >= readSide.cardRect.top &&
          markerPx.y <= readSide.cardRect.bottom
        ? 'kartın altında'
        : 'görünür';
  check(
    'Okuyucuda (yan panel) metindeki “Stalingrad” da çizelgedeki noktayla aynı şeyi yapar: aynı olay, aynı kart; kart okuyucunun soluna sığıyor (üstüne binmiyor); okuyucu açık, adım 6 yerinde',
    JSON.stringify(readSide) === JSON.stringify(readTimeline) &&
      readSide.event === 'stalingrad-1942' &&
      readSide.card &&
      readSide.cardRect.right <= reader.left + 1 &&
      readSide.view === 'read' &&
      readSide.read === 'side' &&
      readSide.step === 6,
    `kart ${JSON.stringify(readSide.cardRect)} · Stalingrad işaretçisi (${Math.round(markerPx.x)}, ${Math.round(markerPx.y)}) ${behind}`,
  );
  await shot(page, 'ai-r2-metinde-olay-adi.png');
  // another name in the text moves the card to that event; the same name again closes it
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 600);
  const readOther = await eventState(page);
  const readCards = await count(page, '[data-testid=event-card]');
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 500);
  const readClosed = await eventState(page);
  check(
    'Metindeki başka bir ad (El Alamein) kartı o olaya çevirir (tek kart, işaretçisi vurgulu); aynı adın ikinci tıklaması olayı kapatır; okuyucu açık, adım 6 yerinde',
    readOther.event === 'el-alamein-1942' &&
      readOther.card &&
      /El Alamein/.test(readOther.title) &&
      readOther.selectedMarker.join() === 'el-alamein-1942' &&
      readCards === 1 &&
      readClosed.event === null &&
      !readClosed.card &&
      readClosed.chip === null &&
      readClosed.view === 'read' &&
      readClosed.step === 6,
    `${readOther.title}`,
  );
  // a name in the text of another step opens its event and nothing more: the step on the map stays where it was
  await page.click('[data-testid=chat-step][data-n="7"] button.evt-ref[data-event="normandiya-1944"]');
  await settle(page, 800);
  const readOtherStep = await eventState(page);
  const readActive = await page.evaluate(
    () => document.querySelector('[data-testid=chat-step][data-active="true"]')?.dataset.n ?? null,
  );
  const readOtherIds = await idsNow(page);
  await page.click('[data-testid=chat-step][data-n="7"] button.evt-ref[data-event="normandiya-1944"]');
  await settle(page, 500);
  check(
    '7. adımın metnindeki “Normandiya” bağlantısı olayı açar ama adımı değiştirmez: 6. adım etkin, haritada 6. adımın sahnesi kalır (bir bağlantıya tıklamak “adımı göster” sayılmaz); ikinci tıklama kapatır',
    readOtherStep.event === 'normandiya-1944' &&
      readOtherStep.card &&
      readOtherStep.step === 6 &&
      readActive === '6' &&
      readOtherIds === GERMANY[5].ids &&
      (await eventState(page)).event === null,
    `etkin adım ${readActive}`,
  );
  // (found while writing these: a key pressed in the text, then a change of size, moved the step; Esc closes the card)
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 600);
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const afterEsc = await eventState(page);
  check(
    'Esc önce olay kartını kapatır; okuyucu ve adım yerinde',
    afterEsc.event === null && !afterEsc.card && afterEsc.view === 'read' && afterEsc.step === 6,
  );
  await page.click('[data-testid=read-size]');
  await settle(page, 1300);
  const full = await pres(page);
  check(
    'Bir bağlantıya tıklayıp Esc’e bastıktan hemen sonra tam ekrana geçmek okunan adımı oynatmaz (6. adım kalır; eskiden metin sonuna kayıp 8. adıma geçiyordu)',
    full.read === 'full' && full.step === 6,
    `${full.step}. adım`,
  );

  // --- in the text, full screen: the card has no room beside the small map, so the event shows as in a timeline click there
  await page.locator('.dock [data-id="el-alamein-1942"]').first().click();
  await settle(page, 700);
  const fullTimeline = await eventState(page);
  await page.keyboard.press('Escape');
  await settle(page, 500);
  const fullAfter = await eventState(page);
  await page.mouse.move(300, 420);
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 800);
  const fullRef = await eventState(page);
  check(
    'Tam ekranda da metindeki bağlantı çizelgedeki noktayla aynı şeyi yapar: olay açık, işaretçisi küçük haritada vurgulu, soru kutusunda olay çipi; okuyucu ve adım yerinde',
    sameEventState(fullRef, fullTimeline) &&
      fullRef.event === 'el-alamein-1942' &&
      fullRef.selectedMarker.join() === 'el-alamein-1942' &&
      /El Alamein/.test(fullRef.chip ?? '') &&
      fullRef.view === 'read' &&
      fullRef.read === 'full' &&
      fullRef.step === 6,
    `${fullRef.chip}`,
  );
  await shot(page, 'ai-r3-tam-ekranda-olay-adi.png');
  check(
    'Tam ekranda Esc açık olayı kaldırır (okuyucu tam ekran kalır)',
    fullAfter.event === null && fullAfter.view === 'read' && fullAfter.read === 'full' && fullAfter.step === 6,
  );
  await page.click('[data-testid=chat-step][data-n="6"] button.evt-ref[data-event="el-alamein-1942"]');
  await settle(page, 600);
  const fullClosed = await eventState(page);
  check(
    'Tam ekranda aynı bağlantıya bir daha tıklamak olayı kapatır (soru kutusundaki çip de gider); okuyucu ve adım yerinde',
    fullClosed.event === null &&
      fullClosed.chip === null &&
      fullClosed.selectedMarker.length === 0 &&
      fullClosed.view === 'read' &&
      fullClosed.read === 'full' &&
      fullClosed.step === 6,
  );
  await page.context().close();
});
await guard(async () => {
  // an answer to a plain question is one step: its caption, and its text under "Devamını oku", name events as well
  const page = await open(AT_HAMBURG);
  await ask(page, STALINGRAD_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 400);
  const said = await evtRefSaid(page);
  const steps = await page.getAttribute('[data-testid=watch]', 'data-steps');
  const refs = await evtRefLinks(page, '[data-testid=watch-caption]');
  check(
    'Tek adımlı Stalingrad yanıtının altyazısında “Stalingrad Muharebesi” bir bağlantı (olay kimliğiyle): noktalı alt çizgili, işaretçi imleçli; görünen yazıda işaret yok',
    steps === '1' &&
      evtRefIds(said.captions[0]).join() === 'stalingrad-1942' &&
      refs.map((r) => r.id).join() === 'stalingrad-1942' &&
      refs.every((r) => r.cursor === 'pointer' && r.line.includes('underline') && r.style === 'dotted') &&
      !/[[\]]|olay:/.test(await text(page, '[data-testid=watch-caption]')),
    refs.map((r) => `“${r.text}”`).join(' '),
  );
  await page.locator('.dock [data-id="stalingrad-1942"]').first().click();
  await settle(page, 700);
  const oneTimeline = await eventState(page);
  await page.click('[data-testid=event-close]');
  await settle(page, 500);
  await page.mouse.move(300, 420);
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 700);
  const oneCaption = await eventState(page);
  check(
    'Tek adımlı yanıtın altyazısındaki “Stalingrad Muharebesi” de çizelgedeki noktayla aynı şeyi yapar: aynı olay, aynı kart, aynı işaretçiler, soru kutusunda aynı çip; yanıt ekranda kalır',
    JSON.stringify(oneCaption) === JSON.stringify(oneTimeline) &&
      oneCaption.event === 'stalingrad-1942' &&
      oneCaption.card &&
      /Stalingrad/.test(oneCaption.title) &&
      oneCaption.selectedMarker.join() === 'stalingrad-1942' &&
      /Stalingrad/.test(oneCaption.chip ?? '') &&
      oneCaption.step === 1 &&
      oneCaption.view === 'watch' &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')),
    JSON.stringify(oneCaption),
  );
  await shot(page, 'ai-r4-tek-adimli-altyazida-olay-adi.png');
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 500);
  const oneToggled = await eventState(page);
  check(
    'Aynı bağlantıya bir daha tıklamak olayı kapatır; tek adımlı yanıt (altyazı, “Devamını oku”) yerinde',
    oneToggled.event === null &&
      !oneToggled.card &&
      oneToggled.step === 1 &&
      (await visible(page, '[data-testid=watch-more]')),
  );

  // --- its text ("Devamını oku"): the name of the event is a link there too
  await page.click('[data-testid=watch-more]');
  await settle(page, 900);
  const oneRead = await page.evaluate(() => ({
    refs: [...document.querySelectorAll('[data-testid=chat-step] button.evt-ref')].map((b) => b.dataset.event),
    raw: /olay:|\]\(/.test(document.querySelector('[data-testid=chat-scroll]').innerText),
  }));
  check(
    'Tek adımlı yanıtın metninde de olay adı bağlantı (Stalingrad Muharebesi); işaret sözdizimi görünmüyor',
    oneRead.refs.join() === evtRefIds(said.text).join() && oneRead.refs.join() === 'stalingrad-1942' && !oneRead.raw,
    oneRead.refs.join(),
  );
  await page.locator('.dock [data-id="stalingrad-1942"]').first().click();
  await settle(page, 700);
  const oneReadTimeline = await eventState(page);
  await page.click('[data-testid=event-close]');
  await settle(page, 400);
  await page.mouse.move(300, 420);
  await page.click('[data-testid=chat-step] button.evt-ref[data-event="stalingrad-1942"]');
  await settle(page, 800);
  const oneReadRef = await eventState(page);
  const oneReader = await rectOf(page, '#read');
  check(
    'Tek adımlı yanıtın metnindeki bağlantı da çizelgedeki noktayla aynı şeyi yapar (yan panel): aynı olay, aynı kart, kart okuyucunun soluna sığıyor; okuyucu açık, adım yerinde',
    JSON.stringify(oneReadRef) === JSON.stringify(oneReadTimeline) &&
      oneReadRef.event === 'stalingrad-1942' &&
      oneReadRef.card &&
      oneReadRef.cardRect.right <= oneReader.left + 1 &&
      oneReadRef.view === 'read' &&
      oneReadRef.read === 'side' &&
      oneReadRef.step === 1,
    JSON.stringify(oneReadRef.cardRect),
  );
  await shot(page, 'ai-r5-tek-adimli-metinde-olay-adi.png');
  await page.keyboard.press('Escape'); // the card goes first
  await settle(page, 400);
  await page.click('[data-testid=read-watch]');
  await settle(page, 600);
  await cameraRests(page, 8000);

  // --- another one-step answer, whose caption names an event of another year than the one its map shows (1940 and 1939)
  await ask(page, AXIS_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 400);
  const axisSaid = await evtRefSaid(page);
  const axisRefs = await evtRefLinks(page, '[data-testid=watch-caption]');
  await page.locator('.dock [data-id="uclu-pakt-1940"]').first().click();
  await settle(page, 700);
  const axisTimeline = await eventState(page);
  await page.click('[data-testid=event-close]');
  await settle(page, 500);
  await page.mouse.move(300, 420);
  await page.click('[data-testid=watch-caption] button.evt-ref[data-event="uclu-pakt-1940"]');
  await settle(page, 700);
  const axisCaption = await eventState(page);
  check(
    'Başka bir tek adımlı yanıtın (Almanya–İtalya) altyazısındaki “Üçlü Pakt” bağlantısı da çizelgedeki noktayla aynı şeyi yapar, olay haritanın gösterdiği yıldan (1939) başka bir yılda (1940) olsa da',
    evtRefIds(axisSaid.captions[0]).join() === 'uclu-pakt-1940' &&
      axisRefs.map((r) => r.id).join() === 'uclu-pakt-1940' &&
      JSON.stringify(axisCaption) === JSON.stringify(axisTimeline) &&
      axisCaption.event === 'uclu-pakt-1940' &&
      axisCaption.card &&
      /Üçlü Pakt/.test(axisCaption.title) &&
      axisCaption.selectedMarker.join() === 'uclu-pakt-1940' &&
      axisCaption.step === 1 &&
      axisCaption.view === 'watch',
    JSON.stringify(axisCaption),
  );
  await page.context().close();
});

/* ============================================== T. the place timeline shows the range and nothing beyond it */
section(
  'T. Çizelge: yalnızca seçili aralık (ondan önce ve sonra hiçbir şey yok); adım noktaları aralık yazısına ve birbirine binmiyor',
);
/** The place timeline as drawn: its axis (years and where they sit), the dots, the sovereignty strip, the cursor. */
const timelineState = (page) =>
  page.evaluate(() => {
    const plot = document.querySelector('.tl-plot').getBoundingClientRect();
    const evs = window.__ayni.data.eventsById;
    const cur = document.querySelector('.tl-cursor').getBoundingClientRect();
    return {
      width: plot.width,
      range: { ...window.__ayni.store.state.range },
      year: window.__ayni.view().year,
      sub: document.querySelector('.tl-sub')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      ticks: [...document.querySelectorAll('.tl-tick')].map((e) => ({
        year: Number(e.textContent.trim()) || null,
        x: e.getBoundingClientRect().left - plot.left,
      })),
      dots: [...document.querySelectorAll('.tl-ev')].map((e) => {
        const r = e.getBoundingClientRect();
        const ev = evs.get(e.dataset.id);
        return { id: e.dataset.id, cx: (r.left + r.right) / 2 - plot.left, start: ev.start, end: ev.end };
      }),
      segs: [...document.querySelectorAll('.tl-seg')].map((e) => {
        const r = e.getBoundingClientRect();
        return { l: r.left - plot.left, r: r.right - plot.left };
      }),
      cursor: cur.left - plot.left,
      extra: document.querySelectorAll('.tl-range, .tl-ground .is-context, [data-testid=timeline-context]').length,
    };
  });
const timelineChecks = (name, t, from, to) => {
  const span = to - from + 1;
  const labelled = t.ticks.filter((k) => k.year !== null);
  const xOf = (y) => ((y - from) / span) * t.width;
  check(
    `${name}: eksen yalnızca ${from}–${to}: yıl etiketlerinin hepsi bu aralıkta, ${labelled.length} etiket, yerleri aralığa göre (yıl başına ${(t.width / span).toFixed(1)} px); ilk etiket (${from}) çizelgenin sol kenarında, son etiket (${to}) sağ kenara yakın`,
    labelled.length >= 3 &&
      labelled.every((k) => k.year >= from && k.year <= to && Math.abs(k.x - xOf(k.year)) < 1.5) &&
      labelled[0].year === from &&
      Math.abs(labelled[0].x) < 1.5 &&
      labelled.at(-1).year === to &&
      labelled.at(-1).x < t.width &&
      t.sub.includes(`${from}–${to}`),
    `${labelled.map((k) => k.year).join(' ')} · “${t.sub}”`,
  );
  // an event is in the range when its (half-open) time overlaps [from, to + 1); one that began before it keeps to the left edge
  const outside = t.dots.filter((d) => d.start >= to + 1 || d.end <= from).map((d) => d.id);
  const off = t.dots.filter((d) => d.cx < 0 || d.cx > t.width).map((d) => d.id);
  const early = t.dots.filter((d) => d.start < from);
  const loose = early.filter((d) => d.cx > 12).map((d) => d.id);
  check(
    `${name}: çizelgedeki ${t.dots.length} olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; aralıktan önce başlayan ${early.length} olay kenara yapışık duruyor`,
    t.dots.length >= 1 && outside.length === 0 && off.length === 0 && loose.length === 0,
    `${outside.concat(off, loose).join(', ') || 'dışarıda olan yok'}${early.length ? ` · kenarda: ${early.map((d) => d.id).join(', ')}` : ''}`,
  );
  check(
    `${name}: yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (${t.year}) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok`,
    t.segs.length >= 1 &&
      t.segs.every((s) => s.l >= -0.5 && s.r <= t.width + 0.5) &&
      Math.abs(t.cursor - ((t.year + 0.5 - from) / span) * t.width) < 2 &&
      t.extra === 0,
    `imleç ${t.cursor.toFixed(0)} px · ${t.segs.length} parça`,
  );
};
await guard(async () => {
  for (const [from, to, shotName] of [
    [1939, 1945, 'ai-t1-cizelge-aralik.png'],
    [1942, 1944, 'ai-t2-cizelge-dar-aralik.png'],
  ]) {
    const page = await open(`#t=${from}-${to}&p=10.000,53.500`);
    await page.click('[data-testid=intro-close]').catch(() => undefined);
    await settle(page, 800);
    const t = await timelineState(page);
    timelineChecks(`${from}–${to}`, t, from, to);
    await shot(page, shotName);
    if (from === 1939) {
      // the timeline follows the range while it is open: the reader narrows it with the ruler's handles (arrow keys)
      await page.focus('[data-testid=handle-start]');
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      await page.focus('[data-testid=handle-end]');
      await page.keyboard.press('ArrowLeft');
      await settle(page, 800);
      const narrowed = await timelineState(page);
      check(
        'Aralık çizelge açıkken daraltılınca (başlangıç 3 yıl ileri, bitiş 1 yıl geri) aralık 1942–1944 olur',
        narrowed.range.from === 1942 && narrowed.range.to === 1944,
        `${narrowed.range.from}–${narrowed.range.to}`,
      );
      timelineChecks('1942–1944 (daraltıldıktan sonra)', narrowed, narrowed.range.from, narrowed.range.to);
    }
    await page.context().close();
  }
});
await guard(async () => {
  // the ruler's step points while a narration is on: not on each other, not on the range's writing, not on the year labels.
  // The eight steps of the German narration lie in six years (two steps each in 1940, 1942 and 1944); the world narration of
  // a short range (1942–1944) crowds its five steps into two or three years (1941 and 1942 twice each, 1944): a year is only
  // about 6 px of the ruler, so the points have to be spread, and they must not end up on the label of 1950 beside them.
  for (const [range, how] of [
    ['1939-1945', 'place'],
    ['1942-1944', 'world'],
  ]) {
    const page = await open(`#t=${range}${how === 'place' ? '&p=10.000,53.500' : ''}`);
    await page.click('[data-testid=intro-close]').catch(() => undefined);
    if (how === 'place') await page.click('[data-testid=place-narrate]');
    else {
      await page.click('[data-testid=chat-input]');
      await page.click('[data-testid=chat-narrate]');
    }
    await page.waitForSelector('[data-testid=watch-caption]', { timeout: 20000 });
    await finalStatus(page);
    await cameraRests(page, 12000);
    const years = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid=ruler-step]')].map((e) => /· (\d{4})$/.exec(e.title)?.[1]),
    );
    const m = await page.evaluate(() => {
      const R = (e) => {
        const r = e.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom };
      };
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      // how far the boxes of a point and a piece of writing lie into each other (a line box has a little leading above its digits)
      const depth = (a, b) => (a.l < b.r && b.l < a.r ? Math.min(a.b, b.b) - Math.max(a.t, b.t) : -Infinity);
      // the point on screen is drawn 1.3 times as big as the others, and any of them can be that one: every point at that size
      const big = (r) => {
        const cx = (r.l + r.r) / 2;
        const cy = (r.t + r.b) / 2;
        const h = Math.max(r.r - r.l, 19.5) / 2;
        return { l: cx - h, r: cx + h, t: cy - h, b: cy + h };
      };
      const seen = (e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      const pts = [...document.querySelectorAll('[data-testid=ruler-step]')].map((e) => ({ n: e.dataset.n, ...R(e) }));
      const grown = pts.map((p) => ({ n: p.n, ...big(p) }));
      const writing = [...document.querySelectorAll('.range-readout, .brush-label, .ruler-tick b')]
        .filter(seen)
        .map((e) => ({ year: e.matches('.ruler-tick b'), text: e.textContent.trim(), ...R(e) }));
      const pairs = [];
      for (let i = 0; i < grown.length; i++)
        for (let j = i + 1; j < grown.length; j++)
          if (hit(grown[i], grown[j])) pairs.push(`${grown[i].n}×${grown[j].n}`);
      // the points sit on the ruler's axis and its years hang below it: the boxes may meet (the on-screen point at its larger size
      // by about 3 px: a line box has leading above its digits), never lie over each other
      const onWriting = [];
      let deepest = 0;
      for (const p of grown)
        for (const w of writing) {
          const d = depth(p, w);
          if (w.year && d > 0) deepest = Math.max(deepest, d);
          if (w.year ? d > 3 : hit(p, w)) onWriting.push(`${p.n}×${w.text}`);
        }
      const track = document.querySelector('.ruler-track').getBoundingClientRect();
      return {
        n: pts.length,
        order: pts.map((p) => Number(p.n)),
        pairs,
        onWriting,
        deepest,
        label: [...document.querySelectorAll('.brush-label')].some(seen),
        inside: pts.every((p) => p.l >= track.left - 1 && p.r <= track.right + 1),
        gaps: pts.slice(1).map((p, i) => (p.l + p.r) / 2 - (pts[i].l + pts[i].r) / 2),
      };
    });
    const same = Math.max(...Object.values(years.reduce((c, y) => ({ ...c, [y]: (c[y] ?? 0) + 1 }), {})));
    const label = `Aralık ${range.replace('-', '–')}`;
    check(
      `${label}: ${m.n} adım noktası (yılları ${years.join(' ')}; en kalabalık yılda ${same}) birbirine (büyütülmüş hâlleriyle de), aralık yazısına (büyük yazı, fırçanın etiketi) ve cetvel yıllarına (“1950” dahil; büyütülmüş nokta yıl yazısının kutusuna en çok 3 px girebilir: nokta eksenin üstünde, yıl altında) binmiyor; fırçanın kendi etiketi gizli; hepsi cetvelin içinde`,
      m.n >= 5 &&
        m.pairs.length === 0 &&
        m.onWriting.length === 0 &&
        !m.label &&
        m.inside &&
        same >= 2 &&
        (how === 'place' ? m.n === GERMANY.length : true),
      `merkezler arası ${m.gaps.map((g) => g.toFixed(0)).join(' ')} px${m.pairs.length ? ` · değenler ${m.pairs.join()}` : ''}${m.onWriting.length ? ` · yazıya binenler ${m.onWriting.join()}` : ''} · yıl yazısına en çok ${m.deepest.toFixed(1)} px`,
    );
    check(
      `Aralık ${range.replace('-', '–')}: aynı yıla düşen adımların noktaları da en az 22 px arayla açılıyor (merkezden merkeze en dar ${Math.min(...m.gaps).toFixed(1)} px) ve soldan sağa 1’den ${m.n}’e sıralı`,
      m.gaps.length === m.n - 1 && m.gaps.every((g) => g >= 21.5) && m.order.every((n, i) => n === i + 1),
      `sıra ${m.order.join(' ')}`,
    );
    if (how === 'world') await shot(page, 'ai-t3-adim-noktalari-kalabalik.png');
    await page.context().close();
  }
});

/* ====================================== F. the end of the text is not under the question box */
section(
  'F. Oku: metnin son satırı soru kutusunun (ve üstündeki notun, çipin) altında kalmıyor; tam ekranda, yan panelde, dar pencerede ve telefonda',
);
await guard(async () => {
  const cases = [
    { name: 'masaüstü 1440×900', viewport: { width: 1440, height: 900 }, mobile: false, modes: ['full', 'side'] },
    { name: 'dar pencere 1024×700', viewport: { width: 1024, height: 700 }, mobile: false, modes: ['full', 'side'] },
    { name: 'telefon 390×844', viewport: { width: 390, height: 844 }, mobile: true, modes: ['full'] },
  ];
  // the long text (the German narration: eight steps) and the longest text of a one-step answer (a reply that is plain text:
  // its caption is made from the first sentences and the rest waits behind "Devamını oku")
  const answers = [
    { label: 'Almanya anlatımı (8 adım)', ask: null },
    { label: 'tek adımlı yanıt (düz metin)', ask: PLAIN_QUESTION },
  ];
  const rows = [];
  for (const a of answers) {
    for (const c of cases) {
      const page = await open(AT_HAMBURG, { viewport: c.viewport, mobile: c.mobile });
      if (a.ask) {
        await ask(page, a.ask);
        await cameraRests(page, 12000);
        await page.click('[data-testid=watch-more]');
      } else {
        await page.click('[data-testid=place-narrate]');
        await finalStatus(page);
        await cameraRests(page, 12000);
        await showStep(page, GERMANY.length); // the text opens at the last step: its label "Haritada gösteriliyor" is the last line
        await page.click('[data-testid=watch-read]');
      }
      await settle(page, 900);
      for (const mode of c.modes) {
        if (!c.mobile && (await pres(page)).read !== mode) {
          await page.click('[data-testid=read-size]');
          await settle(page, 1000);
        }
        // with an event open (its chip stands over the box as well), and without
        for (const withEvent of [false, true]) {
          if (withEvent) {
            await page.locator('.dock [data-id="stalingrad-1942"]').first().click();
            await settle(page, 700);
          }
          // to the very end (the text may still be settling on its step after the change of size: try until it stays there)
          for (let k = 0; k < 6; k++) {
            await page.evaluate(() => {
              const s = document.querySelector('[data-testid=chat-scroll]');
              s.scrollTo({ top: s.scrollHeight, behavior: 'instant' });
            });
            await settle(page, 350);
            if (
              await page.evaluate(() => {
                const s = document.querySelector('[data-testid=chat-scroll]');
                return s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
              })
            )
              break;
          }
          const g = await page.evaluate(() => {
            const scroll = document.querySelector('[data-testid=chat-scroll]');
            const seen = (e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };
            // the text's last line: the lowest paragraph, link or "shown on the map" label in the scroll area
            const lines = [...scroll.querySelectorAll('p, button, h3, .cs-live')].filter(seen);
            const bottom = Math.max(...lines.map((e) => e.getBoundingClientRect().bottom));
            const foot = document.querySelector('#bottom').getBoundingClientRect();
            const box = document.querySelector('[data-testid=ask]').getBoundingClientRect();
            // what lies over the middle of that last line (and over its two ends): the text itself, or something else?
            const last = lines.reduce((a, b) =>
              b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a,
            );
            const lr = last.getBoundingClientRect();
            const probes = [lr.left + 4, (lr.left + lr.right) / 2, lr.right - 4].map((x) =>
              document.elementFromPoint(
                Math.min(innerWidth - 1, Math.max(0, x)),
                Math.min(innerHeight - 1, lr.top + lr.height / 2),
              ),
            );
            const covered = probes.filter((e) => !e || !scroll.contains(e)).length;
            // the stack beside the reader (map side) does not lie over the text: only a stack that overlaps it sideways counts
            const reader = document.querySelector('#read').getBoundingClientRect();
            const overlapsSideways = foot.left < reader.right && foot.right > reader.left;
            return {
              bottom,
              footTop: foot.top,
              askTop: box.top,
              overlapsSideways,
              covered,
              inView: bottom <= innerHeight,
              atEnd: scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2,
              scrolls: scroll.scrollHeight > scroll.clientHeight + 2,
              chip: !!document.querySelector('[data-testid=chat-event-chip]'),
              last: last.textContent.trim().slice(0, 40),
            };
          });
          rows.push({ ...c, answer: a.label, mode, withEvent, ...g });
          if (a.ask === null && c.name.startsWith('masaüstü') && mode === 'full' && !withEvent)
            await shot(page, 'ai-f1-metnin-sonu-tam-ekran.png');
          if (withEvent) {
            await page.keyboard.press('Escape'); // the event goes (the reader stays)
            await settle(page, 400);
          }
        }
      }
      await page.context().close();
    }
  }
  for (const r of rows)
    check(
      `${r.answer} · ${r.name} · ${r.mode === 'full' ? 'tam ekran' : 'yan panel'}${r.withEvent ? ' · olay açıkken (çip de var)' : ''}: metnin sonuna kaydırınca son satır (“${r.last}…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor`,
      r.chip === r.withEvent &&
        r.atEnd &&
        r.inView &&
        r.covered === 0 &&
        (!r.overlapsSideways || (r.bottom <= r.footTop - 4 && r.bottom <= r.askTop - 4)),
      `son satırın altı ${Math.round(r.bottom)} px, yığının üstü ${Math.round(r.footTop)} px${r.overlapsSideways ? ' (yığın metnin altında)' : ' (yığın haritanın yanında)'} · örtülen uç ${r.covered}/3${r.scrolls ? ' · metin kayıyor' : ' · metin sığıyor'}`,
    );
});

/* ============================================ E. stopping and failing, settings */
section('E. Durdurma, hatalar, ayarlar');
await guard(async () => {
  const page = await open(AT_HAMBURG);
  // the German narration is long (eight steps, a few thousand characters): it can be stopped in the middle
  await page.click('[data-testid=place-narrate]');
  await page.waitForFunction(
    () => (window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1)?.text.length ?? 0) > 70,
    null,
    { timeout: 20000 },
  );
  await page.click('[data-testid=chat-stop]');
  const status = await finalStatus(page);
  await settle(page, 300);
  const kept = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      chars: a.text.length,
      planned: a.plan.numbers().length,
      shown: Number(document.querySelector('[data-testid=watch]')?.dataset.steps),
      caption: a.plan.captionOf(1),
    };
  });
  check(
    `Durdur: yanıt hemen “durduruldu” olur; planın ${GERMANY.length} adımı ve o ana kadar yazılan metin kalır, 1. adımın altyazısı ekranda`,
    status === 'stopped' &&
      kept.planned === GERMANY.length &&
      kept.shown === GERMANY.length &&
      kept.chars > 40 &&
      (await visible(page, '[data-testid=chat-stopped]')) &&
      (await text(page, '[data-testid=watch-caption]')) === plainCaption(kept.caption),
    `${kept.chars} karakter · ${kept.shown} adım`,
  );
  await settle(page, 600);
  check(
    'Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez; “Yeniden dene” yalnızca okur basınca (kendiliğinden bir istek daha gitmez)',
    (await visible(page, '[data-testid=chat-send]')) &&
      !(await page.evaluate(() => window.__ayni.ai.session.busy)) &&
      (await page.getByRole('button', { name: 'Yeniden dene' }).count()) >= 1 &&
      (await page.evaluate(() => window.__ayni.ai.session.provider.requests.length)) === 1,
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  const partialRead = await page.evaluate(() => ({
    chars: document.querySelector('[data-testid=chat-answer]').innerText.length,
    steps: document.querySelectorAll('[data-testid=chat-step]').length,
    pending: document.querySelectorAll('[data-testid=chat-step-pending]').length,
  }));
  check(
    'Metin okuyucuda da yarım kalan kısım, planın tüm adımları (henüz yazılmayanlar altyazılarıyla) ve “Durduruldu” notu var',
    partialRead.steps === GERMANY.length &&
      partialRead.steps - partialRead.pending >= 1 &&
      partialRead.pending >= 1 &&
      (await visible(page, '[data-testid=chat-stopped-read]')),
    `${partialRead.chars} karakter · ${partialRead.steps} adım, ${partialRead.pending} tanesinin metni yazılmamış`,
  );
  await page.click('[data-testid=read-watch]');

  // an answer to a plain question is one step: stopped, it keeps its caption and what was written ("Devamını oku" opens that)
  // The whole answer takes under a second to write: the Stop button is pressed from inside the page, in the very
  // update that makes the text longer than the caption, so no polling can be late.
  await page.evaluate(() => {
    const session = window.__ayni.ai.session;
    const off = session.subscribe(() => {
      const a = session.items.filter((i) => i.kind === 'assistant').at(-1);
      const caption = a?.plan.captionOf(1);
      if (a?.status !== 'streaming' || !caption || a.text.length < caption.length + 70) return;
      off();
      document.querySelector('[data-testid=chat-stop]')?.click();
    });
  });
  await page.fill('[data-testid=chat-input]', STALINGRAD_QUESTION);
  await page.keyboard.press('Enter');
  const oneStatus = await finalStatus(page);
  await idle(page);
  await settle(page, 300);
  const stoppedOne = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      chars: a.text.length,
      caption: a.plan.captionOf(1),
      steps: document.querySelector('[data-testid=watch]')?.dataset.steps,
      stepping: ['watch-prev', 'watch-next', 'watch-count', 'watch-play', 'watch-speed', 'watch-read'].filter((id) =>
        document.querySelector(`[data-testid=${id}]`),
      ),
      requests: window.__ayni.ai.session.provider.requests.length,
      items: window.__ayni.ai.session.items.length,
    };
  });
  check(
    'Tek adımlı yanıt da durdurulabilir: altyazısı, yazılan kısım için “Devamını oku” ve “Durduruldu · Yeniden dene” ekranda; adım denetimi yok',
    oneStatus === 'stopped' &&
      stoppedOne.steps === '1' &&
      stoppedOne.stepping.length === 0 &&
      (await text(page, '[data-testid=watch-caption]')) === plainCaption(stoppedOne.caption) &&
      (await visible(page, '[data-testid=watch-more]')) &&
      (await visible(page, '[data-testid=chat-stopped]')),
    `${stoppedOne.chars} karakter yazılmıştı`,
  );
  await page.getByRole('button', { name: 'Yeniden dene' }).first().click();
  await idle(page);
  await settle(page, 300);
  const retriedOne = await page.evaluate(() => {
    const s = window.__ayni.ai.session;
    const a = s.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      requests: s.provider.requests.length,
      items: s.items.length,
      asks: s.items.filter((i) => i.kind === 'user' && /Stalingrad/.test(i.text)).length,
      status: a.status,
      chars: a.text.length,
    };
  });
  check(
    '“Yeniden dene” durdurulan yanıtın yerine bir kez soruyor: yanıt bu sefer tamamlanır, konuşmada soru ve yanıt birer tane kalır',
    retriedOne.requests === stoppedOne.requests + 1 &&
      retriedOne.items === stoppedOne.items &&
      retriedOne.asks === 1 &&
      retriedOne.status === 'done' &&
      retriedOne.chars > stoppedOne.chars,
    `${stoppedOne.chars} → ${retriedOne.chars} karakter`,
  );

  await ask(page, 'deneme [hata:rate_limited]');
  await settle(page, 500);
  check(
    'rate_limited: hata yanıtın yerinde (altyazı kutusunun içinde); yazılan metin altyazı olarak kalır; yeniden dene düğmesi var',
    (await text(page, '[data-testid=chat-error]')).includes('Çok sık istek') &&
      (await page.evaluate(() => !!document.querySelector('[data-testid=watch] [data-testid=chat-error]'))) &&
      (await visible(page, '[data-testid=chat-retry]')) &&
      (await text(page, '[data-testid=watch-caption]')).includes('ilk cümlesi'),
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
  await settle(page, 800);
  const retried = await page.evaluate(() => {
    const s = window.__ayni.ai.session;
    return {
      sent: s.provider.requests.filter((r) => /rate_limited/.test(r.meta.question)).length,
      asks: s.items.filter((i) => i.kind === 'user' && /rate_limited/.test(i.text)).length,
    };
  });
  check(
    '“Yeniden dene” yalnızca okur basınca ve bir kez soruyor (yeniden de hata gelse başka istek gitmez); konuşmada soru bir tane kalır',
    retried.sent === 2 && retried.asks === 1,
    `${retried.sent} istek`,
  );
  // the error is on the text as well, with its own way to try again
  await page.click('[data-testid=read-toggle]');
  await settle(page, 500);
  check(
    'Metin okuyucuda da hata yerinde: yazılan kısım, hata iletisi ve “Yeniden dene”',
    (await text(page, '[data-testid=chat-error-read]')).includes('Çok sık istek') &&
      (await visible(page, '[data-testid=chat-retry-read]')) &&
      (
        await page.evaluate(() => [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1).innerText)
      ).includes('ilk cümlesi'),
  );
  await page.click('[data-testid=read-watch]');

  await ask(page, 'deneme [hata:not_granted]');
  await settle(page, 400);
  const blocked = await rectOf(page, '[data-testid=chat-blocked]');
  const input = await rectOf(page, '[data-testid=chat-input]');
  check(
    'not_granted: kalıcı uyarı soru kutusunun üstünde, kutu kapalı, izin paneli düğmesi var; “Yeniden dene” yok (yeniden denemek işe yaramaz)',
    (await visible(page, '[data-testid=chat-blocked]')) &&
      blocked.bottom <= input.top + 1 &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      (await page.getByRole('button', { name: 'İzinleri aç' }).count()) >= 1 &&
      (await count(page, '[data-testid=chat-retry]')) === 0,
  );
  await page.context().close();
});
await guard(async () => {
  // the other ways a call can end: each says it in its own words, and only some of them offer another try
  const page = await open(AT_HAMBURG);
  const CASES = [
    { code: 'upstream_error', title: 'Yanıt yarım kaldı', retry: true, keeps: true },
    { code: 'empty_completion', title: 'Model boş yanıt verdi', retry: true, keeps: true },
    { code: 'refused', title: 'Model bu isteği yanıtlamadı', retry: false, keeps: false },
    { code: 'prompt_too_large', title: 'Sohbet çok uzadı', retry: false, keeps: true },
  ];
  for (const c of CASES) {
    await ask(page, `deneme [hata:${c.code}]`);
    await settle(page, 400);
    const s = await page.evaluate((code) => {
      const session = window.__ayni.ai.session;
      const a = session.items.filter((i) => i.kind === 'assistant').at(-1);
      const err = document.querySelector('[data-testid=chat-error]');
      return {
        status: a.status,
        code: a.error?.code,
        text: a.text,
        shownCode: err?.dataset.code,
        inWatch: !!err?.closest('[data-testid=watch]') || !!err?.classList.contains('watch-error'),
        title: err?.querySelector('strong')?.textContent.trim(),
        hint: err?.querySelector('p')?.textContent.trim().length ?? 0,
        retry: !!document.querySelector('[data-testid=chat-retry]'),
        caption: document.querySelector('[data-testid=watch-caption]')?.innerText.trim() ?? null,
        sent: session.provider.requests.filter((r) => r.meta.question.includes(`[hata:${code}]`)).length,
        locked: document.querySelector('[data-testid=chat-input]').disabled,
      };
    }, c.code);
    check(
      `Hata ekranı “${c.code}”: yanıtın yerinde, kendi başlığıyla; “Yeniden dene” ${c.retry ? 'var' : 'yok'}; yazılan kısım ${c.keeps ? 'altyazı olarak kalır' : 'geri çekilir (altyazı yok)'}; sohbet kilitlenmez, kendiliğinden yeniden denenmez`,
      s.status === 'failed' &&
        s.code === c.code &&
        s.shownCode === c.code &&
        s.inWatch &&
        s.title === c.title &&
        s.hint > 10 &&
        s.retry === c.retry &&
        (c.keeps ? /ilk cümlesi/.test(s.caption ?? '') : s.text === '' && s.caption === null) &&
        s.sent === 1 &&
        !s.locked,
      `${s.title ?? 'hata yok'} · ${s.sent} istek`,
    );
  }
  // "Sohbet çok uzadı" sends the reader to a new chat: clearing it makes the box work as before
  await page.click('[data-testid=chat-new]');
  await settle(page, 300);
  await ask(page, AXIS_QUESTION);
  check(
    '“Sohbet çok uzadı”dan sonra “Sohbeti temizle” yeniden çalışır hâle getirir: hata kalkar, yeni soru yanıtlanır',
    (await count(page, '[data-testid=chat-error]')) === 0 &&
      (await page.evaluate(
        () => window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1).status,
      )) === 'done',
  );
  // a refusal for good (the account or the organisation does not allow it): the box is closed, and there is no panel to open
  await ask(page, 'deneme [hata:sampling_disabled]');
  await settle(page, 400);
  check(
    'sampling_disabled: kalıcı uyarı soru kutusunun üstünde, kutu kapalı; izin paneli düğmesi ve “Yeniden dene” yok (kullanıcının yapabileceği bir şey yok)',
    (await visible(page, '[data-testid=chat-blocked]')) &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      (await page.getByRole('button', { name: 'İzinleri aç' }).count()) === 0 &&
      (await count(page, '[data-testid=chat-retry]')) === 0,
  );
  await page.context().close();
});
await guard(async () => {
  // stopped while the model is still thinking (nothing has come yet: no plan, no text): the box over the map says so and offers another try
  const page = await open(AT_HAMBURG);
  // the link in the "Düşünüyor…" box is pressed from inside the page the moment it appears: the model's first words take under a second
  await page.evaluate(() => {
    const watcher = new MutationObserver(() => {
      const stop = document.querySelector('[data-testid=watch-stop]');
      if (!stop) return;
      watcher.disconnect();
      stop.click();
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  });
  await page.fill('[data-testid=chat-input]', AXIS_QUESTION);
  await page.keyboard.press('Enter');
  const status = await finalStatus(page);
  await idle(page);
  await settle(page, 500);
  const early = await page.evaluate(() => {
    const s = window.__ayni.ai.session;
    const a = s.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      chars: a.text.length,
      planned: a.plan.numbers().length,
      requests: s.provider.requests.length,
      drawing: window.__ayni.ai.director.drawing,
    };
  });
  check(
    'Düşünürken Durdur (kutudaki bağlantı): yanıt “durduruldu”, hiçbir şey gelmemiş ve çizilmemiş (harita okurun); “Durduruldu” kutusunda “Yeniden dene” ve kapat düğmesi var',
    status === 'stopped' &&
      early.chars === 0 &&
      early.planned === 0 &&
      early.drawing === null &&
      (await visible(page, '[data-testid=chat-stopped]')) &&
      (await aiDom(page)).hidden &&
      (await page.getByRole('button', { name: 'Yeniden dene' }).count()) >= 1 &&
      (await page.getByRole('button', { name: 'Kapat' }).count()) >= 1 &&
      !(await page.locator('[data-testid=chat-input]').isDisabled()),
    `${early.chars} karakter, ${early.requests} istek`,
  );
  await page.getByRole('button', { name: 'Yeniden dene' }).first().click();
  await idle(page);
  await settle(page, 400);
  const again = await page.evaluate(() => {
    const s = window.__ayni.ai.session;
    return {
      status: s.items.filter((i) => i.kind === 'assistant').at(-1).status,
      requests: s.provider.requests.length,
      items: s.items.length,
    };
  });
  check(
    '“Yeniden dene” aynı soruyu bir kez daha sorar: yanıt bu sefer gelir ve haritada çizilir (ittifak çizgisi); konuşmada soru ve yanıt birer tane',
    again.status === 'done' &&
      again.requests === early.requests + 1 &&
      again.items === 2 &&
      (await aiDom(page)).links.join() === 'alliance',
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open(AT_HAMBURG);
  await page.click('[data-testid=chat-settings]');
  await settle(page, 300);
  const menuText = await text(page, '[data-testid=chat-menu]');
  const labels = await page
    .locator('[data-testid=chat-menu] input[name=tier]')
    .evaluateAll((els) => els.map((e) => e.parentElement.querySelector('b').textContent.trim()));
  check(
    'Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; menüde model adı ya da sürüm numarası yok',
    labels.join() === 'Hızlı,Dengeli,Derin' &&
      (
        await page
          .locator('[data-testid=chat-menu] input[name=tier]:checked')
          .evaluate((e) => e.parentElement.innerText)
      ).includes('Dengeli') &&
      !/\d/.test(menuText),
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
  await ask(page, AXIS_QUESTION);
  check('Seçilen hız modele gidiyor (quick)', (await lastRequest(page)).tier === 'quick');
  check(
    'Seçim tarayıcıda saklanıyor',
    (await page.evaluate(() => localStorage.getItem('ayni-zamanda.tier'))) === 'quick',
  );
  await page.reload();
  await page.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
  await bordersSettled(page);
  await settle(page, 400);
  check('Yenilenince seçim korunuyor', (await page.evaluate(() => window.__ayni.ai.session.tier)) === 'quick');
  await ask(page, AXIS_QUESTION);
  check(
    'Yanıt var: haritada çizim (Çelik Pakt’ın ittifak çizgisi), soru kutusunda metin düğmesi',
    !(await aiDom(page)).hidden &&
      (await aiDom(page)).links.join() === 'alliance' &&
      (await visible(page, '[data-testid=read-toggle]')),
  );
  const clearBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=chat-new]');
    const r = b?.getBoundingClientRect();
    const ask = document.querySelector('[data-testid=ask]').getBoundingClientRect();
    return b && r
      ? {
          visible: r.width > 20 && r.height > 20,
          label: b.innerText.trim(),
          disabled: b.disabled,
          onTheBox: r.left >= ask.left && r.right <= ask.right && r.top >= ask.top && r.bottom <= ask.bottom,
        }
      : null;
  });
  check(
    '“Sohbeti temizle” her zaman görünür (ayar menüsü kapalıyken de, soru kutusunun üzerinde), yazışma varken etkin',
    !!clearBtn &&
      clearBtn.visible &&
      clearBtn.onTheBox &&
      /Sohbeti temizle/.test(clearBtn.label) &&
      !clearBtn.disabled &&
      !(await visible(page, '[data-testid=chat-menu]')),
    JSON.stringify(clearBtn),
  );
  await page.click('[data-testid=chat-new]');
  await settle(page, 400);
  const wiped = await page.evaluate(() => ({
    items: window.__ayni.ai.session.items.length,
    shown: window.__ayni.ai.presentation.shown,
    drawing: window.__ayni.ai.director.drawing,
    veil: Number(window.__ayni.map.getPaintProperty('ai-veil', 'background-opacity')),
  }));
  check(
    '“Sohbeti temizle” yazışmayı, ekrandaki yanıtı ve haritadaki çizimi siler; metin düğmesi kalkar; düğme görünür kalır ama boştayken kapalı',
    wiped.items === 0 &&
      (await visible(page, '[data-testid=chat-new]')) &&
      (await page.locator('[data-testid=chat-new]').isDisabled()) &&
      (await aiDom(page)).hidden &&
      !wiped.shown &&
      wiped.drawing === null &&
      wiped.veil === 0 &&
      !(await visible(page, '[data-testid=watch]')) &&
      !(await visible(page, '[data-testid=read-toggle]')),
  );
  check(
    'Temizlenince harita yeniden okurun: yer seçili kalır, bilgi kartı geri gelir',
    (await page.evaluate(() => window.__ayni.store.state.places.length)) === 1 &&
      (await visible(page, '[data-testid=place-card]')) &&
      !(await visible(page, '[data-testid=card-tab]')),
  );

  // clearing in the middle of an answer: the call is cancelled and nothing of it comes back
  await page.click('[data-testid=place-narrate]');
  await page.waitForFunction(
    () => (window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1)?.text.length ?? 0) > 70,
    null,
    { timeout: 20000 },
  );
  const enabledWhileWriting = !(await page.locator('[data-testid=chat-new]').isDisabled());
  // with the settings menu open the button is still there and not covered by the menu
  await page.click('[data-testid=chat-settings]');
  await settle(page, 200);
  const withMenu = (await visible(page, '[data-testid=chat-menu]')) && (await visible(page, '[data-testid=chat-new]'));
  await page.click('[data-testid=chat-new]');
  await settle(page, 1500);
  const midway = await page.evaluate(() => ({
    items: window.__ayni.ai.session.items.length,
    busy: window.__ayni.ai.session.busy,
    shown: window.__ayni.ai.presentation.shown,
    drawing: window.__ayni.ai.director.drawing,
  }));
  check(
    'Yanıt yazılırken “Sohbeti temizle” etkin (ayar menüsü açıkken de görünür ve menünün altında kalmaz; tıklanınca menü kapanır): çağrı iptal edilir, yazışma ve çizim silinir, sonradan hiçbir şey geri gelmez',
    enabledWhileWriting &&
      withMenu &&
      !(await visible(page, '[data-testid=chat-menu]')) &&
      midway.items === 0 &&
      !midway.busy &&
      !midway.shown &&
      midway.drawing === null &&
      !(await visible(page, '[data-testid=watch]')) &&
      !(await visible(page, '[data-testid=chat-stop]')) &&
      (await aiDom(page)).hidden,
  );
  await page.context().close();
});
await guard(async () => {
  // storage that refuses to answer (a private window, blocked site data): the speed still works while the page lives, it is just not kept
  const blocked = () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  };
  const page = await open(AT_HAMBURG, { init: blocked });
  await page.click('[data-testid=chat-settings]');
  await page.locator('[data-testid=chat-menu] label', { hasText: 'Derin' }).click();
  await page.keyboard.press('Escape');
  await ask(page, AXIS_QUESTION);
  check(
    'Tarayıcı depolaması hata verse de ayar çalışır: seçilen hız (complex) modele gidiyor, yanıt gelir, sayfa bozulmaz',
    (await lastRequest(page)).tier === 'complex' &&
      (await page.evaluate(() => window.__ayni.ai.session.items.at(-1).status)) === 'done',
  );
  await page.reload();
  await page.waitForFunction(() => window.__ayni, null, { timeout: 60000 });
  await bordersSettled(page);
  check(
    'Depolama yokken seçim yenilenince kalmaz: sayfa yine varsayılan hızla (Dengeli) açılır',
    (await page.evaluate(() => window.__ayni.ai.session.tier)) === 'default',
  );
  await page.context().close();
});

/* ============================================ G. the real `sample` adapter */
section('G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)');
/**
 * A fake artifact runtime, put in before the page loads: `window.claude.use('sample')` answers with a function that behaves like
 * the runtime's `sample` (turns in, tools that are plain page functions, `onText` with the whole text so far, failures as
 * rejected `{code, message, text}`), so what the page talks to is the REAL adapter (`src/ai/sampleProvider.ts`). What the stand-in
 * model says depends on `shapes` (one per call, the last goes on): `two` = a plan of two scenes (the axis question), `one` = a plan
 * of ONE scene (an answer to a plain question: step n:1, then the text under "## 1."), `plain` = tools offered but none called and
 * plain paragraphs without headings (a model that ignores the format).
 */
const FAKE_RUNTIME = (opts = {}) => {
  window.__noTools = !!opts.noTools;
  window.__rejectWith = opts.rejectWith ?? null;
  window.__rejectToolsWith = opts.rejectToolsWith ?? null;
  window.__hold = !!opts.hold;
  window.__maxTools = opts.maxTools ?? 12;
  window.__shapes = opts.shapes ?? ['two'];
  window.__sampleCalls = [];
  window.__permissionsOpened = 0;
  window.__aborted = 0;
  window.__release = null;
  // the three ways a model may answer: the tool round first (no text), then the text in two pieces
  const SHAPES = {
    two: {
      plan: (by, ctx) => [
        by.step.execute(
          {
            n: 1,
            title: 'Çelik Pakt',
            caption: "22 Mayıs 1939'da Almanya ile İtalya, Çelik Pakt ile karşılıklı askerî yardım ittifakı kurdu.",
            year: 1939,
          },
          ctx,
        ),
        by.highlight.execute({ step: 1, polities: ['nazi-germany', 'kingdom-of-italy', 'atlantis'] }, ctx),
        by.connect.execute(
          { step: 1, from: 'nazi-germany', to: 'kingdom-of-italy', relation: 'alliance', label: 'Çelik Pakt' },
          ctx,
        ),
        by.step.execute(
          {
            n: 2,
            title: 'El Alamein',
            caption:
              "Ekim 1942'de [El Alamein](olay:el-alamein-1942)'de Britanya ordusu, Mısır sınırında Mihver kuvvetlerini durdurdu.",
          },
          ctx,
        ),
        by.highlight.execute({ step: 2, polities: ['nazi-germany', 'kingdom-of-italy'] }, ctx),
        by.show_event.execute({ step: 2, event: 'el-alamein-1942' }, ctx),
      ],
      first: '## 1. Çelik Pakt\nBu yanıt sahte çalışma zamanından geldi',
      rest: ", araçlarla birlikte. 22 Mayıs 1939'da imzalanan Çelik Pakt, Almanya ile İtalya'yı karşılıklı askerî yardıma bağlayan açık bir ittifaktı.\n\n## 2. El Alamein\n[El Alamein](olay:el-alamein-1942)'de Mısır sınırında Britanya ordusu Mihver kuvvetlerini durdurdu.",
    },
    one: {
      plan: (by, ctx) => [
        by.step.execute(
          {
            n: 1,
            title: 'Stalingrad',
            caption:
              "[Stalingrad Muharebesi](olay:stalingrad-1942) Şubat 1943'te Alman 6. Ordusu'nun teslimiyle bitti; doğuda inisiyatif Sovyetlere geçti.",
          },
          ctx,
        ),
        by.show_event.execute({ step: 1, event: 'stalingrad-1942' }, ctx),
      ],
      first:
        "## 1. Stalingrad\nAğustos 1942'de Volga kıyısına ulaşan Alman 6. Ordusu, kentte aylarca süren sokak çatışmalarına girdi.",
      rest: " Kızıl Ordu 19 Kasım'da karşı taarruza geçip ordunun çevresini kapattı; [Stalingrad Muharebesi](olay:stalingrad-1942) Şubat 1943'te Alman teslimiyle sona erdi.\n\nSonuç yalnızca bir yenilgi değildi: Almanya doğuda bir daha genel bir taarruz başlatamadı. Kayıp sayıları tartışmalıdır.",
    },
    plain: {
      plan: null,
      first: "Hava gücü, İkinci Dünya Savaşı'nın sonucunu belirleyen etkenlerden biriydi.",
      rest: " Savaşın başında Almanya'nın yıldırım savaşı, yoğun hava desteğiyle ilerleyen zırhlı birliklere dayanıyordu; Britanya Muharebesi'nde bu üstünlüğü kuramaması ise Almanya'nın ilk büyük başarısızlığı oldu.\n\nSavaşın ilerleyen yıllarında Müttefikler stratejik bombardıman kampanyalarıyla Alman sanayisini ve şehirlerini hedef aldı; bu kampanyanın sonuçları bugün de tartışılıyor.\n\nSon olarak atom bombaları, hava gücünün savaşı bitirmedeki rolünü en yıkıcı biçimiyle gösterdi.",
    },
  };
  const sample = async (input, options = {}) => {
    const index = window.__sampleCalls.length;
    const offered = options.tools || [];
    window.__sampleCalls.push({
      roles: input.map((t) => t.role),
      tier: options.modelTier,
      hasCache: 'cache' in options,
      cache: options.cache,
      tools: offered.map((t) => t.name),
      schemas: offered.every((t) => t.inputSchema && t.inputSchema.type === 'object' && t.description.length <= 1024),
      stepSchema: offered.find((t) => t.name === 'step')?.inputSchema ?? null,
      signal: !!options.signal,
      first: input[0].content,
      last: input[input.length - 1].content,
      turns: input.map((t) => t.content),
    });
    if (window.__rejectWith) throw window.__rejectWith;
    if (offered.length && window.__rejectToolsWith) throw window.__rejectToolsWith;
    // the runtime hands the page's cancel back as an abort: the call ends and says so
    const aborted = new Promise((_, reject) => {
      const stop = () => {
        window.__aborted++;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (options.signal?.aborted) stop();
      else options.signal?.addEventListener('abort', stop, { once: true });
    });
    aborted.catch(() => undefined);
    const wait = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), aborted]);
    const shape = SHAPES[window.__shapes[Math.min(index, window.__shapes.length - 1)]];
    const ctx = { signal: options.signal };
    if (offered.length && shape.plan) {
      const by = Object.fromEntries(offered.map((t) => [t.name, t]));
      // the first round: no text, every call at once (as the instructions ask)
      window.__toolResults = await Promise.all(shape.plan(by, ctx));
    }
    // the long texts are written after the plan; a held call lets the page be looked at in between
    if (window.__hold) await Promise.race([new Promise((r) => (window.__release = r)), aborted]);
    await wait(80);
    options.onText?.({ text: shape.first, delta: shape.first });
    await wait(80);
    const full = shape.first + shape.rest;
    options.onText?.({ text: full, delta: shape.rest });
    return { text: full, truncated: false, modelTierApplied: options.modelTier };
  };
  sample.limits = async () => ({
    maxPromptBytes: 262144,
    tools: window.__noTools ? undefined : { maxCount: window.__maxTools },
  });
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
/** The controls only an answer of several steps has (an answer to a plain question has none of them). */
const EGH_STEPPING_IDS = ['watch-prev', 'watch-next', 'watch-count', 'watch-play', 'watch-speed', 'watch-read'];
const eghSteppingOn = (page) =>
  page.evaluate((ids) => ids.filter((id) => document.querySelector(`[data-testid=${id}]`)), EGH_STEPPING_IDS);
await guard.smoke(async () => {
  const page = await open(AT_HAMBURG, { init: FAKE_RUNTIME, initArg: { hold: true } });
  check(
    'Gerçek çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”',
    !(await visible(page, '[data-testid=ask-mock-note]')) &&
      (await page.evaluate(() => window.__ayni.ai.session.provider.kind)) === 'sample',
  );
  await page.fill('[data-testid=chat-input]', AXIS_QUESTION);
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
    'Metin henüz yokken (araç turu bitti, uzun metin yazılmıyor) İzle başladı: 1. adımın altyazısı ve “Metin yazılıyor…”; çok adımlı İzle’de “Devamını oku” satırı yok',
    early.chars === 0 &&
      early.status !== 'done' &&
      early.writing &&
      early.count === '1 / 2' &&
      /Çelik Pakt ile karşılıklı/.test(early.caption) &&
      (await count(page, '[data-testid=watch-more]')) === 0,
    `${early.status} · ${early.chars} karakter · ${early.count}`,
  );
  const mid = await mapState(page);
  check(
    'Haritada 1. adımın çizimi şimdiden var (Almanya ve İtalya, ittifak çizgisi ve etiketi, 1939); tanınmayan devlet sessizce atlandı',
    mid.ids.join() === 'nazi-germany,kingdom-of-italy' &&
      mid.links.join() === 'alliance' &&
      mid.flags.includes('Çelik Pakt') &&
      mid.year === '1939' &&
      mid.outside === 0 &&
      mid.covered === 0,
    mid.ids.join('+'),
  );
  await showStep(page, 2);
  const mid2 = await mapState(page);
  // the model named Germany, Italy and the event; the parties of the event come from the data
  const lit2 = await page.evaluate(() => {
    const r = window.__ayni.ai.session.resolver;
    const ev = r.eventById('el-alamein-1942');
    const year = r.showYearOf(ev);
    const ids = ['nazi-germany', 'kingdom-of-italy'];
    for (const p of ev.parties) if (!ids.includes(p)) ids.push(p);
    return { ids: ids.filter((id) => r.rowAt(id, year)), year, named: 2 };
  });
  check(
    'Metin yazılmadan 2. adıma da geçilebiliyor: model yalnızca Almanya + İtalya’yı ve El Alamein’i söyledi; uygulama olayın öbür taraflarını da öne çıkardı, savaş çizgisini çizdi, yılı olayınkinden aldı (1942)',
    (await pres(page)).step === 2 &&
      mid2.ids.join() === lit2.ids.join() &&
      lit2.ids.length > lit2.named &&
      mid2.markers.join() === 'el-alamein-1942' &&
      mid2.wars === 1 &&
      mid2.year === String(lit2.year),
    `${mid2.ids.join('+')} · ${mid2.markers.join()} · savaş ${mid2.wars}`,
  );
  // the name of the event in the caption is a link: it does what a click on the event in the timeline does
  const refs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=watch-caption] button.evt-ref')].map((b) => [
      b.textContent,
      b.dataset.event,
    ]),
  );
  check(
    'Altyazıdaki olay adı bağlantı: “El Alamein” → el-alamein-1942 (gösterilen metin, [ad](olay:kimlik) işareti değil)',
    refs.length === 1 &&
      refs[0][0] === 'El Alamein' &&
      refs[0][1] === 'el-alamein-1942' &&
      !/olay:/.test(await text(page, '[data-testid=watch-caption]')),
    JSON.stringify(refs),
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 500);
  check(
    'Metin yazılmadan Oku açılırsa her iki adımın altyazısı yerinde duruyor (“yazılıyor” sürerken boş kalmaz)',
    (await count(page, '[data-testid=chat-step]')) === 2 &&
      (await count(page, '[data-testid=chat-step-pending]')) === 2,
  );
  await page.click('[data-testid=read-watch]');
  await page.evaluate(() => window.__release());
  await finalStatus(page);
  await settle(page, 400);
  check(
    'Metin gelince “Metin yazılıyor…” kalkar; oynatılan adım (2) yerinde kalır',
    !(await visible(page, '[data-testid=watch-writing]')) && (await pres(page)).step === 2,
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
  check(
    'Yönerge dosyası altyazıyı ve tek adımlı cevabı anlatıyor; sayfanın notları da: her cevap adımlı, tek şey için n:1, iki tur, örnekler',
    /altyazı/i.test(INSTRUCTION_FILE) &&
      /tek adım/i.test(INSTRUCTION_FILE) &&
      /Her cevap adımlıdır/.test(call.first) &&
      /ÖRNEK \(tek adımlı/.test(call.first) &&
      /step\{n:1,/.test(call.first) &&
      /ÖRNEK \(iki adımlı/.test(call.first) &&
      !/Tek parça cevap/.test(call.first),
  );
  check('Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)', call.hasCache === false);
  check(
    'Beş araç, bu sırayla: step, show_event, highlight, connect, mark (kamera ya da görünüş aracı yok)',
    call.tools.join() === 'step,show_event,highlight,connect,mark',
    call.tools.join(),
  );
  check(
    'Adım aracı iki metin ister: numara, başlık ve altyazı (caption); yıl isteğe bağlı',
    call.stepSchema &&
      ['n', 'title', 'caption', 'year'].every((k) => k in call.stepSchema.properties) &&
      ['n', 'title', 'caption'].every((k) => call.stepSchema.required.includes(k)) &&
      !call.stepSchema.required.includes('year'),
  );
  const results = await page.evaluate(() => window.__toolResults);
  check(
    'Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi',
    results[0] === 'tamam' && /atlantis/.test(results[1]) && results.every((r) => typeof r === 'string'),
  );
  // what the page tells the model about the moment: the reader's place and range, and the ids it may use
  const listed = await page.evaluate((last) => {
    const lines = (head) => {
      const at = last.indexOf(head);
      return at < 0
        ? []
        : last
            .slice(at)
            .split('\n\n')[0]
            .split('\n')
            .slice(1)
            .filter((l) => l.includes(' | '));
    };
    const events = lines('OLAYLAR (').map((l) => l.split(' | ')[0]);
    const polities = lines('POLİTİLER (').map((l) => l.split(' | ')[0]);
    const { data } = window.__ayni;
    return {
      events: events.length,
      eventsKnown: events.every((id) => data.eventsById.has(id)),
      withAlamein: events.includes('el-alamein-1942') && events.includes('stalingrad-1942'),
      polities: polities.length,
      withGermany: polities.includes('nazi-germany') && /nazi-germany \| Nazi Almanyası/.test(last),
    };
  }, call.last);
  check(
    'Son tur sayfanın o anki durumunu söylüyor: seçili yer (Nazi Almanyası) ve aralık (1939–1945), modelin kullanabileceği devlet ve olay kimlikleri (hepsi veri setinde), istek en sonda',
    /Seçili yer: Nazi Almanyası \(/.test(call.last) &&
      /Seçili zaman aralığı: 1939–1945/.test(call.last) &&
      listed.withGermany &&
      listed.polities >= 10 &&
      listed.events >= 20 &&
      listed.eventsKnown &&
      listed.withAlamein &&
      call.last.endsWith(`İSTEK\n${AXIS_QUESTION}`) &&
      !/ANLATIM İSKELETİ/.test(call.last),
    `${listed.polities} devlet · ${listed.events} olay`,
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
  await ask(page, JAPAN_QUESTION);
  const second = await page.evaluate(() => window.__sampleCalls[1]);
  check(
    'İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”; yönergeler yine başta',
    second.roles.join() === 'user,user,assistant,user' &&
      second.tier === 'complex' &&
      /İSTEK\nPeki Japonya\?/.test(second.last) &&
      second.first.startsWith(INSTRUCTION_FILE),
    second.roles.join(),
  );
  const said = await page.evaluate(() => {
    const r = window.__ayni.ai.session.resolver;
    return {
      de: r.nameOf('nazi-germany'),
      it: r.nameOf('kingdom-of-italy'),
      alamein: r.eventById('el-alamein-1942').title,
    };
  });
  const scenes = second.turns[2].slice(0, second.turns[2].indexOf('\n'));
  check(
    'Konuşmanın tamamı modele gidiyor: önceki sorunun kendisi, önceki yanıtın tam metni (iki adım, olay işaretleriyle) ve o yanıtın haritada ne gösterdiği (adım adım)',
    /Almanya ile İtalya arasındaki ittifak neydi\?/.test(second.turns[1]) &&
      /\[El Alamein\]\(olay:el-alamein-1942\)'de Mısır sınırında Britanya ordusu/.test(second.turns[2]) &&
      second.turns[2].includes('araçlarla birlikte.') &&
      scenes.startsWith(`[Haritada gösterdiklerim: 1. adım: öne çıkan: ${said.de}, ${said.it}`) &&
      scenes.includes(`${said.de} – ${said.it}: ittifak (Çelik Pakt)`) &&
      scenes.includes(`2. adım: öne çıkan: ${said.de}, ${said.it}; olay: ${said.alamein}`) &&
      !/Önceki cevabımın özeti/.test(second.turns[2]),
    scenes.slice(0, 220),
  );
  check(
    'Yeni çağrının bağlamında önceki çizimler söyleniyor; konu değişmediği için “konu değişti” notu ve tekrar notu yok',
    /Haritada şu an senin çizdiklerin var/.test(second.last) && !/Konu değişti|\nTEKRAR\n/.test(second.last),
  );
  // the third question after "Sohbeti temizle" starts from nothing: no history reaches the model
  await page.click('[data-testid=chat-new]');
  await settle(page, 300);
  await ask(page, JAPAN_QUESTION);
  const third = await page.evaluate(() => window.__sampleCalls[2]);
  const everything = third.turns.join('\n');
  check(
    '“Sohbeti temizle”den sonra sorulan soruda önceki konuşma modele gitmez (yalnızca yönergeler ve yeni istek): ne önceki soru, ne yanıtın metni, ne haritada gösterdikleri, ne tekrar ya da konu değişti notu',
    third.roles.join() === 'user,user' &&
      !/Almanya ile İtalya arasındaki ittifak neydi/.test(everything) &&
      !/Mısır sınırında Britanya ordusu/.test(everything) &&
      !/Haritada gösterdiklerim|Haritada şu an senin çizdiklerin var|Konu değişti|\nTEKRAR\n/.test(everything) &&
      /İSTEK\nPeki Japonya\?/.test(third.last),
    third.roles.join(),
  );
  check(
    'Hız seçimi sohbeti temizlemekten etkilenmez: üçüncü çağrı da “complex”',
    third.tier === 'complex',
    String(third.tier),
  );
  await shot(page, 'ai-8-gercek-sample.png');
  await page.context().close();
});
await guard(async () => {
  // an answer to a plain question: the model plans ONE step; Watch starts with the plan, the text comes later
  const page = await open(AT_HAMBURG, { init: FAKE_RUNTIME, initArg: { hold: true, shapes: ['one'] } });
  await page.click('[data-testid=chat-settings]');
  await page.locator('[data-testid=chat-menu] label', { hasText: 'Hızlı' }).click();
  await page.keyboard.press('Escape');
  await page.fill('[data-testid=chat-input]', STALINGRAD_QUESTION);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=watch-caption]', { timeout: 10000 });
  await cameraRests(page, 12000);
  await settle(page, 300);
  const early = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    const w = document.querySelector('[data-testid=watch]');
    const more = document.querySelector('[data-testid=watch-more]');
    return {
      status: a.status,
      chars: a.text.length,
      single: w.classList.contains('watch-single'),
      steps: w.dataset.steps,
      writing: !!document.querySelector('[data-testid=watch-writing]'),
      rowThere: !!more,
      rowReserved: !!more?.parentElement.classList.contains('is-reserved'),
      rulerPoints: document.querySelectorAll('[data-testid=ruler-step]').length,
    };
  });
  const earlyStepping = await eghSteppingOn(page);
  const boxBefore = await rectOf(page, '[data-testid=watch]');
  check(
    'Tek adımlı yanıt (n:1): plan gelince, metin yokken İzle başladı: tek altyazı ve “Metin yazılıyor…”; adım denetimi ve çizelgede adım noktaları yok; “Devamını oku”nun yeri ayrılmış ama görünmüyor',
    early.chars === 0 &&
      early.status !== 'done' &&
      early.single &&
      early.steps === '1' &&
      early.writing &&
      earlyStepping.length === 0 &&
      early.rulerPoints === 0 &&
      early.rowThere &&
      early.rowReserved &&
      !(await visible(page, '[data-testid=watch-more]')) &&
      /Stalingrad Muharebesi.*teslimiyle bitti/.test(await text(page, '[data-testid=watch-caption]')),
    `${early.status} · ${early.chars} karakter · adım ${early.steps}`,
  );
  const lit = await page.evaluate(() => {
    const r = window.__ayni.ai.session.resolver;
    const ev = r.eventById('stalingrad-1942');
    const year = r.showYearOf(ev);
    return { ids: ev.parties.filter((id) => r.rowAt(id, year)), year };
  });
  const oneMap = await mapState(page);
  check(
    'Haritada olayın çizimi şimdiden var: yalnızca Stalingrad’ı söyleyen modelin yerine uygulama iki tarafı öne çıkardı, savaş çizgisini ve olay işaretini koydu, yılı olayınkinden aldı (1942)',
    lit.ids.length === 2 &&
      oneMap.ids.join() === lit.ids.join() &&
      oneMap.markers.join() === 'stalingrad-1942' &&
      oneMap.wars === 1 &&
      oneMap.year === String(lit.year) &&
      oneMap.outside === 0 &&
      oneMap.covered === 0,
    `${oneMap.ids.join('+')} · ${oneMap.year}`,
  );
  // Stop reaches the runtime's call (the signal), and what the plan gave stays
  await page.click('[data-testid=chat-stop]');
  const stoppedStatus = await finalStatus(page);
  await idle(page);
  await settle(page, 300);
  check(
    'Durdur gerçek çağrıyı da iptal eder (çalışma zamanı iptal sinyalini görür); yanıt “durduruldu”, planın altyazısı ekranda kalır, yazılmış metin olmadığından “Devamını oku” yok',
    stoppedStatus === 'stopped' &&
      (await page.evaluate(() => window.__aborted)) === 1 &&
      (await visible(page, '[data-testid=chat-stopped]')) &&
      /Stalingrad Muharebesi.*teslimiyle bitti/.test(await text(page, '[data-testid=watch-caption]')) &&
      !(await visible(page, '[data-testid=watch-more]')),
  );
  await page.getByRole('button', { name: 'Yeniden dene' }).first().click();
  await page.waitForFunction(() => window.__sampleCalls.length === 2, null, { timeout: 10000 });
  await page.waitForSelector('[data-testid=watch-writing]', { timeout: 10000 });
  await cameraRests(page, 12000);
  await settle(page, 300);
  const [first, retry] = await page.evaluate(() => window.__sampleCalls);
  check(
    '“Yeniden dene” gerçek çağrıyı bir kez daha yapar: aynı istek, hız “quick”, konuşma geçmişi yok (durdurulan yanıt konuşmadan çıktı)',
    retry.roles.join() === 'user,user' &&
      retry.tier === 'quick' &&
      first.tier === 'quick' &&
      first.last.endsWith(`İSTEK\n${STALINGRAD_QUESTION}`) &&
      retry.last.endsWith(`İSTEK\n${STALINGRAD_QUESTION}`) &&
      (await page.evaluate(() => window.__sampleCalls.length)) === 2,
    retry.roles.join(),
  );
  const boxHeld = await rectOf(page, '[data-testid=watch]');
  const camHeld = await camera(page);
  await page.evaluate(() => window.__release());
  await finalStatus(page);
  await idle(page);
  await settle(page, 600);
  const boxDone = await rectOf(page, '[data-testid=watch]');
  const camDone = await camera(page);
  check(
    'Metin gelince “Devamını oku” görünür; altyazı kutusu aynı boyda kalır (yeri baştan ayrılmıştı) ve kamera yerinden oynamaz',
    (await visible(page, '[data-testid=watch-more]')) &&
      !(await visible(page, '[data-testid=watch-writing]')) &&
      Math.abs(boxDone.height - boxHeld.height) <= 1 &&
      Math.abs(boxDone.height - boxBefore.height) <= 1 &&
      sameCamera(camHeld, camDone),
    `kutu ${Math.round(boxHeld.height)} → ${Math.round(boxDone.height)} px`,
  );
  await page.click('[data-testid=watch-more]');
  await settle(page, 700);
  const readOne = await page.evaluate(() => ({
    view: window.__ayni.ai.presentation.view,
    steps: document.querySelectorAll('[data-testid=chat-step]').length,
    numbered: document.querySelectorAll('.cs-n').length,
    title: document.querySelector('[data-testid=chat-step-title]')?.textContent.trim(),
    paragraphs: document.querySelectorAll('[data-testid=chat-step] .prose').length,
    refs: [...document.querySelectorAll('[data-testid=chat-step] button.evt-ref')].map((b) => b.dataset.event),
    active: document.querySelector('[data-testid=chat-step]')?.dataset.active,
  }));
  check(
    '“Devamını oku” metni açar: tek adım (numarasız), başlık “Stalingrad”, iki paragraf, olay adı bağlantı, harita bu adımda',
    readOne.view === 'read' &&
      readOne.steps === 1 &&
      readOne.numbered === 0 &&
      readOne.title === 'Stalingrad' &&
      readOne.paragraphs === 2 &&
      readOne.refs.join() === 'stalingrad-1942' &&
      readOne.active === 'true',
    JSON.stringify(readOne),
  );
  await page.click('[data-testid=read-watch]');
  await settle(page, 400);
  check(
    'İzle’ye dönünce yanıt hâlâ tek adım: altyazı ve “Devamını oku” yerinde, adım denetimi yok',
    (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await visible(page, '[data-testid=watch-more]')) &&
      (await eghSteppingOn(page)).length === 0,
  );
  await page.context().close();
});
await guard(async () => {
  // a model that answers in plain text (no plan, no headings) still works; the conversation reaches it in both forms
  const page = await open(AT_HAMBURG, { init: FAKE_RUNTIME, initArg: { shapes: ['plain', 'one', 'plain'] } });
  await ask(page, PLAIN_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 400);
  const plain = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    const w = document.querySelector('[data-testid=watch]');
    return {
      planEmpty: a.plan.empty,
      text: a.text,
      headings: /^#/m.test(a.text),
      caption: document.querySelector('[data-testid=watch-caption]')?.innerText.trim() ?? '',
      single: !!w?.classList.contains('watch-single'),
      steps: w?.dataset.steps,
      drawn: window.__ayni.ai.director.drawing,
    };
  });
  const flat = plain.text.replace(/\s+/g, ' ');
  check(
    'Yalnızca düz metin yazan model de çalışır (araç çağırmadı, başlık da yazmadı): altyazı metnin ilk cümle(ler)inden yapılır, en çok 220 karakter, metnin tamamı değil; adım denetimi yok',
    plain.planEmpty &&
      !plain.headings &&
      plain.single &&
      plain.steps === '1' &&
      plain.caption.length > 20 &&
      plain.caption.length <= 220 &&
      flat.startsWith(plain.caption.replace(/…$/, '')) &&
      plain.caption.length < flat.length / 2 &&
      (await eghSteppingOn(page)).length === 0,
    `altyazı ${plain.caption.length} / metin ${plain.text.length} karakter`,
  );
  check(
    '…“Devamını oku” altyazının altında görünür (metin altyazıdan uzun); haritada gösterilecek bir çizim yok',
    (await visible(page, '[data-testid=watch-more]')) &&
      (!plain.drawn || (!plain.drawn.highlights.length && !plain.drawn.events.length && !plain.drawn.marks.length)),
  );
  await shot(page, 'ai-8b-gercek-sample-duz-metin.png');
  await page.click('[data-testid=watch-more]');
  await settle(page, 700);
  const readPlain = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid=chat-answer]')].at(-1);
    return {
      view: window.__ayni.ai.presentation.view,
      steps: el.querySelectorAll('[data-testid=chat-step]').length,
      numbered: el.querySelectorAll('.cs-n').length,
      paragraphs: el.querySelectorAll('[data-testid=chat-step] .prose').length,
      text: el.innerText,
      show: el.querySelectorAll('[data-testid=chat-step-show]').length,
    };
  });
  check(
    '“Devamını oku” metnin tamamını açar: tek (numarasız) adım, üç paragraf; haritada gösterilecek bir şey olmadığından “Haritada göster” yok',
    readPlain.view === 'read' &&
      readPlain.steps === 1 &&
      readPlain.numbered === 0 &&
      readPlain.paragraphs === 3 &&
      readPlain.text.includes('en yıkıcı biçimiyle gösterdi.') &&
      readPlain.show === 0,
    `${readPlain.paragraphs} paragraf`,
  );
  await page.click('[data-testid=read-watch]');
  await ask(page, STALINGRAD_QUESTION);
  await ask(page, JAPAN_QUESTION);
  const turns = await page.evaluate(() => window.__sampleCalls.map((c) => c.turns));
  const answers = await page.evaluate(() =>
    window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').map((i) => i.text),
  );
  check(
    'Düz metin yanıt sonraki çağrıda olduğu gibi gider (başlıksız; haritada gösterilen bir şey olmadığından “Haritada gösterdiklerim” notu yok); sıra: yönergeler, soru, yanıt, istek',
    turns[1].length === 4 && turns[1][2] === answers[0] && !/Haritada gösterdiklerim/.test(turns[1][2]),
    String(turns[1].length),
  );
  const answerOne = turns[2][4];
  check(
    'Tek adımlı yanıt sonraki çağrıda adımsız anılır: “[Haritada gösterdiklerim: …]” (“1. adım:” öneki yok), ardından tam metin; sıra: yönergeler, soru, yanıt, soru, yanıt, istek',
    turns[2].length === 6 &&
      answerOne.startsWith('[Haritada gösterdiklerim: ') &&
      !/1\. adım:/.test(answerOne.slice(0, answerOne.indexOf('\n'))) &&
      answerOne.endsWith(answers[1]),
    answerOne.slice(0, 160),
  );
  await page.context().close();
});
await guard(async () => {
  const page = await open(AT_HAMBURG, { init: FAKE_RUNTIME, initArg: { noTools: true } });
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await settle(page, 400);
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; altyazının altında “yalnızca metin” notu görünür',
    call.tools.length === 0 &&
      call.cache === false &&
      /yalnızca metin/.test(await text(page, '[data-testid=watch-note]')),
  );
  check(
    'Araçsız çağrıda uygulama notları yalnızca metin biçimini anlatır (“## n. Başlık”, tek şey için tek adım); araç adı, devlet ve olay listeleri, anlatım iskeleti gönderilmez',
    /yalnızca metin yaz/.test(call.first) &&
      /## n\. Başlık/.test(call.first) &&
      /## 1\. Başlık/.test(call.first) &&
      !/show_event|highlight/.test(call.first) &&
      !/POLİTİLER|OLAYLAR|ANLATIM İSKELETİ/.test(call.last),
  );
  const noPlan = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      planEmpty: a.plan.empty,
      caption: document.querySelector('[data-testid=watch-caption]')?.innerText.trim(),
    };
  });
  const firstStep = await page.evaluate(() => {
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return a.text
      .split('\n\n## 2.')[0]
      .replace(/^## 1\..*\n/, '')
      .replace(/\s+/g, ' ');
  });
  check(
    'Araçsız yanıtta altyazıları uygulama metinden çıkarır: iki adım (“1 / 2”), 1. adımın altyazısı adımın ilk cümleleri (en çok 220 karakter)',
    noPlan.planEmpty &&
      (await text(page, '[data-testid=watch-count]')).replace(/\s+/g, ' ').trim() === '1 / 2' &&
      noPlan.caption.length <= 220 &&
      noPlan.caption.length > 20 &&
      firstStep.startsWith(noPlan.caption),
    `${noPlan.caption.length} karakter`,
  );
  await page.click('[data-testid=watch-read]');
  await settle(page, 400);
  check('Aynı not okuyucuda da var', /yalnızca metin/.test(await text(page, '[data-testid=chat-note]')));
  await page.context().close();
});
await guard(async () => {
  const page = await open(AT_HAMBURG, {
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
  // the request that was refused was the German narration: the page had sent the outline it makes from the data
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  const outline = await page.evaluate((last) => {
    const block = last.split('ANLATIM İSKELETİ')[1] ?? '';
    const rows = block
      .split('\n\n')[0]
      .split('\n')
      .slice(1)
      .map((l) => /^(\d+)\. (\S+) \|/.exec(l));
    const events = rows.map((m) => (m ? window.__ayni.data.eventsById.get(m[2]) : undefined));
    return {
      n: rows.length,
      numbered: rows.every((m, i) => m && Number(m[1]) === i + 1),
      known: events.every(Boolean),
      german: events.every((e) => e?.parties.includes('nazi-germany')),
      inOrder: events.every((e, i) => i === 0 || e.start >= events[i - 1].start),
    };
  }, call.last);
  check(
    'Anlatım isteğinde sayfa, veriden çıkardığı iskeleti gönderiyor: Nazi Almanyası’nın taraf olduğu, veri setinde olan 3–6 dönüm noktası, numaralı ve tarih sırasıyla',
    /Bu yerin tarihini seçili aralıkta anlat\./.test(call.last) &&
      outline.n >= 3 &&
      outline.n <= 6 &&
      outline.numbered &&
      outline.known &&
      outline.german &&
      outline.inOrder,
    `${outline.n} adım`,
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
  const page = await open(AT_HAMBURG, {
    init: FAKE_RUNTIME,
    initArg: { maxTools: 3, rejectWith: { code: 'rate_limited', message: 'slow', text: 'Yarım' } },
  });
  await page.fill('[data-testid=chat-input]', 'Soru');
  await page.keyboard.press('Enter');
  await finalStatus(page);
  await settle(page, 300);
  check(
    'Gerçek rate_limited: hata gösterilir, e.text altyazı olarak korunur, kilit yok, otomatik yeniden deneme yok',
    (await text(page, '[data-testid=chat-error]')).includes('Çok sık') &&
      (await text(page, '[data-testid=watch-caption]')) === 'Yarım' &&
      (await page.evaluate(() => window.__sampleCalls.length)) === 1 &&
      !(await page.locator('[data-testid=chat-input]').isDisabled()),
  );
  check(
    'limits() en çok 3 araç diyorsa en önemli üçü gider: step, show_event, highlight',
    (await page.evaluate(() => window.__sampleCalls[0].tools.join())) === 'step,show_event,highlight',
  );
  await page.click('[data-testid=chat-retry]');
  await page.waitForFunction(() => window.__sampleCalls.length > 1, null, { timeout: 10000 });
  await finalStatus(page);
  await settle(page, 800);
  check(
    '“Yeniden dene” yalnızca okur basınca ve bir kez soruyor (çalışma zamanına toplam iki çağrı)',
    (await page.evaluate(() => window.__sampleCalls.length)) === 2,
  );
  await page.context().close();
});
await guard(async () => {
  // a view that cannot run tools after all (the call with tools is refused): the same question goes again as plain text, once
  const page = await open(AT_HAMBURG, {
    init: FAKE_RUNTIME,
    initArg: { rejectToolsWith: { code: 'tools_unavailable', message: 'no tools here' } },
  });
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await idle(page);
  await settle(page, 400);
  const [withTools, plainCall] = await page.evaluate(() => window.__sampleCalls);
  check(
    'Araçlı çağrı “tools_unavailable” ile reddedilirse aynı soru bir kez araçsız (cache:false) yeniden sorulur; yanıt gelir, “yalnızca metin” notu görünür',
    (await page.evaluate(() => window.__sampleCalls.length)) === 2 &&
      withTools.tools.length === 5 &&
      plainCall.tools.length === 0 &&
      plainCall.cache === false &&
      (await page.evaluate(() => window.__ayni.ai.session.items.at(-1).status)) === 'done' &&
      /yalnızca metin/.test(await text(page, '[data-testid=watch-note]')),
  );
  await page.context().close();
});

/* ============================================================== H. mobile */
section(
  'H. Telefon: harita tüm sahne; kart üstte küçük bir sayfa; altyazı ve soru kutusu altta; metin her zaman tam ekran',
);
await guard.smoke(async () => {
  const page = await open(AT_HAMBURG, { viewport: { width: 390, height: 844 }, mobile: true });
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
      zoom: r('.map-zoom'),
      stats: r('.map-stats'),
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
      g0.card.top < g0.map.top + g0.map.height * 0.2 &&
      g0.card.height <= g0.map.height * 0.5 &&
      g0.ask.bottom <= g0.dock.top &&
      g0.dock.top - g0.ask.bottom <= 20 &&
      g0.ask.left >= 0 &&
      g0.ask.right <= g0.vw,
    g0.card ? `kart ${Math.round(g0.card.width)}×${Math.round(g0.card.height)} px` : 'kart yok',
  );
  check(
    'Telefon: yakınlaştırma düğmeleri ve sayaç soru kutusunun üstünde (altında kalmıyor), haritanın içinde',
    g0.zoom &&
      g0.zoom.bottom <= g0.ask.top &&
      g0.stats &&
      g0.stats.bottom <= g0.ask.top &&
      g0.zoom.right <= g0.vw &&
      g0.zoom.left >= 0 &&
      g0.stats.left >= 0,
    `düğmeler ${Math.round(g0.zoom?.bottom ?? 0)} px’de, soru kutusu ${Math.round(g0.ask.top)} px’de başlar`,
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
    // the controls (an event's name in the caption is a link in a sentence, not a control: it is as high as the line)
    const controls = [...watch.querySelectorAll('.watch-btn, .watch-speed select')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0);
    const w = watch.getBoundingClientRect();
    const centres = [...watch.querySelectorAll('.watch-btn, .watch-count')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => r.top + r.height / 2);
    return {
      vw: innerWidth,
      vh: innerHeight,
      watch: w.toJSON(),
      ask: r('[data-testid=ask]'),
      dock: r('.dock'),
      card: r('.card-host'),
      tab: r('[data-testid=card-tab]'),
      zoom: r('.map-zoom'),
      stats: r('.map-stats'),
      stray: controls.filter((c) => c.left < w.left - 1 || c.right > w.right + 1 || c.top < w.top - 1).length,
      oneLine: Math.max(...centres) - Math.min(...centres) <= 3,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      legend: (() => {
        const e = document.querySelector('.legend');
        return !!e && getComputedStyle(e).display !== 'none';
      })(),
      tiny: [...watch.querySelectorAll('.watch-btn')].filter((b) => b.getBoundingClientRect().height < 30).length,
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
    'Telefon: yer kartı kenara çekildi (küçük sekme); renk anahtarı anlatım sürerken gizli; altyazının denetimleri tek satırda ve düğmeleri en az 30 px',
    !!m.tab &&
      !(await visible(page, '[data-testid=place-card]')) &&
      m.tab.width < 280 &&
      !m.legend &&
      m.oneLine &&
      m.tiny === 0,
    m.tab ? `sekme ${Math.round(m.tab.width)}×${Math.round(m.tab.height)} px` : 'sekme yok',
  );
  check(
    'Telefon: yakınlaştırma düğmeleri ve sayaç altyazı ile soru kutusunun sütununun üstünde, sekmeyle çakışmıyor',
    m.zoom.bottom <= m.watch.top && m.stats.bottom <= m.watch.top && m.zoom.top > m.tab.bottom && m.zoom.right <= m.vw,
    `düğmeler ${Math.round(m.zoom.bottom)} px’de biter, altyazı ${Math.round(m.watch.top)} px’de başlar`,
  );
  const mm = await mapState(page);
  check(
    'Telefon: kamera 1. adımı (Almanya ve Polonya, Polonya’ya saldırı) altyazının ve soru kutusunun altında kalmayacak biçimde gösterdi',
    mm.targets > 0 && mm.outside === 0 && mm.belowFoot === 0 && mm.covered === 0,
    `görünüm dışı ${mm.outside}, altyazının altında ${mm.belowFoot}, örtülü ${mm.covered}`,
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
  // the little window is at the widest view of the map: a lit polity with far-off parts (Britain) is not whole in it, but the
  // event, the ends of the war's line and the lit polities are
  check(
    'Telefon: küçük harita 3. adımı gösteriyor (Birleşik Krallık ve Nazi Almanyası, Britanya Muharebesi: işaret ve savaş çizgisinin uçları pencerede; pencere en geniş görünümde olduğundan devlet kutularının en az %40’ı görünür); metin pencerenin altından başlıyor, soru kutusu ekranda',
    miniM.ids.join() === GERMANY[2].ids &&
      miniM.markers.join() === GERMANY[2].events.join() &&
      miniM.outside === 0 &&
      miniM.warOutside === 0 &&
      miniM.boxShare >= 0.4 &&
      r.scrollTop >= r.map.bottom - 2 &&
      r.ask.bottom <= r.vh &&
      r.ask.left >= 0 &&
      r.ask.right <= r.vw,
    `görünüm dışı ${miniM.outside} · kutuların görünen payı %${Math.round(miniM.boxShare * 100)} · metin ${Math.round(r.scrollTop)} px’de, pencere ${Math.round(r.map.bottom)} px’de biter`,
  );
  await shot(page, 'ai-6b-mobil-oku.png');
  await page.click('[data-testid=mini-expand]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  check(
    'Telefon: “Haritayı büyüt” İzle’ye döner, adım 3 kalır',
    (await pres(page)).view === 'watch' && (await pres(page)).step === 3,
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
await guard(async () => {
  // an answer to a plain question on the phone: one step, so a caption and "Devamını oku" and none of the stepping controls
  const page = await open(AT_HAMBURG, { viewport: { width: 390, height: 844 }, mobile: true });
  await ask(page, STALINGRAD_QUESTION);
  await cameraRests(page, 12000);
  await settle(page, 800);
  const one = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      return e ? e.getBoundingClientRect().toJSON() : null;
    };
    const watch = document.querySelector('[data-testid=watch]');
    const more = document.querySelector('[data-testid=watch-more]');
    const a = window.__ayni.ai.session.items.filter((i) => i.kind === 'assistant').at(-1);
    return {
      vw: innerWidth,
      watch: r('[data-testid=watch]'),
      caption: r('[data-testid=watch-caption]'),
      more: r('[data-testid=watch-more]'),
      ask: r('[data-testid=ask]'),
      dock: r('.dock'),
      zoom: r('.map-zoom'),
      stats: r('.map-stats'),
      tab: r('[data-testid=card-tab]'),
      single: watch.classList.contains('watch-single'),
      steps: watch.dataset.steps,
      moreShown: !!more && getComputedStyle(more.parentElement).visibility === 'visible',
      stepping: ['watch-prev', 'watch-next', 'watch-count', 'watch-play', 'watch-speed', 'watch-read'].filter((id) =>
        document.querySelector(`[data-testid=${id}]`),
      ),
      buttons: [...watch.querySelectorAll('.watch-btn')].map((b) => Math.round(b.getBoundingClientRect().height)),
      captionText: document.querySelector('[data-testid=watch-caption]').innerText.trim(),
      planCaption: a.plan.captionOf(1),
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    'Telefon, tek adımlı yanıt: altyazı ve altında “Devamını oku” görünür, adım denetimlerinden hiçbiri yok (önceki, sonraki, sayaç, oynat, hız, metni oku); kapat düğmesi var ve en az 30 px',
    one.single &&
      one.steps === '1' &&
      one.captionText === plainCaption(one.planCaption) &&
      one.moreShown &&
      one.more.top >= one.caption.bottom - 1 &&
      one.more.bottom <= one.watch.bottom &&
      one.stepping.length === 0 &&
      one.buttons.length >= 1 &&
      one.buttons.every((h) => h >= 30),
    `altyazı ${Math.round(one.caption.height)} px yüksek, düğmeler ${one.buttons.join()} px`,
  );
  check(
    'Telefon, tek adımlı yanıt: altyazı kutusu soru kutusunun hemen üstünde, ikisi de ekranın içinde; yakınlaştırma düğmeleri ve sayaç altyazının üstünde, sekmeyle çakışmıyor; yatay taşma yok',
    one.watch.bottom <= one.ask.top + 1 &&
      one.ask.bottom <= one.dock.top &&
      one.watch.left >= 0 &&
      one.watch.right <= one.vw &&
      one.zoom.bottom <= one.watch.top &&
      one.stats.bottom <= one.watch.top &&
      one.zoom.top > one.tab.bottom &&
      !one.overflowX,
    `altyazı ${Math.round(one.watch.width)}×${Math.round(one.watch.height)} px`,
  );
  // all of the Soviet Union does not fit a phone's width (the map cannot step back any further): what is asked here is that
  // the event's marker is in view and nothing of the scene lies under the caption, the question box or the controls
  const oneMap = await mapState(page);
  const marker = await page.evaluate(() => {
    const dot = document.querySelector('.evt[data-id="stalingrad-1942"] .evt-mark');
    const map = document.querySelector('#map').getBoundingClientRect();
    const watch = document.querySelector('[data-testid=watch]').getBoundingClientRect();
    if (!dot) return null;
    const r = dot.getBoundingClientRect();
    return r.left >= map.left && r.right <= map.right && r.top >= map.top && r.bottom <= watch.top;
  });
  check(
    'Telefon, tek adımlı yanıt: Stalingrad sahnesi (Sovyetler Birliği’nin tamamı telefon genişliğine sığmaz): olay işareti görünür alanda, altyazının, soru kutusunun ve denetimlerin altında hiçbir şey kalmıyor',
    oneMap.targets > 0 &&
      marker === true &&
      oneMap.belowFoot === 0 &&
      oneMap.covered === 0 &&
      oneMap.markers.join() === 'stalingrad-1942' &&
      oneMap.wars === 1,
    `görünüm dışı ${oneMap.outside}/${oneMap.targets}, kutuların görünen payı %${Math.round(oneMap.boxShare * 100)}`,
  );
  await shot(page, 'ai-6c-mobil-tek-adim.png');
  await page.click('[data-testid=watch-more]');
  await settle(page, 900);
  await cameraRests(page, 8000);
  await settle(page, 300);
  const readOne = await page.evaluate(() => {
    const rect = (s) => {
      const e = document.querySelector(s);
      return e && !e.hidden ? e.getBoundingClientRect().toJSON() : null;
    };
    return {
      vw: innerWidth,
      read: document.querySelector('#stage').dataset.read,
      readPanel: rect('#read'),
      map: rect('#map'),
      size: !!document.querySelector('[data-testid=read-size]'),
      scrollTop: rect('[data-testid=chat-scroll]')?.top ?? null,
      steps: document.querySelectorAll('[data-testid=chat-step]').length,
      numbered: document.querySelectorAll('.cs-n').length,
      active: document.querySelector('[data-testid=chat-step][data-active="true"]')?.dataset.n,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    'Telefon, tek adımlı yanıt: “Devamını oku” metni tam ekran açar (küçük harita başlığın altında, metin onun altından başlıyor); tek adım (numarasız) etkin',
    readOne.read === 'full' &&
      readOne.readPanel.width > readOne.vw - 2 &&
      !readOne.size &&
      readOne.map.width < readOne.vw * 0.55 &&
      readOne.map.height <= 140 &&
      readOne.scrollTop >= readOne.map.bottom - 2 &&
      readOne.steps === 1 &&
      readOne.numbered === 0 &&
      readOne.active === '1' &&
      !readOne.overflowX,
    `pencere ${Math.round(readOne.map.width)}×${Math.round(readOne.map.height)} px`,
  );
  await shot(page, 'ai-6d-mobil-tek-adim-oku.png');
  await page.click('[data-testid=mini-expand]');
  await settle(page, 700);
  await cameraRests(page, 8000);
  check(
    'Telefon, tek adımlı yanıt: “Haritayı büyüt” İzle’ye döner; yanıt hâlâ tek adım (altyazı ve “Devamını oku” yerinde)',
    (await pres(page)).view === 'watch' &&
      (await visible(page, '[data-testid=watch][data-steps="1"]')) &&
      (await visible(page, '[data-testid=watch-more]')),
  );
  await page.context().close();
});
await guard(async () => {
  // a failed call and a closed chat on the phone: the box that says so stays inside the screen, above the question box, with a button a finger can hit
  const page = await open(AT_HAMBURG, { viewport: { width: 390, height: 844 }, mobile: true });
  const stack = () =>
    page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null;
      const button = (s, name) =>
        [...document.querySelectorAll(`${s} button`)]
          .find((b) => b.textContent.includes(name))
          ?.getBoundingClientRect() ?? null;
      return {
        vw: innerWidth,
        stack: r('#bottom'),
        error: r('[data-testid=chat-error]'),
        blocked: r('[data-testid=chat-blocked]'),
        input: r('[data-testid=chat-input]'),
        zoom: r('.map-zoom'),
        retry: button('[data-testid=chat-error]', 'Yeniden dene')?.toJSON() ?? null,
        permissions: button('[data-testid=chat-blocked]', 'İzinleri aç')?.toJSON() ?? null,
        overflowX: document.documentElement.scrollWidth > innerWidth,
      };
    });
  await ask(page, 'deneme [hata:rate_limited]');
  await settle(page, 500);
  const failed = await stack();
  check(
    'Telefon, hata: hata kutusu altyazının yerinde, ekranın içinde ve soru kutusunun üstünde; “Yeniden dene” en az 30 px yüksekliğinde; yakınlaştırma düğmeleri yığının üstünde; yatay taşma yok',
    failed.error.left >= 0 &&
      failed.error.right <= failed.vw &&
      failed.error.bottom <= failed.input.top &&
      !!failed.retry &&
      failed.retry.height >= 30 &&
      failed.retry.right <= failed.vw &&
      failed.zoom.bottom <= failed.stack.top &&
      !failed.overflowX,
    `kutu ${Math.round(failed.error.width)}×${Math.round(failed.error.height)} px, düğme ${Math.round(failed.retry?.height ?? 0)} px yüksek`,
  );
  await ask(page, 'deneme [hata:not_granted]');
  await settle(page, 500);
  const closed = await stack();
  check(
    'Telefon, not_granted: kalıcı uyarı soru kutusunun üstünde ve ekranın içinde, kutu kapalı; “İzinleri aç” en az 30 px yüksekliğinde; hata kutusuyla çakışmıyor, yakınlaştırma düğmeleri yığının üstünde; yatay taşma yok',
    closed.blocked.left >= 0 &&
      closed.blocked.right <= closed.vw &&
      closed.blocked.bottom <= closed.input.top &&
      (await page.locator('[data-testid=chat-input]').isDisabled()) &&
      !!closed.permissions &&
      closed.permissions.height >= 30 &&
      closed.permissions.right <= closed.vw &&
      closed.error.bottom <= closed.blocked.top &&
      closed.zoom.bottom <= closed.stack.top &&
      !closed.overflowX,
    `uyarı ${Math.round(closed.blocked.width)}×${Math.round(closed.blocked.height)} px, düğme ${Math.round(closed.permissions?.height ?? 0)} px yüksek`,
  );
  await shot(page, 'ai-6e-mobil-hata.png');
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
  '# Okuma arkadaşı, sade harita ve tutarlı sohbet: doğrulama raporu',
  '',
  `${passed}/${results.length} denetim geçti (\`npm run e2e:ai\`). Dönem 1800–2000: uygulama İkinci Dünya Savaşı aralığında (1939–1945, 1942 sınırları) açılır; örnek yer Almanya’dır. Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek \`sample\` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.`,
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
  '- `ai-p1-renkler-dunya.png`, `ai-p2-renkler-avrupa.png`: devlet renkleri (gri ve mavi yok, komşular ayrışıyor)',
  '- `ai-0-yeni-duzen.png`: harita neredeyse tam ekran; üstte ince çubuk, altta ince zaman çizelgesi, hemen üstünde soru kutusu, sağda küçük bilgi kartı',
  '- `ai-s1-sinir-penceresi.png`: çok daha eski bir aralığa (1900–1906, yıl 1903) geçildikten sonra: sınırlar yüklendi, başlıkta “yükleniyor…” yok',
  '- `ai-0-yer-karti.png`: bir yer seçilince küçük kart',
  '- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`, `ai-1g-anlatim-adim8.png`: İzle (Almanya, 8 adım); her adım yalnızca kendi çizimini gösterir, altyazı sabit yerde, kamera adımı izler (4. adımda Barbarossa, 6.da Stalingrad ve El Alamein, 8.de Berlin 1945)',
  '- `ai-1f-tek-anlatici.png`: yanıt ekrandayken haritada yalnızca anılan ve tıklanan olayların işaretçileri',
  '- `ai-j2-yer-secili-olaylar-cekildi.png`: bir yer seçilince dünya olayları haritadan çekilir (not nedenini söyler, çizelge o yerin olaylarıyla dolu)',
  '- `ai-v1-ilerleme-cubugu.png`: zaman cetveli ilerleme çubuğu (adımlar tarihlerinde, görülenler dolu)',
  '- `ai-t1-cizelge-aralik.png`, `ai-t2-cizelge-dar-aralik.png`: yer çizelgesi yalnızca seçili aralığı gösterir; `ai-t3-adim-noktalari-kalabalik.png`: aynı yıla düşen üç adımın noktaları birbirine binmeden açılır',
  '- `ai-r1-altyazida-olay-adi.png`, `ai-r2-metinde-olay-adi.png`, `ai-r3-tam-ekranda-olay-adi.png`: altyazıdaki ve metindeki olay adları tıklanabilir; çizelgedeki tıklamayla aynı sonuç',
  '- `ai-r4-tek-adimli-altyazida-olay-adi.png`, `ai-r5-tek-adimli-metinde-olay-adi.png`: tek adımlı yanıtta da altyazıdaki ve metindeki olay adı bağlantı (Stalingrad)',
  '- `ai-f1-metnin-sonu-tam-ekran.png`: tam ekran okumada metnin son satırı soru kutusunun üstünde',
  '- `ai-w1-izle-adim1.png`, `ai-w2-oku-yan-panel.png`, `ai-w3-oku-tam-ekran.png`: aynı adım (1) üç görünümde: İzle, Oku yan panel, Oku tam ekran (köşede küçük harita)',
  '- `ai-w4-oku-sirasinda-soru.png`: okurken sorulan soru, arkadaki haritayı günceller',
  '- `ai-2-kisa-yanit.png`, `ai-2b-stalingrad-yaniti.png`: tek adımlı yanıt (adım denetimi yok, tek sahne, altyazı ve “Devamını oku”); Çelik Pakt ittifakı, Stalingrad',
  '- `ai-2c-duz-metin.png`: modelin düz metin yazdığı yanıt; altyazı metnin ilk cümleleri, “Devamını oku” tamamını açar',
  '- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru',
  '- `ai-3a-olay-karti.png`, `ai-3b-bunu-sor.png`: yanıt ekrandayken olay kartı; “Bunu sohbette sor”',
  '- `ai-4-baglam-degisti.png`: seçili yer değişince metinde “Bağlam değişti”',
  '- `ai-6c-mobil-tek-adim.png`, `ai-6d-mobil-tek-adim-oku.png`: telefonda tek adımlı yanıt (altyazı ve “Devamını oku”) ve tam ekran metin',
  '- `ai-6e-mobil-hata.png`: telefonda hata kutusu ve izin notu (ekranın içinde, düğmeler ≥ 30 px)',
  '- `ai-8b-gercek-sample-duz-metin.png`: gerçek `sample` bağdaştırıcısında düz metin yazan modelin yanıtı (altyazı ve “Devamını oku”)',
  '- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-6b-mobil-oku.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`',
  '',
);
if (SHOTS) writeFileSync(join(OUT, 'AI-RAPOR.md'), lines.join('\n'));
const perSection = new Map();
for (const g of guardTimes) perSection.set(g.section, (perSection.get(g.section) ?? 0) + g.ms);
console.log('\nBölüm süreleri:');
for (const [title, ms] of perSection) console.log(`  ${String(Math.round(ms / 1000)).padStart(4)} sn  ${title}`);
if (process.env.E2E_TIMES) {
  console.log('\nSenaryo süreleri:');
  for (const g of guardTimes)
    console.log(
      `  ${String(Math.round(g.ms / 1000)).padStart(4)} sn  ${g.checks} denetim  ${g.section.split('.')[0]}: ${g.first.slice(0, 90)}`,
    );
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log('\nBaşarısız denetimler:');
  for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
const mode = `${SMOKE ? 'hızlı' : ONLY ? `E2E_ONLY=${ONLY.join(',')}` : 'tam'} · ${MOTION === 'reduce' ? 'hareket azaltılmış' : 'animasyonlu'}`;
console.log(
  `\n${passed}/${results.length} denetim geçti (${mode}) · ${Math.round((Date.now() - T_START) / 1000)} sn${SHOTS ? ' · Rapor: docs/verification/AI-RAPOR.md' : ''}`,
);
process.exit(passed === results.length ? 0 : 1);
