import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleData, type AppData, type RawFiles } from '../../src/data/load';

const root = join(__dirname, '..', '..');

function load(dir: string): AppData {
  const read = <T>(path: string): T => JSON.parse(readFileSync(join(dir, path), 'utf8')) as T;
  const readOptional = <T>(path: string): T | null => (existsSync(join(dir, path)) ? read<T>(path) : null);
  const index = read<RawFiles['index']>('borders/polities.json');
  const [from, to] = index.meta.range;
  const eventsIndex = read<{ files: string[]; open?: { from: number; to: number } }>('events/index.json');
  return assembleData({
    index,
    entitiesDoc: read<RawFiles['entitiesDoc']>('entities.json'),
    categoriesDoc: read<RawFiles['categoriesDoc']>('categories.json'),
    open: eventsIndex.open,
    eventSets: eventsIndex.files.map((file) => ({
      file,
      doc: read<RawFiles['eventSets'][number]['doc']>(`events/${file}`),
    })),
    land: read<RawFiles['land']>('geo/land.json'),
    places: readOptional<NonNullable<RawFiles['places']>>('places.json'),
    capitals: readOptional<NonNullable<RawFiles['capitals']>>('capitals.json'),
    corrections: readOptional<NonNullable<RawFiles['corrections']>>('corrections/ww2.json'),
    bordersRaw: read<RawFiles['bordersRaw']>(`borders/cliopatria-${from}-${to}.json`),
  });
}

const cache = new Map<string, AppData>();
const once = (dir: string) => {
  let data = cache.get(dir);
  if (!data) cache.set(dir, (data = load(dir)));
  return data;
};

/** The published data (public/data: 1800–2000), assembled exactly as the app assembles it. Read once per test file. */
export const shippedData = (): AppData => once(join(root, 'public', 'data'));

/**
 * An archived period (data/<period>, for example "1400-1600"): the same files, outside the published build. Tests of
 * the mechanics that do not care which era they run on use one, and so keep the archive honest.
 */
export const archivedData = (period: string): AppData => once(join(root, 'data', period));
