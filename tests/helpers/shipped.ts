import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleData, type AppData, type RawFiles } from '../../src/data/load';

const dir = join(__dirname, '..', '..', 'public', 'data');
const read = <T>(path: string): T => JSON.parse(readFileSync(join(dir, path), 'utf8')) as T;

let cached: AppData | null = null;

/** The shipped data files, assembled exactly as the app assembles them. Read once per test file. */
export function shippedData(): AppData {
  if (cached) return cached;
  const index = read<RawFiles['index']>('borders/polities.json');
  const [from, to] = index.meta.range;
  const eventsIndex = read<{ files: string[] }>('events/index.json');
  cached = assembleData({
    index,
    entitiesDoc: read<RawFiles['entitiesDoc']>('entities.json'),
    categoriesDoc: read<RawFiles['categoriesDoc']>('categories.json'),
    eventSets: eventsIndex.files.map((file) => ({
      file,
      doc: read<RawFiles['eventSets'][number]['doc']>(`events/${file}`),
    })),
    land: read<RawFiles['land']>('geo/land.json'),
    bordersRaw: read<RawFiles['bordersRaw']>(`borders/cliopatria-${from}-${to}.json`),
  });
  return cached;
}
