#!/usr/bin/env node
/**
 * Data integrity check for everything under public/data.
 *
 *   npm run data:validate
 *
 * Exits with code 1 if any error is found. Warnings never fail the run.
 * The same function is exercised by the test-suite (tests/data.test.ts).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', 'public', 'data');

const DATE_RE = /^(\d{1,4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJson(path, errors) {
  if (!existsSync(path)) {
    errors.push(`Dosya yok: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`JSON okunamadı (${path}): ${e.message}`);
    return null;
  }
}

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Returns a sortable number or null when invalid. */
function dateKey(text) {
  const m = DATE_RE.exec(String(text));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (m[3] && d > daysIn(y, mo)) return null;
  return y * 10000 + mo * 100 + d;
}

export function validateAll(root = DEFAULT_ROOT) {
  const errors = [];
  const warnings = [];
  const stats = {};

  const entitiesDoc = readJson(join(root, 'entities.json'), errors);
  const polities = readJson(join(root, 'borders', 'polities.json'), errors);
  const categoriesDoc = readJson(join(root, 'categories.json'), errors);
  const eventsIndex = readJson(join(root, 'events', 'index.json'), errors);
  if (!entitiesDoc || !polities || !categoriesDoc || !eventsIndex) return { errors, warnings, stats };

  const range = polities.meta?.range ?? [1400, 1600];
  const entities = entitiesDoc.entities ?? {};
  const derived = polities.entities ?? {};

  /* ---- entities */
  for (const [id, e] of Object.entries(entities)) {
    if (!ID_RE.test(id)) errors.push(`entities: geçersiz kimlik "${id}"`);
    if (e.kind !== 'polity' && e.kind !== 'region') errors.push(`entities.${id}: kind "polity" veya "region" olmalı`);
    if (!e.name?.tr || !String(e.name.tr).trim()) errors.push(`entities.${id}: Türkçe ad (name.tr) eksik`);
    if (e.summary && !String(e.summary.tr ?? '').trim()) errors.push(`entities.${id}: summary.tr boş`);
    if (e.kind === 'region') {
      const b = e.bounds;
      if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== 'number') || b[0] >= b[2] || b[1] >= b[3]) {
        errors.push(`entities.${id}: bölge için geçerli bounds [batı, güney, doğu, kuzey] gerekli`);
      }
    }
  }
  for (const id of Object.keys(derived)) {
    if (!entities[id]) errors.push(`polities.json'da var ama entities.json'da yok: "${id}" (Türkçe ad eklenmeli)`);
  }
  for (const [id, e] of Object.entries(entities)) {
    if (e.kind === 'polity' && !derived[id]) warnings.push(`entities.${id}: sınır verisinde karşılığı yok`);
  }
  const noSummary = Object.entries(entities).filter(([, e]) => e.kind === 'polity' && !e.summary).length;
  stats.entities = Object.keys(entities).length;
  stats.entitiesWithoutSummary = noSummary;

  /* ---- borders */
  const bordersPath = join(root, 'borders', `cliopatria-${range[0]}-${range[1]}.json`);
  const borders = readJson(bordersPath, errors);
  if (borders) {
    let n = 0;
    for (const f of borders.features ?? []) {
      n++;
      const p = f.properties ?? {};
      if (!p.id || !entities[p.id]) errors.push(`borders: "${p.id}" için entities.json kaydı yok`);
      if (!(p.from <= p.to)) errors.push(`borders: ${p.id} from/to geçersiz`);
      for (const up of p.up ?? []) if (!entities[up]) errors.push(`borders: ${p.id} üst yapısı "${up}" entities.json'da yok`);
      if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) errors.push(`borders: ${p.id} geometrisi geçersiz`);
    }
    stats.borderRows = n;
  }
  const land = readJson(join(root, 'geo', 'land.json'), errors);
  if (land) stats.landParts = (land.features ?? []).length;

  /* ---- categories */
  const categoryIds = new Set();
  for (const c of categoriesDoc.categories ?? []) {
    if (categoryIds.has(c.id)) errors.push(`categories: yinelenen kimlik "${c.id}"`);
    categoryIds.add(c.id);
    if (!c.label?.tr) errors.push(`categories.${c.id}: label.tr eksik`);
  }

  /* ---- events */
  const seen = new Map();
  const bySet = {};
  const byImportance = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const partyUse = {};
  for (const file of eventsIndex.files ?? []) {
    const doc = readJson(join(root, 'events', file), errors);
    if (!doc) continue;
    const set = doc.set ?? file;
    bySet[set] = 0;
    for (const ev of doc.events ?? []) {
      const where = `events/${file} › ${ev?.id ?? '(kimliksiz)'}`;
      const err = (m) => errors.push(`${where}: ${m}`);
      const warn = (m) => warnings.push(`${where}: ${m}`);
      bySet[set]++;
      if (!ev.id || !ID_RE.test(ev.id)) err('id yok ya da geçersiz (küçük harf, rakam, tire)');
      if (seen.has(ev.id)) err(`yinelenen id (ilk: ${seen.get(ev.id)})`);
      else seen.set(ev.id, file);
      if (!ev.title?.tr?.trim()) err('title.tr eksik');
      if (!ev.summary?.tr?.trim()) err('summary.tr eksik');
      if (ev.title?.tr && ev.title.tr.length > 64) warn(`başlık uzun (${ev.title.tr.length} karakter)`);
      if (ev.summary?.tr && ev.summary.tr.length > 460) warn(`özet uzun (${ev.summary.tr.length} karakter)`);

      // dates
      const d = typeof ev.date === 'string' ? { start: ev.date } : ev.date;
      const s = d ? dateKey(d.start) : null;
      const e = d?.end ? dateKey(d.end) : s;
      if (s === null) err(`geçersiz başlangıç tarihi: ${JSON.stringify(ev.date)}`);
      if (d?.end && e === null) err(`geçersiz bitiş tarihi: ${JSON.stringify(d.end)}`);
      if (s !== null && e !== null && e < s) err('bitiş tarihi başlangıçtan önce');
      if (s !== null) {
        const sy = Math.floor(s / 10000);
        const ey = e !== null ? Math.floor(e / 10000) : sy;
        if (ey < range[0] || sy > range[1]) warn(`tarih ${range[0]}–${range[1]} dışında`);
      }

      // location
      const c = ev.location?.coordinates;
      if (!ev.location?.name?.tr) err('location.name.tr eksik');
      if (!Array.isArray(c) || c.length !== 2 || c.some((n) => typeof n !== 'number')) err('location.coordinates [boylam, enlem] olmalı');
      else if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) err(`koordinat aralık dışı: ${JSON.stringify(c)}`);

      // importance / category
      if (!Number.isInteger(ev.importance) || ev.importance < 1 || ev.importance > 5) err('importance 1–5 arası tamsayı olmalı');
      else byImportance[ev.importance]++;
      if (!categoryIds.has(ev.category)) err(`bilinmeyen kategori "${ev.category}"`);

      // parties
      if (!Array.isArray(ev.parties) || ev.parties.length === 0) err('parties boş (en az bir taraf gerekli)');
      else {
        for (const p of ev.parties) {
          if (!entities[p]) err(`taraf "${p}" entities.json'da yok`);
          partyUse[p] = (partyUse[p] ?? 0) + 1;
        }
        if (new Set(ev.parties).size !== ev.parties.length) err('parties içinde yinelenen kimlik');
      }

      // sources
      if (!Array.isArray(ev.sources) || ev.sources.length === 0) err('kaynak yok (Vikipedi bağlantısı ya da Wikidata kimliği gerekli)');
      else {
        for (const src of ev.sources) {
          if (!src.wikipedia && !src.wikidata && !src.url) err(`kaynak geçersiz: ${JSON.stringify(src)}`);
          if (src.wikidata && !/^Q\d+$/.test(src.wikidata)) err(`geçersiz Wikidata kimliği "${src.wikidata}"`);
        }
      }
    }
  }
  stats.events = seen.size;
  stats.eventsBySet = bySet;
  stats.eventsByImportance = byImportance;
  stats.mapEligible = byImportance[3] + byImportance[4] + byImportance[5];

  const unusedEntities = Object.entries(entities)
    .filter(([id, e]) => e.kind === 'region' && !partyUse[id])
    .map(([id]) => id);
  if (unusedEntities.length) warnings.push(`hiçbir olayda kullanılmayan bölgeler: ${unusedEntities.join(', ')}`);

  return { errors, warnings, stats };
}

function main() {
  const { errors, warnings, stats } = validateAll();
  console.log('İstatistik:', JSON.stringify(stats, null, 1));
  for (const w of warnings) console.warn('  uyarı:', w);
  for (const e of errors) console.error('  HATA:', e);
  console.log(errors.length ? `\n${errors.length} hata, ${warnings.length} uyarı` : `\nVeri geçerli (${warnings.length} uyarı)`);
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
