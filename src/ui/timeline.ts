import { html, nothing, render, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import { unsafeSVG as unsafeSvg } from 'lit-html/directives/unsafe-svg.js';
import type { AppData } from '../data/load';
import { MARKER_SIZE, styleFor } from '../domain/categories';
import { assignLanes } from '../domain/lanes';
import { axisTicks } from '../domain/time';
import type { HistoricalEvent, YearRange } from '../domain/types';
import type { PlaceView, ViewModel } from '../state/derive';
import type { Store } from '../state/store';
import { clsx, formatRange, shortName } from './format';
import { markerSvg } from './markerShapes';
import type { Tooltip } from './tooltip';

const MAX_LANES = 3;
/** Half the width of a four-digit year label, with a little air: ticks nearer the edge show no label. */
const EDGE_ROOM = 20;
const LANE_H = 26;
const LABEL_H = 22;
/** Distance of the axis from the top of the plot: three label lanes sit above it. The height is
 *  fixed on purpose: if the dock changed height when a place was selected, the map above it would
 *  resize and appear to move. */
const AXIS_FROM_TOP = 6 + MAX_LANES * LANE_H + 4;
const laneTopOf = (lane: number) => AXIS_FROM_TOP - 12 - lane * LANE_H - LABEL_H;

/**
 * The place timeline. It shows what happened *to the selected place*: events whose parties include
 * the polity (or its parents, or the region) that held that place. Distance is irrelevant. The
 * horizontal axis is the selected range plus context on both sides; events outside the range are
 * drawn faded so a one-year range still has neighbours to read.
 *
 * It draws the first selected place; comparison mode would draw one such plot (lane) per place.
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
      const w = this.host.clientWidth;
      if (w && Math.abs(w - this.width) > 2) {
        this.width = w;
        if (this.last) this.render(this.last);
      }
    }).observe(this.host);
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
    const { domain, range } = vm;
    this.width = this.host.clientWidth || this.width;
    const place = vm.places[0] ?? null;

    render(
      html`
        <div class="tl-head">
          <div class="tl-title">
            <span class="eyebrow">Zaman çizelgesi</span>
            <h3 class="tl-name" data-testid="timeline-name">${place ? place.title : 'Henüz bir yer seçilmedi'}</h3>
          </div>
          <p class="tl-sub">
            ${
              place
                ? html`<span class="tl-count">${place.timeline.length} olay</span> · ${formatRange(domain)}`
                : html`Haritadan bir yer seçin; o yerin olayları burada görünür.`
            }
          </p>
        </div>
        ${this.plot(vm, place, domain, range)}
      `,
      this.host,
    );
  }

  private plot(vm: ViewModel, place: PlaceView | null, domain: YearRange, range: YearRange): TemplateResult {
    const w = this.width;
    const ticks = axisTicks(domain.from, domain.to, w, 70);
    const bandL = this.xOf(range.from, domain);
    const bandW = this.xOf(range.to + 1, domain) - bandL;
    const cursorX = this.xOf(vm.year + 0.5, domain);

    const items = place ? this.layoutEvents(place.timeline, domain) : [];
    const sovereignty = place?.resolution.sequence ?? [];
    const plotH = AXIS_FROM_TOP + 44;

    return html`
      <div class="tl-plot" style=${styleMap({ height: `${plotH}px`, '--axis-y': `${AXIS_FROM_TOP}px` })}>
        <div class="tl-band" style=${styleMap({ left: `${bandL}px`, width: `${Math.max(2, bandW)}px` })}>
          <span class="tl-band-label">${formatRange(range)}</span>
        </div>
        <div class="tl-axis" aria-hidden="true"></div>
        ${ticks.map((t) => {
          const x = this.xOf(t.year, domain);
          // A year label is centred on its tick; one that would be cut by the plot's edge is left off (the tick stays).
          const clipped = x < EDGE_ROOM || x > w - EDGE_ROOM;
          return html`<div
            class=${clsx('tl-tick', t.major && 'is-major', clipped && 'is-edge')}
            style=${styleMap({ left: `${x}px` })}
            aria-hidden="true"
          >
            <span>${t.year}</span>
          </div>`;
        })}
        <div
          class="tl-cursor"
          style=${styleMap({ left: `${cursorX}px` })}
          aria-hidden="true"
          title="Haritadaki sınırların yılı"
        ></div>

        ${
          place
            ? html`
                ${items.map((it) => this.eventItem(it, vm))}
                ${sovereignty.map((s) => this.sovereigntySegment(s, domain))}
                ${place.timeline.length === 0 ? this.empty(vm, place) : nothing}
              `
            : html`<p class="tl-empty">Seçili yer yok</p>`
        }
      </div>
    `;
  }

  private empty(vm: ViewModel, place: PlaceView): TemplateResult {
    const n = place.nearest;
    return html`<div class="tl-none">
      <p>Bu yer için bu dönemde kayıtlı olay yok.</p>
      ${
        n
          ? html`<p class="tl-near">
              En yakın kayıt:
              <button type="button" class="link" @click=${() => this.store.selectEvent(n.id)}>${n.title}</button>
              (${n.dateLabel}).
              <button
                type="button"
                class="link"
                @click=${() => this.store.focusYear(n.year, vm.range.to - vm.range.from + 1)}
              >
                Aralığı oraya taşı
              </button>
            </p>`
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
    const label =
      this.textWidth(name, 600, 11) + 12 <= wpx
        ? name
        : this.textWidth(shortName(name), 600, 11) + 12 <= wpx
          ? shortName(name)
          : '';
    const tint = ent?.tint ?? null;
    return html`<div
      class="tl-seg"
      style=${styleMap({ left: `${x}px`, width: `${wpx}px`, background: tint === null ? 'var(--paper-3)' : `var(--tint-${tint})` })}
      title=${`${name}: ${s.from === s.to ? s.from : `${s.from}–${s.to}`}`}
    >
      ${label}
    </div>`;
  }

  private layoutEvents(events: HistoricalEvent[], domain: YearRange) {
    const w = this.width;
    const boxes = events.map((ev) => {
      // An event that began before the window is pinned to its left edge instead of being drawn off-plot.
      const x = Math.min(w, Math.max(0, this.xOf(ev.start, domain)));
      const label = ev.title;
      const lw = this.textWidth(label, 600, 12.5) + this.textWidth(String(ev.year), 500, 11) + 36;
      const flip = x + lw > w - 6; // label would run off the right edge: anchor it leftwards
      const left = Math.max(2, Math.min(w - lw - 2, flip ? x - lw + 14 : x - 7)); // keep the label inside the plot
      return { ev, x, lw, flip, left };
    });
    const lanes = assignLanes(
      boxes.map((b) => ({ id: b.ev.id, x: b.left, width: b.lw, priority: b.ev.importance * 1000 - b.ev.start })),
      MAX_LANES,
      8,
    );
    return boxes.map((b) => ({ ...b, lane: lanes.get(b.ev.id) ?? null }));
  }

  private eventItem(
    it: { ev: HistoricalEvent; x: number; lw: number; flip: boolean; left: number; lane: number | null },
    vm: ViewModel,
  ): TemplateResult {
    const { ev, x, lane, left, lw, flip } = it;
    const inRange = ev.end > vm.range.from && ev.start < vm.range.to + 1;
    const selected = this.store.state.selectedEventId === ev.id;
    const hovered = this.store.state.hoverEventId === ev.id;
    const style = styleFor(ev.category);
    const d = MARKER_SIZE[ev.importance] ?? 14;
    const spanPx = Math.max(0, this.xOf(ev.end, { from: vm.domain.from, to: vm.domain.to }) - x);
    const laneTop = lane === null ? null : laneTopOf(lane);
    return html`
      ${
        ev.range && spanPx > 8
          ? html`<div
              class=${clsx('tl-span', !inRange && 'is-context')}
              style=${styleMap({ left: `${x}px`, width: `${spanPx}px`, '--c': style.color })}
              aria-hidden="true"
            ></div>`
          : nothing
      }
      ${
        lane !== null
          ? html`<div
              class=${clsx('tl-stem', !inRange && 'is-context')}
              style=${styleMap({ left: `${x}px`, top: `${laneTop! + LABEL_H}px`, height: `${AXIS_FROM_TOP - (laneTop! + LABEL_H)}px` })}
              aria-hidden="true"
            ></div>`
          : nothing
      }
      <button
        type="button"
        class=${clsx('tl-ev', !inRange && 'is-context', selected && 'is-selected', hovered && 'is-hover')}
        data-id=${ev.id}
        data-importance=${ev.importance}
        style=${styleMap({ left: `${x}px`, top: `${AXIS_FROM_TOP}px`, '--d': `${d}px` })}
        aria-label=${`${ev.title}, ${ev.dateLabel}`}
        aria-pressed=${selected}
        @click=${() => this.store.selectEvent(selected ? null : ev.id)}
        @pointerenter=${(e: PointerEvent) => this.hover(ev, e.currentTarget as HTMLElement)}
        @pointerleave=${() => this.unhover()}
        @focus=${(e: FocusEvent) => this.hover(ev, e.currentTarget as HTMLElement)}
        @blur=${() => this.unhover()}
      >
        ${unsafeSvg(markerSvg(ev.category, ev.importance, { diameter: d }))}
      </button>
      ${
        lane !== null
          ? html`<button
              type="button"
              class=${clsx('tl-label', flip && 'is-flipped', !inRange && 'is-context', selected && 'is-selected', hovered && 'is-hover')}
              style=${styleMap({ left: `${left}px`, top: `${laneTop}px`, width: `${lw}px` })}
              data-id=${ev.id}
              tabindex="-1"
              aria-hidden="true"
              @click=${() => this.store.selectEvent(selected ? null : ev.id)}
              @pointerenter=${(e: PointerEvent) => this.hover(ev, e.currentTarget as HTMLElement)}
              @pointerleave=${() => this.unhover()}
            >
              <span class="tl-label-year">${ev.year}</span><span class="tl-label-text">${ev.title}</span>
            </button>`
          : nothing
      }
    `;
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
