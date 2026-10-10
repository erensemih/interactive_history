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
 *   2. The Ottoman–French alliance (1536) asked: both polities highlighted and connected, the map does not move.
 *   3. An event clicked while the chat is open: its card opens over the chat, closing returns to the chat,
 *      "Bunu sohbette sor" sends the event into the conversation.
 *   4. The selected place changed mid-conversation: the chat shows the change.
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
function section(title) {
  sections.push({ title, from: results.length });
  console.log(`\n${title}`);
}
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail !== '' ? `  (${detail})` : ''}`);
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
    flags: [...document.querySelectorAll('.ai-layer .ai-flag')].map((e) => e.textContent),
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

/* ============================================================ A. narration */
section('A. Anlatım: Anadolu’da bir nokta, 1500–1550, sohbet açık, adımlar ve harita');
{
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

  const camBefore = await camera(page);
  const geo0 = await geometry(page);
  const ref0 = await pixelOf(page, 10, 45);
  const rec = await recordTransition(
    page,
    () => page.click('[data-testid=place-narrate]'),
    1200,
    async () =>
      (await visible(page, '[data-testid=chat-thinking]')) && (await visible(page, '[data-testid=chat-stop]')),
  );
  check('Yanıt gelmeden önce “Düşünüyor…” ve Durdur düğmesi var', rec.mid);
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
  await page.waitForSelector('[data-testid=chat-step]', { timeout: 20000 });
  await finalStatus(page);
  await settle(page, 600);

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
  const ids1 = await aiIds(page);
  const d1 = await aiDom(page);
  check(
    '1. adım: Osmanlı ve Safevî vurgulu, Tebriz işaretli, bağlantı yok',
    ids1.join() === 'ottoman-empire,safavid-dynasty' &&
      d1.marks === 1 &&
      d1.flags.includes('Tebriz') &&
      d1.links.length === 0,
    `${ids1.join('+')} · ${d1.flags.join(', ')}`,
  );
  const drawing1 = await drawing(page);
  await shot(page, 'ai-1a-anlatim-adim1.png');

  // --- the map follows the step the reader points at
  const camStep1 = await camera(page);
  await page.click('[data-testid=chat-step][data-n="2"] [data-testid=chat-step-show]');
  await settle(page, 2500);
  const act2 = await active(page);
  const d2 = await aiDom(page);
  const cam2 = await camera(page);
  check(
    '2. adım gösterilince harita değişti: 1514, Osmanlı–Safevî savaş çizgisi, Çaldıran işareti',
    act2.n === 2 &&
      (await headYear(page)) === '1514' &&
      d2.links.join() === 'war' &&
      d2.flags.includes('Çaldıran') &&
      d2.flags.includes('savaş'),
    `${d2.links.join()} · ${d2.flags.join(', ')}`,
  );
  check(
    'Odak yalnızca uzaklaşarak oldu: merkez aynı, yakınlaştırma azaldı ya da aynı kaldı',
    cam2.lng === camStep1.lng && cam2.lat === camStep1.lat && cam2.zoom <= camStep1.zoom,
    `${camStep1.zoom.toFixed(2)} → ${cam2.zoom.toFixed(2)}`,
  );
  await shot(page, 'ai-1b-anlatim-adim2.png');
  await page.click('[data-testid=chat-step][data-n="3"] [data-testid=chat-step-show]');
  await settle(page, 1500);
  const cam3 = await camera(page);
  const d3 = await aiDom(page);
  check(
    '3. adım (odak istemez): çizim değişti ama harita hiç oynamadı',
    (await active(page)).n === 3 &&
      (await headYear(page)) === '1517' &&
      d3.links.join() === 'war' &&
      sameCamera(cam2, cam3),
    `${(await aiIds(page)).join('+')}`,
  );
  check(
    'Vurgu, bağlantı ve işaret haritayı hiçbir adımda oynatmadı (merkez 1., 2. ve 3. adımda aynı)',
    cam3.lng === camStep1.lng && cam3.lat === camStep1.lat,
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
  check(
    'Son adımda harita son adımın durumunda (1538, Preveze)',
    (await headYear(page)) === '1538' && (await aiDom(page)).flags.includes('Preveze, 1538'),
  );
  await shot(page, 'ai-1c-anlatim-adim6.png');
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -300);
    await settle(page, 120);
  }
  await settle(page, 600);
  const back = await drawing(page);
  check(
    'Geri dönülünce 1. adımın harita durumu aynen geri geliyor',
    (await active(page)).n === 1 &&
      JSON.stringify(back) === JSON.stringify(drawing1) &&
      (await headYear(page)) === '1505',
  );

  // --- the reader takes the map: the camera is theirs from then on
  const drag = await pixelOf(page, 20, 20);
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  await page.mouse.move(drag.x + 70, drag.y + 40, { steps: 6 });
  await page.mouse.up();
  await settle(page, 400);
  const camDragged = await camera(page);
  check(
    'Okur haritayı kendisi sürükleyince “Harita serbest” çıkıyor',
    (await visible(page, '[data-testid=chat-follow-off]')) &&
      !(await page.evaluate(() => window.__ayni.ai.director.following)),
  );
  await page.click('[data-testid=chat-step][data-n="5"] [data-testid=chat-step-show]');
  await settle(page, 2200);
  const camIgnored = await camera(page);
  check(
    'Artık adımlar haritayı oynatmıyor (5. adım odak istese de): okurla savaşmıyor',
    sameCamera(camDragged, camIgnored) &&
      (await headYear(page)) === '1536' &&
      (await aiDom(page)).links.join() === 'alliance',
    `${camDragged.zoom.toFixed(2)} = ${camIgnored.zoom.toFixed(2)}`,
  );
  await page.click('[data-testid=chat-follow-off]');
  await settle(page, 2200);
  check(
    '“Adımı izlet” ile odak yeniden etkin; uyarı kalktı',
    (await page.evaluate(() => window.__ayni.ai.director.following)) &&
      !(await visible(page, '[data-testid=chat-follow-off]')),
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

  // --- back to the place card and into the chat again: nothing is lost
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  const refC0 = await pixelOf(page, 10, 45);
  const closing = await recordTransition(page, () => page.click('[data-testid=panel-context] .line'), 1200);
  const refC1 = await pixelOf(page, 10, 45);
  check(
    'Başlığa tıklamak yer kartına döndürür; sohbet kapanınca yapay zekâ çizimi haritadan kalkar',
    (await visible(page, '[data-testid=place-card]')) &&
      !(await visible(page, '[data-testid=chat]')) &&
      (await aiDom(page)).hidden &&
      (await aiIds(page)).length === 0,
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
    'Çizim yeniden haritada (etkin adımın durumu)',
    (await aiDom(page)).links.join() === 'war' && (await headYear(page)) === '1517',
  );
  await page.context().close();
}

section('A2. Sohbetten önce haritayı gezmek kamerayı elinizden almaz');
{
  const page = await open('#t=1500-1550&p=35.500,38.900');
  const from = await pixelOf(page, 20, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => window.__ayni.map.jumpTo({ zoom: 4.2 }));
  await settle(page, 500);
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  await settle(page, 600);
  check(
    'Sohbet açılmadan önce haritayı sürüklemek ve yakınlaştırmak “Harita serbest” yapmaz',
    (await page.evaluate(() => window.__ayni.ai.director.following)) &&
      !(await visible(page, '[data-testid=chat-follow-off]')),
  );
  const cam = await camera(page);
  await page.click('[data-testid=chat-step][data-n="2"] [data-testid=chat-step-show]');
  await settle(page, 2500);
  const after = await camera(page);
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
    'Adımın odağı çalışır (okur kamerayı sohbet sırasında almadı): harita uzaklaşır ve iki devlet de görünür olur',
    after.zoom < cam.zoom && inView,
    `${cam.zoom.toFixed(2)} → ${after.zoom.toFixed(2)}`,
  );
  await page.context().close();
}

/* ========================================================== B. a question */
section('B. Soru: Osmanlı–Fransa ittifakı (1536) — her yanıtın tek harita durumu var, harita oynamaz');
let qaPage;
{
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
  await settle(page, 700);
  const camAfter = await camera(page);
  check(
    'Soru yanıtı tek adım: numarasız, tek bölüm',
    (await count(page, '[data-testid=chat-step]')) === 1 && (await count(page, '.cs-n')) === 0,
  );
  const ids = await aiIds(page);
  check(
    'Her iki devlet de vurgulandı (Osmanlı ve Fransa)',
    ids.join() === 'ottoman-empire,kingdom-of-france',
    ids.join('+'),
  );
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.plabel.is-ai')]
      .filter((e) => !e.classList.contains('is-hidden'))
      .map((e) => e.textContent.replace(/\s+/g, ' ')),
  );
  check('İki devletin adı da haritada mürekkep renginde, kalın', labels.length >= 2, labels.join(' | '));
  const dom = await aiDom(page);
  check(
    'İkisi ittifak çizgisiyle bağlandı: “İttifak, 1536”',
    dom.links.join() === 'alliance' && dom.flags.includes('İttifak, 1536'),
    dom.flags.join(', '),
  );
  check('Harita sınırları 1536’ya getirildi', (await headYear(page)) === '1536');
  check(
    'Harita hiç oynamadı (merkez ve yakınlaştırma birebir aynı)',
    sameCamera(camBefore, camAfter),
    `zoom ${camBefore.zoom.toFixed(3)}`,
  );
  await shot(page, 'ai-2-ittifak-sorusu.png');
  qaPage = page;
}

/* ============================================================ C. an event */
section('C. Olay: sohbet açıkken bir olaya tıklamak, kartı sohbetin üstünde açar');
{
  const page = qaPage;
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  const id = 'mohac-1526';
  const marker = page.locator(`.marker-layer [data-id="${id}"]`);
  await marker.click({ timeout: 5000 });
  await settle(page, 800);
  check(
    'Olay kartı sohbetin üstünde açıldı (sohbet altta duruyor, kart onu örtüyor)',
    (await visible(page, '[data-testid=event-sheet] [data-testid=event-card]')) &&
      (await count(page, '[data-testid=chat]')) === 1,
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
    'Yer, başlıkta tek satır olarak kalıyor ve haritada seçili olay vurgulu',
    (await visible(page, '[data-testid=panel-context] .line')) &&
      (await count(page, '.marker-layer .evt.is-selected')) === 1,
  );
  check(
    'Açık olay soru kutusunda bağlam olarak görünüyor',
    /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-event-chip]')),
  );
  await shot(page, 'ai-3a-olay-sohbetin-ustunde.png');

  await page.click('[data-testid=event-sheet] button[aria-label="Olayı kapat"]');
  await settle(page, 500);
  const scrollMid = await page.evaluate(() => document.querySelector('[data-testid=chat-scroll]').scrollTop);
  check(
    'Kartı kapatmak sohbete döndürür; okuma konumu aynı',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      (await visible(page, '[data-testid=chat-input]')) &&
      Math.abs(scrollMid - scrollBefore) <= 1 &&
      (await page.evaluate(() => window.__ayni.store.state.selectedEventId)) === null,
  );
  await marker.click({ timeout: 5000 });
  await settle(page, 500);
  await page.keyboard.press('Escape');
  await settle(page, 400);
  check(
    'Esc de kartı kapatır; sohbet açık kalır',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      (await visible(page, '[data-testid=chat]')) &&
      (await page.evaluate(() => window.__ayni.store.state.chatOpen)),
  );

  await marker.click({ timeout: 5000 });
  await settle(page, 500);
  check('Olay kartında “Bunu sohbette sor” düğmesi var', await visible(page, '[data-testid=event-ask]'));
  await answered(page, () => page.click('[data-testid=event-ask]'));
  await settle(page, 600);
  check(
    'Düğme olayı sohbete gönderdi: kart kapandı, kullanıcı mesajında olay çipi var',
    !(await visible(page, '[data-testid=event-sheet]')) &&
      /Mohaç Muharebesi/.test(await text(page, '[data-testid=chat-user-event]')),
  );
  const req = await lastRequest(page);
  check(
    'Model olayı bağlam olarak aldı (açık olay kartı + soru)',
    req && /Açık olay kartı: «Mohaç Muharebesi»/.test(req.last) && /İSTEK \[SORU\]/.test(req.last),
  );
  const dom = await aiDom(page);
  check(
    'Yanıtın haritası: olayın yeri işaretli, taraflar vurgulu, olayın yılı',
    dom.flags.includes('Mohaç') && (await aiIds(page)).includes('ottoman-empire') && (await headYear(page)) === '1526',
    `${dom.flags.join(', ')} · ${await headYear(page)}`,
  );
  await shot(page, 'ai-3b-bunu-sohbette-sor.png');
}

section('C2. Olay: kart sohbet kapalıyken açılırsa; çizelgeden; Esc');
{
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
}

/* ========================================================= D. new subject */
section('D. Bağlam: sohbet sürerken seçili yer değişirse sohbet bunu gösterir');
{
  const page = qaPage;
  const before = await count(page, '[data-testid=chat-context-change]');
  check('Yer değişmeden ayırıcı yok', before === 0);
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
  const back = await pixelOf(page, 35.5, 38.9);
  await page.mouse.click(back.x, back.y);
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
}

/* ============================================ E. stopping and failing, settings */
section('E. Durdurma, hatalar, ayarlar');
{
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
}
{
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
}

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
{
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
    'Yedi araç: step, highlight, connect, mark, set_year, focus, clear',
    call.tools.join() === 'step,highlight,connect,mark,set_year,focus,clear',
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
}
{
  const page = await open('#t=1500-1550&p=35.500,38.900', { init: FAKE_RUNTIME, initArg: { noTools: true } });
  await page.click('[data-testid=place-narrate]');
  await finalStatus(page);
  const call = await page.evaluate(() => window.__sampleCalls[0]);
  check(
    'Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; sohbet “yalnızca metin” notunu gösterir',
    call.tools.length === 0 && /yalnızca metin/.test(await text(page, '[data-testid=chat-note]')),
  );
  await page.context().close();
}
{
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
}
{
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
}

/* ============================================================== H. mobile */
section('H. Telefon: harita yukarıda kalır, sohbet kalan yeri doldurur');
{
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
  await page.context().close();
}

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
  '- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1c-anlatim-adim6.png`: anlatım, adım değiştikçe harita',
  '- `ai-2-ittifak-sorusu.png`: Osmanlı–Fransa ittifakı sorusu (iki devlet vurgulu ve bağlı, harita oynamadı)',
  '- `ai-3a-olay-sohbetin-ustunde.png`, `ai-3b-bunu-sohbette-sor.png`: olay kartı sohbetin üstünde; “Bunu sohbette sor”',
  '- `ai-4-baglam-degisti.png`: seçili yer değişince sohbette “Bağlam değişti”',
  '- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`',
  '',
);
writeFileSync(join(OUT, 'AI-RAPOR.md'), lines.join('\n'));
console.log(`\n${passed}/${results.length} denetim geçti. Rapor: docs/verification/AI-RAPOR.md`);
process.exit(passed === results.length ? 0 : 1);
