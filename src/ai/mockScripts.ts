import type { AppData } from '../data/load';
import { overlaps } from '../domain/time';
import type { HistoricalEvent } from '../domain/types';
import type { AiContext } from './context';
import type { MockCall, MockReply, MockScript } from './mockProvider';
import type { ModelErrorCode } from './provider';
import { captionFromText } from './narration';
import { normalizeName } from './resolve';

/** One scripted step: a title, the subtitle, the full text, and what the map does. Actions get the step number added. */
interface ScriptStep {
  title: string;
  /** The subtitle (Watch): a summary of the text. Made from the text when left out. */
  caption?: string;
  text: string;
  /** The border year, for a step that shows no event of the data (an event's own year is used otherwise). */
  year?: number;
  actions: [name: string, input: Record<string, unknown>][];
}

function narration(steps: ScriptStep[]): MockReply {
  const calls: MockCall[] = steps.flatMap((s, i) => [
    {
      name: 'step',
      input: {
        n: i + 1,
        title: s.title,
        caption: s.caption ?? captionFromText(s.text),
        ...(s.year !== undefined ? { year: s.year } : {}),
      },
    },
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
 * each with a map of its own. The model says WHAT is shown and the app draws it: an event the data has is only
 * named (`show_event`: its parties light up and a war's line runs through its marker), `highlight` adds the
 * polities that stand out besides, and `connect` and `mark` are for what the data does not know (the 1536 alliance,
 * Mercidabık). Texts mention the data's events as `[text](olay:id)`, which the page turns into links. Facts are the
 * commonly given ones; where historians disagree the text says so.
 */
const OTTOMAN_NARRATION: ScriptStep[] = [
  {
    title: 'Doğuda yeni bir komşu',
    caption:
      "1501'de [Safevî Devleti kuruldu](olay:safevi-1501); Osmanlı'nın doğusunda, Anadolu'daki Türkmen boylarına da seslenen yeni bir güç doğdu.",
    text: "1501'de genç Şah İsmail Tebriz'de [Safevî Devleti'ni kurdu](olay:safevi-1501). Safevîler Şii bir düzene dayanıyordu ve Anadolu'daki Türkmen boyları arasında geniş bir yandaş kitlesi vardı. Osmanlı yönetimi için bu, doğu sınırındaki bir komşudan çok içeride bir tehditti: Kızılbaş hareketleri, özellikle 1511'deki Şahkulu ayaklanmasıyla, Anadolu'yu sarstı.",
    year: 1505,
    actions: [
      ['show_event', { event: 'safevi-1501' }],
      ['highlight', { polities: ['ottoman-empire'] }],
    ],
  },
  {
    title: 'Çaldıran: doğu sınırı çiziliyor',
    caption:
      "1514'te [Çaldıran Muharebesi](olay:caldiran-1514)'nde Osmanlı topçusu ve tüfekli piyadesi Safevî ordusunu yendi; Doğu Anadolu Osmanlı yönetimine geçti.",
    text: "Sultan Selim, 1514'te Safevîlere karşı sefere çıktı ve 23 Ağustos'ta [Çaldıran Muharebesi](olay:caldiran-1514)'nde Şah İsmail'in ordusunu yendi. Osmanlı topçusu ve tüfekli piyadesi belirleyici oldu. Zaferin ardından Doğu Anadolu'nun büyük bölümü birkaç yıl içinde Osmanlı yönetimine geçti; Safevîler ise batıya genişleme umudunu yitirdi.",
    actions: [['show_event', { event: 'caldiran-1514' }]],
  },
  {
    title: 'Memlük topraklarının alınması',
    caption:
      "1516–1517'de Selim Memlükleri yendi: Suriye ve Mısır alındı, [Ridaniye](olay:ridaniye-1517)'den sonra Osmanlı Mekke ve Medine'nin koruyucusu oldu.",
    text: "Selim, ardından Memlük Sultanlığı'na yöneldi. 1516'da Mercidabık'ta Suriye'nin, 22 Ocak 1517'de [Ridaniye Muharebesi](olay:ridaniye-1517)'nde Mısır'ın kapısı açıldı ve Memlük Sultanlığı yıkıldı. Osmanlılar Kudüs, Şam ve Kahire'yi, Mekke ve Medine'nin koruyuculuğunu kazandı; toprakları bir iki yıl içinde iki katından fazla büyüdü.",
    actions: [
      ['mark', { lon: 37.1, lat: 36.68, label: 'Mercidabık' }],
      ['show_event', { event: 'ridaniye-1517' }],
    ],
  },
  {
    title: 'Süleyman ve Orta Avrupa',
    caption:
      "I. Süleyman döneminde cephe Avrupa'ya kaydı: 1526'da [Mohaç](olay:mohac-1526)'ta Macar ordusu yenildi, 1529'da [Viyana](olay:viyana-1529) kuşatıldı ama alınamadı.",
    text: "I. Süleyman döneminde cephe Avrupa'ya kaydı. 1521'de Belgrad, 1522'de Rodos alındı; 29 Ağustos 1526'da [Mohaç Muharebesi](olay:mohac-1526)'nde Macar ordusu yenildi, Kral II. Lajos savaş alanında öldü. Macaristan'ın büyük bölümü sonraki yıllarda Osmanlı yönetimine girdi; 1529'da [Viyana kuşatıldı](olay:viyana-1529) ama şehir alınamadan geri dönüldü.",
    actions: [
      ['show_event', { event: 'mohac-1526' }],
      ['show_event', { event: 'viyana-1529' }],
    ],
  },
  {
    title: 'Fransa ile ittifak',
    caption:
      "Habsburg çemberindeki Fransa Osmanlı'ya yaklaştı; 1536 dolayında somutlaşan bu ittifakın niteliği tartışmalıdır.",
    text: "Bu yıllarda Osmanlı'nın asıl rakibi Habsburglardı; Fransa Kralı I. François da Habsburg çemberi altındaydı. 1525'te Pavia'da yenilip tutsak düşen François, Süleyman'dan destek istedi. Bu temas, 1536 dolayında somutlaşan Fransız–Osmanlı yakınlaşmasının başlangıcı sayılır; ittifakın ayrıntıları ve kapitülasyonların hukuki niteliği ise tarihçilerce tartışılır.",
    year: 1536,
    actions: [
      ['highlight', { polities: ['ottoman-empire', 'kingdom-of-france'] }],
      ['connect', { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'İttifak, 1536' }],
    ],
  },
  {
    title: 'Akdeniz’de güç dengesi',
    caption:
      "1538'de [Preveze](olay:preveze-1538)'de Osmanlı donanması Haçlı ittifakının filosunu yendi; Doğu Akdeniz'de üstünlük uzun süre Osmanlı'da kaldı.",
    text: "Yakınlaşma Akdeniz'e de yansıdı. 28 Eylül 1538'de [Preveze Deniz Muharebesi](olay:preveze-1538)'nde Barbaros Hayreddin Paşa komutasındaki Osmanlı donanması, Papalık, Venedik, İspanya ve Malta Şövalyeleri'nin ortak filosunu yendi. Doğu Akdeniz'de Osmanlı üstünlüğü bundan sonra uzun süre sürdü.",
    actions: [['show_event', { event: 'preveze-1538' }]],
  },
];

const FRANCE_ANSWER = (): MockReply => ({
  calls: [
    { name: 'highlight', input: { polities: ['ottoman-empire', 'kingdom-of-france'] } },
    {
      name: 'connect',
      input: { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'İttifak, 1536' },
    },
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
    const { question } = req.meta;
    if (req.meta.mode !== 'qa' || !has(question, 'fransa') || !(has(question, 'ittifak') || has(question, 'osmanli')))
      return null;
    return FRANCE_ANSWER();
  };

  const eventQuestion: MockScript = (req) => {
    const ev = req.meta.context.event;
    if (!ev || req.meta.mode !== 'qa') return null;
    const record = data.events.find((e) => e.id === ev.id);
    return eventAnswer(ev, record, nameOf);
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
  nameOf: (id: string) => string,
): MockReply {
  // only which event: the app lights its parties, draws its line if it is a war, and shows the borders of its year
  const calls: MockCall[] = [{ name: 'show_event', input: { event: ev.id } }];
  const parties = record?.parties ?? [];
  const who = parties.length ? ` Olaya karışan taraflar: ${parties.map(nameOf).join(', ')}.` : '';
  return {
    calls,
    text: `**${ev.title}** (${ev.dateLabel}, ${ev.placeName}). ${ev.summary}${who}\n\nBu olayı dönemin geri kalanıyla ilişkilendirmek için çevresindeki gelişmelere de bakmak gerekir; haritada olay kendi işaretiyle, ilgili devletler de öne çıkarılarak gösterildi.`,
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
      ? ` Aynı yıllarda öne çıkan olay: [${related[0]!.title}](olay:${related[0]!.id}) (${related[0]!.dateLabel}).`
      : '';
    const text =
      `${span} arasında bu nokta ${nameOf(s.id)} sınırları içindeydi. ${sentences(entity?.summary, 2)}${eventLine}`.trim();
    const actions: ScriptStep['actions'] = [['highlight', { polities: [s.id] }]];
    if (related.length) actions.push(['show_event', { event: related[0]!.id }]);
    return { title: `${nameOf(s.id)} (${span})`, text, year: Math.round((s.from + s.to) / 2), actions };
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
      text: `[${e.title}](olay:${e.id}): ${e.dateLabel}, ${e.location.name}. ${e.summary}${e.parties.length ? ` Taraflar: ${e.parties.map(nameOf).join(', ')}.` : ''}`,
      actions: [['show_event', { event: e.id }]],
    })),
  );
}
