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
 * The scripted answers are a stand-in for the model that does what the instructions ask of it (every answer is made of
 * scenes, each with a title, a caption of sentences and a full text), over the 1800–2000 data. The model says WHAT is shown
 * and the app draws it. Each sentence of a caption is a beat of its scene and every action says which beat it appears with:
 * `show_event` names an event of the data (its marker: prominent while its beat plays, then a numbered dot), `route` is an
 * arrow through places (an advance, a retreat; a stop may be the border of a polity toward a place, so an army leaves the front,
 * not a capital), `sides` says who is on which side (the app paints the map relative to the narration's focus, each actor in
 * its own colour for the whole narration), `highlight` points at polities, `territory_change` shows what a polity gained and
 * lost between two years, and `mark` is for a place the data has no event for. There are no lines between places. Texts
 * mention the data's events as `[text](olay:id)`, which the page turns into links. Facts are the commonly given ones; where
 * historians disagree the text says so.
 */

/** "Germany at war": eight scenes from the outbreak of the war to the surrender, each with a map of its own. */
const GERMANY_AT_WAR: ScriptStep[] = [
  {
    title: 'Savaş başlıyor',
    caption:
      "23 Ağustos 1939'da Almanya ile Sovyetler Birliği [Molotov–Ribbentrop Paktı](olay:molotov-ribbentrop-1939)'nı Moskova'da imzaladı. 1 Eylül'de Alman ordusu [Polonya'ya saldırdı](olay:polonya-isgali-1939). 3 Eylül'de Britanya ve Fransa [Almanya'ya savaş ilan etti](olay:savas-ilani-1939). 17 Eylül'de Kızıl Ordu da [doğudan girdi](olay:sovyet-polonya-isgali-1939) ve Polonya iki işgal bölgesine ayrıldı.",
    text: "Savaş, 1 Eylül 1939 sabahı Alman ordusunun [Polonya'ya saldırmasıyla](olay:polonya-isgali-1939) başladı. Bir hafta önce Moskova'da imzalanan [Molotov–Ribbentrop Paktı](olay:molotov-ribbentrop-1939), Almanya'nın doğuda Sovyetler'le karşılaşma riskini ortadan kaldırmış ve Polonya'nın paylaşılmasını gizli bir protokolle öngörmüştü. Britanya ve Fransa 3 Eylül'de [savaş ilan etti](olay:savas-ilani-1939) ama Polonya'ya fiilen yardım edemedi; 17 Eylül'de Kızıl Ordu da [Polonya'nın doğusuna girince](olay:sovyet-polonya-isgali-1939) ülke iki işgal bölgesine ayrıldı.\n\nHaritada 1939'dan 1940'a geçerken Sovyetler Birliği'nin kazandığı toprak vurgulanır; sınır verisi yıllık olduğu için aynı yılın öbür işgalleri (Danimarka, Norveç, Fransa) de 1940 haritasında görünür.",
    actions: [
      ['show_event', { beat: 1, event: 'molotov-ribbentrop-1939' }],
      [
        'sides',
        {
          beat: 1,
          sides: [
            { name: 'Almanya', polities: ['nazi-germany'] },
            { name: 'Polonya', polities: ['second-polish-republic'] },
          ],
          neutral: ['union-of-soviet-socialist-republics', 'kingdom-of-great-britain', 'french-third-republic'],
        },
      ],
      ['show_event', { beat: 2, event: 'polonya-isgali-1939' }],
      [
        'route',
        {
          beat: 2,
          via: ['sınır: nazi-germany → Varşova', 'Varşova'],
          type: 'advance',
          label: 'Alman ilerleyişi',
          animate: true,
        },
      ],
      ['route', { beat: 2, via: ['sınır: nazi-germany → Kraków', 'Kraków'], type: 'advance', animate: true }],
      ['highlight', { beat: 2, polities: ['second-polish-republic'] }],
      ['show_event', { beat: 3, event: 'savas-ilani-1939' }],
      [
        'sides',
        {
          beat: 3,
          sides: [
            { name: 'Almanya', polities: ['nazi-germany'] },
            {
              name: 'Polonya ve müttefikleri',
              polities: ['second-polish-republic', 'kingdom-of-great-britain', 'french-third-republic'],
            },
          ],
          neutral: ['union-of-soviet-socialist-republics'],
        },
      ],
      ['show_event', { beat: 4, event: 'sovyet-polonya-isgali-1939' }],
      [
        'route',
        {
          beat: 4,
          via: ['sınır: union-of-soviet-socialist-republics → Lviv', 'Lviv'],
          type: 'advance',
          label: 'Sovyet ilerleyişi',
          animate: true,
        },
      ],
      [
        'sides',
        {
          beat: 4,
          sides: [
            { name: 'Almanya', polities: ['nazi-germany'] },
            {
              name: 'Polonya ve müttefikleri',
              polities: ['second-polish-republic', 'kingdom-of-great-britain', 'french-third-republic'],
            },
            { name: 'Sovyetler Birliği', polities: ['union-of-soviet-socialist-republics'] },
          ],
        },
      ],
      ['territory_change', { beat: 4, polity: 'union-of-soviet-socialist-republics', from: 1939, to: 1940 }],
    ],
  },
  {
    title: 'Batıda yıldırım savaşı',
    caption:
      "Mayıs 1940'ta Almanya Ardenler üzerinden saldırıp [Fransa Muharebesi](olay:fransa-muharebesi-1940)'ni altı haftada kazandı. Fransa 22 Haziran'da [ateşkes imzaladı](olay:compiegne-ateskesi-1940).",
    text: "10 Mayıs 1940'ta başlayan [Fransa Muharebesi](olay:fransa-muharebesi-1940)'nde Alman zırhlı birlikleri Ardenler'i aşıp Sedan'da Fransız cephesini yardı ve Kanal kıyısına ulaştı. Fransa 22 Haziran'da Compiègne'de [ateşkes imzaladı](olay:compiegne-ateskesi-1940); ülke işgal altındaki kuzey ve batı ile Vichy'den yönetilen güney olarak ikiye bölündü. Batı Avrupa'nın büyük bölümü artık Alman denetimindeydi.",
    actions: [
      ['show_event', { beat: 1, event: 'fransa-muharebesi-1940' }],
      [
        'route',
        {
          beat: 1,
          via: ['sınır: nazi-germany → Sedan', 'Sedan', 'Dunkirk'],
          type: 'advance',
          label: 'Ardenler atılımı',
        },
      ],
      ['show_event', { beat: 2, event: 'compiegne-ateskesi-1940' }],
    ],
  },
  {
    title: 'Britanya direniyor',
    caption:
      "Temmuz–Ekim 1940'taki [Britanya Muharebesi](olay:britanya-muharebesi-1940)'nde Luftwaffe havada üstünlük kuramadı; işgal planı ertelendi.",
    text: "Almanya, Britanya'yı barışa zorlamak ve olası bir çıkarma için havada üstünlük kurmak istedi. Temmuz–Ekim 1940'taki [Britanya Muharebesi](olay:britanya-muharebesi-1940)'nde Kraliyet Hava Kuvvetleri radarın ve savaş uçaklarının desteğiyle direndi; Hitler işgal planını erteledi. Savaşın ilk büyük Alman başarısızlığıdır.",
    actions: [
      ['show_event', { beat: 1, event: 'britanya-muharebesi-1940' }],
      ['highlight', { beat: 1, polities: ['kingdom-of-great-britain'] }],
    ],
  },
  {
    title: 'Doğuya saldırı',
    caption:
      "22 Haziran 1941'de Almanya ve ortakları [Barbarossa Harekâtı](olay:barbarossa-1941) ile Sovyetler Birliği'ne saldırdı. Alman orduları sınırdan Minsk ve Smolensk üzerinden Moskova'ya doğru ilerledi. Eylül'de [Leningrad kuşatıldı](olay:leningrad-kusatmasi-1941).",
    text: "22 Haziran 1941'de Almanya ve müttefikleri, Molotov–Ribbentrop Paktı'nı bozarak [Barbarossa Harekâtı](olay:barbarossa-1941) ile Sovyetler Birliği'ne üç milyondan fazla askerle saldırdı. İlk aylarda Alman ordusu çok hızlı ilerledi; Eylül'de [Leningrad kuşatıldı](olay:leningrad-kusatmasi-1941). Aralık'ta Moskova önünde durdurulduğunda ise kısa bir savaş umudu da bitmişti.",
    actions: [
      ['show_event', { beat: 1, event: 'barbarossa-1941' }],
      [
        'sides',
        {
          beat: 1,
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
          beat: 2,
          via: ['sınır: nazi-germany → Minsk', 'Minsk', 'Smolensk', 'Moskova'],
          type: 'advance',
          label: 'Alman ilerleyişi',
          animate: true,
        },
      ],
      ['show_event', { beat: 3, event: 'leningrad-kusatmasi-1941' }],
    ],
  },
  {
    title: 'Berlin’de verilen karar',
    caption:
      "20 Ocak 1942'de Berlin-Wannsee'de toplanan yetkililer, Avrupa Yahudilerinin sistemli biçimde yok edilmesini görüştü: [Wannsee Konferansı](olay:wannsee-1942).",
    text: "Savaşın bir yüzü de cephelerin gerisinde yaşandı. 20 Ocak 1942'de Berlin'in Wannsee semtinde toplanan üst düzey Nazi yetkilileri ve devlet memurları, Avrupa Yahudilerinin “nihai çözüm” adıyla sistemli biçimde yok edilmesinin örgütlenmesini görüştü: [Wannsee Konferansı](olay:wannsee-1942). Holokost'ta altı milyon kadar Yahudi öldürüldü.",
    actions: [
      ['show_event', { beat: 1, event: 'wannsee-1942' }],
      ['highlight', { beat: 1, polities: ['nazi-germany'] }],
    ],
  },
  {
    title: 'Dönüm noktası: Stalingrad',
    caption:
      "Şubat 1943'te [Stalingrad](olay:stalingrad-1942)'da Alman 6. Ordusu teslim oldu. Aynı aylarda [El Alamein](olay:el-alamein-1942)'de Mihver Kuzey Afrika'da da durduruldu.",
    text: "1942 sonbaharına gelindiğinde Alman taarruzu iki yerde tıkandı. Volga kıyısındaki [Stalingrad](olay:stalingrad-1942)'da Kızıl Ordu'nun Kasım'daki karşı taarruzu 6. Ordu'yu kuşattı; Şubat 1943'te teslim olan ordunun kaybı Almanya için ağır bir darbeydi. Aynı haftalarda [İkinci El Alamein Muharebesi](olay:el-alamein-1942)'nde Britanya ordusu Rommel'in kuvvetlerini Mısır sınırında yendi. Buradan sonra inisiyatif Müttefiklerdeydi.",
    actions: [
      ['show_event', { beat: 1, event: 'stalingrad-1942' }],
      ['show_event', { beat: 2, event: 'el-alamein-1942' }],
    ],
  },
  {
    title: 'İkinci cephe',
    caption:
      "6 Haziran 1944'te Müttefikler [Normandiya'ya çıktı](olay:normandiya-1944). İki hafta sonra Sovyetler [Bagration Harekâtı](olay:bagration-1944) ile doğuda atağa geçti ve Almanlar iki yönden geri çekilmeye başladı.",
    text: "6 Haziran 1944'te Britanya, ABD ve Kanada kuvvetleri [Normandiya'ya çıkarak](olay:normandiya-1944) Batı Avrupa'da ikinci cepheyi açtı. 22 Haziran'da Kızıl Ordu [Bagration Harekâtı](olay:bagration-1944) ile Belarus'ta Alman Orta Ordular Grubu'nu yok etti. Almanya iki yönden de geri çekilmeye başladı; Aralık'taki [Ardenler Taarruzu](olay:ardenler-1944) son büyük karşı atağı oldu.",
    actions: [
      ['show_event', { beat: 1, event: 'normandiya-1944' }],
      [
        'sides',
        {
          beat: 1,
          sides: [
            { name: 'Almanya ve ortakları', polities: ['nazi-germany', 'romania', 'hungary'] },
            {
              name: 'Müttefikler',
              polities: ['kingdom-of-great-britain', 'united-states-of-america', 'union-of-soviet-socialist-republics'],
            },
          ],
        },
      ],
      ['show_event', { beat: 2, event: 'bagration-1944' }],
      ['route', { beat: 2, via: ['Minsk', 'Varşova', 'Berlin'], type: 'retreat', label: 'Alman geri çekilişi' }],
    ],
  },
  {
    title: 'Berlin ve teslim',
    caption:
      "Nisan–Mayıs 1945'te [Berlin Muharebesi](olay:berlin-muharebesi-1945) sürerken Hitler intihar etti. Almanya 8 Mayıs'ta [koşulsuz teslim oldu](olay:almanya-teslimi-1945) ve savaşta kazandığı toprakların hepsini yitirdi.",
    text: "16 Nisan 1945'te Kızıl Ordu Oder'den Berlin'e saldırdı; [Berlin Muharebesi](olay:berlin-muharebesi-1945) iki hafta sürdü ve Hitler 30 Nisan'da intihar etti. Almanya 7 Mayıs'ta Reims'te, 8 Mayıs'ta Berlin-Karlshorst'ta [koşulsuz teslim oldu](olay:almanya-teslimi-1945). Ülke dört işgal bölgesine ayrıldı; Nazi Almanyası'nın sonu, aynı zamanda savaşın Avrupa'daki sonuydu.",
    actions: [
      ['show_event', { beat: 1, event: 'berlin-muharebesi-1945' }],
      ['show_event', { beat: 2, event: 'almanya-teslimi-1945' }],
      ['territory_change', { beat: 2, polity: 'nazi-germany', from: 1944, to: 1945 }],
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
    "[Stalingrad Muharebesi](olay:stalingrad-1942)'nde Alman 6. Ordusu kuşatılıp teslim oldu. Doğu cephesinde inisiyatif Sovyetlere geçti.",
  text: "Ağustos 1942'de Volga kıyısındaki Stalingrad'a ulaşan Alman 6. Ordusu, kent içinde sokak sokak süren ağır çatışmalara girdi. Kızıl Ordu 19 Kasım'da kentin kuzeyinden ve güneyinden karşı taarruza geçip ordunun çevresini kapattı; Şubat 1943'te [Stalingrad Muharebesi](olay:stalingrad-1942) Alman teslimiyle sona erdi.\n\nYenilginin önemi sayılarda değil, sonuçtaydı: Almanya bir daha doğuda genel bir taarruz başlatamadı, müttefikleri (Romanya, Macaristan, İtalya) ordularının büyük bölümünü yitirdi. Tarihçiler ölü sayısını iki taraf için yüz binler düzeyinde, toplam kayıpları ise bir milyona yakın veriyor; kesin rakamlar tartışmalıdır.",
  actions: [
    ['show_event', { beat: 1, event: 'stalingrad-1942' }],
    ['highlight', { beat: 2, polities: ['union-of-soviet-socialist-republics', 'nazi-germany'] }],
  ],
};

/** A scene in the west: the fall of France. The borders it shows are those of its start, 1939, where the Third Republic still is. */
const FRANCE_ANSWER: ScriptStep = {
  title: 'Fransa’nın düşüşü',
  caption:
    "10 Mayıs 1940'ta başlayan [Fransa Muharebesi](olay:fransa-muharebesi-1940)'nde Almanya altı haftada Fransa'yı yendi. Britanya ordusu kıtadan çekildi.",
  text: "10 Mayıs 1940'ta Almanya Hollanda ve Belçika'ya girdi, Ardenler üzerinden yaptığı zırhlı atılımla Sedan'da Fransız cephesini yardı ve Kanal kıyısına ulaştı. [Fransa Muharebesi](olay:fransa-muharebesi-1940) altı hafta sürdü; Britanya Seferi Kuvvetleri kıtayı terk etti, Fransa 22 Haziran'da ateşkes imzaladı.\n\nHaritada Fransa, Britanya ve Almanya'nın birbirine komşu olduğu Batı Avrupa görünür: savaşın başladığı Mayıs 1940'ta Fransa Üçüncü Cumhuriyeti hâlâ ayaktaydı, bu yüzden sınırlar bir önceki yılın, 1939'un sınırlarıdır.",
  actions: [
    ['show_event', { beat: 1, event: 'fransa-muharebesi-1940' }],
    ['highlight', { beat: 2, polities: ['french-third-republic', 'kingdom-of-great-britain'] }],
  ],
};

/** The landings: a scene in the west too, with the United States in it (it frames Western Europe, not Alaska and Greenland). */
const NORMANDY_ANSWER: ScriptStep = {
  title: 'Normandiya Çıkarması',
  caption:
    "6 Haziran 1944'te Britanya, ABD ve Kanada kuvvetleri [Normandiya'ya çıktı](olay:normandiya-1944). Batı Avrupa'da ikinci cephe açıldı.",
  text: "6 Haziran 1944'te Britanya, ABD ve Kanada kuvvetleri Normandiya sahillerine çıktı: tarihin en büyük amfibi harekâtı [Normandiya Çıkarması](olay:normandiya-1944) Batı Avrupa'da ikinci cepheyi açtı. Ağustos'ta Paris kurtarıldı.\n\nHaritada çıkarmanın yeri görünür; Amerika Birleşik Devletleri de bu sahnededir ama toprağının hiçbir parçası bu bölgede olmadığı için harita yalnızca Batı Avrupa'yı gösterir.",
  actions: [
    ['show_event', { beat: 1, event: 'normandiya-1944' }],
    ['highlight', { beat: 2, polities: ['kingdom-of-great-britain', 'united-states-of-america', 'nazi-germany'] }],
  ],
};

/** A relation the data has no event for: shown by colour (the 1939 Pact of Steel), growing with the Tripartite Pact. */
const AXIS_ANSWER: ScriptStep = {
  title: 'Almanya ve İtalya',
  caption:
    "Almanya ile İtalya, 22 Mayıs 1939'da Çelik Pakt ile askerî ittifak kurdu. [Üçlü Pakt](olay:uclu-pakt-1940) 1940'ta Japonya'yı da getirdi.",
  text: "Hitler ve Mussolini'nin yakınlaşması 1936'daki “Roma–Berlin Mihveri” ile başladı. 22 Mayıs 1939'da imzalanan Çelik Pakt, iki devleti karşılıklı askerî yardıma bağlayan açık bir ittifaktı. Savaş çıktığında İtalya hazır olmadığı için önce tarafsız kaldı, ancak Haziran 1940'ta Fransa çökerken savaşa girdi.\n\nSistem 27 Eylül 1940'ta [Üçlü Pakt](olay:uclu-pakt-1940) ile Japonya'yı da içine aldı; Macaristan, Romanya, Slovakya ve Bulgaristan sonradan katıldı. İttifakın nitelikleri tartışılır: üyeler ortak bir komuta ya da ortak bir strateji kurmadı, her biri kendi savaşını yürüttü.",
  year: 1939,
  actions: [
    ['sides', { beat: 1, sides: [{ name: 'Çelik Pakt', polities: ['nazi-germany', 'kingdom-of-italy'] }] }],
    ['show_event', { beat: 2, event: 'uclu-pakt-1940' }],
    [
      'sides',
      {
        beat: 2,
        sides: [{ name: 'Çelik Pakt ve Üçlü Pakt', polities: ['nazi-germany', 'kingdom-of-italy', 'empire-of-japan'] }],
      },
    ],
  ],
};

/** Who stood with whom: the sides of the war, painted as two blocs, and then who stood aside. */
const SIDES_ANSWER: ScriptStep = {
  title: 'Mihver ve Müttefikler',
  caption:
    "İkinci Dünya Savaşı'nda bir yanda Mihver (Almanya, İtalya, Japonya), öbür yanda Müttefikler (Britanya, Sovyetler Birliği, ABD) yer aldı. Taraflar savaş boyunca değişti; İsveç, İsviçre ve Türkiye uzak durdu.",
  text: "İkinci Dünya Savaşı'nın iki ana kutbu, 1940 tarihli Üçlü Pakt'la birleşen Almanya, İtalya ve Japonya'nın oluşturduğu Mihver ile Britanya, Sovyetler Birliği ve ABD'nin başını çektiği Müttefiklerdi. Haritada 1942 yılının görünümü bu iki bloğu birer renkle gösteriyor.\n\nGörüntü yine de basitleştirilmiş bir ikilik. Sovyetler Birliği 1939–1941 arasında Almanya ile bir saldırmazlık paktı içindeydi ve savaşa 1941'de, saldırıya uğrayınca girdi; ABD savaşa 1941 sonunda katıldı; Fransa'nın büyük bölümü 1940'tan sonra işgal altındaydı, Tayland Japonya'nın yanında yer aldı, İsveç ve İsviçre gibi bazı ülkeler tarafsız kaldı. Hangi devletin hangi tarafta sayılacağı yıldan yıla değiştiği için buradaki gruplama 1942 içindir.",
  year: 1942,
  actions: [
    [
      'sides',
      {
        beat: 1,
        sides: [
          { name: 'Mihver', polities: ['nazi-germany', 'kingdom-of-italy', 'empire-of-japan'] },
          {
            name: 'Müttefikler',
            polities: ['kingdom-of-great-britain', 'union-of-soviet-socialist-republics', 'united-states-of-america'],
          },
        ],
      },
    ],
    [
      'sides',
      {
        beat: 2,
        sides: [
          { name: 'Mihver', polities: ['nazi-germany', 'kingdom-of-italy', 'empire-of-japan'] },
          {
            name: 'Müttefikler',
            polities: ['kingdom-of-great-britain', 'union-of-soviet-socialist-republics', 'united-states-of-america'],
          },
        ],
        neutral: ['kingdom-of-sweden', 'swiss-confederation', 'republic-of-turkey'],
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
 * The scripted answers: the German narration (a place of Nazi Germany, 1939–1945) and plain questions for the
 * acceptance test (an event, a relation the data has no event for, the sides of the war, and two scenes in the west: the
 * fall of France and the landings in Normandy), a reply that ignores the format and is plain text, the open-event question,
 * and generic ones made from the app's own data so that any place and any range gets something real to show. The first
 * script that fits answers.
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

  const franceQuestion: MockScript = (req) => {
    if (req.meta.mode !== 'qa' || !has(req.meta.question, 'fransa', '1940')) return null;
    return single(FRANCE_ANSWER);
  };

  const normandyQuestion: MockScript = (req) => {
    if (req.meta.mode !== 'qa' || !has(req.meta.question, 'normandiya')) return null;
    return single(NORMANDY_ANSWER);
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
    if (place?.holder) actions.push(['highlight', { beat: 1, polities: [place.holder.id] }]);
    if (place)
      actions.push(['mark', { beat: 1, lon: place.point.lon, lat: place.point.lat, label: clip(place.title, 24) }]);
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
    franceQuestion,
    normandyQuestion,
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
