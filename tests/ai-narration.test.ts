import { describe, expect, it } from 'vitest';
import { TurnPlan } from '../src/ai/drawing';
import { captionFromText, hasMore, isStepped, sentencesOf, stepsOf } from '../src/ai/narration';
import type { AssistantItem } from '../src/ai/session';

const item = (text: string, plan = new TurnPlan(), status: AssistantItem['status'] = 'done'): AssistantItem => ({
  kind: 'assistant',
  id: 'm1',
  mode: 'narration',
  status,
  text,
  plan,
  error: null,
  truncated: false,
  notes: [],
});

const planOf = (...steps: [n: number, title: string, caption: string | null][]) => {
  const plan = new TurnPlan();
  for (const [n, title, caption] of steps) plan.declare(n, title, caption);
  return plan;
};

describe('sentencesOf', () => {
  it('splits at sentence ends, but not after a lone capital or a Roman numeral', () => {
    expect(sentencesOf("I. Süleyman Mohaç'ta kazandı. Kral II. Lajos öldü. Sonra ne oldu?")).toEqual([
      "I. Süleyman Mohaç'ta kazandı.",
      'Kral II. Lajos öldü.',
      'Sonra ne oldu?',
    ]);
    expect(sentencesOf('Alman 6. Ordusu kuşatıldı. 2. Dünya Savaşı sürdü.')).toEqual([
      'Alman 6. Ordusu kuşatıldı.',
      '2. Dünya Savaşı sürdü.',
    ]);
    expect(sentencesOf('Tek cümle')).toEqual(['Tek cümle']);
    expect(sentencesOf('')).toEqual([]);
  });
});

describe('captionFromText', () => {
  it('is the first sentences of the text, plain, for a model that wrote no subtitle', () => {
    const body =
      "**1501'de** Şah İsmail Safevî Devleti'ni kurdu. Safevîler Şii bir düzene dayanıyordu. Anadolu'daki Türkmen boyları arasında geniş bir yandaş kitlesi vardı ve Osmanlı yönetimi bundan tedirgindi.";
    const caption = captionFromText(body);
    expect(caption.startsWith("1501'de Şah İsmail Safevî Devleti'ni kurdu.")).toBe(true);
    expect(caption).not.toContain('**');
    expect(caption.length).toBeLessThanOrEqual(220);
    expect(caption.endsWith('.')).toBe(true);
  });

  it('cuts one very long sentence at a word, and is empty for no text', () => {
    const caption = captionFromText(`${'kelime '.repeat(80)}bitti.`, 100);
    expect(caption.length).toBeLessThanOrEqual(100);
    expect(caption.endsWith('…')).toBe(true);
    expect(captionFromText('   ')).toBe('');
  });
});

describe('stepsOf and isStepped', () => {
  const text = '## 1. Birinci\nİlk adımın metni. İkinci cümle.\n\n## 2. İkinci\nİkinci adımın metni.';

  it('a narration is the plan with its subtitles and the texts under their numbers', () => {
    const a = item(text, planOf([1, 'Birinci', 'İlk altyazı.'], [2, 'İkinci', 'İkinci altyazı.']));
    expect(isStepped(a)).toBe(true);
    expect(stepsOf(a)).toMatchObject([
      { n: 1, title: 'Birinci', caption: 'İlk altyazı.', body: 'İlk adımın metni. İkinci cümle.', hasText: true },
      { n: 2, title: 'İkinci', caption: 'İkinci altyazı.', body: 'İkinci adımın metni.', hasText: true },
    ]);
  });

  it('the plan comes first: with no text yet the steps are there with their subtitles and no text', () => {
    const a = item('', planOf([1, 'Birinci', 'İlk altyazı.'], [2, 'İkinci', 'İkinci altyazı.']), 'waiting');
    expect(isStepped(a)).toBe(true);
    expect(stepsOf(a).map((s) => [s.n, s.caption, s.hasText])).toEqual([
      [1, 'İlk altyazı.', false],
      [2, 'İkinci altyazı.', false],
    ]);
    // the text arrives step by step: the first is written, the second not yet
    const b = item('## 1. Birinci\nİlk adımın metni.', a.plan, 'streaming');
    expect(stepsOf(b).map((s) => s.hasText)).toEqual([true, false]);
  });

  it('a step the model gave no subtitle gets the first sentences of its text, else its title', () => {
    const a = item(text, planOf([1, 'Birinci', null], [2, 'İkinci', null]));
    expect(stepsOf(a).map((s) => s.caption)).toEqual(['İlk adımın metni. İkinci cümle.', 'İkinci adımın metni.']);
    const b = item('', planOf([1, 'Birinci', null], [2, 'İkinci', null]), 'streaming');
    expect(stepsOf(b).map((s) => s.caption)).toEqual(['Birinci', 'İkinci']);
  });

  it('knows which steps change the map and what year each asks for', () => {
    const plan = planOf([1, 'Bir', 'a'], [2, 'İki', 'b'], [3, 'Üç', 'c']);
    plan.add({ kind: 'highlight', step: 1, beat: 1, polities: ['ottoman-empire'] });
    plan.add({ kind: 'set_year', step: 2, year: 1514 });
    const steps = stepsOf(item('', plan, 'streaming'));
    expect(steps.map((s) => s.hasScene)).toEqual([true, true, false]);
    expect(steps.map((s) => s.year)).toEqual([null, 1514, null]);
  });

  it('numbers from the text count too: headings without a plan make steps', () => {
    const a = item(text);
    expect(isStepped(a)).toBe(true);
    expect(stepsOf(a).map((s) => [s.n, s.title])).toEqual([
      [1, 'Birinci'],
      [2, 'İkinci'],
    ]);
  });

  it('one scene, or one section, is not a narration: it is a single step', () => {
    const plan = new TurnPlan();
    plan.add({ kind: 'highlight', step: 1, beat: 1, polities: ['nazi-germany'] });
    const a = item('Kısa bir yanıt.', plan);
    expect(isStepped(a)).toBe(false);
    expect(stepsOf(a)).toMatchObject([{ n: 1, title: '', caption: 'Kısa bir yanıt.', hasText: true, hasScene: true }]);
    expect(isStepped(item('## 1. Tek başlık\nMetin.'))).toBe(false);
    expect(stepsOf(item('## 1. Tek başlık\nMetin.'))).toMatchObject([{ n: 1, title: 'Tek başlık', body: 'Metin.' }]);
    // before there is anything of it, there is no step
    expect(stepsOf(item('', new TurnPlan(), 'waiting'))).toEqual([]);
    // a plan alone (the tool round comes before the text) is a step with its scene
    expect(stepsOf(item('', plan, 'streaming'))).toMatchObject([{ n: 1, hasText: false, hasScene: true }]);
  });
});

describe('a single-step answer and its caption', () => {
  const long =
    'Stalingrad 1942-43 kışında savaşın dönüm noktası oldu. Alman 6. Ordusu kentte kuşatıldı ve Şubat 1943’te teslim oldu. ' +
    'Sovyet karşı taarruzu Kasım ayında başladı ve iki Alman ordusunu çevirdi. Bu yenilgiden sonra Almanya doğuda bir daha taarruz inisiyatifini ele geçiremedi.\n\n' +
    'İkinci paragraf, sonuçları anlatır.';

  it('uses the model’s own caption, with the text kept whole for reading', () => {
    const [step] = stepsOf(
      item(`## 1. Stalingrad\n${long}`, planOf([1, 'Stalingrad', 'Alman 6. Ordusu Stalingrad’da kuşatıldı.'])),
    );
    expect(step!.caption).toBe('Alman 6. Ordusu Stalingrad’da kuşatıldı.');
    expect(step!.body).toBe(long);
    expect(hasMore(step!)).toBe(true);
  });

  it('for a plain text with no caption is its first sentence or two, never the whole text', () => {
    const [step] = stepsOf(item(long));
    expect(step!.caption).toBe(
      'Stalingrad 1942-43 kışında savaşın dönüm noktası oldu. Alman 6. Ordusu kentte kuşatıldı ve Şubat 1943’te teslim oldu.',
    );
    expect(step!.caption.length).toBeLessThan(long.length / 2);
    expect(step!.body).toBe(long);
    expect(hasMore(step!)).toBe(true); // "Devamını oku"
  });

  it('is cut at a word when even the first sentence is long, and says so with an ellipsis', () => {
    const [step] = stepsOf(item(`${'kelime '.repeat(80)}bitti. Sonra bir cümle daha.`));
    expect(step!.caption.length).toBeLessThanOrEqual(220);
    expect(step!.caption.endsWith('…')).toBe(true);
    expect(hasMore(step!)).toBe(true);
  });

  it('is the whole answer when the answer is that short, and then there is nothing more to open', () => {
    const [step] = stepsOf(item('Bu kadar. Ve bu.'));
    expect(step!.caption).toBe('Bu kadar. Ve bu.');
    expect(hasMore(step!)).toBe(false);
    expect(hasMore({ caption: 'x', body: '', hasText: false })).toBe(false);
  });

  it('while it is being written the caption follows the first sentence, and the rest waits behind “Devamını oku”', () => {
    const first = stepsOf(
      item('Stalingrad 1942-43 kışında savaşın dönüm noktası oldu.', new TurnPlan(), 'streaming'),
    )[0]!;
    expect(first.caption).toBe('Stalingrad 1942-43 kışında savaşın dönüm noktası oldu.');
    expect(hasMore(first)).toBe(false); // nothing beyond the caption yet
    const half = stepsOf(
      item('Stalingrad 1942-43 kışında savaşın dönüm noktası oldu. Alman 6. Ord', new TurnPlan(), 'streaming'),
    )[0]!;
    // the second sentence is still being written: it is not in the caption (the caption would grow and shrink back)
    expect(half.caption).toBe('Stalingrad 1942-43 kışında savaşın dönüm noktası oldu.');
    expect(hasMore(half)).toBe(true);
    const more = stepsOf(item(long, new TurnPlan(), 'streaming'))[0]!;
    expect(hasMore(more)).toBe(true);
  });
});

describe('the caption of a text that is still arriving', () => {
  const text =
    "Hava gücü, İkinci Dünya Savaşı'nın sonucunu belirleyen etkenlerden biriydi. Savaşın başında Almanya'nın yıldırım savaşı, yoğun hava desteğiyle ilerleyen zırhlı birliklere dayanıyordu; Britanya Muharebesi'nde bu üstünlüğü kuramaması ise Almanya'nın ilk büyük başarısızlığı oldu.\n\nSavaşın ilerleyen yıllarında Müttefikler stratejik bombardıman kampanyalarıyla Alman sanayisini hedef aldı.";

  it('never shrinks as more of the text comes in: the first sentence grows as it is written, then holds', () => {
    let previous = 0;
    for (let n = 1; n <= text.length; n++) {
      const caption = captionFromText(text.slice(0, n));
      expect(caption.length, `after ${n} characters`).toBeGreaterThanOrEqual(previous);
      previous = caption.length;
    }
    expect(captionFromText(text)).toBe("Hava gücü, İkinci Dünya Savaşı'nın sonucunu belirleyen etkenlerden biriydi.");
  });

  it('adds a second sentence only once it is whole (and fits)', () => {
    expect(captionFromText('Birinci cümle bitti. İkinci cüm')).toBe('Birinci cümle bitti.');
    expect(captionFromText('Birinci cümle bitti. İkinci cümle de bitti.')).toBe(
      'Birinci cümle bitti. İkinci cümle de bitti.',
    );
    expect(captionFromText('Birinci cümle bitti. İkinci cümle de bitti. Üçüncü yazılıyor')).toBe(
      'Birinci cümle bitti. İkinci cümle de bitti.',
    );
  });
});
