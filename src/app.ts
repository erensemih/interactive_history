import { html, render } from 'lit-html';
import { loadData, type AppData } from './data/load';
import { MapView } from './map/mapView';
import { deriveView, type ViewModel } from './state/derive';
import { DEFAULT_STATE, Store, type AppState } from './state/store';
import { hashToPartialState, parseCamera, stateToHash } from './state/url';
import { InfoPanel } from './ui/infoPanel';
import { MapChrome } from './ui/mapChrome';
import { formatRange } from './ui/format';
import { scrollBehavior } from './ui/motion';
import { Ruler } from './ui/ruler';
import { Timeline, eventTip } from './ui/timeline';
import { Tooltip } from './ui/tooltip';

declare global {
  interface Window {
    /** Read-only handles for tests and debugging (the end-to-end script drives the app through these). */
    __ayni?: {
      map: MapView['map'];
      store: Store;
      data: AppData;
      view: () => ViewModel;
      visibleMarkerIds: () => string[];
    };
  }
}

/** The licence notice: a file next to the page, or (in the single-file build) its place in the repository. */
const NOTICE_URL: string = import.meta.env.VITE_NOTICE_URL || './NOTICE.txt';

const SHELL = `
  <a class="skip" href="#dock-ruler">Zaman denetimine geç</a>
  <a class="skip" href="#panel">Bilgi paneline geç</a>
  <header class="topbar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M16 8.5V16l5.2 3.2" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="brand-name">Aynı Zamanda</span>
    </div>
    <p class="tagline">Aynı sırada, başka yerlerde ne oluyordu?</p>
    <p class="credits" id="credits"></p>
  </header>
  <div class="stage">
    <main class="map-wrap" aria-label="Harita">
      <div class="map" id="map" lang="tr"></div>
      <div class="map-chrome" id="map-chrome"></div>
      <div class="map-stats" id="map-stats" hidden></div>
      <div class="toast" id="toast" role="status" hidden></div>
    </main>
    <aside class="panel" aria-label="Bilgi paneli">
      <div class="panel-scroll" id="panel" tabindex="-1"></div>
    </aside>
  </div>
  <section class="dock" aria-label="Zaman">
    <div class="dock-ruler" id="dock-ruler" tabindex="-1"></div>
    <div class="dock-funnel" id="dock-funnel" aria-hidden="true"></div>
    <div class="dock-timeline" id="dock-timeline"></div>
  </section>
  <div class="sr-only" id="sr-status" role="status" aria-live="polite" aria-atomic="true"></div>
  <div class="loading" id="loading" role="status"><span class="loading-mark"></span><span id="loading-text">Yükleniyor…</span></div>
`;

export async function startApp(root: HTMLElement): Promise<void> {
  root.innerHTML = SHELL;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const loadingText = $('loading-text');

  /** Startup failures are shown on the veil, in Turkish, with a way to retry. */
  function fail(message: string, err: unknown): never {
    loadingText.textContent = message;
    $('loading').classList.add('is-error');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn';
    retry.textContent = 'Yeniden dene';
    retry.addEventListener('click', () => location.reload());
    $('loading').appendChild(retry);
    console.error(err);
    throw err;
  }

  let data: AppData;
  try {
    data = await loadData((label) => (loadingText.textContent = label));
  } catch (err) {
    fail(`Veri yüklenemedi: ${(err as Error).message}`, err);
  }

  /* ------------------------------------------------------------- state */
  // Canvas text measurement (timeline lanes, map labels) needs the real fonts.
  await Promise.all([
    document.fonts.load('600 12.5px "Instrument Sans Variable"'),
    document.fonts.load('500 16px "Newsreader Variable"'),
    document.fonts.load('italic 450 16px "Newsreader Variable"'),
  ]).catch(() => undefined);

  /** The state a link describes. Anything the data does not know (an event id that is gone) is dropped. */
  function stateFromHash(): AppState {
    const partial = hashToPartialState(location.hash, data.extent);
    if (partial.selectedEventId && !data.eventsById.has(partial.selectedEventId)) delete partial.selectedEventId;
    return { ...DEFAULT_STATE, ...partial };
  }

  const store = new Store(stateFromHash(), data.extent);
  const tip = new Tooltip(root);

  /* ------------------------------------------------------- UI pieces */
  // The map is created last: its initial fit must see the final layout of the dock and panel.
  let mapView!: MapView;
  // The camera goes into the link only once the user has moved the map themselves (or the link had one):
  // the automatic first framing is the same for everyone and does not belong in a shared address.
  let cameraTouched = parseCamera(location.hash) !== null;
  const chrome = new MapChrome($('map-chrome'), data, {
    zoomIn: () => {
      cameraTouched = true;
      mapView.map.zoomIn();
    },
    zoomOut: () => {
      cameraTouched = true;
      mapView.map.zoomOut();
    },
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
      <a href=${NOTICE_URL} target="_blank" rel="noopener noreferrer">Atıf ve lisanslar</a>`,
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

  /* ------------------------------------------- screen reader announcements */
  // One polite status line says what changed ("Seçili yer: …"), instead of the whole page being a live region.
  const status = $('sr-status');
  let announceTimer = 0;
  function announce(message: string, delay = 0) {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      status.textContent = message;
    }, delay);
  }
  const announced: { range: string; place: string; event: string | null } = { range: '', place: '', event: null };

  /* ----------------------------------------------------- render loop */
  let vm = deriveView(store.state, data);
  let vmState = store.state;
  let queued = false;
  let hashTimer = 0;
  let lastHash = location.hash;
  let hoverTimer = 0;
  let focusCardAfterUpdate = false;

  /** Keyboard or pointer? After a keyboard selection, focus follows the opened card. */
  let keyboardUser = false;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') keyboardUser = true;
    },
    true,
  );
  window.addEventListener('pointerdown', () => (keyboardUser = false), true);

  function update() {
    queued = false;
    const state = store.state;
    // The view model depends on range, cursor, places and the open event only (not on hover).
    if (
      state.range !== vmState.range ||
      state.cursor !== vmState.cursor ||
      state.places !== vmState.places ||
      state.selectedEventId !== vmState.selectedEventId
    ) {
      vm = deriveView(state, data);
      vmState = state;
    }

    if (!mapView) return;
    // The map's content: time only. The selected place only changes the highlight and the pin.
    mapView.setYear(vm.year);
    mapView.setEvents(vm.mapEvents, vm.year);
    mapView.setSelectedPolities(vm.places.map((p) => p.resolution.row?.id).filter((id): id is string => !!id));
    mapView.setPlaces(state.places);
    const open = vm.selectedEvent;
    mapView.setPreviewEvent(open && !vm.mapEvents.some((e) => e.id === open.id) ? open : null);
    mapView.setSelectedEvent(state.selectedEventId);
    mapView.setHoverEvent(state.hoverEventId);

    chrome.render(vm);
    panel.render(vm);
    ruler.render();
    timeline.render(vm);
    renderFunnel(vm);

    announceChanges(vm);
    if (focusCardAfterUpdate && open) {
      focusCardAfterUpdate = false;
      root.querySelector<HTMLElement>('[data-testid=event-title]')?.focus({ preventScroll: true });
    }
    scheduleHash();
    scheduleHoverCheck();
  }

  function announceChanges(v: ViewModel) {
    const open = v.selectedEvent;
    if ((open?.id ?? null) !== announced.event) {
      announced.event = open?.id ?? null;
      announce(open ? `Olay: ${open.title}, ${open.dateLabel}, ${open.location.name}` : 'Olay kartı kapatıldı');
      return;
    }
    const place = v.places[0];
    const placeKey = place ? `${place.title}|${v.year}` : '';
    if (placeKey !== announced.place) {
      announced.place = placeKey;
      announce(place ? `Seçili yer: ${place.title}, ${v.year}` : 'Yer seçimi kaldırıldı');
      return;
    }
    const rangeKey = formatRange(v.range);
    if (rangeKey !== announced.range) {
      const first = announced.range === '';
      announced.range = rangeKey;
      if (!first) announce(`Zaman aralığı ${rangeKey}. Haritada ${v.mapEvents.length} olay.`, 500);
    }
  }

  /** A hovered node that was removed never gets a pointerleave: clear a hover nothing is under any more. */
  function scheduleHoverCheck() {
    window.clearTimeout(hoverTimer);
    if (!store.state.hoverEventId) return;
    hoverTimer = window.setTimeout(() => {
      const id = store.state.hoverEventId;
      if (!id) return;
      const alive = [...root.querySelectorAll<HTMLElement>('[data-id]')].some(
        (el) => el.dataset.id === id && (el.matches(':hover') || el.matches(':focus')),
      );
      if (!alive) {
        store.hoverEvent(null);
        tip.hide('event');
      }
    }, 300);
  }

  function scheduleHash() {
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      let camera = null;
      if (cameraTouched) {
        const c = mapView.map.getCenter();
        camera = { lng: c.lng, lat: c.lat, zoom: mapView.map.getZoom() };
      }
      const next = stateToHash(store.state, camera);
      try {
        if (next !== location.hash) history.replaceState(null, '', next);
        lastHash = next;
      } catch {
        /* a sandboxed frame may refuse to touch the address: the link is a convenience, not a requirement */
      }
    }, 250);
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
      focusCardAfterUpdate = keyboardUser;
      if (window.matchMedia('(max-width: 900px)').matches) {
        // single-column layout: the reading panel is below the map, bring the card into view
        $('panel').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      } else {
        $('panel').scrollTo({ top: 0, behavior: scrollBehavior() });
      }
    }
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Text fields use Esc to undo their own edit.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    tip.hide(); // hover content can always be dismissed
    if (store.state.selectedEventId) store.selectEvent(null);
    else if (store.state.places.length) store.selectPlace(null);
  });

  // A link pasted into this tab (or an edited address) replaces the view; the map's own camera is not touched.
  // (history.replaceState, which this app uses to keep the address current, does not fire this event.)
  window.addEventListener('hashchange', () => {
    if (location.hash === lastHash || !new URLSearchParams(location.hash.slice(1)).has('t')) return;
    lastHash = location.hash;
    store.replace(stateFromHash());
  });

  // Skip links move focus without touching the address.
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a.skip')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      root.querySelector<HTMLElement>(link.getAttribute('href')!)?.focus();
    });
  }

  // First paint of everything except the map, then the map itself.
  vm = deriveView(store.state, data);
  vmState = store.state;
  chrome.render(vm);
  panel.render(vm);
  ruler.render();
  timeline.render(vm);
  renderFunnel(vm);
  announceChanges(vm);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const initialView = parseCamera(location.hash);
  try {
    mapView = new MapView(
      $('map'),
      data,
      {
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
          if (!id) return tip.hide('polity');
          const ent = data.entities.get(id);
          tip.show(html`<div class="tip-polity">${ent?.name ?? id}</div>`, x, y, 'cursor', 'polity');
        },
        onEventClick: (id) => store.selectEvent(store.state.selectedEventId === id ? null : id),
        onEventHover: (id, el) => {
          store.hoverEvent(id);
          const ev = id ? data.eventsById.get(id) : null;
          if (ev && el) {
            const r = el.getBoundingClientRect();
            tip.show(eventTip(ev, data), r.left + r.width / 2, r.top, 'above', 'event');
          } else {
            tip.hide('event');
          }
        },
      },
      initialView,
    );
  } catch (err) {
    fail('Harita başlatılamadı. Tarayıcınızda WebGL kapalı ya da desteklenmiyor olabilir.', err);
  }

  mapView.map.on('movestart', (e) => {
    if (e.originalEvent) cameraTouched = true; // the user's own drag, wheel, pinch or keys
  });
  mapView.map.on('moveend', scheduleHash);
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
