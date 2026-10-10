import type { YearRange } from '../domain/types';
import type { TurnPlan } from './drawing';
import type { ToolSpec } from './provider';
import { cleanLabel, type Resolver } from './resolve';
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
  description: 'Hangi adıma ait olduğu (varsayılan 1).',
};

/**
 * The page functions the model may call. They are the only way the AI touches the map. Each one checks
 * its references against the data and either records the request in the plan or declines it ("atlandı"),
 * and never throws: a declined drawing is not an error worth a round trip. They only record; what is
 * drawn, and when, is decided later by the step the reader is on.
 *
 * Listed in the order they should be dropped from the end if a view allows fewer tools than seven.
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
        'ANLATIM için bir adımı bildirir: numarası ve kısa başlığı. Her adım için bir kez, ilk turda diğer araçlarla birlikte çağır. Metni burada yazma; metin sonra, nihai yanıtta gelir. Dönüş: "tamam".',
      inputSchema: {
        type: 'object',
        properties: {
          n: { ...STEP_PROP, description: "Adım numarası, 1'den başlar." },
          title: { type: 'string', description: 'Adımın kısa başlığı (en çok 6 sözcük).' },
        },
        required: ['n', 'title'],
      },
      execute(input) {
        // A step without a number (or with a nonsensical one) takes the next free one, so the titles do not overwrite each other.
        const numbered = input.step !== undefined || input.n !== undefined;
        const next = Math.min(LIMITS.steps, Math.max(0, ...plan.numbers()) + 1);
        const n = numbered ? stepOf(input) : next;
        if (n === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        plan.declare(n, cleanLabel(input.title, LIMITS.title));
        env.onChange?.();
        return OK;
      },
    },
    {
      name: 'highlight',
      description:
        'Haritada devletleri vurgular (taramalı). Kimlikler yalnızca POLİTİLER listesinden olmalı; listede olmayan atlanır. Harita oynamaz. Dönüş: "tamam" ya da neden atlandığı.',
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
        'İki devlet arasına ilişki çizgisi çizer: war (savaş), alliance (ittifak), trade (ticaret), treaty (antlaşma). İki kimlik de POLİTİLER listesinden olmalı. Harita oynamaz. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          from: { type: 'string', description: 'Birinci devletin kimliği.' },
          to: { type: 'string', description: 'İkinci devletin kimliği.' },
          relation: { type: 'string', enum: [...RELATIONS], description: 'İlişkinin türü.' },
          label: { type: 'string', description: 'İsteğe bağlı kısa etiket, en çok 24 karakter ("Mohaç, 1526").' },
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
        'Haritada bir noktayı kısa bir etiketle işaretler (kent, savaş alanı, liman). Koordinatı iyi bilmiyorsan çağırma. Harita oynamaz. Dönüş: "tamam" ya da neden atlandığı.',
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
        return accept({ kind: 'mark', step, point, label });
      },
    },
    {
      name: 'set_year',
      description:
        'Haritanın sınır yılını ayarlar. Yıl seçili aralığın içinde olmalı; dışındaysa atlanır. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: { step: STEP_PROP, year: { type: 'integer', description: 'Yıl.' } },
        required: ['year'],
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const year = resolver.year(input.year, range);
        if (year === null) return `atlandı: yıl ${range.from}–${range.to} aralığında olmalı`;
        return accept({ kind: 'set_year', step, year });
      },
    },
    {
      name: 'focus',
      description:
        'Kamerayı, verilen devletler ve noktalar görünür olsun diye, yumuşakça ve olabildiğince az oynatır. Yalnızca anlattığın yer şu an ekranda olmayacaksa kullan. Dönüş: "tamam" ya da neden atlandığı.',
      inputSchema: {
        type: 'object',
        properties: {
          step: STEP_PROP,
          polities: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Görünmesi gereken devlet kimlikleri.',
          },
          points: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: { lon: { type: 'number' }, lat: { type: 'number' } },
              required: ['lon', 'lat'],
            },
            description: 'Görünmesi gereken noktalar.',
          },
        },
      },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        const { ids, skipped } = polities(listOf(input.polities).slice(0, 4));
        const points = listOf(input.points)
          .slice(0, 4)
          .map((p) =>
            p && typeof p === 'object'
              ? resolver.point((p as Record<string, unknown>).lon, (p as Record<string, unknown>).lat)
              : null,
          )
          .filter((p): p is NonNullable<typeof p> => !!p);
        if (!ids.length && !points.length) return `atlandı: görünecek bir şey tanınmadı${note(skipped)}`;
        return accept({ kind: 'focus', step, polities: ids, points }) + note(skipped);
      },
    },
    {
      name: 'clear',
      description:
        'Bu adıma kadar çizilen her şeyi siler ve sınır yılını okura geri verir. Yeni bir konuya geçerken kullan.',
      inputSchema: { type: 'object', properties: { step: STEP_PROP } },
      execute(input) {
        const step = stepOf(input);
        if (step === null) return 'atlandı: adım numarası 1 ile 12 arasında olmalı';
        return accept({ kind: 'clear', step });
      },
    },
  ];
}
