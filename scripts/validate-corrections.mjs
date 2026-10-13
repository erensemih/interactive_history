#!/usr/bin/env node
/**
 * Checks the correction layer (public/data/corrections/ww2.json) against the border file and the entities.
 *
 *   node scripts/validate-corrections.mjs [data dir]      (default: public/data)
 *
 * `validateCorrections(root, ctx)` returns { errors, warnings, stats }; it is what scripts/validate-data.mjs calls.
 *   root  the data directory (public/data, or an archived period's folder)
 *   ctx   optional, what the caller has already read, so that the 15 MB border file is not read twice:
 *           ctx.entities  the `entities` object of entities.json
 *           ctx.borders   the parsed border file (encoded or plain GeoJSON)
 *           ctx.range     [from, to] of the period
 * A period without a corrections file has nothing to check: that is no error.
 *
 * What it checks: every reference of the layer exists in the data (polities, the rows an entry copies or takes its
 * shape from, years), shapes are valid (closed, simple rings), ids are unique and kebab-case, every entry has a note and
 * a source, the point where an occupied land is named lies inside it, and (the check that keeps the layer honest) each
 * occupation really applies at that point in at least one of its years, with this entry and no earlier one naming it.
 * The geometry code below repeats, in plain JavaScript, what src/data/corrections.ts does in the page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', 'public', 'data');
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isYear = (v) => Number.isInteger(v);
const years = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

/* ------------------------------------------------------------------- geometry */

function decodeRing(flat, scale) {
  const n = flat.length >> 1;
  const ring = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += flat[2 * i];
    y += flat[2 * i + 1];
    ring.push([x / scale, y / scale]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/** The polygons ([outer, ...holes] of [lon, lat]) of a feature of the border file, encoded or plain. */
function polygonsOf(geometry, encoded, scale) {
  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.map((poly) => (encoded ? poly.map((r) => decodeRing(r, scale)) : poly));
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h));
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function boundsOf(polys) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

const EARTH_RADIUS_KM = 6371.0088;

/** Area of a ring on the sphere in km² (the same formula as src/data/corrections.ts). */
function ringAreaKm2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    sum += (((x2 - x1) * Math.PI) / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

const polygonAreaKm2 = (poly) =>
  Math.max(
    0,
    poly.slice(1).reduce((a, hole) => a - ringAreaKm2(hole), ringAreaKm2(poly[0])),
  );

/** A box or a list of boxes, as a list (null: none). */
function boxList(box) {
  if (!Array.isArray(box) || !box.length) return null;
  return Array.isArray(box[0]) ? box : [box];
}

const validBox = (b) =>
  Array.isArray(b) &&
  b.length === 4 &&
  b.every(isNum) &&
  b[0] < b[2] &&
  b[1] < b[3] &&
  Math.abs(b[0]) <= 180 &&
  Math.abs(b[2]) <= 180 &&
  Math.abs(b[1]) <= 90 &&
  Math.abs(b[3]) <= 90;
const boxesOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Do two segments cross (share more than an end point)? */
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function ringProblem(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 'bir halka en az dört noktadan (kapanış dahil) oluşmalı';
  for (const p of ring) {
    if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) return 'nokta [boylam, enlem] olmalı';
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) return `koordinat aralık dışı: ${JSON.stringify(p)}`;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return 'halka kapalı değil (ilk ve son nokta aynı olmalı)';
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length - 1; j = i++)
    twice += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  if (Math.abs(twice) < 1e-9) return 'halkanın alanı sıfır';
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(ring[i], ring[i + 1], ring[j], ring[j + 1])) return 'halka kendi kendini kesiyor';
    }
  }
  return null;
}

/* ------------------------------------------------------------------- the checks */

export function validateCorrections(root = DEFAULT_ROOT, ctx = {}) {
  const errors = [];
  const warnings = [];
  const stats = {};
  const file = join(root, 'corrections', 'ww2.json');
  if (!existsSync(file)) return { errors, warnings, stats: { corrections: 0 } };

  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`corrections/ww2.json okunamadı: ${e.message}`);
    return { errors, warnings, stats };
  }
  const err = (m) => errors.push(`corrections: ${m}`);
  const warn = (m) => warnings.push(`corrections: ${m}`);

  /* what the layer refers to: the entities and the border file */
  let entities = ctx.entities;
  let range = ctx.range;
  if (!entities || !range) {
    try {
      entities ??= JSON.parse(readFileSync(join(root, 'entities.json'), 'utf8')).entities ?? {};
      range ??= JSON.parse(readFileSync(join(root, 'borders', 'polities.json'), 'utf8')).meta?.range ?? [1800, 2000];
    } catch (e) {
      err(`varlıklar ya da dönem okunamadı: ${e.message}`);
      return { errors, warnings, stats };
    }
  }
  let borders = ctx.borders;
  if (!borders) {
    try {
      borders = JSON.parse(readFileSync(join(root, 'borders', `cliopatria-${range[0]}-${range[1]}.json`), 'utf8'));
    } catch (e) {
      err(`sınır dosyası okunamadı: ${e.message}`);
      return { errors, warnings, stats };
    }
  }
  const encoded = borders.meta?.encoding === 'delta-int';
  const scale = borders.meta?.scale ?? 100;

  /* the border rows, by polity; a row's shape is decoded the first time somebody asks for it */
  const rowsById = new Map();
  for (const f of borders.features ?? []) {
    const p = f.properties ?? {};
    const row = {
      id: p.id,
      from: p.from,
      to: p.to,
      area: p.area,
      box: p.box ?? p.bbox ?? null,
      feature: f,
      cache: null,
      polys() {
        return (this.cache ??= polygonsOf(this.feature.geometry, encoded, scale));
      },
    };
    const list = rowsById.get(p.id);
    if (list) list.push(row);
    else rowsById.set(p.id, [row]);
  }
  const polityKnown = (id) => entities[id]?.kind === 'polity' && rowsById.has(id);
  const rowOf = (id, year) => {
    let best = null;
    for (const r of rowsById.get(id) ?? [])
      if (r.from <= year && year <= r.to && (!best || r.area > best.area)) best = r;
    return best;
  };
  const rowContains = (row, x, y) =>
    (!row.box || inBox(row.box, x, y)) && row.polys().some((poly) => inPolygon(x, y, poly));

  /* ---- meta */
  const meta = doc.meta;
  if (!meta || typeof meta !== 'object') err('meta eksik');
  else {
    if (!isText(meta.title)) err('meta.title eksik');
    if (!isText(meta.note)) err("meta.note eksik (Cliopatria'ya dokunulmadığını ve katmanın küçük olduğunu söylemeli)");
    else if (!/Cliopatria/.test(meta.note)) warn("meta.note Cliopatria'dan söz etmiyor");
    for (const s of meta.sources ?? []) {
      if (!isText(s?.name)) err('meta.sources: ad eksik');
      if (s?.url !== undefined && !/^https?:\/\//i.test(String(s.url)))
        err(`meta.sources: adres http(s) olmalı: "${s.url}"`);
    }
    if (meta.knownGaps !== undefined && (!Array.isArray(meta.knownGaps) || !meta.knownGaps.every(isText)))
      err('meta.knownGaps metin listesi olmalı');
  }

  const noteAndSource = (where, e) => {
    if (!isText(e.note)) err(`${where}: note eksik (neden gerekli olduğunu söylemeli)`);
    if (!isText(e.source)) err(`${where}: source eksik (Vikipedi makalesi, adres ya da veri analizi)`);
  };
  const yearsProblem = (where, e) => {
    if (!isYear(e.from) || !isYear(e.to) || e.from > e.to) err(`${where}: from/to geçerli bir yıl aralığı olmalı`);
    else if (e.from < range[0] || e.to > range[1])
      err(`${where}: ${years(e.from, e.to)} dönemin (${range[0]}–${range[1]}) dışında`);
  };

  /* ---- rows */
  const added = []; // rows the layer adds, as { id, from, to, area, polys } (for the holder check below)
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (doc.rows !== undefined && !Array.isArray(doc.rows)) err('rows bir liste olmalı');
  const addNames = new Set();
  rows.forEach((c, i) => {
    const where = `rows[${i}] (${c?.id} ${isYear(c?.from) ? years(c.from, c.to) : '?'})`;
    if (!c || (c.op !== 'copy' && c.op !== 'add')) return err(`${where}: op "copy" ya da "add" olmalı`);
    if (!ID_RE.test(String(c.id ?? ''))) err(`${where}: id kebab-case olmalı`);
    else if (!polityKnown(c.id)) err(`${where}: "${c.id}" sınır dosyasında satırı olan bir devlet değil`);
    yearsProblem(where, c);
    noteAndSource(where, c);
    if (c.op === 'copy') {
      if (!c.of || !isText(c.of.id) || !isYear(c.of.year)) return err(`${where}: of {id, year} olmalı`);
      const source = rowOf(c.of.id, c.of.year);
      if (!source) return err(`${where}: kaynak satır yok (${c.of.id}, ${c.of.year})`);
      let polys = source.polys();
      const keep = boxList(c.keep);
      if (keep) {
        if (!keep.every(validBox)) return err(`${where}: keep kutuları [batı, güney, doğu, kuzey] olmalı`);
        polys = polys.filter((poly) => {
          const b = boundsOf([poly]);
          return keep.some((k) => b[0] >= k[0] && b[1] >= k[1] && b[2] <= k[2] && b[3] <= k[3]);
        });
        if (!polys.length) return err(`${where}: keep kutuları kaynağın hiçbir parçasını içermiyor`);
      } else if (c.keep !== undefined) err(`${where}: keep boş`);
      added.push({ id: c.id, from: c.from, to: c.to, area: source.area, polys });
      return;
    }
    // add
    if (!isText(c.name)) err(`${where}: add için name gerekli`);
    else if (addNames.has(c.name)) err(`${where}: name "${c.name}" yinelenmiş`);
    else addNames.add(c.name);
    if (!Array.isArray(c.polygons) || !c.polygons.length) return err(`${where}: polygons boş`);
    const polys = [];
    for (const [k, poly] of c.polygons.entries()) {
      if (!Array.isArray(poly) || !poly.length) return err(`${where}: polygons[${k}] boş`);
      for (const [r, ring] of poly.entries()) {
        const problem = ringProblem(ring);
        if (problem) return err(`${where}: polygons[${k}][${r}]: ${problem}`);
      }
      for (const hole of poly.slice(1))
        if (!inRing(hole[0][0], hole[0][1], poly[0]))
          warn(`${where}: polygons[${k}]: bir delik dış halkanın içinde değil`);
      polys.push(poly);
    }
    // the area is not given: the layer works it out when it is applied
    added.push({
      id: c.id,
      from: c.from,
      to: c.to,
      area: Math.round(polys.reduce((a, poly) => a + polygonAreaKm2(poly), 0)),
      polys,
      name: c.name,
    });
  });
  stats.rowCorrections = rows.length;
  stats.rowsCopied = rows.filter((c) => c?.op === 'copy').length;
  stats.rowsAdded = rows.filter((c) => c?.op === 'add').length;

  /* ---- occupier labels */
  const labels = doc.occupierLabels ?? {};
  if (typeof labels !== 'object' || Array.isArray(labels)) err('occupierLabels bir nesne olmalı');
  else {
    for (const [id, word] of Object.entries(labels)) {
      if (!polityKnown(id)) err(`occupierLabels: "${id}" sınır dosyasında satırı olan bir devlet değil`);
      if (!isText(word)) err(`occupierLabels.${id}: sözcük eksik`);
    }
  }

  /* ---- occupations */
  const entries = Array.isArray(doc.occupations) ? doc.occupations : [];
  if (doc.occupations !== undefined && !Array.isArray(doc.occupations)) err('occupations bir liste olmalı');
  const seen = new Set();
  const usedOccupiers = new Set();
  const prepared = [];
  entries.forEach((e, i) => {
    const where = `occupations[${i}] (${e?.id})`;
    if (!e || typeof e !== 'object') return err(`${where}: nesne olmalı`);
    if (!ID_RE.test(String(e.id ?? ''))) err(`${where}: id kebab-case olmalı`);
    else if (seen.has(e.id)) err(`${where}: id yinelenmiş`);
    else seen.add(e.id);
    if (!isText(e.name)) err(`${where}: name eksik`);
    yearsProblem(where, e);
    noteAndSource(where, e);
    let ok = true;
    if (!Array.isArray(e.occupiers) || !e.occupiers.length) {
      err(`${where}: occupiers boş`);
      ok = false;
    } else {
      for (const o of e.occupiers) {
        usedOccupiers.add(o);
        if (!polityKnown(o)) err(`${where}: işgalci "${o}" sınır dosyasında satırı olan bir devlet değil`);
        else if (!labels[o]) warn(`${where}: işgalci "${o}" için occupierLabels'ta sözcük yok ("işgal" yazılır)`);
      }
    }
    if (!e.area || !isText(e.area.id) || !isYear(e.area.year)) {
      err(`${where}: area {id, year} olmalı`);
      return;
    }
    const areaRow = rowOf(e.area.id, e.area.year);
    if (!areaRow) {
      err(`${where}: area için satır yok (${e.area.id}, ${e.area.year})`);
      return;
    }
    let boxes = null;
    if (e.box !== undefined) {
      boxes = boxList(e.box);
      if (!boxes || !boxes.every(validBox)) {
        err(`${where}: box [batı, güney, doğu, kuzey] ya da böyle kutuların listesi olmalı`);
        boxes = null;
        ok = false;
      } else {
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++)
            if (boxesOverlap(boxes[a], boxes[b]))
              err(`${where}: box kutuları üst üste biniyor (${a}, ${b}); alan hesabı bunu bekler`);
      }
    }
    if (!Array.isArray(e.at) || e.at.length !== 2 || !e.at.every(isNum)) {
      err(`${where}: at [boylam, enlem] olmalı`);
      return;
    }
    const [x, y] = e.at;
    if (!rowContains(areaRow, x, y)) err(`${where}: at noktası area satırının şeklinin dışında`);
    else if (boxes && !boxes.some((b) => inBox(b, x, y))) err(`${where}: at noktası box'ın dışında`);
    if (ok) prepared.push({ e, areaRow, boxes });
  });

  /* the holder of a point in a year: of the rows that contain it (the layer's own among them) the smallest */
  const holderAt = (x, y, year) => {
    let best = null;
    const consider = (r) => {
      if (r.from > year || r.to < year) return;
      if (!best || r.area < best.area || (r.area === best.area && r.id < best.id)) best = r;
    };
    for (const list of rowsById.values())
      for (const r of list) if (r.from <= year && year <= r.to && rowContains(r, x, y)) consider(r);
    for (const r of added) {
      if (r.from > year || r.to < year) continue;
      if (inBox(boundsOf(r.polys), x, y) && r.polys.some((poly) => inPolygon(x, y, poly))) consider(r);
    }
    return best;
  };
  const applies = (e, areaRow, boxes, x, y, year, holderId) =>
    year >= e.from &&
    year <= e.to &&
    e.occupiers.includes(holderId) &&
    (!boxes || boxes.some((b) => inBox(b, x, y))) &&
    rowContains(areaRow, x, y);

  const effective = {};
  for (const item of prepared) {
    const { e, areaRow, boxes } = item;
    const [x, y] = e.at;
    const active = [];
    for (let year = e.from; year <= e.to; year++) {
      const holder = holderAt(x, y, year);
      if (!holder || !applies(e, areaRow, boxes, x, y, year, holder.id)) continue;
      active.push(year);
      // the first entry of the file that applies here must be this one, or its name tag would sit under another's name
      const first = prepared.find((o) => applies(o.e, o.areaRow, o.boxes, x, y, year, holder.id));
      if (first && first.e.id !== e.id)
        warn(`occupations (${e.id}): ${year} yılında at noktasında "${first.e.id}" önce gelir`);
    }
    if (!active.length)
      err(
        `occupations (${e.id}): ${years(e.from, e.to)} yıllarının hiçbirinde at noktasını bir işgalci tutmuyor; kayıt hiç uygulanmaz`,
      );
    effective[e.id] = active.length ? years(active[0], active[active.length - 1]) : '-';
    if (active.length && active[active.length - 1] - active[0] + 1 !== active.length)
      warn(`occupations (${e.id}): at noktasındaki işgal yıllar boyunca kesintisiz değil (${active.join(', ')})`);
  }

  stats.occupations = entries.length;
  stats.occupiers = usedOccupiers.size;
  stats.occupationYears = effective;
  stats.knownGaps = (meta?.knownGaps ?? []).length;
  stats.corrections = 1;
  return { errors, warnings, stats };
}

function main() {
  const root = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_ROOT;
  const { errors, warnings, stats } = validateCorrections(root);
  console.log('İstatistik:', JSON.stringify(stats, null, 1));
  for (const w of warnings) console.warn('  uyarı:', w);
  for (const e of errors) console.error('  HATA:', e);
  console.log(
    errors.length
      ? `\n${errors.length} hata, ${warnings.length} uyarı`
      : `\nDüzeltmeler geçerli (${warnings.length} uyarı)`,
  );
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
