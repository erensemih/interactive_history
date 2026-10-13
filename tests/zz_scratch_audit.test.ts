import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { primaryAt, rowsContaining } from '../src/domain/geo';
import { shippedData } from './helpers/shipped';

// TEMPORARY scratch audit (deleted before the end): which big cities does each occupation entry name, per year?
const OUT = '/tmp/claude-0/-home-user-interactive-history/d8acbdcf-7c20-5da4-815d-0e60f50659e9/scratchpad/c/audit-out.txt';
const EXPECT: Record<string, string[]> = {
  polonya: ['Poland', 'Ukraine', 'Belarus', 'Lithuania', 'Czechia'],
  'dogu-polonya': ['Poland', 'Ukraine', 'Belarus', 'Lithuania'],
  'litvanya-vilnius': ['Lithuania'],
  'bohemya-moravya': ['Czechia'],
  norvec: ['Norway'],
  hollanda: ['Netherlands'],
  belcika: ['Belgium'],
  luksemburg: ['Luxembourg'],
  danimarka: ['Denmark'],
  fransa: ['France', 'Monaco'],
  yunanistan: ['Greece'],
  yugoslavya: ['Serbia', 'Croatia', 'Bosnia and Herzegovina', 'Slovenia', 'Montenegro', 'Macedonia', 'North Macedonia', 'Kosovo'],
  arnavutluk: ['Albania'],
  estonya: ['Estonia'],
  letonya: ['Latvia'],
  litvanya: ['Lithuania'],
  belarus: ['Belarus'],
  ukrayna: ['Ukraine'],
  rusya: ['Russia'],
  cin: ['China'],
  filipinler: ['Philippines'],
  'hollanda-dogu-hint-adalari': ['Indonesia'],
  burma: ['Myanmar'],
  singapur: ['Singapore'],
  malaya: ['Malaysia'],
  'ingiliz-borneosu': ['Malaysia', 'Brunei'],
  'fransiz-cinhindisi': ['Vietnam', 'Laos', 'Cambodia'],
  'dogu-timor': ['East Timor'],
};

describe('scratch audit', () => {
  it('prints', () => {
    const data = shippedData();
    const places = (
      JSON.parse(
        readFileSync('/home/user/interactive_history/.cache/natural-earth/ne_10m_populated_places_simple.geojson', 'utf8'),
      ) as { features: { properties: { nameascii: string; adm0name: string; latitude: number; longitude: number; pop_max: number } }[] }
    ).features
      .map((f) => ({ name: f.properties.nameascii, c: f.properties.adm0name, lon: f.properties.longitude, lat: f.properties.latitude, pop: f.properties.pop_max }))
      .filter((p) => p.pop >= 30000);
    const years = [1939, 1940, 1941, 1942, 1943, 1944, 1945];
    const byEntry = new Map<string, Map<number, string[]>>();
    const unexpected = new Map<string, Set<string>>();
    const lines: string[] = [];
    for (const p of places) {
      const cands = rowsContaining(data.rows, p.lon, p.lat);
      for (const y of years) {
        const holder = primaryAt(cands, y);
        const occ = data.occupations.at({ lon: p.lon, lat: p.lat }, y, holder);
        if (!occ) continue;
        let m = byEntry.get(occ.id);
        if (!m) byEntry.set(occ.id, (m = new Map()));
        const arr = m.get(y) ?? [];
        arr.push(`${p.name}(${p.c.slice(0, 3)},${occ.label.slice(0, 1)})`);
        m.set(y, arr);
        if (!(EXPECT[occ.id] ?? []).includes(p.c)) {
          let u = unexpected.get(occ.id);
          if (!u) unexpected.set(occ.id, (u = new Set()));
          u.add(`${p.name}[${p.c}]`);
        }
      }
    }
    for (const e of data.occupations['items' as never] ? [] : []) lines.push(String(e));
    lines.push('== labelled cities (>=30k) per entry and year; unexpected countries');
    for (const [id, m] of byEntry) {
      lines.push(`\n## ${id}: ${[...m].map(([y, a]) => `${y}:${a.length}`).join(' ')}`);
      const u = unexpected.get(id);
      lines.push(`   unexpected: ${u ? [...u].join(', ') : '-'}`);
    }
    writeFileSync(OUT, lines.join('\n') + '\n');
  }, 120000);
});
