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
 * The scripted answers are a stand-in for the model that does what the instructions ask of it (every answer is a
 * narration of one or more steps, each with a caption and a full text), over the 1800–2000 data. The model says WHAT
 * is shown and the app draws it: an event the data has is only named (`show_event`: its parties light up and a war's
 * line runs through its marker), `highlight` adds the polities that stand out besides, `sides` groups polities into
 * the sides of a conflict (the app paints each as one bloc), `route` is a directed path through places (an advance, a
 * retreat), and `connect` and `mark` are for what the data does not know (the 1939 Pact of Steel, a place with no
 * event). Lines and routes run between places (cities by name, a polity is its capital). Texts mention the data's events as
 * `[text](olay:id)`, which the page turns into links. Facts are the commonly given ones; where historians disagree
 * the text says so.
 */

/** "Germany at war": eight steps from the invasion of Poland to the surrender, each with a map of its own. */
const GERMANY_AT_WAR: ScriptStep[] = [
  {
    title: 'Polonya’ya saldırı',
    caption:
      "1 Eylül 1939'da Almanya [Polonya'ya saldırdı](olay:polonya-isgali-1939); iki gün sonra Britanya ve Fransa savaş ilan etti.",
    text: "Savaş, 1 Eylül 1939 sabahı Alman ordusunun [Polonya'ya saldırmasıyla](olay:polonya-isgali-1939) başladı. Bir hafta önce imzalanan [Molotov–Ribbentrop Paktı](olay:molotov-ribbentrop-1939) Almanya'nın doğuda Sovyetler'le karşılaşma riskini ortadan kaldırmıştı; 17 Eylül'de Kızıl Ordu da Polonya'nın doğusuna girdi. Britanya ve Fransa 3 Eylül'de [savaş ilan etti](olay:savas-ilani-1939) ama Polonya'ya fiilen yardım edemedi.",
    actions: [
      ['show_event', { event: 'polonya-isgali-1939' }],
      ['highlight', { polities: ['nazi-germany'] }],
    ],
  },
  {
    title: 'Batıda yıldırım savaşı',
    caption:
      "Mayıs 1940'ta Almanya Ardenler üzerinden saldırıp [Fransa Muharebesi](olay:fransa-muharebesi-1940)'ni altı haftada kazandı; Fransa 22 Haziran'da ateşkes imzaladı.",
    text: "10 Mayıs 1940'ta başlayan [Fransa Muharebesi](olay:fransa-muharebesi-1940)'nde Alman zırhlı birlikleri Ardenler'i aşıp Sedan'da Fransız cephesini yardı ve Kanal kıyısına ulaştı. Fransa 22 Haziran'da Compiègne'de [ateşkes imzaladı](olay:compiegne-ateskesi-1940); ülke işgal altındaki kuzey ve batı ile Vichy'den yönetilen güney olarak ikiye bölündü. Batı Avrupa'nın büyük bölümü artık Alman denetimindeydi.",
    actions: [
      ['show_event', { event: 'fransa-muharebesi-1940' }],
      ['show_event', { event: 'compiegne-ateskesi-1940' }],
    ],
  },
  {
    title: 'Britanya direniyor',
    caption:
      "Temmuz–Ekim 1940'taki [Britanya Muharebesi](olay:britanya-muharebesi-1940)'nde Luftwaffe havada üstünlük kuramadı; işgal planı ertelendi.",
    text: "Almanya, Britanya'yı barışa zorlamak ve olası bir çıkarma için havada üstünlük kurmak istedi. Temmuz–Ekim 1940'taki [Britanya Muharebesi](olay:britanya-muharebesi-1940)'nde Kraliyet Hava Kuvvetleri radarın ve savaş uçaklarının desteğiyle direndi; Hitler işgal planını erteledi. Savaşın ilk büyük Alman başarısızlığıdır.",
    actions: [['show_event', { event: 'britanya-muharebesi-1940' }]],
  },
  {
    title: 'Doğuya saldırı',
    caption:
      "22 Haziran 1941'de [Barbarossa Harekâtı](olay:barbarossa-1941) ile Almanya Sovyetler Birliği'ne saldırdı ve savaşın en büyük cephesini açtı.",
    text: "22 Haziran 1941'de Almanya ve müttefikleri, Molotov–Ribbentrop Paktı'nı bozarak [Barbarossa Harekâtı](olay:barbarossa-1941) ile Sovyetler Birliği'ne üç milyondan fazla askerle saldırdı. İlk aylarda Alman ordusu çok hızlı ilerledi; Eylül'de [Leningrad kuşatıldı](olay:leningrad-kusatmasi-1941). Aralık'ta Moskova önünde durdurulduğunda ise kısa bir savaş umudu da bitmişti.",
    actions: [
      ['show_event', { event: 'barbarossa-1941' }],
      ['show_event', { event: 'leningrad-kusatmasi-1941' }],
      [
        'sides',
        {
          sides: [
            {
              name: 'Mihver ve ortakları',
              polities: ['nazi-germany', 'romania', 'republic-of-finland', 'hungary', 'kingdom-of-italy'],
            },
            { name: 'Sovyetler Birliği', polities: ['union-of-soviet-socialist-republics'] },
          ],
        },
      ],
      [
        'route',
        {
          via: ['Brest-Litovsk', 'Minsk', 'Smolensk', 'Moskova'],
          type: 'advance',
          label: 'Alman ilerleyişi',
          animate: true,
        },
      ],
    ],
  },
  {
    title: 'Berlin’de verilen karar',
    caption:
      "20 Ocak 1942'de Berlin-Wannsee'de toplanan yetkililer, Avrupa Yahudilerinin sistemli biçimde yok edilmesini görüştü: [Wannsee Konferansı](olay:wannsee-1942).",
    text: "Savaşın bir yüzü de cephelerin gerisinde yaşandı. 20 Ocak 1942'de Berlin'in Wannsee semtinde toplanan üst düzey Nazi yetkilileri ve devlet memurları, Avrupa Yahudilerinin “nihai çözüm” adıyla sistemli biçimde yok edilmesinin örgütlenmesini görüştü: [Wannsee Konferansı](olay:wannsee-1942). Holokost'ta altı milyon kadar Yahudi öldürüldü.",
    actions: [
      ['show_event', { event: 'wannsee-1942' }],
      ['highlight', { polities: ['nazi-germany'] }],
    ],
  },
  {
    title: 'Dönüm noktası: Stalingrad',
    caption:
      "Şubat 1943'te [Stalingrad](olay:stalingrad-1942)'da Alman 6. Ordusu teslim oldu; aynı aylarda [El Alamein](olay:el-alamein-1942)'de Mihver Kuzey Afrika'da da durduruldu.",
    text: "1942 sonbaharına gelindiğinde Alman taarruzu iki yerde tıkandı. Volga kıyısındaki [Stalingrad](olay:stalingrad-1942)'da Kızıl Ordu'nun Kasım'daki karşı taarruzu 6. Ordu'yu kuşattı; Şubat 1943'te teslim olan ordunun kaybı Almanya için ağır bir darbeydi. Aynı haftalarda [İkinci El Alamein Muharebesi](olay:el-alamein-1942)'nde Britanya ordusu Rommel'in kuvvetlerini Mısır sınırında yendi. Buradan sonra inisiyatif Müttefiklerdeydi.",
    actions: [
      ['show_event', { event: 'stalingrad-1942' }],
      ['show_event', { event: 'el-alamein-1942' }],
    ],
  },
  {
    title: 'İkinci cephe',
    caption:
      "6 Haziran 1944'te Müttefikler [Normandiya'ya çıktı](olay:normandiya-1944); iki hafta sonra Sovyetler [Bagration Harekâtı](olay:bagration-1944) ile doğuda atağa geçti.",
    text: "6 Haziran 1944'te Britanya, ABD ve Kanada kuvvetleri [Normandiya'ya çıkarak](olay:normandiya-1944) Batı Avrupa'da ikinci cepheyi açtı. 22 Haziran'da Kızıl Ordu [Bagration Harekâtı](olay:bagration-1944) ile Belarus'ta Alman Orta Ordular Grubu'nu yok etti. Almanya iki yönden de geri çekilmeye başladı; Aralık'taki [Ardenler Taarruzu](olay:ardenler-1944) son büyük karşı atağı oldu.",
    actions: [
      ['show_event', { event: 'normandiya-1944' }],
      ['show_event', { event: 'bagration-1944' }],
      ['route', { via: ['Minsk', 'Varşova', 'Berlin'], type: 'retreat', label: 'Alman geri çekilişi' }],
    ],
  },
  {
    title: 'Berlin ve teslim',
    caption:
      "Nisan–Mayıs 1945'te [Berlin Muharebesi](olay:berlin-muharebesi-1945) sürerken Hitler intihar etti; Almanya 8 Mayıs'ta [koşulsuz teslim oldu](olay:almanya-teslimi-1945).",
    text: "16 Nisan 1945'te Kızıl Ordu Oder'den Berlin'e saldırdı; [Berlin Muharebesi](olay:berlin-muharebesi-1945) iki hafta sürdü ve Hitler 30 Nisan'da intihar etti. Almanya 7 Mayıs'ta Reims'te, 8 Mayıs'ta Berlin-Karlshorst'ta [koşulsuz teslim oldu](olay:almanya-teslimi-1945). Ülke dört işgal bölgesine ayrıldı; Nazi Almanyası'nın sonu, aynı zamanda savaşın Avrupa'daki sonuydu.",
    actions: [
      ['show_event', { event: 'berlin-muharebesi-1945' }],
      ['show_event', { event: 'almanya-teslimi-1945' }],
    ],
  },
];

/** One scene: the answer to a plain question is a narration of a single step. */
function single(step: ScriptStep): MockReply {
  return narration([step]);
}

const STALINGRAD_ANSWER: ScriptStep = {
  title: 'Stalingrad',
  caption:
    "[Stalingrad Muharebesi](olay:stalingrad-1942)'nde Alman 6. Ordusu kuşatılıp teslim oldu; doğu cephesinde inisiyatif Sovyetlere geçti.",
  text: "Ağustos 1942'de Volga kıyısındaki Stalingrad'a ulaşan Alman 6. Ordusu, kent içinde sokak sokak süren ağır çatışmalara girdi. Kızıl Ordu 19 Kasım'da kentin kuzeyinden ve güneyinden karşı taarruza geçip ordunun çevresini kapattı; Şubat 1943'te [Stalingrad Muharebesi](olay:stalingrad-1942) Alman teslimiyle sona erdi.\n\nYenilginin önemi sayılarda değil, sonuçtaydı: Almanya bir daha doğuda genel bir taarruz başlatamadı, müttefikleri (Romanya, Macaristan, İtalya) ordularının büyük bölümünü yitirdi. Tarihçiler ölü sayısını iki taraf için yüz binler düzeyinde, toplam kayıpları ise bir milyona yakın veriyor; kesin rakamlar tartışmalıdır.",
  actions: [
    ['show_event', { event: 'stalingrad-1942' }],
    ['highlight', { polities: ['union-of-soviet-socialist-republics', 'nazi-germany'] }],
  ],
};

/** A relation the data has no event for: a line of the model's own (the 1939 Pact of Steel). */
const AXIS_ANSWER: ScriptStep = {
  title: 'Almanya ve İtalya',
  caption:
    "Almanya ile İtalya, 22 Mayıs 1939'da Çelik Pakt ile askerî ittifak kurdu; [Üçlü Pakt](olay:uclu-pakt-1940) 1940'ta Japonya'yı da getirdi.",
  text: "Hitler ve Mussolini'nin yakınlaşması 1936'daki “Roma–Berlin Mihveri” ile başladı. 22 Mayıs 1939'da imzalanan Çelik Pakt, iki devleti karşılıklı askerî yardıma bağlayan açık bir ittifaktı. Savaş çıktığında İtalya hazır olmadığı için önce tarafsız kaldı, ancak Haziran 1940'ta Fransa çökerken savaşa girdi.\n\nSistem 27 Eylül 1940'ta [Üçlü Pakt](olay:uclu-pakt-1940) ile Japonya'yı da içine aldı; Macaristan, Romanya, Slovakya ve Bulgaristan sonradan katıldı. İttifakın nitelikleri tartışılır: üyeler ortak bir komuta ya da ortak bir strateji kurmadı, her biri kendi savaşını yürüttü.",
  year: 1939,
  actions: [
    ['highlight', { polities: ['nazi-germany', 'kingdom-of-italy'] }],
    ['connect', { from: 'Berlin', to: 'Roma', relation: 'alliance', label: 'Çelik Pakt, 1939' }],
    ['show_event', { event: 'uclu-pakt-1940' }],
  ],
};

/** Who stood with whom: the sides of the war, painted as two blocs. */
const SIDES_ANSWER: ScriptStep = {
  title: 'Mihver ve Müttefikler',
  caption:
    "İkinci Dünya Savaşı'nda bir yanda Mihver (Almanya, İtalya, Japonya), öbür yanda Müttefikler (Britanya, Sovyetler Birliği, ABD) yer aldı; taraflar savaş boyunca değişti.",
  text: "İkinci Dünya Savaşı'nın iki ana kutbu, 1940 tarihli Üçlü Pakt'la birleşen Almanya, İtalya ve Japonya'nın oluşturduğu Mihver ile Britanya, Sovyetler Birliği ve ABD'nin başını çektiği Müttefiklerdi. Haritada 1942 yılının görünümü bu iki bloğu birer renkle gösteriyor.\n\nGörüntü yine de basitleştirilmiş bir ikilik. Sovyetler Birliği 1939–1941 arasında Almanya ile bir saldırmazlık paktı içindeydi ve savaşa 1941'de, saldırıya uğrayınca girdi; ABD savaşa 1941 sonunda katıldı; Fransa'nın büyük bölümü 1940'tan sonra işgal altındaydı, Tayland Japonya'nın yanında yer aldı, İsveç ve İsviçre gibi bazı ülkeler tarafsız kaldı. Hangi devletin hangi tarafta sayılacağı yıldan yıla değiştiği için buradaki gruplama 1942 içindir.",
  year: 1942,
  actions: [
    [
      'sides',
      {
        sides: [
          { name: 'Mihver', polities: ['nazi-germany', 'kingdom-of-italy', 'empire-of-japan'] },
          {
            name: 'Müttefikler',
            polities: ['kingdom-of-great-britain', 'union-of-soviet-socialist-republics', 'united-states-of-america'],
          },
        ],
      },
    ],
  ],
};

/** The plain-text answer a model might give that ignores the format altogether (the page then makes the caption itself). */
const PLAIN_TEXT_ANSWER =
  "Hava gücü, İkinci Dünya Savaşı'nın sonucunu belirleyen etkenlerden biriydi. Savaşın başında Almanya'nın yıldırım savaşı, yoğun hava desteğiyle ilerleyen zırhlı birliklere dayanıyordu; Britanya Muharebesi'nde bu üstünlüğü kuramaması ise Almanya'nın ilk büyük başarısızlığı oldu.\n\nSavaşın ilerleyen yıllarında Müttefikler stratejik bombardıman kampanyalarıyla Alman sanayisini ve şehirlerini hedef aldı; Dresden ve Hamburg'un bombalanması bu kampanyanın en çok tartışılan örnekleridir. Pasifik'te ise uçak gemileri donanmaların asıl vurucu gücü hâline geldi; Midway gibi muharebelerde gemiler birbirini hiç görmeden, yalnızca uçaklarla çarpıştı.\n\nSonunda Hiroşima ve Nagasaki'ye atılan atom bombaları, hava gücünün savaşı bitirmedeki rolünü tartışmasız en yıkıcı biçimiyle gösterdi; bu bombaların gerekli olup olmadığı bugün de tarihçiler arasında tartışılır.";

const has = (text: string, ...words: string[]) => words.every((w) => normalizeName(text).includes(w));

/** `[hata:rate_limited]` in a question makes the scripted model fail that way, so the error screens can be seen and tested. */
const FAILURE = /\[hata:([a-z_]+)\]/;

/**
 * The scripted answers: the German narration (a place of Nazi Germany, 1939–1945) and two plain questions for the
 * acceptance test (one an event and one a relation the data has no event for), a reply that ignores the format and is
 * plain text, the open-event question, and generic ones made from the app's own data so that any place and any range
 * gets something real to show. The first script that fits answers.
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

  const plainText: MockScript = (req) => {
    if (req.meta.mode !== 'qa' || !has(req.meta.question, 'duz metin')) return null;
    return { text: PLAIN_TEXT_ANSWER };
  };

  const germanNarration: MockScript = (req) => {
    const { mode, context } = req.meta;
    const place = context.places[0];
    if (mode !== 'narration' || !place?.lineage.includes('nazi-germany')) return null;
    if (!(context.range.from <= 1941 && context.range.to >= 1944)) return null;
    return narration(GERMANY_AT_WAR);
  };

  const stalingradQuestion: MockScript = (req) => {
    if (req.meta.mode !== 'qa' || !has(req.meta.question, 'stalingrad')) return null;
    return single(STALINGRAD_ANSWER);
  };

  const sidesQuestion: MockScript = (req) => {
    if (req.meta.mode !== 'qa' || !has(req.meta.question, 'mihver', 'muttefik')) return null;
    return single(SIDES_ANSWER);
  };

  const axisQuestion: MockScript = (req) => {
    const { question } = req.meta;
    if (req.meta.mode !== 'qa' || !has(question, 'italya') || !(has(question, 'ittifak') || has(question, 'mihver')))
      return null;
    return single(AXIS_ANSWER);
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
    const actions: ScriptStep['actions'] = [];
    if (place?.holder) actions.push(['highlight', { polities: [place.holder.id] }]);
    if (place) actions.push(['mark', { lon: place.point.lon, lat: place.point.lat, label: clip(place.title, 24) }]);
    return single({
      title: 'Deneme kipi',
      caption: 'Deneme kipindesiniz: şu anda bir model yok, yanıtlar komut dosyasından geliyor.',
      text: `Deneme kipindesiniz: şu anda bir model yok, yanıtlar komut dosyasından geliyor. «${clip(question, 120)}» sorusu için bağlam şöyle: ${where}. Gerçek bir model bağlıyken buna gerçek bir yanıt ve haritada ona uygun bir çizim gelir.`,
      actions,
    });
  };

  return [
    failing,
    plainText,
    germanNarration,
    stalingradQuestion,
    sidesQuestion,
    axisQuestion,
    eventQuestion,
    placeNarration,
    anyQuestion,
  ];
}

function eventAnswer(
  ev: NonNullable<AiContext['event']>,
  record: HistoricalEvent | undefined,
  nameOf: (id: string) => string,
): MockReply {
  // only which event: the app lights its parties, draws its line if it is a war, and shows the borders of its year
  const parties = record?.parties ?? [];
  const who = parties.length ? ` Olaya karışan taraflar: ${parties.map(nameOf).join(', ')}.` : '';
  return single({
    title: clip(ev.title, 48),
    caption: sentences(ev.summary, 2) || ev.title,
    text: `**${ev.title}** (${ev.dateLabel}, ${ev.placeName}). ${ev.summary}${who}\n\nBu olayı dönemin geri kalanıyla ilişkilendirmek için çevresindeki gelişmelere de bakmak gerekir; haritada olay kendi işaretiyle, ilgili devletler de öne çıkarılarak gösterildi.`,
    actions: [['show_event', { event: ev.id }]],
  });
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
    return single({
      title: clip(place.title, 48),
      caption: `Bu nokta ${context.range.from}–${context.range.to} aralığında sınır verisinde kayıtlı bir devlete ait görünmüyor.`,
      text: `Bu nokta ${context.range.from}–${context.range.to} aralığında sınır verisinde kayıtlı bir devlete ait görünmüyor. Gerçek bir model bağlıyken burada bölgenin bu dönemdeki toplulukları ve komşuları anlatılırdı.`,
      actions: [['mark', { lon: place.point.lon, lat: place.point.lat, label: clip(place.title, 24) }]],
    });
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
    return single({
      title: 'Olay yok',
      caption: `${context.range.from}–${context.range.to} aralığı için kayıtlı bir olay yok; aralığı genişletmeyi deneyin.`,
      text: `${context.range.from}–${context.range.to} aralığı için kayıtlı bir olay yok; aralığı genişletmeyi deneyin.`,
      actions: [],
    });
  }
  return narration(
    picked.map((e) => ({
      title: clip(e.title, 48),
      text: `[${e.title}](olay:${e.id}): ${e.dateLabel}, ${e.location.name}. ${e.summary}${e.parties.length ? ` Taraflar: ${e.parties.map(nameOf).join(', ')}.` : ''}`,
      actions: [['show_event', { event: e.id }]],
    })),
  );
}
