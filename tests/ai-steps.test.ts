import { describe, expect, it } from 'vitest';
import { pickActive, type StepBox } from '../src/ai/activeStep';
import { alignWithPlan, paragraphsOf, parseAnswer } from '../src/ai/steps';

describe('parseAnswer', () => {
  it('splits numbered sections', () => {
    const out = parseAnswer(
      '## 1. Doğuda yeni bir komşu\nBirinci paragraf.\n\nİkinci paragraf.\n\n## 2. Çaldıran\nSon.',
    );
    expect(out.preamble).toBe('');
    expect(out.sections).toEqual([
      { n: 1, title: 'Doğuda yeni bir komşu', body: 'Birinci paragraf.\n\nİkinci paragraf.' },
      { n: 2, title: 'Çaldıran', body: 'Son.' },
    ]);
  });

  it('is tolerant about the heading mark and numbering', () => {
    const out = parseAnswer('### Adım 1: Başlangıç\nA.\n## 2) İkinci\nB.\n**3. Üçüncü**\nC.\n## Dördüncü\nD.');
    expect(out.sections.map((s) => [s.n, s.title])).toEqual([
      [1, 'Başlangıç'],
      [2, 'İkinci'],
      [3, 'Üçüncü'],
      [4, 'Dördüncü'],
    ]);
    expect(out.sections.map((s) => s.body)).toEqual(['A.', 'B.', 'C.', 'D.']);
  });

  it('keeps step numbers strictly increasing, whatever the text says', () => {
    const out = parseAnswer('## 3. A\nx\n## 3. B\ny\n## 1. C\nz');
    expect(out.sections.map((s) => s.n)).toEqual([3, 4, 5]);
  });

  it('a question has no headings: one section, number 1', () => {
    expect(parseAnswer('Tek paragraf yanıt.\n\nİkincisi.').sections).toEqual([
      { n: 1, title: '', body: 'Tek paragraf yanıt.\n\nİkincisi.' },
    ]);
    expect(parseAnswer('').sections).toEqual([]);
    expect(parseAnswer('  \n ').sections).toEqual([]);
  });

  it('keeps a line before the first heading apart from the steps', () => {
    const out = parseAnswer('Kısa bir giriş.\n\n## 1. Başlık\nGövde.');
    expect(out.preamble).toBe('Kısa bir giriş.');
    expect(out.sections).toHaveLength(1);
  });

  it('does not show a heading that has only just begun as text', () => {
    expect(parseAnswer('## 1. A\nGövde.\n\n##').sections).toEqual([{ n: 1, title: 'A', body: 'Gövde.' }]);
    expect(parseAnswer('## 1. A\nGövde.\n## ').sections).toEqual([{ n: 1, title: 'A', body: 'Gövde.' }]);
    // a heading whose title is still coming is a heading
    expect(parseAnswer('## 1. A\nGövde.\n## 2.').sections.map((s) => [s.n, s.title])).toEqual([
      [1, 'A'],
      [2, ''],
    ]);
  });

  it('a title starting like the word "Adım" keeps its letters', () => {
    expect(parseAnswer('## Adımlar ve sonuçlar\nx').sections[0]!.title).toBe('Adımlar ve sonuçlar');
  });

  it('copes with Windows line ends and bold marks in titles', () => {
    const out = parseAnswer('## 1. **Kalın** başlık\r\nGövde\r\n');
    expect(out.sections[0]).toEqual({ n: 1, title: 'Kalın başlık', body: 'Gövde' });
  });
});

describe('paragraphsOf', () => {
  it('splits at blank lines and joins soft line breaks', () => {
    expect(paragraphsOf('Bir\nsatır.\n\nİkinci.\n\n\n\nÜçüncü.')).toEqual(['Bir satır.', 'İkinci.', 'Üçüncü.']);
    expect(paragraphsOf('')).toEqual([]);
  });
});

describe('pickActive', () => {
  // three steps stacked in a 600 px tall view that starts at 0
  const steps: StepBox[] = [
    { key: 'a', top: 0, bottom: 300 },
    { key: 'b', top: 320, bottom: 600 },
    { key: 'c', top: 620, bottom: 900 },
  ];
  const view = { top: 0, bottom: 600 };

  it('the step under the reading line is active', () => {
    expect(pickActive(steps, view)).toBe('a'); // line at 38 % = 228
    expect(pickActive(steps, { top: 200, bottom: 800 })).toBe('b'); // line at 428
    expect(pickActive(steps, { top: 400, bottom: 1000 })).toBe('c'); // line at 628
  });

  it('between two steps, the one just above stays active', () => {
    expect(pickActive(steps, { top: 80, bottom: 680 })).toBe('a'); // line at 308: in the gap after a
  });

  it('before the first step starts, the first one on screen is active', () => {
    expect(pickActive([{ key: 'x', top: 400, bottom: 700 }], { top: 0, bottom: 600 })).toBe('x');
  });

  it('at the very end of the scroll, the last step on screen wins even if it never reaches the line', () => {
    const short: StepBox[] = [
      { key: 'a', top: 0, bottom: 500 },
      { key: 'b', top: 520, bottom: 600 },
    ];
    expect(pickActive(short, { top: 0, bottom: 600 })).toBe('a');
    expect(pickActive(short, { top: 0, bottom: 600, atEnd: true })).toBe('b');
  });

  it('is null when no step is on screen, and moves the line when asked', () => {
    expect(pickActive(steps, { top: 1000, bottom: 1600 })).toBeNull();
    expect(pickActive([], view)).toBeNull();
    expect(pickActive(steps, { ...view, line: 0.9 })).toBe('b'); // line at 540
  });

  it('skips a step that has scrolled out of view above the line', () => {
    const list: StepBox[] = [
      { key: 'a', top: -400, bottom: -50 },
      { key: 'b', top: 400, bottom: 800 },
    ];
    expect(pickActive(list, { top: 0, bottom: 600 })).toBe('b');
  });
});

describe('alignWithPlan', () => {
  const one = (body: string) => parseAnswer(body).sections;
  const title = (n: number) => ({ 1: 'Bir', 2: 'İki', 3: 'Üç' })[n] ?? null;

  it('gives a plan of several steps to a text whose headings could not be read, when the paragraphs match', () => {
    const out = alignWithPlan(one('Birinci paragraf.\n\nİkinci paragraf.\n\nÜçüncü paragraf.'), [1, 2, 3], title);
    expect(out.map((s) => [s.n, s.title, s.body])).toEqual([
      [1, 'Bir', 'Birinci paragraf.'],
      [2, 'İki', 'İkinci paragraf.'],
      [3, 'Üç', 'Üçüncü paragraf.'],
    ]);
  });

  it('leaves a text alone when the counts differ, when it already has sections, or when the plan is one step', () => {
    const text = one('Birinci.\n\nİkinci.');
    expect(alignWithPlan(text, [1, 2, 3], title)).toBe(text);
    const headed = parseAnswer('## 1. A\nx\n## 2. B\ny').sections;
    expect(alignWithPlan(headed, [1, 2], title)).toBe(headed);
    expect(alignWithPlan(text, [1], title)).toBe(text);
    expect(alignWithPlan([], [1, 2], title)).toEqual([]);
  });

  it('uses the step numbers the plan has, even when they do not start at 1', () => {
    const out = alignWithPlan(one('A.\n\nB.'), [2, 5], () => null);
    expect(out.map((s) => s.n)).toEqual([2, 5]);
  });
});
