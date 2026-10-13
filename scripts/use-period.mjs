#!/usr/bin/env node
/**
 * Which period of history the published app shows.
 *
 *   node scripts/use-period.mjs --list          the periods: the published one and the archived ones
 *   node scripts/use-period.mjs 1400-1600       publish an archived period (the one that is published goes to the archive)
 *
 * The published data lives in public/data. Every other period is kept whole in data/<from>-<to>/ (the same files, the
 * same layout), outside the build: nothing in data/ reaches the app or the single-file page. Switching moves the
 * files, so each period exists exactly once; `npm run data:validate` and `npm run build` then work on the new one.
 * (public/data/schema stays: it belongs to the app, not to a period.)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public', 'data');
const ARCHIVE = join(ROOT, 'data');
/** What makes a period: everything but the app's own schema folder. */
const PARTS = ['borders', 'events', 'geo', 'categories.json', 'entities.json'];

const rangeOf = (dir) => {
  const file = join(dir, 'borders', 'polities.json');
  if (!existsSync(file)) return null;
  const [from, to] = JSON.parse(readFileSync(file, 'utf8')).meta.range;
  return `${from}-${to}`;
};

const archived = () =>
  existsSync(ARCHIVE)
    ? readdirSync(ARCHIVE, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(ARCHIVE, d.name, 'borders', 'polities.json')))
        .map((d) => d.name)
        .sort()
    : [];

function list() {
  console.log(`yayında:  ${rangeOf(PUBLIC) ?? '(yok)'}   (public/data)`);
  const others = archived();
  console.log(`arşivde:  ${others.length ? others.join(', ') : '(yok)'}   (data/)`);
}

function move(from, to) {
  mkdirSync(to, { recursive: true });
  for (const part of PARTS) if (existsSync(join(from, part))) renameSync(join(from, part), join(to, part));
}

function use(period) {
  const current = rangeOf(PUBLIC);
  if (current === period) {
    console.log(`${period} zaten yayında.`);
    return 0;
  }
  const source = join(ARCHIVE, period);
  if (!existsSync(join(source, 'borders', 'polities.json'))) {
    console.error(`HATA: data/${period} bir dönem arşivi değil. Arşivdekiler: ${archived().join(', ') || '(yok)'}`);
    return 1;
  }
  if (current) {
    const target = join(ARCHIVE, current);
    if (existsSync(target) && readdirSync(target).length) {
      console.error(`HATA: data/${current} zaten dolu; yayındaki ${current} üzerine yazılmasın diye durdum.`);
      return 1;
    }
    move(PUBLIC, target);
    console.log(`${current}: public/data -> data/${current}`);
  }
  move(source, PUBLIC);
  console.log(`${period}: data/${period} -> public/data`);
  console.log('Şimdi: npm run data:validate && npm run build');
  return 0;
}

const arg = process.argv[2];
if (!arg || arg === '--list' || arg === '-l') {
  list();
} else if (/^\d{1,4}-\d{1,4}$/.test(arg)) {
  process.exit(use(arg));
} else {
  console.error('Kullanım: node scripts/use-period.mjs --list | <başlangıç>-<bitiş>');
  process.exit(1);
}
