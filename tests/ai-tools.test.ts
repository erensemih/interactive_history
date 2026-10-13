import { describe, expect, it } from 'vitest';
import { TurnPlan } from '../src/ai/drawing';
import type { ToolSpec } from '../src/ai/provider';
import { Resolver } from '../src/ai/resolve';
import { createTools } from '../src/ai/tools';
import { archivedData } from './helpers/shipped';

const resolver = new Resolver(archivedData('1400-1600'));
const range = { from: 1500, to: 1550 };

function setup() {
  const plan = new TurnPlan();
  let changes = 0;
  const tools = createTools({ resolver, range, plan, onChange: () => changes++ });
  const tool = (name: string): ToolSpec => tools.find((t) => t.name === name)!;
  return { plan, tool, tools, changes: () => changes };
}

describe('the map tools', () => {
  it('offer five tools, none of them about looks or the camera: what to show, never how', () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name)).toEqual(['step', 'show_event', 'highlight', 'connect', 'mark']);
    // no tool for the camera (the app frames what a step shows) and none for the year (a step names it)
    expect(tools.some((t) => ['focus', 'set_year', 'clear'].includes(t.name))).toBe(false);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.description.length).toBeLessThanOrEqual(1024);
      expect(t.inputSchema.type).toBe('object');
      expect(JSON.stringify(t.inputSchema).length).toBeLessThanOrEqual(4096);
      expect(t.name).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    }
  });

  it('step declares a step with a clean title and its subtitle', () => {
    const { plan, tool } = setup();
    expect(
      tool('step').execute({ n: 2, title: '  **Çaldıran**  ', caption: '  1514’te Safevîler **yenildi**.  ' }),
    ).toBe('tamam');
    expect(plan.titleOf(2)).toBe('Çaldıran');
    expect(plan.captionOf(2)).toBe('1514’te Safevîler yenildi.');
    expect(tool('step').execute({ n: 99, title: 'x', caption: 'y' })).toMatch(/^atlandı/);
    expect(plan.has(99)).toBe(false);
  });

  it('a step may come without a caption (the page then makes one from the text), and an over-long one is cut', () => {
    const { plan, tool } = setup();
    tool('step').execute({ n: 1, title: 'Yalnız başlık' });
    expect(plan.captionOf(1)).toBeNull();
    tool('step').execute({ n: 2, title: 'Uzun', caption: 'Çok uzun bir altyazı. '.repeat(40) });
    expect(plan.captionOf(2)!.length).toBeLessThanOrEqual(340);
  });

  it('a caption keeps the names of events as references, and a cut never leaves half of one', () => {
    const { plan, tool } = setup();
    const ref = '[Çaldıran Muharebesi](olay:caldiran-1514)';
    tool('step').execute({ n: 1, title: 'A', caption: `1514’te ${ref}’nde Osmanlı kazandı.` });
    expect(plan.captionOf(1)).toBe(`1514’te ${ref}’nde Osmanlı kazandı.`);
    // cut in the middle of the name: the open reference is dropped, the rest stays
    tool('step').execute({ n: 2, title: 'B', caption: `${'Söz '.repeat(75)}${ref} sonrası` });
    const cut = plan.captionOf(2)!;
    expect(cut.length).toBeLessThanOrEqual(340);
    expect(cut).not.toMatch(/\[[^\]]*$/);
    expect(cut).not.toMatch(/\]\(olay:[^)]*$/);
  });

  it('a step may carry its border year; one outside the range is left out and the step is still declared', () => {
    const { plan, tool } = setup();
    expect(tool('step').execute({ n: 1, title: 'A', caption: 'a', year: 1536 })).toBe('tamam');
    expect(tool('step').execute({ n: 2, title: 'B', caption: 'b', year: 1600 })).toMatch(/^tamam; yıl atlandı/);
    expect(tool('step').execute({ n: 3, title: 'C', caption: 'c', year: 'bin' })).toMatch(/^tamam; yıl atlandı/);
    expect(plan.drawingAt(1).year).toBe(1536);
    expect(plan.drawingAt(2).year).toBeUndefined();
    expect(plan.titleOf(2)).toBe('B');
    expect(plan.drawingAt(3).year).toBeUndefined();
  });

  it('the step tool asks for the two short texts, and says where the long one goes', () => {
    const { tool } = setup();
    const step = tool('step');
    expect(step.inputSchema.required).toEqual(['n', 'title', 'caption']); // the year is optional
    expect(Object.keys(step.inputSchema.properties)).toContain('year');
    expect(step.description).toContain('altyazı');
    expect(step.description).toContain('## n. Başlık');
  });

  it('a step without a number takes the next free one, so titles never overwrite each other', () => {
    const { plan, tool } = setup();
    tool('step').execute({ title: 'Birinci' });
    tool('step').execute({ title: 'İkinci' });
    tool('step').execute({ n: 5, title: 'Beşinci' });
    tool('step').execute({ title: 'Altıncı' });
    expect(plan.numbers()).toEqual([1, 2, 5, 6]);
    expect([1, 2, 5, 6].map((n) => plan.titleOf(n))).toEqual(['Birinci', 'İkinci', 'Beşinci', 'Altıncı']);
  });

  it('highlight resolves ids and names, drops what it does not know, and says so', () => {
    const { plan, tool } = setup();
    const out = tool('highlight').execute({ step: 1, polities: ['ottoman-empire', 'Fransa', 'atlantis'] }) as string;
    expect(out).toContain('tamam');
    expect(out).toContain('atlantis');
    expect(plan.drawingAt(1).highlights).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(tool('highlight').execute({ polities: ['atlantis'] })).toMatch(/^atlandı/);
    expect(tool('highlight').execute({ polities: 'safavid-dynasty' })).toBe('tamam'); // a lone string will do
    expect(plan.drawingAt(1).highlights).toContain('safavid-dynasty');
  });

  it('a polity with no borders in the range is skipped like an unknown one', () => {
    const { plan, tool } = setup();
    expect(resolver.presentIn('albanian-principalities', range)).toBe(false); // gone by 1421
    expect(tool('highlight').execute({ polities: ['albanian-principalities'] })).toMatch(/^atlandı/);
    expect(plan.empty).toBe(true);
  });

  it('connect needs two different known polities and a relation, in either language', () => {
    const { plan, tool } = setup();
    expect(
      tool('connect').execute({
        step: 1,
        from: 'ottoman-empire',
        to: 'kingdom-of-france',
        relation: 'alliance',
        label: 'İttifak, 1536',
      }),
    ).toBe('tamam');
    expect(tool('connect').execute({ step: 1, from: 'Osmanlı', to: 'Safevî Devleti', relation: 'savaş' })).toBe(
      'tamam',
    );
    expect(tool('connect').execute({ from: 'ottoman-empire', to: 'ottoman-empire', relation: 'war' })).toMatch(
      /^atlandı/,
    );
    expect(tool('connect').execute({ from: 'ottoman-empire', to: 'atlantis', relation: 'war' })).toMatch(/^atlandı/);
    expect(
      tool('connect').execute({ from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'friendship' }),
    ).toMatch(/^atlandı/);
    const links = plan.drawingAt(1).links;
    expect(links.map((l) => l.relation)).toEqual(['alliance', 'war']);
    expect(links[0]!.label).toBe('İttifak, 1536');
    expect(links[1]!.to).toBe('safavid-dynasty');
  });

  it('mark needs a point on the map and a label', () => {
    const { plan, tool } = setup();
    expect(tool('mark').execute({ lon: 32.48, lat: 37.87, label: 'Konya' })).toBe('tamam');
    expect(tool('mark').execute({ lon: '35,48', lat: '38.73', label: 'Kayseri' })).toBe('tamam');
    expect(tool('mark').execute({ lon: 400, lat: 45, label: 'Dışarıda' })).toMatch(/^atlandı/);
    expect(tool('mark').execute({ lon: 18, lat: 45, label: '' })).toMatch(/^atlandı/);
    expect(tool('mark').execute({ lon: 'x', lat: 45, label: 'Y' })).toMatch(/^atlandı/);
    expect(plan.drawingAt(1).marks.map((m) => m.label)).toEqual(['Konya', 'Kayseri']);
  });

  it('the tools that draw say what the app does with their input, so the model asks for what and never for how', () => {
    const { tool } = setup();
    expect(tool('show_event').description).toContain('aynı biçimde'); // always drawn the same way
    expect(tool('connect').description).toContain('OLAYLAR'); // for what the data has no event for
    expect(tool('mark').description).toContain('OLAYLAR');
    expect(tool('highlight').description).toContain('öne çıkacağını');
  });

  it('show_event takes an event of the app by id, or by a title that names exactly one', () => {
    const { plan, tool, changes } = setup();
    expect(tool('show_event').execute({ step: 1, event: 'caldiran-1514' })).toBe('tamam');
    expect(tool('show_event').execute({ step: 2, event: 'Mohaç Muharebesi' })).toBe('tamam');
    expect(tool('show_event').execute({ step: 3, event: 'Preveze' })).toBe('tamam'); // starts like exactly one title
    expect(tool('show_event').execute({ step: 4, event: 'Caldiran-1514' })).toBe('tamam'); // case and accents do not matter
    expect(tool('show_event').execute({ step: 5, event: 'yok-boyle-bir-olay' })).toMatch(/^atlandı/);
    expect(tool('show_event').execute({ step: 5, event: '' })).toMatch(/^atlandı/);
    expect(tool('show_event').execute({ step: 5 })).toMatch(/^atlandı/);
    expect([1, 2, 3, 4, 5].map((n) => plan.drawingAt(n).events)).toEqual([
      ['caldiran-1514'],
      ['mohac-1526'],
      ['preveze-1538'],
      ['caldiran-1514'],
      [],
    ]);
    expect(changes()).toBe(4);
  });

  it('a mark for something the app has an event for is shown as that event, not as a second marker', () => {
    const { plan, tool } = setup();
    const out = tool('mark').execute({ step: 1, lon: 44.0, lat: 39.14, label: 'Çaldıran' }) as string;
    expect(out).toMatch(/^tamam/);
    expect(out).toContain('Çaldıran Muharebesi');
    expect(tool('mark').execute({ step: 1, lon: 18.68, lat: 45.99, label: 'Mohaç, 1526' })).toMatch(/^tamam/);
    expect(plan.drawingAt(1)).toMatchObject({ events: ['caldiran-1514', 'mohac-1526'], marks: [] });
  });

  it('but a mark of a place the data has no event for stays a mark, and so does one at another place of that name', () => {
    const { plan, tool } = setup();
    tool('mark').execute({ step: 1, lon: 37.1, lat: 36.68, label: 'Mercidabık' }); // no such event in the data
    tool('mark').execute({ step: 1, lon: 31.25, lat: 30.07, label: 'Kahire' }); // Ridaniye happened here, but this is the city
    tool('mark').execute({ step: 1, lon: 2.35, lat: 48.85, label: 'Mohaç' }); // a long way from the event of that name
    tool('mark').execute({ step: 1, lon: 18.68, lat: 45.99, label: 'Mohaç, 1683' }); // not the year of the event
    expect(plan.drawingAt(1).events).toEqual([]);
    expect(plan.drawingAt(1).marks.map((m) => m.label)).toEqual(['Mercidabık', 'Kahire', 'Mohaç', 'Mohaç, 1683']);
  });

  it('there is no clear: every step owns its map', () => {
    const { tools } = setup();
    expect(tools.some((t) => t.name === 'clear')).toBe(false);
  });

  it('reads the step from `step` or `n`, defaults to 1 and refuses nonsense', () => {
    const { plan, tool } = setup();
    tool('highlight').execute({ polities: ['ottoman-empire'] });
    tool('highlight').execute({ n: 3, polities: ['kingdom-of-france'] });
    tool('highlight').execute({ step: '2', polities: ['safavid-dynasty'] });
    expect(tool('highlight').execute({ step: 'ikinci', polities: ['ottoman-empire'] })).toMatch(/^atlandı/);
    expect(tool('highlight').execute({ step: 0, polities: ['venice'] })).toMatch(/^atlandı|tamam/);
    expect(plan.drawingAt(1).highlights).toContain('ottoman-empire');
    expect(plan.drawingAt(2).highlights).toEqual(['safavid-dynasty']);
    expect(plan.drawingAt(3).highlights).toEqual(['kingdom-of-france']); // each step has only what it asked for
  });

  it('never throws on garbage input', () => {
    const { tools } = setup();
    for (const t of tools) {
      for (const input of [
        {},
        { step: null, polities: null, from: {}, to: [], lon: [], lat: {}, year: {}, label: 5, relation: 7 },
        { points: 'x', polities: [{}] },
      ]) {
        expect(() => t.execute(input as Record<string, unknown>)).not.toThrow();
      }
    }
  });

  it('tells the interface about every accepted request, and only those', () => {
    const { tool, changes } = setup();
    tool('highlight').execute({ polities: ['atlantis'] });
    expect(changes()).toBe(0);
    tool('highlight').execute({ polities: ['ottoman-empire'] });
    tool('step').execute({ n: 1, title: 'Başlık' });
    expect(changes()).toBe(2);
  });
});
