import type { Map as MLMap } from 'maplibre-gl';

const DURATION = 320;
const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** The map's own controls that hug the panel's edge and must travel with it while it opens or closes. */
const EDGE_CONTROLS = '.map-zoom, .map-stats';

/**
 * The panel is wider while the chat is open (a long narration reads better on a longer line). The width
 * changes exactly once, in one smooth movement, and the map never moves under the reader's eyes:
 *
 *  - Opening: the panel slides out over the map, its content already at its final width and glued to the
 *    right edge, so nothing inside it reflows. Only when it has arrived is the layout switched (to a panel
 *    of the same width) and the map resized, once, with its left edge held fixed.
 *  - Closing: the layout is switched first (the map grows, left edge held fixed, under a panel that still
 *    covers its old width), then the panel slides back and uncovers it.
 *
 * Either way the part of the map the reader can see keeps its place, and the controls on the map's right
 * edge ride along with the panel's edge instead of jumping at the end.
 */
export class PanelWidth {
  private wide = false;
  private running: Animation[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly panel: HTMLElement,
    private readonly content: HTMLElement,
    private readonly map: () => MLMap | undefined,
  ) {}

  /** Call before the panel's content is rendered, so the first frame already has the right shape. */
  sync(chatOpen: boolean) {
    if (chatOpen === this.wide) return;
    this.settle();
    this.wide = chatOpen;
    const desktop = window.matchMedia('(min-width: 901px)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = this.panel.offsetWidth;
    const to = this.widthIn(chatOpen);
    const delta = to - from; // positive when the panel grows
    if (!desktop || calm || Math.abs(delta) < 2 || !this.panel.isConnected) {
      this.commit(chatOpen);
      return;
    }
    // The content takes its final width at once and stays glued to the right edge: it never reflows.
    this.hold(to);
    if (chatOpen) {
      this.slide(0, -delta, () => {
        this.commit(true);
        this.release();
      });
    } else {
      this.commit(false);
      this.slide(delta, 0, () => this.release()); // delta is negative here: the panel still covers its old width
    }
  }

  /** Moves the panel's left edge (its margin) and the edge controls from `fromPx` to `toPx`. */
  private slide(fromPx: number, toPx: number, done: () => void) {
    const options: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: 'both' };
    const anims = [
      this.panel.animate([{ marginLeft: `${fromPx}px` }, { marginLeft: `${toPx}px` }], options),
      ...[...this.root.querySelectorAll<HTMLElement>(EDGE_CONTROLS)].map((el) =>
        el.animate([{ transform: `translateX(${fromPx}px)` }, { transform: `translateX(${toPx}px)` }], options),
      ),
    ];
    this.running = anims;
    anims[0]!.onfinish = () => {
      this.running = [];
      for (const a of anims) a.cancel();
      done();
    };
  }

  /** Ends any transition in flight at once, in the state it was heading to. */
  private settle() {
    if (!this.running.length) return;
    this.running[0]!.onfinish = null;
    for (const a of this.running) a.cancel();
    this.running = [];
    this.commit(this.wide);
    this.release();
  }

  /** The width the panel has in the given mode, measured without anything being drawn in between. */
  private widthIn(chatOpen: boolean): number {
    const had = this.root.classList.contains('is-chat');
    this.root.classList.toggle('is-chat', chatOpen);
    const width = this.panel.offsetWidth;
    this.root.classList.toggle('is-chat', had);
    return width;
  }

  /** Switches the layout and resizes the map once, its left edge held where it was. */
  private commit(chatOpen: boolean) {
    const map = this.map();
    const canvas = map?.getCanvas();
    const oldW = canvas?.clientWidth ?? 0;
    const oldH = canvas?.clientHeight ?? 0;
    this.root.classList.toggle('is-chat', chatOpen);
    if (!map || !canvas || !oldW) return;
    const container = map.getContainer();
    const newW = container.clientWidth; // reading it forces the new layout
    const newH = container.clientHeight;
    if (newW === oldW && newH === oldH) return;
    // What lies at the middle of the new size, measured in the old frame, is the centre that keeps the left edge in place.
    const centre = map.unproject([newW / 2, newH / 2]);
    map.resize();
    map.jumpTo({ center: centre });
    map.redraw();
  }

  /** While moving, the panel clips and its content is fixed to its final width, glued to the right. */
  private hold(width: number) {
    const p = this.panel.style;
    p.overflow = 'hidden';
    p.position = 'relative';
    p.zIndex = '7';
    const c = this.content.style;
    c.position = 'absolute';
    c.top = '0';
    c.right = '0';
    c.bottom = '0';
    c.width = `${width}px`;
  }

  private release() {
    const p = this.panel.style;
    p.overflow = '';
    p.position = '';
    p.zIndex = '';
    p.marginLeft = '';
    const c = this.content.style;
    c.position = '';
    c.top = '';
    c.right = '';
    c.bottom = '';
    c.width = '';
  }
}
