import { html, nothing, render, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import type { AppData } from '../data/load';
import { clamp, presetRange } from '../domain/time';
import type { Store } from '../state/store';
import { clsx, formatRange } from './format';

type Drag = { mode: 'start' | 'end' | 'move' | 'cursor'; grab: number; pointerId: number } | null;

/** A step of the narration on screen, at the year its scene shows. */
export interface StepMark {
  n: number;
  year: number;
  title: string;
  active: boolean;
}

/** The ruler's part in a narration: a step can be chosen by its point on the ruler. */
export interface RulerActions {
  goStep(n: number): void;
}

/** Closest two step points may sit (px, centre to centre); a point that would touch the one before it is moved along. */
const STEP_PITCH = 16;
/** How far a point may be moved from its year: any further and it would say the wrong date. */
const STEP_DRIFT = 26;

/**
 * The time control: one slim ruler over the whole dataset (1400–1600) with a brush for the selected
 * range and a small marker inside it for the year whose borders the map draws. Dragging the brush
 * moves the range, its two edges resize it, a click on the empty track recentres it. There are no
 * number fields or presets: the ruler is the whole control. It selects *time*; it never knows about places.
 */
export class Ruler {
  private drag: Drag = null;
  private track: HTMLElement | null = null;
  /** The year whose borders are drawn: the reader's cursor, or the one the AI's current step asks for. */
  private shown: number | null = null;
  private last: { year?: number; steps: readonly StepMark[] } | null = null;
  private lastWidth = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly data: AppData,
    private readonly actions: RulerActions = { goStep: () => undefined },
  ) {
    // The step points are placed in pixels: when the ruler's width changes they are placed again.
    new ResizeObserver(() => {
      const width = this.track?.clientWidth ?? 0;
      if (this.last?.steps.length && Math.abs(width - this.lastWidth) > 1) this.render(this.last.year, this.last.steps);
    }).observe(host);
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

  /** Only the primary button / first touch drags; a second finger or the right button is ignored. */
  private static primary(e: PointerEvent): boolean {
    return e.isPrimary && e.button === 0;
  }

  private capture(el: Element, pointerId: number) {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* the pointer is already gone (e.g. a touch that ended): nothing to capture */
    }
  }

  private onDown = (e: PointerEvent, mode: NonNullable<Drag>['mode']) => {
    if (!Ruler.primary(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const range = this.store.state.range;
    const year = this.xToYear(e.clientX);
    this.drag = { mode, grab: mode === 'move' ? year - range.from : 0, pointerId: e.pointerId };
    this.capture(e.currentTarget as HTMLElement, e.pointerId);
  };

  private onTrackDown = (e: PointerEvent) => {
    if (!Ruler.primary(e)) return;
    // A click on empty track recentres the window there (sliding, never shrinking, at the ends) and
    // lets the user keep dragging it.
    const range = this.store.state.range;
    const len = range.to - range.from + 1;
    const year = this.xToYear(e.clientX);
    this.store.setRange(presetRange({ from: year, to: year }, len, this.data.extent));
    const now = this.store.state.range;
    this.drag = { mode: 'move', grab: year - now.from, pointerId: e.pointerId };
    this.capture(this.track!, e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
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

  private onUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.pointerId) this.drag = null;
  };

  /* ---------------------------------------------------------- keyboard */

  private onKey = (e: KeyboardEvent, target: 'start' | 'end' | 'move' | 'cursor') => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+← is the browser's Back, not a time step
    const step = e.shiftKey ? 10 : 1;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'PageUp') delta = 10;
    else if (e.key === 'PageDown') delta = -10;
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
      const y = (this.shown ?? this.store.shownYear) + delta;
      this.store.setDisplayYear(clamp(y, r.from, r.to));
    }
  };

  /* ------------------------------------------------------------ progress */

  private progress(steps: readonly StepMark[]): TemplateResult | typeof nothing {
    if (steps.length < 2 || !this.track) return nothing;
    const width = this.track.clientWidth || 1;
    // left to right by year (and by number within a year); a point that would touch the one before is moved on
    const ordered = [...steps].sort((a, b) => a.year - b.year || a.n - b.n);
    let prev = -Infinity;
    const placed = ordered.map((m) => {
      const own = (this.pct(m.year + 0.5) / 100) * width;
      const x = Math.min(own + STEP_DRIFT, Math.max(own, prev + STEP_PITCH));
      prev = x;
      return { ...m, x };
    });
    const first = placed[0]!;
    const active = placed.find((m) => m.active);
    const rank = active ? placed.indexOf(active) : -1;
    return html`<div class="ruler-steps" data-testid="ruler-steps">
      ${
        active
          ? html`<i
              class="ruler-run"
              style=${styleMap({ left: `${first.x}px`, width: `${Math.max(0, active.x - first.x)}px` })}
              aria-hidden="true"
            ></i>`
          : nothing
      }
      ${placed.map(
        (m, i) =>
          html`<button
            type="button"
            class=${clsx('ruler-step', m.active && 'is-on', rank >= 0 && i < rank && 'is-past')}
            data-testid="ruler-step"
            data-n=${m.n}
            style=${styleMap({ left: `${m.x}px` })}
            title=${`${m.n}. adım${m.title ? `: ${m.title}` : ''} · ${m.year}`}
            tabindex="-1"
            aria-hidden="true"
            @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
            @click=${() => this.actions.goStep(m.n)}
          >
            ${m.n}
          </button>`,
      )}
    </div>`;
  }

  /* ------------------------------------------------------------ render */

  /**
   * While a narration is on screen the ruler is also its progress bar: each step is a point at its year, those
   * already seen are filled, the one on screen is marked, and a line runs from the first to it. Steps without a year
   * are left out of it (there is nowhere to put them). Fewer than two dated steps are no progress to speak of.
   */
  render(shownYear?: number, steps: readonly StepMark[] = []) {
    this.last = { year: shownYear, steps };
    const wasLaidOut = !!this.track;
    const { range } = this.store.state;
    const year = shownYear ?? this.store.shownYear;
    this.shown = year;
    const ext = this.data.extent;
    const left = this.pct(range.from);
    const width = this.pct(range.to + 1) - left;
    const cursorX = range.to === range.from ? this.pct(range.from + 0.5) : this.pct(year + 0.5);

    const ticks: { year: number; major: boolean }[] = [];
    for (let y = Math.ceil(ext.from / 10) * 10; y <= ext.to + 1; y += 10) ticks.push({ year: y, major: y % 50 === 0 });

    render(
      html`
        <div class="dock-label">
          <span class="eyebrow">Zaman aralığı</span>
          <strong class="range-readout" data-testid="range-readout">${formatRange(range)}</strong>
        </div>

        <div class="ruler" role="group" aria-label="Zaman cetveli, ${ext.from}–${ext.to}">
          <div
            class="ruler-track"
            @pointerdown=${this.onTrackDown}
            @pointermove=${this.onMove}
            @pointerup=${this.onUp}
            @pointercancel=${this.onUp}
            @lostpointercapture=${this.onUp}
          >
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
            ${this.progress(steps)}
            <div
              class="brush"
              style=${styleMap({ left: `${left}%`, width: `${width}%` })}
              @pointerdown=${(e: PointerEvent) => this.onDown(e, 'move')}
              @pointermove=${this.onMove}
              @pointerup=${this.onUp}
              @pointercancel=${this.onUp}
              @lostpointercapture=${this.onUp}
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
              @lostpointercapture=${this.onUp}
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
              @lostpointercapture=${this.onUp}
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
              @lostpointercapture=${this.onUp}
              @keydown=${(e: KeyboardEvent) => this.onKey(e, 'cursor')}
              tabindex="0"
              role="slider"
              title="Haritadaki sınırların yılı: ${year}"
              aria-label="Haritada gösterilen sınırların yılı"
              aria-valuemin=${range.from}
              aria-valuemax=${range.to}
              aria-valuenow=${year}
              data-testid="cursor"
            >
              <span class="cursor-pin" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      `,
      this.host,
    );
    this.track = this.host.querySelector('.ruler-track');
    this.lastWidth = this.track?.clientWidth ?? 0;
    // the very first pass had no width to place the points in: once the track exists they are placed for real
    if (steps.length >= 2 && !wasLaidOut && this.lastWidth) this.render(shownYear, steps);
  }
}
