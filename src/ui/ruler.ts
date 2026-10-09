import { html, nothing, render } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import type { AppData } from '../data/load';
import { clamp } from '../domain/time';
import type { Store } from '../state/store';
import { clsx, formatRange } from './format';

type Drag = { mode: 'start' | 'end' | 'move' | 'cursor'; grab: number } | null;

const PRESETS = [
  { span: 1, label: '1 yıl' },
  { span: 5, label: '5 yıl' },
  { span: 25, label: '25 yıl' },
  { span: 100, label: '100 yıl' },
];

/**
 * The time control. Top: range inputs and span presets. Below: a ruler over the whole dataset
 * (1400–1600) with a brush for the selected range and a small "borders year" marker inside it.
 * The brush selects *time*; it never knows about places.
 */
export class Ruler {
  private drag: Drag = null;
  private track: HTMLElement | null = null;
  private binCounts: number[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly data: AppData,
  ) {
    // Density of globally important events across the whole extent (a static overview).
    const { from, to } = data.extent;
    const bins = Math.ceil((to - from + 1) / 5);
    this.binCounts = new Array(bins).fill(0);
    for (const e of data.events) {
      if (e.importance < 3) continue;
      const b = Math.min(bins - 1, Math.floor((e.start - from) / 5));
      if (b >= 0) this.binCounts[b]!++;
    }
  }

  private get span() {
    const e = this.data.extent;
    return e.to - e.from + 1;
  }

  private xToYear(clientX: number): number {
    const r = this.track!.getBoundingClientRect();
    const t = clamp((clientX - r.left) / r.width, 0, 1);
    return this.data.extent.from + t * this.span;
  }

  private pct(year: number): number {
    return ((year - this.data.extent.from) / this.span) * 100;
  }

  /* ----------------------------------------------------------- pointer */

  private onDown = (e: PointerEvent, mode: NonNullable<Drag>['mode']) => {
    e.preventDefault();
    e.stopPropagation();
    const range = this.store.state.range;
    const year = this.xToYear(e.clientX);
    this.drag = { mode, grab: mode === 'move' ? year - range.from : 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  private onTrackDown = (e: PointerEvent) => {
    // A click on empty track recentres the window there and lets the user keep dragging it.
    const range = this.store.state.range;
    const len = range.to - range.from + 1;
    const year = this.xToYear(e.clientX);
    const from = Math.round(year - len / 2);
    this.store.setRange({ from, to: from + len - 1 });
    const now = this.store.state.range;
    this.drag = { mode: 'move', grab: year - now.from };
    this.track!.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const ext = this.data.extent;
    const r = this.store.state.range;
    const year = this.xToYear(e.clientX);
    if (d.mode === 'start') {
      const from = clamp(Math.round(year), ext.from, r.to);
      this.store.setRange({ from, to: r.to });
    } else if (d.mode === 'end') {
      const to = clamp(Math.round(year) - 1, r.from, ext.to);
      this.store.setRange({ from: r.from, to });
    } else if (d.mode === 'move') {
      const len = r.to - r.from;
      const from = clamp(Math.round(year - d.grab), ext.from, ext.to - len);
      this.store.setRange({ from, to: from + len });
    } else {
      this.store.setDisplayYear(clamp(Math.round(year - 0.5), r.from, r.to));
    }
  };

  private onUp = () => {
    this.drag = null;
  };

  /* ---------------------------------------------------------- keyboard */

  private onKey = (e: KeyboardEvent, target: 'start' | 'end' | 'move' | 'cursor') => {
    const step = e.shiftKey ? 10 : 1;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'Home') delta = -1000;
    else if (e.key === 'End') delta = 1000;
    else return;
    e.preventDefault();
    const r = this.store.state.range;
    const ext = this.data.extent;
    if (target === 'start') this.store.setRange({ from: clamp(r.from + delta, ext.from, r.to), to: r.to });
    else if (target === 'end') this.store.setRange({ from: r.from, to: clamp(r.to + delta, r.from, ext.to) });
    else if (target === 'move') this.store.shiftBy(delta);
    else {
      const y = this.store.shownYear + delta;
      this.store.setDisplayYear(clamp(y, r.from, r.to));
    }
  };

  /* ------------------------------------------------------------ inputs */

  private commitInput(which: 'from' | 'to', raw: string) {
    const n = Number.parseInt(raw.replace(/\D/g, ''), 10);
    const r = this.store.state.range;
    if (!Number.isFinite(n)) return this.render();
    const ext = this.data.extent;
    const v = clamp(n, ext.from, ext.to);
    if (which === 'from') this.store.setRange({ from: v, to: Math.max(v, r.to) });
    else this.store.setRange({ from: Math.min(v, r.from), to: v });
    this.render();
  }

  private inputKey(e: KeyboardEvent, which: 'from' | 'to') {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      this.commitInput(which, input.value);
      input.select();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const r = this.store.state.range;
      this.commitInput(which, String((which === 'from' ? r.from : r.to) + dir * (e.shiftKey ? 10 : 1)));
    }
  }

  /* ------------------------------------------------------------ render */

  render() {
    const { range } = this.store.state;
    const year = this.store.shownYear;
    const ext = this.data.extent;
    const span = range.to - range.from + 1;
    const left = this.pct(range.from);
    const width = this.pct(range.to + 1) - left;
    const cursorX = range.to === range.from ? this.pct(range.from + 0.5) : this.pct(year + 0.5);

    const ticks: { year: number; major: boolean }[] = [];
    for (let y = Math.ceil(ext.from / 10) * 10; y <= ext.to + 1; y += 10) ticks.push({ year: y, major: y % 50 === 0 });

    const maxBin = Math.max(1, ...this.binCounts);

    render(
      html`
        <div class="dock-controls">
          <div class="dock-block">
            <span class="eyebrow">Zaman aralığı</span>
            <div class="range-inputs">
              ${this.yearInput('from', range.from, 'Başlangıç yılı')}
              <span class="range-dash" aria-hidden="true">–</span>
              ${this.yearInput('to', range.to, 'Bitiş yılı')}
            </div>
          </div>
          <div class="dock-block">
            <span class="eyebrow" id="preset-label">Uzunluk</span>
            <div class="presets" role="group" aria-labelledby="preset-label">
              ${PRESETS.map(
                (p) =>
                  html`<button
                    type="button"
                    class=${clsx('chip', span === p.span && 'is-on')}
                    aria-pressed=${span === p.span}
                    @click=${() => this.store.setPreset(p.span)}
                  >
                    ${p.label}
                  </button>`,
              )}
            </div>
          </div>
          <div
            class="dock-block dock-year"
            title="Haritada çizilen sınırların yılı. Cetvelde, seçili aralığın içindeki işaretçiyi sürükleyerek değiştirebilirsiniz."
          >
            <span class="eyebrow">Haritadaki sınırlar</span>
            <strong class="year-readout" data-testid="shown-year">${year}</strong>
          </div>
          <p class="dock-hint">
            Aralığı sürükleyin · kenarlarından uzunluğunu ayarlayın · <span class="hint-mark">▾</span> ile sınır yılını
            seçin
          </p>
        </div>

        <div class="ruler" aria-label="Zaman cetveli, ${ext.from}–${ext.to}">
          <div
            class="ruler-track"
            @pointerdown=${this.onTrackDown}
            @pointermove=${this.onMove}
            @pointerup=${this.onUp}
            @pointercancel=${this.onUp}
          >
            <div class="ruler-bins" aria-hidden="true">
              ${this.binCounts.map(
                (n, i) =>
                  html`<i
                    class="bin"
                    style=${styleMap({
                      left: `${(i * 5 * 100) / this.span}%`,
                      width: `${(5 * 100) / this.span}%`,
                      height: `${n === 0 ? 0 : 3 + (n / maxBin) * 13}px`,
                    })}
                  ></i>`,
              )}
            </div>
            <div class="ruler-axis" aria-hidden="true"></div>
            ${ticks.map(
              (t) =>
                html`<span
                  class=${clsx('ruler-tick', t.major && 'is-major')}
                  style=${styleMap({ left: `${this.pct(t.year)}%` })}
                  aria-hidden="true"
                  >${t.major ? html`<b>${t.year}</b>` : nothing}</span
                >`,
            )}

            <div
              class="brush"
              style=${styleMap({ left: `${left}%`, width: `${width}%` })}
              @pointerdown=${(e: PointerEvent) => this.onDown(e, 'move')}
              @pointermove=${this.onMove}
              @pointerup=${this.onUp}
              @pointercancel=${this.onUp}
              @keydown=${(e: KeyboardEvent) => this.onKey(e, 'move')}
              tabindex="0"
              role="slider"
              aria-label="Seçili zaman aralığı (ok tuşlarıyla kaydırın)"
              aria-valuemin=${ext.from}
              aria-valuemax=${ext.to}
              aria-valuenow=${range.from}
              aria-valuetext=${formatRange(range)}
              data-testid="brush"
            >
              <span class="brush-label" aria-hidden="true">${formatRange(range)}</span>
            </div>
            <div
              class="handle handle-start"
              style=${styleMap({ left: `${left}%` })}
              @pointerdown=${(e: PointerEvent) => this.onDown(e, 'start')}
              @pointermove=${this.onMove}
              @pointerup=${this.onUp}
              @pointercancel=${this.onUp}
              @keydown=${(e: KeyboardEvent) => this.onKey(e, 'start')}
              tabindex="0"
              role="slider"
              aria-label="Başlangıç yılı"
              aria-valuemin=${ext.from}
              aria-valuemax=${range.to}
              aria-valuenow=${range.from}
              data-testid="handle-start"
            ></div>
            <div
              class="handle handle-end"
              style=${styleMap({ left: `${left + width}%` })}
              @pointerdown=${(e: PointerEvent) => this.onDown(e, 'end')}
              @pointermove=${this.onMove}
              @pointerup=${this.onUp}
              @pointercancel=${this.onUp}
              @keydown=${(e: KeyboardEvent) => this.onKey(e, 'end')}
              tabindex="0"
              role="slider"
              aria-label="Bitiş yılı"
              aria-valuemin=${range.from}
              aria-valuemax=${ext.to}
              aria-valuenow=${range.to}
              data-testid="handle-end"
            ></div>
            <div
              class="cursor"
              style=${styleMap({ left: `${cursorX}%` })}
              @pointerdown=${(e: PointerEvent) => this.onDown(e, 'cursor')}
              @pointermove=${this.onMove}
              @pointerup=${this.onUp}
              @pointercancel=${this.onUp}
              @keydown=${(e: KeyboardEvent) => this.onKey(e, 'cursor')}
              tabindex="0"
              role="slider"
              aria-label="Haritada gösterilen sınırların yılı"
              aria-valuemin=${range.from}
              aria-valuemax=${range.to}
              aria-valuenow=${year}
              data-testid="cursor"
            >
              <span class="cursor-pin" aria-hidden="true"></span>
              <span class="cursor-year" aria-hidden="true">${year}</span>
            </div>
          </div>
        </div>
      `,
      this.host,
    );
    this.track = this.host.querySelector('.ruler-track');
  }

  private yearInput(which: 'from' | 'to', value: number, label: string) {
    return html`<input
      class="year-input"
      type="text"
      inputmode="numeric"
      maxlength="4"
      size="4"
      aria-label=${label}
      .value=${String(value)}
      @keydown=${(e: KeyboardEvent) => this.inputKey(e, which)}
      @change=${(e: Event) => this.commitInput(which, (e.target as HTMLInputElement).value)}
      @focus=${(e: FocusEvent) => (e.target as HTMLInputElement).select()}
      data-testid=${`input-${which}`}
    />`;
  }
}
