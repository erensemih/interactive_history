import type { YearRange } from '../domain/types';
import type { TurnPlan } from './drawing';
import type { ToolSpec } from './provider';
import { cleanCaption, cleanLabel, type Resolver } from './resolve';
import { LIMITS, RELATIONS, ROUTE_TYPES, type PlaceRef, type Relation, type RouteType, type Side } from './types';

export interface ToolEnv {
  resolver: Resolver;
  /** The range the call was made for; fixed, so a reader who moves the ruler meanwhile does not change what resolves. */
  range: YearRange;
  plan: TurnPlan;
  /** Called after each accepted request, so the interface can follow along. */
  onChange?(): void;
}

const OK = 'tamam';

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : value == null ? [] : [value]);

const integer = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;
};

/** The step a request belongs to: 1 when unsaid, null when it is nonsense (and the request is skipped). */
function stepOf(input: Record<string, unknown>): number | null {
  const raw = input.step ?? input.n;
  if (raw === undefined || raw === null || raw === '') return 1;
  const n = integer(raw);
  if (n === null || n > LIMITS.steps) return null;
  return Math.max(1, n);
}

const RELATION_ALIASES: Record<string, Relation> = {
  war: 'war',
  savas: 'war',
  alliance: 'alliance',
  ittifak: 'alliance',
  trade: 'trade',
  ticaret: 'trade',
  treaty: 'treaty',
  antlasma: 'treaty',
  anlasma: 'treaty',
};

function relationOf(value: unknown): Relation | null {
  if (typeof value !== 'string') return null;
  const key = value.toLocaleLowerCase('tr').replace(/[şŞ]/g, 's').replace(/[ıİ]/g, 'i').trim();
  return RELATION_ALIASES[key] ?? null;
}

const ROUTE_ALIASES: Record<string, RouteType> = {
  advance: 'advance',
  campaign: 'advance',
  march: 'advance',
  offensive: 'advance',
  ilerleyis: 'advance',
  sefer: 'advance',
  taarruz: 'advance',
  retreat: 'retreat',
  withdrawal: 'retreat',
  'geri cekilme': 'retreat',
  'geri cekilis': 'retreat',
  migration: 'migration',
  exodus: 'migration',
  flight: 'migration',
  goc: 'migration',
  surgun: 'migration',
  trade: 'trade',
  supply: 'trade',
  ticaret: 'trade',
  'ticaret yolu': 'trade',
  ikmal: 'trade',
};

function routeTypeOf(value: unknown): RouteType | null {
  if (typeof value !== 'string') return null;
  const key = value
    .toLocaleLowerCase('tr')
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .trim();
  return ROUTE_ALIASES[key] ?? null;
}

const PLACE_HELP =
  'Yer: şehir adı ("Moskova"; eski adlar da tanınır: "Stalingrad", "Danzig"), OLAYLAR listesindeki bir olayın kimliği, devletin kimliği (o yılın başkenti) ya da "enlem, boylam" ("52.23, 21.01"); tanınmayan yer atlanır.';

const STEP_RANGE_NOTE = `atlandı: sahne numarası 1 ile ${LIMITS.steps} arasında olmalı`;

const STEP_PROP = {
  type: 'integer',
  minimum: 1,
  maximum: LIMITS.steps,
  description: 'Hangi sahneye ait olduğu (varsayılan 1). Çizim, o sahne etkinken haritada durur.',
};

/**
 * The page functions the model may call. They are the only way the AI touches the map. Each one checks
 * its references against the data and either records the request in the plan or declines it ("atlandı"),
 * and never throws: a declined drawing is not an error worth a round trip. They only record; what is
 * drawn, and when, is decided later by the step the reader is on (and each step shows only its own).
 *
 * The model decides WHAT the map shows; the app decides HOW it looks. So there are seven tools and none of them
 * is about looks or the camera: `step` (a scene of a narration, with its caption and, if it needs one, its
 * year), `show_event` (an event of the data: the app draws it by its kind), `highlight` (which polities stand
 * out), `sides` (which polities stand together in a conflict: the app paints each side as one bloc), and for what the
 * data does not know, `route` (a directed path through places), `connect` (a line between two places) and `mark` (a
 * point). The ends of a line and the stops of a route are PLACES (an event, a city, a point, or a polity's capital).
 * The order is the order of importance: a view that allows fewer tools keeps the first ones.
 */
export function createTools(env: ToolEnv): ToolSpec[] {
  const { resolver, range, plan } = env;
  const accept = (action: Parameters<TurnPlan['add']>[0]) => {
    plan.add(action);
    env.onChange?.();
    return OK;
  };
  const polities = (refs: unknown[]) => {
    const ids: string[] = [];
    const skipped: string[] = [];
    for (const ref of refs) {
      const id = resolver.polity(ref, range);
      if (!id) skipped.push(String(ref).slice(0, 40));
      else if (!ids.includes(id)) ids.push(id);
    }
    return { ids, skipped };
  };
  const note = (skipped: string[]) =>
    skipped.length ? ` (atlandı, tanınmadı: ${skipped.slice(0, 3).join(', ')})` : '';
  const placeRefs = (values: unknown[]) => {
    const refs: PlaceRef[] = [];
    const skipped: string[] = [];
    for (const value of values) {
      const ref = resolver.placeRef(value, range);
      if (ref) refs.push(ref);
      else skipped.push(typeof value === 'string' ? value.slice(0, 40) : (JSON.stringify(value) ?? '?').slice(0, 40));
    }
    return { refs, skipped };
  };

  return [
    {
      name: 'step',
      description:
        'Bir sahneyi tanımlar: numarası, kısa başlığı ve altyazısı. Aynı numarayla çağrılan gösterim araçları sahnenin haritasını kurar; harita, etkin sahnenin kendi gösterimini gösterir. year verilirse harita o yılın sınırlarını gösterir; verilmezse sahnedeki olayın başladığı yılın, olay yoksa okurun yılının sınırlarını. Tam metin bu çağrıda yer almaz; ikinci turda "## n. Başlık" altında yazılır. Dönüş: "tamam".',
      inputSchema: {
        type: 'object',
        properties: {
          n: { ...STEP_PROP, description: "Sahne numarası, 1'den başlar." },
          title: { type: 'string', description: 'Sahnenin kısa başlığı.' },
          caption: {
            type: 'string',
            description:
              'Altyazı: sahnenin özü, bir iki cümle; haritanın üstünde görünür. Veri setindeki bir olay [olay adı](olay:KİMLİK) biçiminde anılırsa okur tıklayıp haritada görür.',
          },
          year: {
            type: 'integer',
            description: 'İsteğe bağlı: haritada gösterilecek sınırların yılı (seçili aralığın içinde).',
          },
        },
        required: ['n', 'title', 'caption'],
      },
      execute(input) {
        // A step without a number (or with a nonsensical one) takes the next free one, so the titles do not overwrite each other.
        const numbered = input.step !== undefined || input.n !== undefined;
        const next = Math.min(LIMITS.steps, Math.max(0, ...plan.numbers()) + 1);
        const n = numbered ? stepOf(input) : next;
        if (n === null) return STEP_RANGE_NOTE;
        plan.declare(n, cleanLabel(input.title, LIMITS.title), cleanCaption(input.caption, LIMITS.caption));
        env.onChange?.();
        if (input.year === undefined || input.year === null || input.year === '') return OK;
        const year = resolver.year(input.year, range);
        if (year === null) return `tamam; yıl atlandı: ${range.from}–${range.to} aralığında olmalı`;
        return accept({ kind: 'set_year', step: n, year });
      },
    },
    {
      name: 'show_event',
      description:
        'OLAYLAR listesindeki bir olayı haritada gösterir: olayın tarafları öne çıkar, olayın işareti konur; savaş olaylarında iki tarafın başkentlerinden çıkan ve işaretin üzerinden geçen bir çizgi çizilir. event: OLAYLAR listesindeki kimlik. Dönüş: "tamam" ya da atlanma nedeni.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          event: { type: 'string', description: 'OLAYLAR listesindeki olay kimliği (örn. "stalingrad-1942").' },
        },
        required: ['event'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const ev = resolver.event(input.event ?? input.id ?? input.title);
        if (!ev) return 'atlandı: bu kimlikte bir olay yok; kimlik OLAYLAR listesinden olmalı';
        return accept({ kind: 'event', step, id: ev.id });
      },
    },
    {
      name: 'highlight',
      description:
        'Devletleri öne çıkarır: canlı renkle ve dolgun görünürler, haritanın geri kalanı solar. polities: POLİTİLER listesindeki kimlikler (en çok 4); listede olmayan atlanır. Dönüş: "tamam" ya da atlanma nedeni.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          polities: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Devlet kimlikleri (POLİTİLER listesinden).',
          },
        },
        required: ['polities'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const { ids, skipped } = polities(listOf(input.polities ?? input.polity ?? input.ids).slice(0, 6));
        if (!ids.length) return `atlandı: tanınan devlet yok${note(skipped)}`;
        return accept({ kind: 'highlight', step, polities: ids }) + note(skipped);
      },
    },
    {
      name: 'sides',
      description: `Bir çatışmanın taraflarını tanımlar: her taraf tek bir blok olarak ayrı bir renkle boyanır ve adı rengiyle birlikte gösterilir; tarafların devletleri öne çıkar. sides: 2–${LIMITS.sides} taraf, her biri {name, polities}; name kısa bir ad (örn. "Mihver"), polities POLİTİLER listesindeki kimlikler (taraf başına en çok ${LIMITS.sidePolities}). Bir devlet tek tarafta yer alır. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          sides: {
            type: 'array',
            minItems: 1,
            maxItems: LIMITS.sides,
            description: 'Taraflar.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: `Tarafın kısa adı (en çok ${LIMITS.label} karakter).` },
                polities: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: LIMITS.sidePolities,
                  description: 'Devlet kimlikleri (POLİTİLER listesinden).',
                },
              },
              required: ['name', 'polities'],
            },
          },
        },
        required: ['sides'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const sides: Side[] = [];
        const skipped: string[] = [];
        const taken = new Set<string>();
        for (const item of listOf(input.sides ?? input.parties).slice(0, LIMITS.sides + 2)) {
          if (!item || typeof item !== 'object') continue;
          const side = item as Record<string, unknown>;
          const name = cleanLabel(side.name ?? side.title, LIMITS.label);
          const found = polities(listOf(side.polities ?? side.members).slice(0, LIMITS.sidePolities + 4));
          skipped.push(...found.skipped);
          const fresh = found.ids.filter((id) => !taken.has(id)).slice(0, LIMITS.sidePolities);
          for (const id of fresh) taken.add(id);
          if (name && fresh.length) sides.push({ name, polities: fresh });
        }
        if (!sides.length) return `atlandı: adı ve tanınan devletleri olan bir taraf gerekli${note(skipped)}`;
        return accept({ kind: 'sides', step, sides: sides.slice(0, LIMITS.sides) }) + note(skipped);
      },
    },
    {
      name: 'route',
      description: `Sıralı yerlerden geçen yönlü bir yol çizer. type: advance (ilerleyiş, sefer), retreat (geri çekilme), migration (göç, sürgün) ya da trade (ticaret, ikmal); her türün biçimi sabittir (kıvrımlı, uçta oklu). via: 2–${LIMITS.stops} yer, sırayla; ok sonuncuyu gösterir. ${PLACE_HELP} label: isteğe bağlı kısa etiket. animate: true ise yol, sahne açılınca çizilerek belirir. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          via: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: LIMITS.stops,
            description: 'Duraklar, sırayla (birincisi başlangıç, sonuncusu varış).',
          },
          type: { type: 'string', enum: [...ROUTE_TYPES], description: 'Yolun türü.' },
          label: { type: 'string', description: `İsteğe bağlı kısa etiket (en çok ${LIMITS.label} karakter).` },
          animate: { type: 'boolean', description: 'Yol çizilerek belirsin mi? Varsayılan: hayır.' },
        },
        required: ['via', 'type'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const type = routeTypeOf(input.type);
        if (!type) return 'atlandı: tür advance, retreat, migration ya da trade olmalı';
        const { refs, skipped } = placeRefs(
          listOf(input.via ?? input.stops ?? input.places).slice(0, LIMITS.stops + 4),
        );
        // the same place twice in a row is one stop
        const stops = refs.filter((r, i) => i === 0 || !resolver.samePlace(r, refs[i - 1]!)).slice(0, LIMITS.stops);
        if (stops.length < 2) return `atlandı: en az iki ayrı ve tanınan yer gerekli${note(skipped)}`;
        const label = cleanLabel(input.label, LIMITS.label) ?? undefined;
        const animate = input.animate === true || input.animate === 'true';
        return accept({ kind: 'route', step, via: stops, type, animate, ...(label ? { label } : {}) }) + note(skipped);
      },
    },
    {
      name: 'connect',
      description: `İki yer arasına bir ilişki çizgisi çizer. relation: war (savaş), alliance (ittifak), trade (ticaret) ya da treaty (antlaşma); her ilişkinin çizgi biçimi sabittir. from, to: iki uç. ${PLACE_HELP} label: isteğe bağlı kısa etiket. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          from: { type: 'string', description: 'Birinci uç (bir yer).' },
          to: { type: 'string', description: 'İkinci uç (bir yer).' },
          relation: { type: 'string', enum: [...RELATIONS], description: 'İlişkinin türü.' },
          label: { type: 'string', description: `İsteğe bağlı kısa etiket (en çok ${LIMITS.label} karakter).` },
        },
        required: ['from', 'to', 'relation'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const relation = relationOf(input.relation);
        if (!relation) return 'atlandı: ilişki war, alliance, trade ya da treaty olmalı';
        const { refs, skipped } = placeRefs([input.from, input.to]);
        if (refs.length < 2) return `atlandı: iki yer gerekli${note(skipped)}`;
        if (resolver.samePlace(refs[0]!, refs[1]!)) return 'atlandı: iki ayrı yer gerekli';
        const label = cleanLabel(input.label, LIMITS.label) ?? undefined;
        return accept({ kind: 'connect', step, from: refs[0]!, to: refs[1]!, relation, ...(label ? { label } : {}) });
      },
    },
    {
      name: 'mark',
      description: `Haritada bir noktayı kısa bir etiketle işaretler. Nokta, place ile (bir şehir adı, eski adlar da tanınır: "Danzig"; ya da "enlem, boylam") veya lon ve lat ile verilir; place OLAYLAR listesindeki bir olayın yeriyse olay olarak gösterilir. label: işaretin etiketi. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          place: { type: 'string', description: 'Yer: şehir adı ya da "enlem, boylam". Verilirse lon/lat gerekmez.' },
          lon: { type: 'number', description: 'Boylam, ondalık derece (doğu +).' },
          lat: { type: 'number', description: 'Enlem, ondalık derece (kuzey +).' },
          label: {
            type: 'string',
            description: `Kısa etiket (en çok ${LIMITS.label} karakter); place bir şehirse verilmezse şehrin adı olur.`,
          },
        },
        required: ['label'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        let point = null as ReturnType<typeof resolver.point>;
        let name: string | null = null;
        if (input.place !== undefined && input.place !== null && input.place !== '') {
          const ref = resolver.placeRef(input.place, range);
          if (!ref || ref.kind === 'polity')
            return 'atlandı: yer tanınmadı (bir şehir adı ya da "enlem, boylam" olmalı)';
          if (ref.kind === 'event')
            return accept({ kind: 'event', step, id: ref.id }) + ' (uygulamanın olay kaydı; olay olarak gösterildi)';
          point = resolver.placePoint(ref, range.to);
          name = ref.kind === 'city' ? ref.name : null;
        } else {
          point = resolver.point(input.lon, input.lat);
        }
        if (!point) return 'atlandı: koordinat haritanın dışında';
        const label = cleanLabel(input.label, LIMITS.label) ?? name;
        if (!label) return 'atlandı: etiket gerekli';
        // A place the app already has an event for is shown by that event's own marker, never by a second one.
        const known = resolver.eventFor(label, point, range);
        if (known) {
          accept({ kind: 'event', step, id: known.id });
          return `tamam: «${known.title}» uygulamanın olay kaydı; olay olarak gösterildi`;
        }
        return accept({ kind: 'mark', step, point, label });
      },
    },
  ];
}
