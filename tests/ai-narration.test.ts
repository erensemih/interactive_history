import { describe, expect, it } from 'vitest';
import { TurnPlan } from '../src/ai/drawing';
import { captionFromText, isStepped, sentencesOf, shortOf, stepsOf } from '../src/ai/narration';
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
    plan.add({ kind: 'highlight', step: 1, polities: ['ottoman-empire'] });
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

  it('one scene, or one section, is not a narration', () => {
    const plan = new TurnPlan();
    plan.add({ kind: 'highlight', step: 1, polities: ['ottoman-empire'] });
    const a = item('Kısa bir yanıt.', plan);
    expect(isStepped(a)).toBe(false);
    expect(stepsOf(a)).toEqual([]);
    expect(isStepped(item('## 1. Tek başlık\nMetin.'))).toBe(false);
    expect(isStepped(item('', new TurnPlan(), 'waiting'))).toBe(false);
  });
});

describe('shortOf', () => {
  it('is the text of a single-part answer, with whether it has a scene of its own', () => {
    const plan = new TurnPlan();
    plan.add({ kind: 'highlight', step: 1, polities: ['ottoman-empire'] });
    expect(shortOf(item('İlk paragraf.\n\nİkinci paragraf.', plan))).toEqual({
      title: '',
      body: 'İlk paragraf.\n\nİkinci paragraf.',
      hasScene: true,
    });
    expect(shortOf(item('Yalnız metin.'))).toMatchObject({ body: 'Yalnız metin.', hasScene: false });
  });

  it('keeps a lone heading as the title', () => {
    expect(shortOf(item('## 1. Mohaç\nMetin.'))).toMatchObject({ title: 'Mohaç', body: 'Metin.' });
  });
});
