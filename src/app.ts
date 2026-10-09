import { html, render } from 'lit-html';
import { loadData, type AppData } from './data/load';
import { MapView } from './map/mapView';
import { deriveView, type ViewModel } from './state/derive';
import { DEFAULT_STATE, Store, type AppState } from './state/store';
import { hashToPartialState, stateToHash } from './state/url';
import { InfoPanel } from './ui/infoPanel';
import { MapChrome } from './ui/mapChrome';
import { Ruler } from './ui/ruler';
import { Timeline, eventTip } from './ui/timeline';
import { Tooltip } from './ui/tooltip';

declare global {
  interface Window {
    /** Read-only handles for tests and debugging. */
    __ayni?: {
      map: MapView['map'];
      store: Store;
      data: AppData;
      view: () => ViewModel;
      visibleMarkerIds: () => string[];
    };
  }
}

const SHELL = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Aynı Zamanda, ana sayfa">
      <svg class="brand-mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M16 8.5V16l5.2 3.2" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="brand-name">Aynı Zamanda</span>
    </a>
    <p class="tagline">Aynı sırada, başka yerlerde ne oluyordu?</p>
    <p class="credits" id="credits"></p>
  </header>
  <main class="stage">
    <section class="map-wrap" aria-label="Harita">
      <div class="map" id="map" lang="tr"></div>
      <div class="map-chrome" id="map-chrome"></div>
      <div class="map-stats" id="map-stats" hidden></div>
      <div class="toast" id="toast" role="status" hidden></div>
    </section>
    <aside class="panel" aria-label="Bilgi paneli">
      <div class="panel-scroll" id="panel"></div>
    </aside>
  </main>
  <section class="dock" aria-label="Zaman">
    <div class="dock-ruler" id="dock-ruler"></div>
    <div class="dock-funnel" id="dock-funnel" aria-hidden="true"></div>
    <div class="dock-timeline" id="dock-timeline"></div>
  </section>
  <div class="loading" id="loading" role="status"><span class="loading-mark"></span><span id="loading-text">Yükleniyor…</span></div>
`;

export async function startApp(root: HTMLElement): Promise<void> {
  root.innerHTML = SHELL;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const loadingText = $('loading-text');

  let data: AppData;
  try {
    data = await loadData((label) => (loadingText.textContent = label));
  } catch (err) {
    loadingText.textContent = `Veri yüklenemedi: ${(err as Error).message}`;
    $('loading').classList.add('is-error');
    throw err;
  }

  /* ------------------------------------------------------------- state */
  // Canvas text measurement (timeline lanes, map labels) needs the real fonts.
  await Promise.all([
    document.fonts.load('600 12.5px "Instrument Sans Variable"'),
    document.fonts.load('500 16px "Newsreader Variable"'),
    document.fonts.load('italic 450 16px "Newsreader Variable"'),
  ]).catch(() => undefined);

  const store = new Store({ ...DEFAULT_STATE, ...hashToPartialState(location.hash, data.extent) }, data.extent);
  const tip = new Tooltip(root);

  /* ------------------------------------------------------- UI pieces */
  // The map is created last: its initial fit must see the final layout of the dock and panel.
  let mapView!: MapView;
  const chrome = new MapChrome($('map-chrome'), data, {
    zoomIn: () => mapView.map.zoomIn(),
    zoomOut: () => mapView.map.zoomOut(),
  });
  const panel = new InfoPanel($('panel'), store, data);
  const ruler = new Ruler($('dock-ruler'), store, data);
  const timeline = new Timeline($('dock-timeline'), store, data, tip);

  const credits = $('credits');
  render(
    html`Sınırlar:
      <a href=${data.sources.borders.url} target="_blank" rel="noopener noreferrer">Seshat Cliopatria</a>
      (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer"
        >${data.sources.borders.license}</a
      >, kırpılıp sadeleştirildi) · Kıyı:
      <a href=${data.sources.coast.url} target="_blank" rel="noopener noreferrer">Natural Earth</a> ·
      <a href="./NOTICE.txt" target="_blank" rel="noopener">Atıf ve lisanslar</a>`,
    credits,
  );

  /* ---------------------------------------------------------- toast */
  let toastTimer = 0;
  const toastEl = $('toast');
  function toast(message: string | null) {
    window.clearTimeout(toastTimer);
    if (!message) {
      toastEl.hidden = true;
      return;
    }
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2600);
  }

  /* ----------------------------------------------------- render loop */
  let vm = deriveView(store.state, data);
  let queued = false;
  let hashTimer = 0;

  function update() {
    queued = false;
    const state = store.state;
    vm = deriveView(state, data);
    const selectedPolity = vm.places[0]?.resolution.row?.id ?? null;

    // The map's content: time only. Selected place only changes the highlight.
    if (!mapView) return;
    mapView.setYear(vm.year);
    mapView.setEvents(vm.mapEvents, vm.year, vm.selectedEvent);
    mapView.setSelectedPolity(selectedPolity);
    mapView.setPlaces(state.places);
    mapView.setSelectedEvent(state.selectedEventId);
    mapView.setHoverEvent(state.hoverEventId);

    chrome.render(vm);
    panel.render(vm);
    ruler.render();
    timeline.render(vm);
    renderFunnel(vm);

    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => history.replaceState(null, '', stateToHash(state)), 200);
  }

  function renderFunnel(v: ViewModel) {
    const ext = data.extent;
    const extSpan = ext.to - ext.from + 1;
    const dSpan = v.domain.to - v.domain.from + 1;
    const pct = (y: number, from: number, span: number) => ((y - from) / span) * 100;
    const bl = pct(v.range.from, ext.from, extSpan);
    const br = pct(v.range.to + 1, ext.from, extSpan);
    const dl = pct(v.range.from, v.domain.from, dSpan);
    const dr = pct(v.range.to + 1, v.domain.from, dSpan);
    render(
      html`<svg viewBox="0 0 100 10" preserveAspectRatio="none" width="100%" height="100%">
        <polygon points=${`${bl},0 ${br},0 ${dr},10 ${dl},10`} class="funnel-fill" />
        <line x1=${bl} y1="0" x2=${dl} y2="10" class="funnel-edge" vector-effect="non-scaling-stroke" />
        <line x1=${br} y1="0" x2=${dr} y2="10" class="funnel-edge" vector-effect="non-scaling-stroke" />
      </svg>`,
      $('dock-funnel'),
    );
  }

  store.subscribe((state: AppState, prev: AppState) => {
    if (state.selectedEventId && state.selectedEventId !== prev.selectedEventId) {
      $('panel').scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (store.state.selectedEventId) store.selectEvent(null);
    else if (store.state.places.length) store.selectPlace(null);
  });

  // First paint of everything except the map, then the map itself.
  vm = deriveView(store.state, data);
  chrome.render(vm);
  panel.render(vm);
  ruler.render();
  timeline.render(vm);
  renderFunnel(vm);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  mapView = new MapView($('map'), data, {
    onPlaceClick: (p) => {
      toast(null);
      store.selectPlace(p);
    },
    onMarkerStats: ({ shown, total, thinned, offscreen }) => {
      const el = $('map-stats');
      el.hidden = total === 0;
      // Say honestly why some events are not drawn: zoom/collision thinning, or simply out of view.
      const hint =
        thinned > 0
          ? html`<span> · yakınlaştıkça artar</span>`
          : offscreen > 0
            ? html`<span> · kalanlar görünüm dışında</span>`
            : '';
      render(html`<b>${shown}</b> / ${total} olay haritada${hint}`, el);
    },
    onWaterClick: () => toast('Burası deniz. Bir kara parçasına tıklayın; harita yerinden oynamaz.'),
    onHoverPolity: (id, x, y) => {
      if (!id) return tip.hide();
      const ent = data.entities.get(id);
      tip.show(html`<div class="tip-polity">${ent?.name ?? id}</div>`, x, y, 'cursor');
    },
    onEventClick: (id) => store.selectEvent(store.state.selectedEventId === id ? null : id),
    onEventHover: (id, el) => {
      store.hoverEvent(id);
      const ev = id ? data.eventsById.get(id) : null;
      if (ev && el) {
        const r = el.getBoundingClientRect();
        tip.show(eventTip(ev, data), r.left + r.width / 2, r.top, 'above');
      } else {
        tip.hide();
      }
    },
  });

  update();
  loadingText.textContent = 'Harita çiziliyor…';
  await mapView.whenDrawn();
  $('loading').classList.add('is-done');
  window.setTimeout(() => $('loading').remove(), 400);

  window.__ayni = {
    map: mapView.map,
    store,
    data,
    view: () => vm,
    visibleMarkerIds: () => mapView.visibleMarkerIds(),
  };
}
