import { describe, expect, it } from 'vitest';
import { TurnPlan } from '../src/ai/drawing';
import type { ToolSpec } from '../src/ai/provider';
import { Resolver } from '../src/ai/resolve';
import { createTools } from '../src/ai/tools';
import { shippedData } from './helpers/shipped';

const resolver = new Resolver(shippedData());
const range = { from: 1500, to: 1550 };

function setup() {
  const plan = new TurnPlan();
  let changes = 0;
  const tools = createTools({ resolver, range, plan, onChange: () => changes++ });
  const tool = (name: string): ToolSpec => tools.find((t) => t.name === name)!;
  return { plan, tool, tools, changes: () => changes };
}

describe('the map tools', () => {
  it('offer the small set the brief asked for, each described and with an object schema', () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name)).toEqual(['step', 'highlight', 'connect', 'mark', 'set_year', 'focus', 'clear']);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.description.length).toBeLessThanOrEqual(1024);
      expect(t.inputSchema.type).toBe('object');
      expect(JSON.stringify(t.inputSchema).length).toBeLessThanOrEqual(4096);
      expect(t.name).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    }
  });

  it('step declares a step with a clean title', () => {
    const { plan, tool } = setup();
    expect(tool('step').execute({ n: 2, title: '  **Çaldıran**  ' })).toBe('tamam');
    expect(plan.titleOf(2)).toBe('Çaldıran');
    expect(tool('step').execute({ n: 99, title: 'x' })).toMatch(/^atlandı/);
    expect(plan.has(99)).toBe(false);
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
    expect(tool('mark').execute({ lon: 18.68, lat: 45.99, label: 'Mohaç' })).toBe('tamam');
    expect(tool('mark').execute({ lon: '16,37', lat: '48.21', label: 'Viyana' })).toBe('tamam');
    expect(tool('mark').execute({ lon: 400, lat: 45, label: 'Dışarıda' })).toMatch(/^atlandı/);
    expect(tool('mark').execute({ lon: 18, lat: 45, label: '' })).toMatch(/^atlandı/);
    expect(tool('mark').execute({ lon: 'x', lat: 45, label: 'Y' })).toMatch(/^atlandı/);
    expect(plan.drawingAt(1).marks.map((m) => m.label)).toEqual(['Mohaç', 'Viyana']);
  });

  it('set_year takes a year inside the range and nothing else', () => {
    const { plan, tool } = setup();
    expect(tool('set_year').execute({ step: 1, year: 1536 })).toBe('tamam');
    expect(tool('set_year').execute({ step: 2, year: 1600 })).toMatch(/^atlandı/);
    expect(tool('set_year').execute({ step: 2, year: 'bin' })).toMatch(/^atlandı/);
    expect(plan.drawingAt(1).year).toBe(1536);
    expect(plan.drawingAt(2).year).toBe(1536);
  });

  it('focus records what should be in view, from polities and points', () => {
    const { plan, tool } = setup();
    expect(
      tool('focus').execute({
        step: 1,
        polities: ['ottoman-empire', 'x-yok'],
        points: [
          { lon: 16.37, lat: 48.21 },
          { lon: 999, lat: 0 },
        ],
      }),
    ).toContain('tamam');
    expect(plan.focusAt(1)).toEqual({ polities: ['ottoman-empire'], points: [{ lon: 16.37, lat: 48.21 }] });
    expect(tool('focus').execute({ polities: ['x-yok'] })).toMatch(/^atlandı/);
  });

  it('clear is a step action that empties what came before', () => {
    const { plan, tool } = setup();
    tool('highlight').execute({ step: 1, polities: ['ottoman-empire'] });
    tool('clear').execute({ step: 2 });
    tool('highlight').execute({ step: 2, polities: ['kingdom-of-france'] });
    expect(plan.drawingAt(1).highlights).toEqual(['ottoman-empire']);
    expect(plan.drawingAt(2).highlights).toEqual(['kingdom-of-france']);
  });

  it('reads the step from `step` or `n`, defaults to 1 and refuses nonsense', () => {
    const { plan, tool } = setup();
    tool('highlight').execute({ polities: ['ottoman-empire'] });
    tool('highlight').execute({ n: 3, polities: ['kingdom-of-france'] });
    tool('highlight').execute({ step: '2', polities: ['safavid-dynasty'] });
    expect(tool('highlight').execute({ step: 'ikinci', polities: ['ottoman-empire'] })).toMatch(/^atlandı/);
    expect(tool('highlight').execute({ step: 0, polities: ['venice'] })).toMatch(/^atlandı|tamam/);
    expect(plan.drawingAt(1).highlights).toContain('ottoman-empire');
    expect(plan.drawingAt(3).highlights).toEqual(
      expect.arrayContaining(['ottoman-empire', 'safavid-dynasty', 'kingdom-of-france']),
    );
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
