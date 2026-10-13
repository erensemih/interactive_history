import type { YearRange } from '../domain/types';
import type { TurnPlan } from './drawing';
import type { ToolSpec } from './provider';
import { cleanCaption, cleanLabel, type Resolver } from './resolve';
import { LIMITS, RELATIONS, type Relation } from './types';

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

const STEP_PROP = {
  type: 'integer',
  minimum: 1,
  maximum: LIMITS.steps,
  description: 'Hangi adıma ait olduğu (varsayılan 1). Çizim yalnızca o adım etkinken haritada durur.',
};

/**
 * The page functions the model may call. They are the only way the AI touches the map. Each one checks
 * its references against the data and either records the request in the plan or declines it ("atlandı"),
 * and never throws: a declined drawing is not an error worth a round trip. They only record; what is
 * drawn, and when, is decided later by the step the reader is on (and each step shows only its own).
 *
 * The model decides WHAT the map shows; the app decides HOW it looks. So there are five tools and none of them
 * is about looks or the camera: `step` (a scene of a narration, with its caption and, if it needs one, its
 * year), `show_event` (an event of the data: the app draws it by its kind), `highlight` (which polities stand
 * out), and for what the data does not know, `connect` (a line between two polities) and `mark` (a point).
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

  return [
    {
      name: 'step',
      description:
        'Bir adımı (bir sahneyi) bildirir: numarası, kısa başlığı ve altyazısı (adımın özü, bir iki cümle; okur haritayı izlerken bunu okur). Her cevap adımlıdır: tek bir şeyi anlatıyorsan tek adım (n:1), birkaç sahne gerekiyorsa her biri için bir adım. Her adım için bir kez, ilk turda, o adımın gösterim araçlarıyla (show_event, highlight, connect, mark) birlikte çağır. Her adım haritanın sahibidir: etkin olunca harita yalnızca o adımın gösterimini gösterir. Adımda bir olay gösteriyorsan yıl vermen gerekmez; harita o olayın yılının sınırlarını gösterir. Yılı yalnızca olay göstermeyen ya da başka bir yıl isteyen adımda ver. Tam metni burada yazma; o sonra, nihai yanıtta "## n. Başlık" altında gelir. Dönüş: "tamam".',
      inputSchema: {
        type: 'object',
        properties: {
          n: { ...STEP_PROP, description: "Adım numarası, 1'den başlar." },
          title: { type: 'string', description: 'Adımın kısa başlığı (en çok 6 sözcük).' },
          caption: {
            type: 'string',
            description:
              'Altyazı: adımın özü, bir iki cümle (en çok ~200 karakter). Tam metnin özeti olmalı. Veri setindeki bir olaydan söz ediyorsan onu [olay adı](olay:KİMLİK) biçiminde yaz; okur tıklayıp haritada görür.',
          },
          year: {
            type: 'integer',
            description:
              'İsteğe bağlı: adımın gösterdiği harita sınırlarının yılı (seçili aralığın içinde). Olay gösteren adımda verme.',
          },
        },
        required: ['n', 'title', 'caption'],
      },
      execute(input) {
        // A step without a number (or with a nonsensical one) takes the next free one, so the titles do not overwrite each other.
        const numbered = input.step !== undefined || input.n !== undefined;
        const next = Math.min(LIMITS.steps, Math.max(0, ...plan.numbers()) + 1);
        const n = numbered ? stepOf(input) : next;
        if (n === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
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
        'Uygulamanın OLAYLAR listesindeki bir olayı haritada gösterir. Yalnızca hangi olay olduğunu söylersin; uygulama onu HER SEFERİNDE aynı biçimde çizer: olayın tarafları öne çıkar, olayın kendi işareti konur, savaşlarda iki taraf arasındaki çizgi işaretin üzerinden geçer. Anlattığın şey listede bir olaysa her zaman bunu kullan (çizgi ya da işaret çizme). Kimlik listeden olmalı. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          event: { type: 'string', description: 'OLAYLAR listesindeki olay kimliği (örn. "caldiran-1514").' },
        },
        required: ['event'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const ev = resolver.event(input.event ?? input.id ?? input.title);
        if (!ev)
          return 'atlandı: bu kimlikte bir olay yok; OLAYLAR listesindeki kimliği yaz, listede yoksa mark kullan';
        return accept({ kind: 'event', step, id: ev.id });
      },
    },
    {
      name: 'highlight',
      description:
        'Hangi devletlerin öne çıkacağını söyler: o adımda bu devletler canlı renkle ve dolgun görünür, haritanın geri kalanı solar. Bir olay gösteriyorsan olayın tarafları zaten öne çıkar; bunu yalnızca olayın taraflarından BAŞKA devletleri öne çıkarmak ya da olay göstermeyen bir adımda kullan. Kimlikler yalnızca POLİTİLER listesinden olmalı; listede olmayan atlanır. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          polities: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Devlet kimlikleri.' },
        },
        required: ['polities'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const { ids, skipped } = polities(listOf(input.polities ?? input.polity ?? input.ids).slice(0, 6));
        if (!ids.length) return `atlandı: tanınan devlet yok${note(skipped)}`;
        return accept({ kind: 'highlight', step, polities: ids }) + note(skipped);
      },
    },
    {
      name: 'connect',
      description:
        'İki devlet arasına KENDİ ilişki çizgini çizer: war (savaş), alliance (ittifak), trade (ticaret), treaty (antlaşma). YALNIZCA veri setinde olay olarak bulunmayan bir ilişki için kullan (örneğin bir ticaret yolu ya da bir ittifak); OLAYLAR listesindeki bir savaş için show_event kullan, çizgisini uygulama çizer. İki kimlik de POLİTİLER listesinden olmalı. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          from: { type: 'string', description: 'Birinci devletin kimliği.' },
          to: { type: 'string', description: 'İkinci devletin kimliği.' },
          relation: { type: 'string', enum: [...RELATIONS], description: 'İlişkinin türü.' },
          label: { type: 'string', description: 'İsteğe bağlı kısa etiket, en çok 24 karakter.' },
        },
        required: ['from', 'to', 'relation'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const relation = relationOf(input.relation);
        if (!relation) return 'atlandı: ilişki war, alliance, trade ya da treaty olmalı';
        const { ids, skipped } = polities([input.from, input.to]);
        if (ids.length < 2) return `atlandı: iki ayrı devlet gerekli${note(skipped)}`;
        const label = cleanLabel(input.label, LIMITS.label) ?? undefined;
        return accept({ kind: 'connect', step, from: ids[0]!, to: ids[1]!, relation, ...(label ? { label } : {}) });
      },
    },
    {
      name: 'mark',
      description:
        'Haritada, OLAYLAR listesinde BULUNMAYAN bir noktayı (kent, geçit, liman, savaş alanı) kısa bir etiketle işaretler. Listedeki bir olay için kullanma: show_event kullan. Koordinatı iyi bilmiyorsan çağırma: yanlış bir işaret, işaretsiz bir anlatımdan kötüdür. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          lon: { type: 'number', description: 'Boylam, ondalık derece (doğu +).' },
          lat: { type: 'number', description: 'Enlem, ondalık derece (kuzey +).' },
          label: { type: 'string', description: 'Kısa etiket, en çok 24 karakter.' },
        },
        required: ['lon', 'lat', 'label'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const point = resolver.point(input.lon, input.lat);
        if (!point) return 'atlandı: koordinat haritanın dışında';
        const label = cleanLabel(input.label, LIMITS.label);
        if (!label) return 'atlandı: etiket gerekli';
        // A place the app already has an event for is shown by that event's own marker, never by a second one.
        const known = resolver.eventFor(label, point, range);
        if (known) {
          accept({ kind: 'event', step, id: known.id });
          return `tamam: «${known.title}» uygulamanın olay kaydı; olay olarak gösterildi (böyle olaylar için show_event kullan)`;
        }
        return accept({ kind: 'mark', step, point, label });
      },
    },
  ];
}
