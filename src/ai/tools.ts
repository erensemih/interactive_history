import type { YearRange } from '../domain/types';
import type { TurnPlan } from './drawing';
import type { ToolSpec } from './provider';
import { cleanCaption, cleanLabel, type Resolver } from './resolve';
import { LIMITS, ROUTE_TYPES, type PlaceRef, type RouteType, type Side } from './types';

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

/** The beat (the sentence of the caption) a request appears with: 1 when unsaid or nonsense, never past the limit. */
function beatOf(input: Record<string, unknown>): number {
  const n = integer(input.beat);
  return n === null ? 1 : Math.min(LIMITS.beats, Math.max(1, n));
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
  'Yer: şehir adı ("Moskova"; eski adlar da tanınır: "Stalingrad"), OLAYLAR listesindeki bir olayın kimliği, devletin kimliği (o yılın başkenti), "enlem, boylam" ya da "sınır: devlet → yer" (devletin sınırının yere en yakın noktası). Tanınmayan yer atlanır.';

const STEP_RANGE_NOTE = `atlandı: sahne numarası 1 ile ${LIMITS.steps} arasında olmalı`;

const STEP_PROP = {
  type: 'integer',
  minimum: 1,
  maximum: LIMITS.steps,
  description: 'Hangi sahneye ait olduğu (varsayılan 1).',
};

const BEAT_PROP = {
  type: 'integer',
  minimum: 1,
  maximum: LIMITS.beats,
  description: 'Sahnenin altyazısının kaçıncı cümlesi okunurken göründüğü (varsayılan 1).',
};

/**
 * The page functions the model may call. They are the only way the AI touches the map. Each one checks
 * its references against the data and either records the request in the plan or declines it ("atlandı"),
 * and never throws: a declined drawing is not an error worth a round trip. They only record; what is
 * drawn, and when, is decided later by the scene and the beat the reader is on (a scene shows only its own).
 *
 * The model decides WHAT the map shows; the app decides HOW it looks, with one meaning for each mark: an area is
 * territory or control, an arrow is a movement, a point is a place or an event, hatching is occupation or doubt. So there are
 * seven tools and none of them is about looks or the camera: `step` (a scene of a narration, with its caption: the sentences
 * of which are its beats, and, if it needs one, its year), `show_event` (an event of the data: its marker), `highlight` (which
 * polities stand out), `sides` (who is on which side: the app paints the map relative to the narration's focus),
 * `route` (an arrow through places), `territory_change` (what a polity gained and lost between two years) and `mark` (a
 * point). The stops of a route are PLACES (an event, a city, a point, a polity's capital, or the border of a polity toward
 * another place). The order is the order of importance: a view that allows fewer tools keeps the first ones.
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
        'Bir sahneyi tanımlar: numarası, kısa başlığı ve altyazısı. Altyazı cümlelere bölünür; her cümle sahnenin sırayla oynayan bir vuruşudur (1\'den başlar). Aynı numarayla çağrılan gösterim araçları sahnenin haritasını kurar; her biri beat ile hangi vuruşta göründüğünü söyler. year verilirse harita o yılın sınırlarıyla açılır; verilmezse sahnedeki olayın başladığı yılın, olay yoksa okurun yılının sınırlarıyla. Tam metin bu çağrıda yer almaz; ikinci turda "## n. Başlık" altında yazılır. Dönüş: "tamam".',
      inputSchema: {
        type: 'object',
        properties: {
          n: { ...STEP_PROP, description: "Sahne numarası, 1'den başlar." },
          title: { type: 'string', description: 'Sahnenin kısa başlığı.' },
          caption: {
            type: 'string',
            description:
              'Altyazı: cümle cümle yazılır ve haritanın üstünde görünür; her cümle bir vuruştur. Veri setindeki bir olay [olay adı](olay:KİMLİK) biçiminde anılırsa okur tıklayıp haritada görür.',
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
        'OLAYLAR listesindeki bir olayın yerini haritada işaretiyle gösterir; işaret, vuruş sürerken belirgindir, sonra küçük numaralı bir noktaya dönüşür. event: OLAYLAR listesindeki kimlik. Dönüş: "tamam" ya da atlanma nedeni.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
          event: { type: 'string', description: 'OLAYLAR listesindeki olay kimliği (örn. "stalingrad-1942").' },
        },
        required: ['event'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const ev = resolver.event(input.event ?? input.id ?? input.title);
        if (!ev) return 'atlandı: bu kimlikte bir olay yok; kimlik OLAYLAR listesinden olmalı';
        return accept({ kind: 'event', step, beat: beatOf(input), id: ev.id });
      },
    },
    {
      name: 'highlight',
      description:
        'Devletleri vurgular: vuruş sürerken devletler kendi renginde belirginleşir ve çevresi çizilir, haritanın geri kalanı solar; renkleri değişmez. polities: POLİTİLER listesindeki kimlikler (en çok 8); listede olmayan atlanır. Dönüş: "tamam" ya da atlanma nedeni.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
          polities: {
            type: 'array',
            items: { type: 'string' },
            maxItems: LIMITS.highlights,
            description: 'Devlet kimlikleri (POLİTİLER listesinden).',
          },
        },
        required: ['polities'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const { ids, skipped } = polities(
          listOf(input.polities ?? input.polity ?? input.ids).slice(0, LIMITS.highlights + 2),
        );
        if (!ids.length) return `atlandı: tanınan devlet yok${note(skipped)}`;
        return accept({ kind: 'highlight', step, beat: beatOf(input), polities: ids }) + note(skipped);
      },
    },
    {
      name: 'sides',
      description: `Kimin hangi tarafta olduğunu söyler; harita buna göre yeniden boyanır: odak tarafı, karşıt taraflar ve tarafsız devletler ayrı renklerdedir, adı geçmeyenler solar. Bir tarafın rengi anlatım boyunca aynı kalır; taraf değiştiren devlet yeni tarafın rengini alır. sides: 1–${LIMITS.sides} taraf, her biri {name, polities}; odak tarafı, seçili yerin devletinin tarafıdır (yoksa ilk taraf). neutral: tarafsız ya da tarafı belirsiz devletler. Kimlikler POLİTİLER listesinden (taraf başına en çok ${LIMITS.sidePolities}); bir devlet tek yerde yer alır. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
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
          neutral: {
            type: 'array',
            items: { type: 'string' },
            maxItems: LIMITS.sidePolities,
            description: 'Tarafsız ya da tarafı belirsiz devletlerin kimlikleri (isteğe bağlı).',
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
        const standing = polities(listOf(input.neutral).slice(0, LIMITS.sidePolities + 4));
        skipped.push(...standing.skipped);
        const neutral = standing.ids.filter((id) => !taken.has(id)).slice(0, LIMITS.sidePolities);
        if (!sides.length) return `atlandı: adı ve tanınan devletleri olan bir taraf gerekli${note(skipped)}`;
        return (
          accept({ kind: 'sides', step, beat: beatOf(input), sides: sides.slice(0, LIMITS.sides), neutral }) +
          note(skipped)
        );
      },
    },
    {
      name: 'route',
      description: `Sıralı yerlerden geçen yönlü bir ok çizer: gerçek bir hareket. type: advance (ilerleyiş), retreat (geri çekilme), migration (göç) ya da trade (ticaret); her türün biçimi sabittir. via: 2–${LIMITS.stops} yer, sırayla; ok sonuncuyu gösterir, vuruş sürerken görünür ve vuruş bitince solar. ${PLACE_HELP} label: kısa etiket. animate: false ise ok çizilerek belirmez. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
          via: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: LIMITS.stops,
            description: 'Duraklar, sırayla (birincisi başlangıç, sonuncusu varış).',
          },
          type: { type: 'string', enum: [...ROUTE_TYPES], description: 'Hareketin türü.' },
          label: { type: 'string', description: `İsteğe bağlı kısa etiket (en çok ${LIMITS.label} karakter).` },
          animate: { type: 'boolean', description: 'Ok çizilerek belirsin mi? Varsayılan: evet.' },
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
        const animate = !(input.animate === false || input.animate === 'false');
        return (
          accept({ kind: 'route', step, beat: beatOf(input), via: stops, type, animate, ...(label ? { label } : {}) }) +
          note(skipped)
        );
      },
    },
    {
      name: 'territory_change',
      description:
        'Bir devletin iki yıl arasında kazandığı ve kaybettiği toprağı gösterir: uygulama iki yılın sınırlarını karşılaştırır ve değişen alanı devletin renginde canlandırır; vuruştan sonra harita to yılının sınırlarını gösterir. polity: POLİTİLER listesindeki kimlik. from, to: seçili aralıkta iki yıl (from < to). Sınır verisi yıllıktır: aynı yıl içindeki değişiklikler ayrılamaz. Dönüş: "tamam" ya da atlanma nedeni.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
          polity: { type: 'string', description: 'Devlet kimliği (POLİTİLER listesinden).' },
          from: { type: 'integer', description: 'Başlangıç yılı (seçili aralığın içinde).' },
          to: { type: 'integer', description: 'Bitiş yılı (seçili aralığın içinde, from’dan büyük).' },
        },
        required: ['polity', 'from', 'to'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return STEP_RANGE_NOTE;
        const polity = resolver.polity(input.polity ?? input.polities, range);
        if (!polity) return 'atlandı: devlet tanınmadı; kimlik POLİTİLER listesinden olmalı';
        const from = resolver.year(input.from, range);
        const to = resolver.year(input.to, range);
        if (from === null || to === null) return `atlandı: iki yıl da ${range.from}–${range.to} aralığında olmalı`;
        if (from >= to) return 'atlandı: from, to’dan küçük olmalı';
        if (!resolver.rowAt(polity, from) && !resolver.rowAt(polity, to))
          return `atlandı: ${resolver.nameOf(polity)} bu iki yılda da sınır verisinde yok`;
        return accept({ kind: 'territory', step, beat: beatOf(input), polity, from, to });
      },
    },
    {
      name: 'mark',
      description: `Haritada bir noktayı kısa bir etiketle işaretler; işaret vuruş sürerken etiketiyle belirgindir, sonra küçük numaralı bir noktaya dönüşür. Nokta, place ile (bir şehir adı, eski adlar da tanınır: "Danzig"; ya da "enlem, boylam") veya lon ve lat ile verilir; place OLAYLAR listesindeki bir olayın yeriyse olay olarak gösterilir. label: işaretin etiketi. Dönüş: "tamam" ya da atlanma nedeni.`,
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          beat: BEAT_PROP,
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
        const beat = beatOf(input);
        let point = null as ReturnType<typeof resolver.point>;
        let name: string | null = null;
        if (input.place !== undefined && input.place !== null && input.place !== '') {
          const ref = resolver.placeRef(input.place, range);
          if (!ref || ref.kind === 'polity' || ref.kind === 'border')
            return 'atlandı: yer tanınmadı (bir şehir adı ya da "enlem, boylam" olmalı)';
          if (ref.kind === 'event')
            return (
              accept({ kind: 'event', step, beat, id: ref.id }) + ' (uygulamanın olay kaydı; olay olarak gösterildi)'
            );
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
          accept({ kind: 'event', step, beat, id: known.id });
          return `tamam: «${known.title}» uygulamanın olay kaydı; olay olarak gösterildi`;
        }
        return accept({ kind: 'mark', step, beat, point, label });
      },
    },
  ];
}
