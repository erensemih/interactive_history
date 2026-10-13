#!/usr/bin/env node
/**
 * Checks of the gazetteer (places.json) and the capitals table (capitals.json) under public/data.
 *
 *   node scripts/validate-places.mjs            both files of the published period
 *
 * Both are optional files (an archived period has none): a missing file is a warning, not an error.
 * scripts/validate-data.mjs calls the two functions below with what it has already read:
 *
 *   validatePlaces(root, ctx)   -> { errors, warnings, stats }
 *   validateCapitals(root, ctx) -> { errors, warnings, stats }
 *
 * `ctx` is optional and every part of it is optional: { places, entities, derived, events }
 *   places    the parsed places.json
 *   entities  the `entities` object of entities.json
 *   derived   the `entities` object of borders/polities.json (the years each polity has rows; the correction layer's
 *             added rows count too, see drawnYears)
 *   events    the event objects of every file in events/index.json
 * What is missing is read from `root`. Messages are Turkish like the rest of the validator's.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', 'public', 'data');

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FOLD = { ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l' };

/** The key of a name: the same folding as normalizeName in src/domain/names.ts (tests/places.test.ts holds the two together). */
export function nameKey(text) {
  return String(text)
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ıßæœøđł]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`JSON okunamadı (${path}): ${e.message}`);
    return null;
  }
}

function readEvents(root, errors) {
  const index = join(root, 'events', 'index.json');
  if (!existsSync(index)) return [];
  const files = readJson(index, errors)?.files ?? [];
  return files.flatMap((f) =>
    existsSync(join(root, 'events', f)) ? (readJson(join(root, 'events', f), errors)?.events ?? []) : [],
  );
}

/**
 * The years each polity is drawn in: those of borders/polities.json, and the years the correction layer adds a row for
 * (corrections/*.json "rows": Nazi Germany is drawn in 1945 although Cliopatria's rows end in 1944).
 */
export function drawnYears(root, derived, errors = []) {
  const years = {};
  for (const [id, y] of Object.entries(derived)) years[id] = { from: y.from, to: y.to };
  const dir = join(root, 'corrections');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      for (const row of readJson(join(dir, file), errors)?.rows ?? []) {
        const y = years[row.id] ?? (years[row.id] = { from: row.from, to: row.to });
        y.from = Math.min(y.from, row.from);
        y.to = Math.max(y.to, row.to);
      }
    }
  }
  return years;
}

/** Great-circle distance in km. */
function km([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export function validatePlaces(root = DEFAULT_ROOT, ctx = {}) {
  const errors = [];
  const warnings = [];
  const stats = {};
  const doc =
    ctx.places ?? (existsSync(join(root, 'places.json')) ? readJson(join(root, 'places.json'), errors) : null);
  if (!doc) {
    if (!errors.length)
      warnings.push('places.json yok (isteğe bağlı: yapay zekâ çizgileri yer adlarını bu dosyadan çözer)');
    return { errors, warnings, stats };
  }

  const src = doc.meta?.source;
  for (const field of ['name', 'url', 'license', 'citation', 'changes']) {
    if (!src?.[field] || typeof src[field] !== 'string') errors.push(`places.json: meta.source.${field} eksik`);
  }
  const places = doc.places;
  if (!Array.isArray(places)) {
    errors.push('places.json: places bir liste olmalı');
    return { errors, warnings, stats };
  }
  if (doc.meta?.count !== places.length)
    errors.push(`places.json: meta.count (${doc.meta?.count}) ile yer sayısı (${places.length}) aynı değil`);

  const ids = new Set();
  const byMain = new Map();
  let capitals = 0;
  let keys = 0;
  let altNames = 0;
  let withAlt = 0;
  let previous = '';
  const countries = new Set();
  for (const p of places) {
    const where = `places.json › ${p?.id ?? '(kimliksiz)'}`;
    const err = (m) => errors.push(`${where}: ${m}`);
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) err('id yok ya da geçersiz (küçük harf, rakam, tire)');
    if (ids.has(p.id)) err('yinelenen id');
    ids.add(p.id);
    if (p.id < previous) err(`kimliklere göre sıralı değil (öncekinden küçük: ${previous})`);
    previous = p.id;
    for (const f of ['tr', 'en']) if (typeof p[f] !== 'string' || !p[f].trim()) err(`${f} adı boş`);
    if (typeof p.lon !== 'number' || typeof p.lat !== 'number' || Math.abs(p.lon) > 180 || Math.abs(p.lat) > 90)
      err(`koordinat geçersiz: ${p.lon}, ${p.lat}`);
    else if (p.lon === 0 && p.lat === 0) err('koordinat 0, 0');
    if (!Number.isInteger(p.pop) || p.pop < 0) err(`pop negatif olmayan tamsayı olmalı: ${p.pop}`);
    if (typeof p.cc !== 'string' || !/^[A-Z]{2}$/.test(p.cc)) err(`cc iki büyük harf olmalı: ${p.cc}`);
    else countries.add(p.cc);
    if (p.cap !== undefined && p.cap !== 1) err('cap yalnızca 1 olabilir');
    if (p.key !== undefined && p.key !== 1) err('key yalnızca 1 olabilir');
    if (p.cap) capitals++;
    if (p.key) keys++;
    if (!Array.isArray(p.alt)) {
      err('alt bir liste olmalı');
      continue;
    }
    const seen = new Set([nameKey(p.tr ?? ''), nameKey(p.en ?? '')]);
    for (const a of p.alt) {
      if (typeof a !== 'string' || !nameKey(a)) {
        err(`alt adı geçersiz: ${JSON.stringify(a)}`);
        continue;
      }
      if (/[?�]/.test(a)) err(`alt adı bozuk: ${JSON.stringify(a)}`);
      if (seen.has(nameKey(a))) err(`alt adı tr/en ya da başka bir alt adla aynı: ${JSON.stringify(a)}`);
      seen.add(nameKey(a));
    }
    altNames += p.alt.length;
    if (p.alt.length) withAlt++;
    for (const k of new Set([nameKey(p.tr ?? ''), nameKey(p.en ?? '')])) {
      if (!byMain.has(k)) byMain.set(k, []);
      byMain.get(k).push(p);
    }
  }

  // the same place twice: one name, within a kilometre or two
  for (const [k, group] of byMain) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (km([group[i].lon, group[i].lat], [group[j].lon, group[j].lat]) < 2)
          warnings.push(`places.json: "${k}" adıyla aynı yerde iki kayıt: ${group[i].id}, ${group[j].id}`);
  }

  // the app's own events and the gazetteer should agree where they name the same place
  const events = ctx.events ?? readEvents(root, errors);
  let checked = 0;
  for (const ev of events) {
    const name = ev?.location?.name?.tr;
    const c = ev?.location?.coordinates;
    if (!name || !Array.isArray(c)) continue;
    const found = byMain.get(nameKey(name));
    if (!found) continue;
    checked++;
    const nearest = Math.min(...found.map((p) => km(c, [p.lon, p.lat])));
    if (nearest > 40)
      warnings.push(`olay "${ev.id}" yeri "${name}" göstergelikteki aynı adlı yerden ${Math.round(nearest)} km uzakta`);
  }

  stats.places = places.length;
  stats.placeCapitals = capitals;
  stats.placeKeys = keys;
  stats.placeCountries = countries.size;
  stats.placeAltNames = altNames;
  stats.placesWithAlt = withAlt;
  stats.eventPlacesChecked = checked;
  return { errors, warnings, stats };
}

export function validateCapitals(root = DEFAULT_ROOT, ctx = {}) {
  const errors = [];
  const warnings = [];
  const stats = {};
  const doc = existsSync(join(root, 'capitals.json')) ? readJson(join(root, 'capitals.json'), errors) : null;
  if (!doc) {
    if (!errors.length)
      warnings.push('capitals.json yok (isteğe bağlı: bir devletten çizgi başlarken yıla göre başkent kullanılır)');
    return { errors, warnings, stats };
  }
  if (typeof doc.meta?.note !== 'string' || !doc.meta.note.trim()) errors.push('capitals.json: meta.note eksik');
  if (
    doc.meta?.sources !== undefined &&
    !(Array.isArray(doc.meta.sources) && doc.meta.sources.every((s) => typeof s === 'string'))
  )
    errors.push('capitals.json: meta.sources metin listesi olmalı');
  const table = doc.capitals;
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    errors.push('capitals.json: capitals bir nesne olmalı (devlet kimliği -> aralıklar)');
    return { errors, warnings, stats };
  }

  const places =
    ctx.places ?? (existsSync(join(root, 'places.json')) ? readJson(join(root, 'places.json'), errors) : null);
  const placeIds = new Set((places?.places ?? []).map((p) => p.id));
  if (!places) errors.push('capitals.json var ama places.json yok: başkentler yer kimliğiyle gösterilir');
  const entities = ctx.entities ?? readJson(join(root, 'entities.json'), errors)?.entities ?? {};
  const derived = ctx.derived ?? readJson(join(root, 'borders', 'polities.json'), errors)?.entities ?? {};
  const drawn = drawnYears(root, derived, errors);
  const events = ctx.events ?? readEvents(root, errors);

  let spans = 0;
  let coveredYears = 0;
  let lifetimeYears = 0;
  const usedPlaces = new Set();
  for (const [id, list] of Object.entries(table)) {
    const where = `capitals.json › ${id}`;
    const err = (m) => errors.push(`${where}: ${m}`);
    const entity = entities[id];
    if (!entity) err("entities.json'da böyle bir devlet yok");
    else if (entity.sameAs !== undefined) err(`bir takma ad; asıl kimlik "${entity.sameAs}" kullanılmalı`);
    else if (entity.kind !== 'polity') err('devlet (kind: polity) değil');
    const years = drawn[id];
    if (!years) err('sınır verisinde (borders/polities.json) yıl aralığı yok');
    if (!Array.isArray(list) || !list.length) {
      err('aralık listesi boş');
      continue;
    }
    const sorted = [...list].sort((a, b) => a.from - b.from);
    let last = -Infinity;
    for (const s of sorted) {
      spans++;
      if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from > s.to) {
        err(`geçersiz aralık: ${JSON.stringify(s)}`);
        continue;
      }
      if (s.from <= last) err(`aralıklar çakışıyor (${s.from} yılında)`);
      last = Math.max(last, s.to);
      if (years && (s.from < years.from || s.to > years.to))
        err(`${s.from}–${s.to}, devletin çizildiği yılların (${years.from}–${years.to}) dışında`);
      if (typeof s.place !== 'string' || !s.place) err(`yer yok: ${JSON.stringify(s)}`);
      else if (places && !placeIds.has(s.place)) err(`"${s.place}" places.json'da yok`);
      else usedPlaces.add(s.place);
      if (s.note !== undefined && (typeof s.note !== 'string' || !s.note.trim()))
        err(`note boş ya da metin değil (${s.from}–${s.to})`);
      coveredYears += s.to - s.from + 1;
    }
    if (years) lifetimeYears += years.to - years.from + 1;
  }

  // who the events name, and whether the table has them
  const parties = new Set();
  for (const ev of events) for (const p of [...(ev?.parties ?? []), ...(ev?.versus ?? [])]) parties.add(p);
  const missing = [...parties].filter((p) => !table[p]).sort();
  if (missing.length) warnings.push(`olaylarda geçen ama başkent tablosunda olmayan devletler: ${missing.join(', ')}`);

  stats.capitalPolities = Object.keys(table).length;
  stats.capitalSpans = spans;
  stats.capitalPlaces = usedPlaces.size;
  stats.capitalYearsCovered = coveredYears;
  stats.capitalYearsOfPolities = lifetimeYears;
  stats.eventPartiesCovered = parties.size - missing.length;
  stats.eventParties = parties.size;
  return { errors, warnings, stats };
}

function main() {
  let failed = 0;
  for (const [name, run] of [
    ['places.json', validatePlaces],
    ['capitals.json', validateCapitals],
  ]) {
    const { errors, warnings, stats } = run();
    console.log(`${name}:`, JSON.stringify(stats));
    for (const w of warnings) console.warn('  uyarı:', w);
    for (const e of errors) console.error('  HATA:', e);
    failed += errors.length;
  }
  console.log(failed ? `\n${failed} hata` : '\nYer ve başkent dosyaları geçerli');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
