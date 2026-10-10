import type { AppData } from '../data/load';
import { overlaps } from '../domain/time';
import type { HistoricalEvent } from '../domain/types';
import type { AiContext } from './context';
import type { MockCall, MockReply, MockScript } from './mockProvider';
import type { ModelErrorCode } from './provider';
import { normalizeName } from './resolve';

/** One scripted step: a title, the paragraph, and what the map does. Actions get the step number added. */
interface ScriptStep {
  title: string;
  text: string;
  actions: [name: string, input: Record<string, unknown>][];
}

function narration(steps: ScriptStep[]): MockReply {
  const calls: MockCall[] = steps.flatMap((s, i) => [
    { name: 'step', input: { n: i + 1, title: s.title } },
    ...s.actions.map(([name, input]) => ({ name, input: { step: i + 1, ...input } })),
  ]);
  const text = steps.map((s, i) => `## ${i + 1}. ${s.title}\n${s.text}`).join('\n\n');
  return { calls, text };
}

/** The first `n` sentences of a text. */
function sentences(text: string | undefined, n: number): string {
  if (!text) return '';
  return text
    .split(/(?<=[.!?])\s+/)
    .slice(0, n)
    .join(' ');
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The Ottoman half-century the brief's acceptance test uses: six steps from Safavid Iran to the Mediterranean,
 * each with its own map state. Facts are the commonly given ones; where historians disagree the text says so.
 */
const OTTOMAN_NARRATION: ScriptStep[] = [
  {
    title: 'Doğuda yeni bir komşu',
    text: "1501'de genç Şah İsmail Tebriz'de Safevî Devleti'ni kurdu. Safevîler Şii bir düzene dayanıyordu ve Anadolu'daki Türkmen boyları arasında geniş bir yandaş kitlesi vardı. Osmanlı yönetimi için bu, doğu sınırındaki bir komşudan çok içeride bir tehditti: Kızılbaş hareketleri, özellikle 1511'deki Şahkulu ayaklanmasıyla, Anadolu'yu sarstı.",
    actions: [
      ['highlight', { polities: ['ottoman-empire', 'safavid-dynasty'] }],
      ['mark', { lon: 46.29, lat: 38.08, label: 'Tebriz' }],
      ['set_year', { year: 1505 }],
    ],
  },
  {
    title: 'Çaldıran: doğu sınırı çiziliyor',
    text: "Sultan Selim, 1514'te Safevîlere karşı sefere çıktı ve 23 Ağustos'ta Çaldıran'da Şah İsmail'in ordusunu yendi. Osmanlı topçusu ve tüfekli piyadesi belirleyici oldu. Zaferin ardından Doğu Anadolu'nun büyük bölümü birkaç yıl içinde Osmanlı yönetimine geçti; Safevîler ise batıya genişleme umudunu yitirdi.",
    actions: [
      ['connect', { from: 'ottoman-empire', to: 'safavid-dynasty', relation: 'war' }],
      ['mark', { lon: 44.0, lat: 39.14, label: 'Çaldıran' }],
      ['set_year', { year: 1514 }],
      ['focus', { polities: ['ottoman-empire', 'safavid-dynasty'] }],
    ],
  },
  {
    title: 'Memlük topraklarının alınması',
    text: "Selim, ardından Memlük Sultanlığı'na yöneldi. 1516'da Mercidabık'ta Suriye'nin, 22 Ocak 1517'de Ridaniye'de Mısır'ın kapısı açıldı ve Memlük Sultanlığı yıkıldı. Osmanlılar Kudüs, Şam ve Kahire'yi, Mekke ve Medine'nin koruyuculuğunu kazandı; toprakları bir iki yıl içinde iki katından fazla büyüdü.",
    actions: [
      ['clear', {}],
      ['highlight', { polities: ['ottoman-empire', 'mamluk-sultanate'] }],
      ['connect', { from: 'ottoman-empire', to: 'mamluk-sultanate', relation: 'war' }],
      ['mark', { lon: 31.25, lat: 30.07, label: 'Ridaniye' }],
      ['set_year', { year: 1517 }],
    ],
  },
  {
    title: 'Süleyman ve Orta Avrupa',
    text: "I. Süleyman döneminde cephe Avrupa'ya kaydı. 1521'de Belgrad, 1522'de Rodos alındı; 29 Ağustos 1526'da Mohaç'ta Macar ordusu yenildi, Kral II. Lajos savaş alanında öldü. Macaristan'ın büyük bölümü sonraki yıllarda Osmanlı yönetimine girdi; 1529'da Viyana kuşatıldı ama şehir alınamadan geri dönüldü.",
    actions: [
      ['clear', {}],
      ['highlight', { polities: ['ottoman-empire', 'kingdom-of-hungary', 'habsburg-monarchy'] }],
      ['connect', { from: 'ottoman-empire', to: 'kingdom-of-hungary', relation: 'war' }],
      ['mark', { lon: 18.68, lat: 45.99, label: 'Mohaç, 1526' }],
      ['mark', { lon: 16.37, lat: 48.21, label: 'Viyana, 1529' }],
      ['set_year', { year: 1526 }],
      ['focus', { polities: ['ottoman-empire'], points: [{ lon: 16.37, lat: 48.21 }] }],
    ],
  },
  {
    title: 'Fransa ile ittifak',
    text: "Bu yıllarda Osmanlı'nın asıl rakibi Habsburglardı; Fransa Kralı I. François da Habsburg çemberi altındaydı. 1525'te Pavia'da yenilip tutsak düşen François, Süleyman'dan destek istedi. Bu temas, 1536 dolayında somutlaşan Fransız–Osmanlı yakınlaşmasının başlangıcı sayılır; ittifakın ayrıntıları ve kapitülasyonların hukuki niteliği ise tarihçilerce tartışılır.",
    actions: [
      ['clear', {}],
      ['highlight', { polities: ['ottoman-empire', 'kingdom-of-france'] }],
      ['connect', { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'İttifak, 1536' }],
      ['set_year', { year: 1536 }],
      ['focus', { polities: ['ottoman-empire', 'kingdom-of-france'] }],
    ],
  },
  {
    title: 'Akdeniz’de güç dengesi',
    text: "Yakınlaşma Akdeniz'e de yansıdı. 28 Eylül 1538'de Preveze önünde Barbaros Hayreddin Paşa komutasındaki Osmanlı donanması, Papalık, Venedik, İspanya ve Malta Şövalyeleri'nin ortak filosunu yendi. Doğu Akdeniz'de Osmanlı üstünlüğü bundan sonra uzun süre sürdü.",
    actions: [
      ['clear', {}],
      ['highlight', { polities: ['ottoman-empire', 'republic-of-venice', 'papal-states'] }],
      ['connect', { from: 'ottoman-empire', to: 'republic-of-venice', relation: 'war' }],
      ['mark', { lon: 20.72, lat: 38.96, label: 'Preveze, 1538' }],
      ['set_year', { year: 1538 }],
    ],
  },
];

const FRANCE_ANSWER = (year: number | null): MockReply => ({
  calls: [
    { name: 'highlight', input: { polities: ['ottoman-empire', 'kingdom-of-france'] } },
    {
      name: 'connect',
      input: { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'İttifak, 1536' },
    },
    ...(year ? [{ name: 'set_year', input: { year } }] : []),
  ],
  text: "Fransa Kralı I. François, 1525'te Pavia'da Habsburg ordusuna yenilip tutsak düşünce Habsburg çemberini kıracak bir müttefik aradı; Fransa'dan Süleyman'a elçi gönderildi. Bu temas, ortak düşman karşısında doğan Fransız–Osmanlı yakınlaşmasının başlangıcıdır. Anlatılarda ittifakın tarihi çoğunlukla 1536 olarak verilir; ancak o yıl imzalandığı söylenen kapitülasyon metninin hukuki niteliği tarihçiler arasında tartışmalıdır.\n\nUygulamada bu, resmî bir savunma paktından çok kalıcı bir diplomatik ve zaman zaman askerî iş birliğiydi: 1543'te Osmanlı donanması Fransız filosuyla birlikte Nitsa'yı kuşattı ve ertesi kış Toulon'da kaldı. Hristiyan Avrupa'nın Osmanlı karşısında birleşmesini güçleştirdiği için çağdaşlar arasında tepkiyle karşılandı.",
});

const has = (text: string, ...words: string[]) => words.every((w) => normalizeName(text).includes(w));

/** `[hata:rate_limited]` in a question makes the scripted model fail that way, so the error screens can be seen and tested. */
const FAILURE = /\[hata:([a-z_]+)\]/;

/**
 * The scripted answers: the Ottoman narration and the French alliance question for the brief's acceptance
 * test, the open-event question, and generic ones made from the app's own data so that any place and any
 * range gets something real to show. The first script that fits answers.
 */
export function createMockScripts(data: Pick<AppData, 'entities' | 'events'>): MockScript[] {
  const nameOf = (id: string) => data.entities.get(id)?.name ?? id;

  const failing: MockScript = (req) => {
    const m = FAILURE.exec(req.meta.question);
    if (!m) return null;
    const code = m[1] as ModelErrorCode;
    return {
      text: 'Bu yanıtın ilk cümlesi yazıldı, sonra bir hata oluştu. Devamı gelmedi.',
      fail: { code, afterChars: 40 },
    };
  };

  const ottomanNarration: MockScript = (req) => {
    const { mode, context } = req.meta;
    const place = context.places[0];
    if (mode !== 'narration' || !place?.lineage.includes('ottoman-empire')) return null;
    if (!(context.range.from <= 1505 && context.range.to >= 1538)) return null;
    return narration(OTTOMAN_NARRATION);
  };

  const franceQuestion: MockScript = (req) => {
    const { question, context } = req.meta;
    if (req.meta.mode !== 'qa' || !has(question, 'fransa') || !(has(question, 'ittifak') || has(question, 'osmanli')))
      return null;
    const year = context.range.from <= 1536 && 1536 <= context.range.to ? 1536 : null;
    return FRANCE_ANSWER(year);
  };

  const eventQuestion: MockScript = (req) => {
    const ev = req.meta.context.event;
    if (!ev || req.meta.mode !== 'qa') return null;
    const record = data.events.find((e) => e.id === ev.id);
    return eventAnswer(ev, record, req.meta.context, nameOf);
  };

  const placeNarration: MockScript = (req) => {
    const { mode, context } = req.meta;
    if (mode !== 'narration') return null;
    return context.places.length ? narrateSovereigns(context, data, nameOf) : narrateWorld(context, data, nameOf);
  };

  const anyQuestion: MockScript = (req) => {
    const { question, context } = req.meta;
    const place = context.places[0];
    const where = place
      ? `${place.title}, ${context.range.from}–${context.range.to}`
      : `dünya, ${context.range.from}–${context.range.to}`;
    const calls: MockCall[] = [];
    if (place?.holder) calls.push({ name: 'highlight', input: { polities: [place.holder.id] } });
    if (place)
      calls.push({ name: 'mark', input: { lon: place.point.lon, lat: place.point.lat, label: clip(place.title, 24) } });
    return {
      calls,
      text: `Deneme kipindesiniz: şu anda bir model yok, yanıtlar komut dosyasından geliyor. «${clip(question, 120)}» sorusu için bağlam şöyle: ${where}. Gerçek bir model bağlıyken buna gerçek bir yanıt ve haritada ona uygun bir çizim gelir.`,
    };
  };

  return [failing, ottomanNarration, franceQuestion, eventQuestion, placeNarration, anyQuestion];
}

function eventAnswer(
  ev: NonNullable<AiContext['event']>,
  record: HistoricalEvent | undefined,
  context: AiContext,
  nameOf: (id: string) => string,
): MockReply {
  const calls: MockCall[] = [];
  const parties = record?.parties ?? [];
  if (parties.length) calls.push({ name: 'highlight', input: { polities: parties.slice(0, 3) } });
  calls.push({ name: 'mark', input: { lon: ev.point.lon, lat: ev.point.lat, label: clip(ev.placeName, 24) } });
  if (record && record.year >= context.range.from && record.year <= context.range.to) {
    calls.push({ name: 'set_year', input: { year: record.year } });
  }
  const who = parties.length ? ` Olaya karışan taraflar: ${parties.map(nameOf).join(', ')}.` : '';
  return {
    calls,
    text: `**${ev.title}** (${ev.dateLabel}, ${ev.placeName}). ${ev.summary}${who}\n\nBu olayı dönemin geri kalanıyla ilişkilendirmek için çevresindeki gelişmelere de bakmak gerekir; haritada olayın yeri ve ilgili devletler işaretlendi.`,
  };
}

/** A narration made of the place's own record: who held it, one step each, with what the data says of them. */
function narrateSovereigns(
  context: AiContext,
  data: Pick<AppData, 'entities' | 'events'>,
  nameOf: (id: string) => string,
): MockReply {
  const place = context.places[0]!;
  const segments = place.sovereigns.slice(0, 5);
  if (!segments.length) {
    return {
      calls: [{ name: 'mark', input: { lon: place.point.lon, lat: place.point.lat, label: clip(place.title, 24) } }],
      text: `Bu nokta ${context.range.from}–${context.range.to} aralığında sınır verisinde kayıtlı bir devlete ait görünmüyor. Gerçek bir model bağlıyken burada bölgenin bu dönemdeki toplulukları ve komşuları anlatılırdı.`,
    };
  }
  const steps: ScriptStep[] = segments.map((s) => {
    const span = s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`;
    const entity = data.entities.get(s.id);
    const related = data.events
      .filter((e) => e.parties.includes(s.id) && overlaps(e.start, e.end, s.from, s.to + 1))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 1);
    const eventLine = related.length
      ? ` Aynı yıllarda öne çıkan olay: ${related[0]!.title} (${related[0]!.dateLabel}).`
      : '';
    const text =
      `${span} arasında bu nokta ${nameOf(s.id)} sınırları içindeydi. ${sentences(entity?.summary, 2)}${eventLine}`.trim();
    const actions: ScriptStep['actions'] = [
      ['clear', {}],
      ['highlight', { polities: [s.id] }],
      ['set_year', { year: Math.round((s.from + s.to) / 2) }],
    ];
    if (related.length)
      actions.push([
        'mark',
        { lon: related[0]!.location.lon, lat: related[0]!.location.lat, label: clip(related[0]!.location.name, 24) },
      ]);
    return { title: `${nameOf(s.id)} (${span})`, text, actions };
  });
  return narration(steps);
}

/** With no place chosen: the range's most important events, one step each, in date order. */
function narrateWorld(
  context: AiContext,
  data: Pick<AppData, 'entities' | 'events'>,
  nameOf: (id: string) => string,
): MockReply {
  const picked = data.events
    .filter((e) => overlaps(e.start, e.end, context.range.from, context.range.to + 1))
    .sort((a, b) => b.importance - a.importance || a.start - b.start)
    .slice(0, 5)
    .sort((a, b) => a.start - b.start);
  if (!picked.length) {
    return {
      text: `${context.range.from}–${context.range.to} aralığı için kayıtlı bir olay yok; aralığı genişletmeyi deneyin.`,
    };
  }
  return narration(
    picked.map((e) => ({
      title: clip(e.title, 48),
      text: `${e.dateLabel}, ${e.location.name}. ${e.summary}${e.parties.length ? ` Taraflar: ${e.parties.map(nameOf).join(', ')}.` : ''}`,
      actions: [
        ['clear', {}],
        ['highlight', { polities: e.parties.slice(0, 2) }],
        ['mark', { lon: e.location.lon, lat: e.location.lat, label: clip(e.location.name, 24) }],
        ['set_year', { year: e.year }],
      ],
    })),
  );
}
