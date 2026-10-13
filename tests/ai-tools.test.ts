import { describe, expect, it } from 'vitest';
import { TurnPlan } from '../src/ai/drawing';
import type { ToolSpec } from '../src/ai/provider';
import { Resolver } from '../src/ai/resolve';
import { createTools } from '../src/ai/tools';
import { withMiniPlaces } from './helpers/places';
import { archivedData } from './helpers/shipped';

const resolver = new Resolver(withMiniPlaces(archivedData('1400-1600')));
const range = { from: 1500, to: 1550 };

function setup() {
  const plan = new TurnPlan();
  let changes = 0;
  const tools = createTools({ resolver, range, plan, onChange: () => changes++ });
  const tool = (name: string): ToolSpec => tools.find((t) => t.name === name)!;
  return { plan, tool, tools, changes: () => changes };
}

describe('the map tools', () => {
  it('offer seven tools, none of them about looks or the camera: what to show, never how', () => {
    const { tools } = setup();
    // in the order of importance: a view that allows fewer tools keeps the first ones
    expect(tools.map((t) => t.name)).toEqual(['step', 'show_event', 'highlight', 'sides', 'route', 'connect', 'mark']);
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

  it('connect needs two different known places and a relation, in either language', () => {
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
    expect(links[0]!.from).toEqual({ kind: 'polity', id: 'ottoman-empire' });
    expect(links[1]!.to).toEqual({ kind: 'polity', id: 'safavid-dynasty' });
  });

  it('the ends of a connect are places: a city by any of its names, an event, a point, a polity (its capital)', () => {
    const { plan, tool } = setup();
    expect(tool('connect').execute({ step: 1, from: 'Konstantinopolis', to: 'Viyana', relation: 'war' })).toBe('tamam');
    expect(tool('connect').execute({ step: 2, from: 'mohac-1526', to: 'Kahire', relation: 'trade' })).toBe('tamam');
    expect(tool('connect').execute({ step: 3, from: '47.5, 19.04', to: 'kingdom-of-france', relation: 'treaty' })).toBe(
      'tamam',
    );
    expect(plan.drawingAt(1).links[0]).toMatchObject({
      from: { kind: 'city', id: 'istanbul', name: 'İstanbul' }, // a historical name is the same place
      to: { kind: 'city', id: 'vienna', name: 'Viyana' },
    });
    expect(plan.drawingAt(2).links[0]).toMatchObject({
      from: { kind: 'event', id: 'mohac-1526' },
      to: { kind: 'city', id: 'cairo' },
    });
    expect(plan.drawingAt(3).links[0]).toMatchObject({
      from: { kind: 'point', point: { lon: 19.04, lat: 47.5 } },
      to: { kind: 'polity', id: 'kingdom-of-france' },
    });
  });

  it('the same place twice, or the same place by two names, is not a line; neither is a place nobody knows', () => {
    const { plan, tool } = setup();
    expect(tool('connect').execute({ from: 'İstanbul', to: 'Constantinople', relation: 'war' })).toMatch(/^atlandı/);
    expect(tool('connect').execute({ from: '41.01, 28.98', to: '41.0101, 28.9801', relation: 'war' })).toMatch(
      /^atlandı/,
    );
    const out = tool('connect').execute({ from: 'Atlantis', to: 'Viyana', relation: 'war' }) as string;
    expect(out).toMatch(/^atlandı/);
    expect(out).toContain('Atlantis');
    expect(plan.empty).toBe(true);
  });

  it('where two places go by one name, the better known one is meant', () => {
    const { plan, tool } = setup();
    tool('connect').execute({ from: 'Kayseri', to: 'Edirne', relation: 'trade' });
    expect(plan.drawingAt(1).links[0]!.from).toMatchObject({ kind: 'city', id: 'kayseri' });
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

  it('mark may name the place instead of giving coordinates: a city by any name, or "enlem, boylam"', () => {
    const { plan, tool } = setup();
    expect(tool('mark').execute({ place: 'Edirne', label: 'Eski başkent' })).toBe('tamam');
    expect(tool('mark').execute({ place: 'Adrianople', label: '' })).toBe('tamam'); // no label: the city's own name
    expect(tool('mark').execute({ place: '38.08, 46.3', label: 'Gözcü kulesi' })).toBe('tamam');
    expect(tool('mark').execute({ place: 'Atlantis', label: 'X' })).toMatch(/^atlandı/);
    expect(tool('mark').execute({ place: 'ottoman-empire', label: 'X' })).toMatch(/^atlandı/); // a polity is not a point to mark
    const marks = plan.drawingAt(1).marks;
    expect(marks.map((m) => m.label)).toEqual(['Eski başkent', 'Edirne', 'Gözcü kulesi']);
    expect(marks[0]!.point).toEqual({ lon: 26.56, lat: 41.68 });
    expect(marks[2]!.point).toEqual({ lon: 46.3, lat: 38.08 });
  });

  it('mark of an event id is that event, not a second marker', () => {
    const { plan, tool } = setup();
    expect(tool('mark').execute({ place: 'caldiran-1514', label: 'Savaş yeri' })).toMatch(/^tamam/);
    expect(plan.drawingAt(1)).toMatchObject({ events: ['caldiran-1514'], marks: [] });
  });

  it('route draws a directed path through places: type, stops in order, a label and whether it animates', () => {
    const { plan, tool } = setup();
    expect(
      tool('route').execute({
        step: 1,
        via: ['Edirne', 'Budapeşte', 'Viyana'],
        type: 'advance',
        label: 'Sefer',
        animate: true,
      }),
    ).toBe('tamam');
    const route = plan.drawingAt(1).routes[0]!;
    expect(route).toMatchObject({ type: 'advance', label: 'Sefer', animate: true });
    expect(route.via).toEqual([
      { kind: 'city', id: 'edirne', name: 'Edirne' },
      { kind: 'city', id: 'budapest', name: 'Budapeşte' },
      { kind: 'city', id: 'vienna', name: 'Viyana' },
    ]);
    // the animation is the model's choice; the default is none
    tool('route').execute({ step: 2, via: ['Roma', 'Paris'], type: 'trade' });
    expect(plan.drawingAt(2).routes[0]).toMatchObject({ type: 'trade', animate: false });
    expect(plan.drawingAt(2).routes[0]).not.toHaveProperty('label');
  });

  it('a route stop is a city by any of its names, an event, a point or a polity (its capital); a route needs two', () => {
    const { plan, tool } = setup();
    expect(
      tool('route').execute({
        via: ['Constantinople', 'mohac-1526', '48.2, 16.4', 'kingdom-of-france'],
        type: 'migration',
      }),
    ).toBe('tamam');
    expect(plan.drawingAt(1).routes[0]!.via.map((v) => v.kind)).toEqual(['city', 'event', 'point', 'polity']);
    expect(tool('route').execute({ step: 2, via: ['Roma'], type: 'advance' })).toMatch(/^atlandı/);
    expect(tool('route').execute({ step: 2, via: ['Roma', 'Roma'], type: 'advance' })).toMatch(/^atlandı/); // one stop twice
    expect(tool('route').execute({ step: 2, via: ['Roma', 'Atlantis'], type: 'advance' })).toMatch(/^atlandı/);
    expect(tool('route').execute({ step: 2, via: [], type: 'advance' })).toMatch(/^atlandı/);
    expect(tool('route').execute({ step: 2, via: 'Roma', type: 'advance' })).toMatch(/^atlandı/);
    expect(plan.drawingAt(2).routes).toEqual([]);
  });

  it('a route skips the stops it does not know and says so, and collapses the same stop twice in a row', () => {
    const { plan, tool } = setup();
    const out = tool('route').execute({ via: ['Edirne', 'Edrine', 'Atlantis', 'Viyana'], type: 'advance' }) as string;
    expect(out).toMatch(/^tamam/);
    expect(out).toContain('Atlantis');
    expect(plan.drawingAt(1).routes[0]!.via.map((v) => (v.kind === 'city' ? v.id : '?'))).toEqual(['edirne', 'vienna']);
  });

  it('a route has at most eight stops, and the same route asked twice is one route', () => {
    const { plan, tool } = setup();
    const names = [
      'Edirne',
      'Budapeşte',
      'Viyana',
      'Roma',
      'Paris',
      'Kahire',
      'Tebriz',
      'İstanbul',
      'Kayseri',
      'Viyana',
    ];
    tool('route').execute({ via: names, type: 'advance' });
    expect(plan.drawingAt(1).routes[0]!.via).toHaveLength(8);
    tool('route').execute({ via: ['Roma', 'Paris'], type: 'advance' });
    tool('route').execute({ via: ['Roma', 'Paris'], type: 'advance', label: 'Yeni' });
    expect(plan.drawingAt(1).routes).toHaveLength(2);
    expect(plan.drawingAt(1).routes[1]!.label).toBe('Yeni'); // the later ask replaces the earlier
  });

  it('a route type is one of four, in either language, and anything else is declined', () => {
    const { plan, tool } = setup();
    const via = ['Roma', 'Paris'];
    for (const [given, wanted] of [
      ['advance', 'advance'],
      ['Sefer', 'advance'],
      ['ilerleyiş', 'advance'],
      ['retreat', 'retreat'],
      ['geri çekilme', 'retreat'],
      ['migration', 'migration'],
      ['göç', 'migration'],
      ['trade', 'trade'],
      ['Ticaret yolu', 'trade'],
    ] as const) {
      tool('route').execute({ step: 3, via: [...via, given], type: given }); // (distinct stops, so none is a duplicate)
      expect(plan.drawingAt(3).routes.at(-1)!.type, given).toBe(wanted);
    }
    expect(tool('route').execute({ step: 4, via, type: 'parade' })).toMatch(/^atlandı/);
    expect(tool('route').execute({ step: 4, via })).toMatch(/^atlandı/);
    expect(plan.drawingAt(4).routes).toEqual([]);
  });

  it('sides groups polities into the sides of a conflict, a polity on one side only', () => {
    const { plan, tool } = setup();
    expect(
      tool('sides').execute({
        step: 1,
        sides: [
          { name: 'Osmanlı bloku', polities: ['ottoman-empire', 'Fransa'] },
          { name: 'Habsburglar', polities: ['habsburg-monarchy', 'ottoman-empire', 'kingdom-of-hungary'] },
        ],
      }),
    ).toBe('tamam');
    expect(plan.drawingAt(1).sides).toEqual([
      { name: 'Osmanlı bloku', polities: ['ottoman-empire', 'kingdom-of-france'] },
      { name: 'Habsburglar', polities: ['habsburg-monarchy', 'kingdom-of-hungary'] }, // the Ottomans are on the first side only
    ]);
  });

  it('sides skips polities it does not know and sides without a name or a polity, and says what it skipped', () => {
    const { plan, tool } = setup();
    const out = tool('sides').execute({
      sides: [
        { name: 'A', polities: ['ottoman-empire', 'atlantis'] },
        { name: '', polities: ['kingdom-of-france'] },
        { name: 'C', polities: ['mu'] },
        { name: 'D', polities: ['safavid-dynasty'] },
      ],
    }) as string;
    expect(out).toMatch(/^tamam/);
    expect(out).toContain('atlantis');
    expect(plan.drawingAt(1).sides.map((s) => s.name)).toEqual(['A', 'D']);
    expect(tool('sides').execute({ step: 2, sides: [{ name: 'X', polities: ['atlantis'] }] })).toMatch(/^atlandı/);
    expect(tool('sides').execute({ step: 2, sides: [] })).toMatch(/^atlandı/);
    expect(tool('sides').execute({ step: 2 })).toMatch(/^atlandı/);
    expect(plan.drawingAt(2).sides).toEqual([]);
  });

  it('sides has at most three sides of eight polities, and a later call replaces the earlier in the same step', () => {
    const { plan, tool } = setup();
    const polities = [
      'ottoman-empire',
      'kingdom-of-france',
      'safavid-dynasty',
      'habsburg-monarchy',
      'kingdom-of-hungary',
      'mamluk-sultanate',
    ];
    tool('sides').execute({
      sides: [
        { name: '1', polities: [polities[0]!] },
        { name: '2', polities: [polities[1]!] },
        { name: '3', polities: [polities[2]!] },
        { name: '4', polities: [polities[3]!] },
      ],
    });
    expect(plan.drawingAt(1).sides.map((s) => s.name)).toEqual(['1', '2', '3']);
    tool('sides').execute({ sides: [{ name: 'Yeni', polities: polities.slice(0, 6) }] });
    expect(plan.drawingAt(1).sides).toEqual([{ name: 'Yeni', polities }]);
  });

  it('sides are for the step they are asked in; the sides tool counts as a change for the interface', () => {
    const { plan, tool, changes } = setup();
    tool('sides').execute({ step: 2, sides: [{ name: 'A', polities: ['ottoman-empire'] }] });
    expect(plan.drawingAt(1).sides).toEqual([]);
    expect(plan.drawingAt(2).sides).toHaveLength(1);
    expect(changes()).toBe(1);
  });

  it('the tools that draw say what the app does with their input, so the model asks for what and never for how', () => {
    const { tool } = setup();
    expect(tool('show_event').description).toContain('aynı biçimde'); // always drawn the same way
    expect(tool('connect').description).toContain('OLAYLAR'); // for what the data has no event for
    expect(tool('mark').description).toContain('OLAYLAR');
    expect(tool('sides').description).toContain('TEK bir blok'); // the app paints each side as one bloc
    expect(tool('route').description).toContain('uygulama belirler'); // the app decides how a route looks
    for (const name of ['connect', 'route']) expect(tool(name).description).toContain('BAŞKENT'); // a polity means its capital
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
        { via: [null, {}, 5, [], 'x'], type: {}, sides: [null, 'a', 5, { name: {}, polities: {} }], place: {} },
        { via: 'Roma', sides: 'x', from: 5, to: 6, relation: 'war', animate: 'yes', type: 'advance' },
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
