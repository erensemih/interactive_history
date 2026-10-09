import { html, nothing, render, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import type { AppData } from '../data/load';
import { MARKER_DIAMETER, styleFor } from '../domain/categories';
import { stackDots } from '../domain/lanes';
import { axisTicks } from '../domain/time';
import type { HistoricalEvent, YearRange } from '../domain/types';
import type { PlaceView, ViewModel } from '../state/derive';
import type { Store } from '../state/store';
import { dot } from './dot';
import { clsx, formatRange } from './format';
import type { Tooltip } from './tooltip';

/** Dots that would touch are stacked into this many rows above the axis. */
const ROWS = 3;
/** Distance between rows. The dots are 13 px, so neighbouring rows touch but do not cover each other. */
const PITCH = 14;
const DOT_AREA = ROWS * PITCH;
/** The strip under the dots: it carries the years and, in colour, who held the place. */
const BAND_TOP = DOT_AREA + 2;
const BAND_H = 14;
/** Fixed on purpose: if the dock changed height when a place was selected, the map above it would
 *  resize and appear to move. */
export const TIMELINE_H = BAND_TOP + BAND_H;
/** Closest two dots in one row may sit (px, centre to centre). */
const SPACING = MARKER_DIAMETER + 3;
/** Height of the selected event's name tag. */
const TAG_H = 20;
/** A year label this close to the right edge would be cut off, so it is left out (its tick stays). */
const EDGE_ROOM = 30;

const rowCentre = (row: number) => DOT_AREA - PITCH / 2 - row * PITCH;

/** An event of the place, placed on the plot: its x and the row its dot was stacked into. */
interface Item {
  ev: HistoricalEvent;
  x: number;
  row: number;
}

/**
 * The place timeline. It shows what happened *to the selected place*: events whose parties include
 * the polity (or its parents, or the region) that held that place. Distance is irrelevant. The
 * horizontal axis is the selected range plus context on both sides; events outside the range are
 * drawn faded so a one-year range still has neighbours to read.
 *
 * Event names are not written on the timeline: hovering (or focusing) a dot names it, and so does a
 * tap, which also opens it. Only the opened event keeps a name tag next to its dot.
 *
 * It draws the first selected place; comparison mode would draw one such plot per place.
 */
export class Timeline {
  private width = 800;
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly widthCache = new Map<string, number>();
  private last: ViewModel | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly data: AppData,
    private readonly tip: Tooltip,
  ) {
    document.fonts?.addEventListener('loadingdone', () => {
      this.widthCache.clear();
      if (this.last) this.render(this.last);
    });
    new ResizeObserver(() => {
      const w = this.plotWidth();
      if (w && Math.abs(w - this.width) > 2) {
        this.width = w;
        if (this.last) this.render(this.last);
      }
    }).observe(this.host);
  }

  private plotWidth(): number {
    return this.host.querySelector<HTMLElement>('.tl-plot')?.clientWidth ?? 0;
  }

  private textWidth(text: string, weight: number, size: number): number {
    const key = `${text}|${weight}|${size}`;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      this.measure.font = `${weight} ${size}px "Instrument Sans Variable", system-ui, sans-serif`;
      w = this.measure.measureText(text).width;
      this.widthCache.set(key, w);
    }
    return w;
  }

  private xOf(t: number, domain: YearRange): number {
    const span = domain.to - domain.from + 1;
    return ((t - domain.from) / span) * this.width;
  }

  render(vm: ViewModel) {
    this.last = vm;
    this.width = this.plotWidth() || this.width;
    const place = vm.places[0] ?? null;
    const { domain } = vm;

    render(
      html`
        <div class="dock-label">
          <span class="eyebrow">Zaman çizelgesi</span>
          <h3 class="tl-name" data-testid="timeline-name" title=${place ? place.title : ''}>
            ${place ? place.title : 'Yer seçilmedi'}
          </h3>
          ${
            place
              ? html`<p class="tl-sub">
                  <span class="tl-count">${place.timeline.length} olay</span> · ${formatRange(domain)}
                </p>`
              : nothing
          }
        </div>
        ${this.plot(vm, place)}
      `,
      this.host,
    );
    // The very first pass runs before the plot has a width; settle on the real one right away.
    const w = this.plotWidth();
    if (w && Math.abs(w - this.width) > 2) {
      this.width = w;
      this.render(vm);
    }
  }

  private plot(vm: ViewModel, place: PlaceView | null): TemplateResult {
    const { domain, range } = vm;
    const w = this.width;
    const bandL = this.xOf(range.from, domain);
    const bandW = this.xOf(range.to + 1, domain) - bandL;
    const cursorX = this.xOf(vm.year + 0.5, domain);
    const ticks = axisTicks(domain.from, domain.to, w, 64);

    const items = place ? this.layoutEvents(place.timeline, domain) : [];
    const picked = items.find((it) => it.ev.id === this.store.state.selectedEventId) ?? null;

    return html`
      <div
        class="tl-plot"
        style=${styleMap({ height: `${TIMELINE_H}px` })}
        role="group"
        aria-label=${place ? `Zaman çizelgesi: ${place.title}` : 'Zaman çizelgesi: yer seçilmedi'}
      >
        <div
          class="tl-range"
          style=${styleMap({ left: `${bandL}px`, width: `${Math.max(2, bandW)}px` })}
          aria-hidden="true"
        ></div>
        <div class="tl-cursor" style=${styleMap({ left: `${cursorX}px` })} aria-hidden="true"></div>

        <div class="tl-ground" style=${styleMap({ top: `${BAND_TOP}px`, height: `${BAND_H}px` })}>
          ${(place?.resolution.sequence ?? []).map((s) => this.sovereigntySegment(s, domain))}
          ${ticks.map((t) => {
            const x = this.xOf(t.year, domain);
            return html`<span
              class=${clsx('tl-tick', t.major && 'is-major')}
              style=${styleMap({ left: `${x}px` })}
              aria-hidden="true"
              >${x <= w - EDGE_ROOM ? t.year : nothing}</span
            >`;
          })}
        </div>

        ${
          place
            ? html`
                ${items.map((it) => this.eventItem(it, vm))} ${picked ? this.tag(picked, items) : nothing}
                ${place.timeline.length === 0 ? this.empty(vm, place) : nothing}
              `
            : html`<p class="tl-empty">Haritadan bir yer seçin; o yerin olayları burada görünür.</p>`
        }
      </div>
    `;
  }

  private empty(vm: ViewModel, place: PlaceView): TemplateResult {
    const n = place.nearest;
    return html`<div class="tl-none">
      <span>Bu yer için bu dönemde kayıtlı olay yok.</span>
      ${
        n
          ? html`<span class="tl-near"
              >En yakın kayıt:
              <button type="button" class="link" @click=${() => this.store.selectEvent(n.id)}>${n.title}</button>
              (${n.dateLabel}) ·
              <button
                type="button"
                class="link"
                @click=${() => this.store.focusYear(n.year, vm.range.to - vm.range.from + 1)}
              >
                Aralığı oraya taşı
              </button></span
            >`
          : nothing
      }
    </div>`;
  }

  private sovereigntySegment(s: { id: string; from: number; to: number }, domain: YearRange): TemplateResult {
    const ent = this.data.entities.get(s.id);
    const lo = Math.max(s.from, domain.from);
    const hi = Math.min(s.to, domain.to);
    if (hi < lo) return html``;
    const x = this.xOf(lo, domain);
    const wpx = this.xOf(hi + 1, domain) - x;
    const name = ent?.name ?? s.id;
    const tint = ent?.tint ?? null;
    const years = s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`;
    return html`<i
      class="tl-seg"
      style=${styleMap({ left: `${x}px`, width: `${wpx}px`, background: tint === null ? 'var(--paper-3)' : `var(--tint-${tint})` })}
      @pointerenter=${(e: PointerEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        this.tip.show(
          html`<div class="tip-event">
            <strong>${name}</strong><span class="tip-meta">Bu noktanın egemeni: ${years}</span>
          </div>`,
          Math.min(Math.max(e.clientX, r.left), r.right),
          r.top,
          'above',
          'segment',
        );
      }}
      @pointerleave=${() => this.tip.hide('segment')}
    ></i>`;
  }

  private layoutEvents(events: HistoricalEvent[], domain: YearRange): Item[] {
    const w = this.width;
    // An event that began before the window is pinned to its left edge instead of being drawn off-plot.
    const xs = events.map((ev) => ({ ev, x: Math.min(w, Math.max(0, this.xOf(ev.start, domain))) }));
    const rows = stackDots(
      xs.map(({ ev, x }) => ({ id: ev.id, x })),
      ROWS,
      SPACING,
    );
    return xs.map(({ ev, x }) => ({ ev, x, row: rows.get(ev.id) ?? 0 }));
  }

  private eventItem(it: Item, vm: ViewModel): TemplateResult {
    const { ev, x, row } = it;
    const inRange = ev.end > vm.range.from && ev.start < vm.range.to + 1;
    const selected = this.store.state.selectedEventId === ev.id;
    const hovered = this.store.state.hoverEventId === ev.id;
    const cy = rowCentre(row);
    const spanPx = Math.max(0, this.xOf(ev.end, vm.domain) - x);
    return html`
      ${
        ev.range && spanPx > 10
          ? html`<div
              class=${clsx('tl-span', !inRange && 'is-context')}
              style=${styleMap({ left: `${x}px`, top: `${cy}px`, width: `${spanPx}px`, '--c': styleFor(ev.category).color })}
              aria-hidden="true"
            ></div>`
          : nothing
      }
      <button
        type="button"
        class=${clsx('tl-ev', !inRange && 'is-context', selected && 'is-selected', hovered && 'is-hover')}
        data-id=${ev.id}
        style=${styleMap({ left: `${x}px`, top: `${cy}px` })}
        aria-label=${`${ev.title}, ${ev.dateLabel}`}
        aria-pressed=${selected}
        @click=${() => this.store.selectEvent(selected ? null : ev.id)}
        @pointerenter=${(e: PointerEvent) => {
          if (e.pointerType !== 'touch') this.hover(ev, e.currentTarget as HTMLElement);
        }}
        @pointerleave=${() => this.unhover()}
        @focus=${(e: FocusEvent) => {
          // keyboard focus names the dot; the focus a tap leaves behind must not (the tap opens the event, whose name stays)
          const el = e.currentTarget as HTMLElement;
          if (el.matches(':focus-visible')) this.hover(ev, el);
        }}
        @blur=${() => this.unhover()}
      >
        ${dot(ev.category)}
      </button>
    `;
  }

  /**
   * The opened event keeps its name beside its dot. It sits where it covers the fewest other dots: to the
   * right of the dot in its own row if that is clear, else to the left, else in a neighbouring row. It
   * never takes pointer events from the dots beneath it.
   */
  private tag(picked: Item, items: Item[]): TemplateResult {
    const { ev, x, row } = picked;
    const lw = this.textWidth(ev.title, 600, 12.5) + this.textWidth(String(ev.year), 500, 11) + 26;
    const others = items.filter((o) => o !== picked);
    const covered = (left: number, top: number) =>
      others.filter((o) => {
        const cy = rowCentre(o.row);
        return o.x + 8 > left - 1 && o.x - 8 < left + lw + 1 && cy + 8 > top - 1 && cy - 8 < top + TAG_H + 1;
      }).length;
    const byDistance = [...Array(ROWS).keys()].sort((a, b) => Math.abs(a - row) - Math.abs(b - row) || a - b);
    let best: { left: number; top: number; left_of_dot: boolean; n: number } | null = null;
    for (const r of byDistance) {
      const top = Math.min(DOT_AREA - TAG_H, Math.max(0, rowCentre(r) - TAG_H / 2));
      for (const leftOfDot of [false, true]) {
        const left = leftOfDot ? x - 14 - lw : x + 14;
        if (left < 2 || left + lw > this.width - 2) continue; // would be cut off by the plot's edge
        const n = covered(left, top);
        if (!best || n < best.n) best = { left, top, left_of_dot: leftOfDot, n };
        if (n === 0) break;
      }
      if (best?.n === 0) break;
    }
    // A tag wider than either side of the dot can hold: keep it inside the plot anyway.
    const fallback = {
      left: Math.max(2, Math.min(this.width - lw - 2, x + 14)),
      top: Math.min(DOT_AREA - TAG_H, Math.max(0, rowCentre(row) - TAG_H / 2)),
      left_of_dot: false,
    };
    const at = best ?? fallback;
    return html`<div
      class=${clsx('tl-tag', at.left_of_dot && 'is-flipped')}
      style=${styleMap({ left: `${at.left}px`, top: `${at.top}px`, height: `${TAG_H}px` })}
      aria-hidden="true"
      data-testid="timeline-tag"
    >
      <span class="tl-tag-year">${ev.year}</span><span class="tl-tag-text">${ev.title}</span>
    </div>`;
  }

  private hover(ev: HistoricalEvent, el: HTMLElement) {
    this.store.hoverEvent(ev.id);
    const r = el.getBoundingClientRect();
    this.tip.show(eventTip(ev, this.data), r.left + r.width / 2, r.top, 'above', 'event');
  }

  private unhover() {
    this.store.hoverEvent(null);
    this.tip.hide('event');
  }
}

export function eventTip(ev: HistoricalEvent, data: AppData): TemplateResult {
  const cat = data.categories.find((c) => c.id === ev.category)?.label ?? ev.category;
  return html`<div class="tip-event">
    <span class="tip-kicker">${cat}</span>
    <strong>${ev.title}</strong>
    <span class="tip-meta">${ev.dateLabel} · ${ev.location.name}</span>
  </div>`;
}
