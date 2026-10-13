import { html, render } from 'lit-html';
import { contextEvent, contextFromView, type AiContext } from './ai/context';
import { Director } from './ai/director';
import { describeDrawing, frameTargetOf, resolveDrawing } from './ai/drawing';
import { errorCopy } from './ai/errorCopy';
import { createMockProvider } from './ai/mockProvider';
import { createMockScripts } from './ai/mockScripts';
import { openPermissionsPanel } from './ai/permissions';
import { Presentation } from './ai/presentation';
import { eventRequest, NARRATION_REQUEST, WORLD_NARRATION_REQUEST } from './ai/prompt';
import { createSampleProvider } from './ai/sampleProvider';
import { AiSession, type AssistantItem } from './ai/session';
import { readTier, writeTier } from './ai/settings';
import { appEventsSource } from './ai/sources';
import type { Drawing } from './ai/types';
import { loadData, type AppData } from './data/load';
import { CameraWatch, type Camera } from './domain/camera';
import type { HistoricalEvent } from './domain/types';
import type { Narrator } from './map/markers';
import { MapView } from './map/mapView';
import { deriveView, type ViewModel } from './state/derive';
import { DEFAULT_STATE, Store, type AppState } from './state/store';
import { hashToPartialState, parseCamera, stateToHash } from './state/url';
import { AskBox } from './ui/ask/askBox';
import { FollowPrompt } from './ui/followPrompt';
import { formatRange } from './ui/format';
import { InfoCard } from './ui/infoCard';
import { MapChrome, MapHead } from './ui/mapChrome';
import { ReadView } from './ui/read/readView';
import { Ruler } from './ui/ruler';
import { Timeline, eventTip } from './ui/timeline';
import { Tooltip } from './ui/tooltip';
import { WatchView } from './ui/watch/watchView';

declare global {
  interface Window {
    /** Read-only handles for tests and debugging (the end-to-end script drives the app through these). */
    __ayni?: {
      map: MapView['map'];
      store: Store;
      data: AppData;
      view: () => ViewModel;
      visibleMarkerIds: () => string[];
      /** The borders of the shown year are on the map (they are fetched in windows of years: see MapView). */
      bordersReady: () => boolean;
      /** The reading companion (tests read what it has drawn and said; nothing writes through this). */
      ai: { session: AiSession; director: Director; presentation: Presentation };
    };
  }
}

/** The licence notice: a file next to the page, or (in the single-file build) its place in the repository. */
const NOTICE_URL: string = import.meta.env.VITE_NOTICE_URL || './NOTICE.txt';

const SHELL = `
  <a class="skip" href="#dock-ruler">Zaman denetimine geç</a>
  <a class="skip" href="#panel">Bilgi kartına geç</a>
  <header class="topbar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M16 8.5V16l5.2 3.2" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="brand-name">Aynı Zamanda</span>
    </div>
    <p class="tagline">Aynı sırada, başka yerlerde ne oluyordu?</p>
    <div class="map-head" id="map-head"></div>
    <p class="credits" id="credits"></p>
  </header>
  <div class="stage" id="stage" data-view="none" data-read="">
    <main class="map-col" aria-label="Harita">
      <div class="map-wrap" role="region" aria-label="Harita alanı">
        <div class="map" id="map" lang="tr"></div>
        <div class="map-chrome" id="map-chrome"></div>
        <div class="map-stats" id="map-stats" data-avoid hidden></div>
        <div class="toast" id="toast" role="status" hidden></div>
        <div id="follow-host"></div>
        <button type="button" class="mini-expand" id="mini-expand" data-testid="mini-expand" aria-label="Haritayı büyüt" title="Haritayı büyüt"></button>
      </div>
    </main>
    <aside class="card-host" id="card-host" aria-label="Bilgi kartı" hidden>
      <div class="card-scroll" id="panel" tabindex="-1" data-avoid></div>
    </aside>
    <div class="read" id="read" data-avoid></div>
    <div class="bottom" id="bottom"></div>
    <div class="foot-guard" id="foot-guard" data-avoid aria-hidden="true"></div>
  </div>
  <section class="dock" aria-label="Zaman">
    <div class="dock-ruler" id="dock-ruler" tabindex="-1"></div>
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
    return { ...DEFAULT_STATE, range: data.open, ...partial };
  }

  const store = new Store(stateFromHash(), data.extent);
  // (inside the map's landmark: a hint that floats over the page belongs to something on it)
  const tip = new Tooltip(root.querySelector<HTMLElement>('main') ?? root);

  /* ------------------------------------------------------- UI pieces */
  // The map is created last: its initial fit must see the final layout of the dock and panel.
  let mapView!: MapView;
  // The camera goes into the link only once the user has moved the map themselves (or the link had one):
  // the automatic first framing is the same for everyone and does not belong in a shared address.
  let cameraTouched = parseCamera(location.hash) !== null;
  // The +/− buttons move the map without a pointer or key event of the map's own: say so, so the move counts as the reader's
  // (and forget it if the map did not move after all, at its widest or closest, so it cannot be taken for a later move's).
  let readerMove = false;
  let readerMoveTimer = 0;
  function markReaderMove() {
    readerMove = true;
    window.clearTimeout(readerMoveTimer);
    readerMoveTimer = window.setTimeout(() => (readerMove = false), 1500);
  }
  /** Where the page itself last left the camera (a step brought into view, an event revealed, a resize). */
  const watch = new CameraWatch();
  const cameraNow = (): Camera => {
    const c = mapView.map.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: mapView.map.getZoom() };
  };
  const head = new MapHead($('map-head'));
  new MapChrome($('map-chrome'), data, {
    zoomIn: () => {
      cameraTouched = true;
      markReaderMove();
      mapView.map.zoomIn();
    },
    zoomOut: () => {
      cameraTouched = true;
      markReaderMove();
      mapView.map.zoomOut();
    },
  });

  /* ------------------------------------------------ reading companion (AI) */
  // The model is the reader's own Claude (the artifact runtime's `sample`); where there is none, a scripted
  // stand-in answers and the page says so. Nothing is asked of either until the first question.
  const provider = createSampleProvider().then((p) => p ?? createMockProvider(createMockScripts(data)));
  const session = new AiSession({
    provider,
    data,
    sources: [appEventsSource(data)],
    tier: readTier(),
    // what the model is told is on the map: what the reader can see, which is nothing of ours once the answer is closed
    drawing: () => (presentation.narrating ? director.drawing : null),
  });
  const director: Director = new Director(session, { frame: (drawing) => frameDrawing(drawing) });
  /** Watch and Read: two ways to follow an answer, over the one step the director is on. */
  const presentation: Presentation = new Presentation(session, director);
  /** What the reader is looking at, as the model will be told: set by every render. */
  let liveContext: AiContext = { range: store.state.range, year: 0, places: [], event: null };

  const eventTitle = (id: string) => data.eventsById.get(id)?.title ?? id;
  const describe = (drawing: Drawing) => describeDrawing(drawing, (id) => session.resolver.nameOf(id), eventTitle);

  /** The reading panel is only ever full screen on a phone: there is no room beside the map. */
  const narrowScreen = window.matchMedia('(max-width: 900px)');
  /** Read as it is on screen: beside the map or full screen (with the map shrunk into a corner). */
  const readMode = (): 'side' | 'full' | null =>
    presentation.shown && presentation.view === 'read' ? (narrowScreen.matches ? 'full' : presentation.readMode) : null;
  const miniMap = () => readMode() === 'full';

  /**
   * Brings what a step puts on the map into view, at the year that step shows (the camera follows the narration).
   * When the drawing is already framed the camera stays, and that is where the reader's moves are measured from.
   */
  function frameDrawing(drawing: Drawing) {
    if (!mapView || !presentation.narrating) return; // with the answer closed nothing of the AI's is on the map to bring into view
    const year = director.year ?? vm.year;
    const target = frameTargetOf(resolveDrawing(drawing, session.resolver, year), session.resolver, year);
    if (target && mapView.frameTarget(target)) return; // moving: the reference is taken when the move ends
    watch.settle(cameraNow());
  }

  /** The info card steps aside when the reader asks something (the selection stays: the question is about it). */
  let cardTucked = false;
  /** The card was a tab when an event was opened over it. */
  let tuckedBeforeEvent = false;
  let introOpen = true;
  const tuck = () => {
    if (cardTucked) return;
    cardTucked = true;
    store.refresh();
  };

  /** One question at a time, about whatever is open; an open event card is closed once it is in the conversation. */
  function ask(text: string) {
    const event = liveContext.event;
    tuck();
    presentation.show();
    void session.send({ text, mode: 'qa', event }, liveContext);
    if (event) store.selectEvent(null);
  }
  function narrate() {
    tuck();
    presentation.show();
    const context = { ...liveContext, event: null };
    const text = context.places.length ? NARRATION_REQUEST : WORLD_NARRATION_REQUEST;
    void session.send({ text, mode: 'narration' }, context);
  }
  function askAboutEvent(ev: HistoricalEvent) {
    tuck();
    presentation.show();
    store.selectEvent(null);
    void session.send(
      { text: eventRequest(ev), mode: 'qa', event: contextEvent(ev, data) },
      { ...liveContext, event: null },
    );
  }

  const askBox = new AskBox({
    session,
    director,
    presentation,
    data,
    context: () => liveContext,
    actions: {
      send: ask,
      narrate,
      stop: () => session.stop(),
      newChat: () => session.newChat(),
      setFollowing: (on) => director.setFollowing(on),
      setTier: (tier) => {
        session.setTier(tier);
        writeTier(tier);
      },
      openPermissions: () => void openPermissionsPanel(),
      dropEvent: () => store.selectEvent(null),
      toggleRead: () =>
        presentation.shown && presentation.view === 'read' ? presentation.closeRead() : presentation.openRead(),
    },
  });
  /**
   * The name of an event in a caption or a text was clicked: the same as clicking that event on the timeline (it opens
   * its card and, if it lies out of sight, the map makes room for it; a second click closes it again).
   */
  function openEvent(id: string) {
    if (!data.eventsById.has(id)) return;
    store.selectEvent(store.state.selectedEventId === id ? null : id);
  }
  const watchView = new WatchView({
    session,
    presentation,
    actions: {
      stop: () => session.stop(),
      retry: () => void session.retry(),
      openPermissions: () => void openPermissionsPanel(),
      read: () => presentation.openRead(),
      close: () => presentation.hide(),
      openEvent,
    },
  });
  const readView = new ReadView({
    session,
    director,
    presentation,
    data,
    context: () => liveContext,
    canResize: () => !narrowScreen.matches,
    actions: {
      stop: () => session.stop(),
      retry: () => void session.retry(),
      selectStep: (itemId, n) => {
        director.activate(itemId, n);
        announceStep(itemId, n);
      },
      readStep: (itemId, n) => director.activate(itemId, n),
      openPermissions: () => void openPermissionsPanel(),
      watch: () => presentation.closeRead(),
      close: () => presentation.closeRead(),
      toggleSize: () => presentation.setReadMode(presentation.readMode === 'full' ? 'side' : 'full'),
      openEvent,
    },
  });
  $('bottom').append(watchView.element, askBox.element);
  $('read').append(readView.element);
  /** The small question over the map, after the reader has taken the map a long way while it was following. */
  const followPrompt = new FollowPrompt($('follow-host'), { director, openSettings: () => askBox.openSettings() });
  /** Pointing at a step is announced with what it puts on the map (reading on is not: that would be noise). */
  function announceStep(itemId: string, n: number) {
    const item = session.find(itemId);
    if (item?.kind !== 'assistant') return;
    const title = item.plan.titleOf(n);
    const drawn = director.drawing ? describe(director.drawing) : '';
    announce(`${title ? `Adım ${n}: ${title}. ` : `Adım ${n}. `}${drawn ? `Haritada: ${drawn}.` : ''}`);
  }
  const card = new InfoCard($('panel'), store, data, {
    narrate,
    narrateWorld: narrate,
    ask: () => askBox.focus(),
    askAboutEvent,
    busy: () => session.busy,
    untuck: () => {
      cardTucked = false;
      store.refresh();
    },
  });
  const ruler = new Ruler($('dock-ruler'), store, data, { goStep: (n) => presentation.go(n) });
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
  /** The year the AI asked for when `vm` was derived. */
  let vmAiYear: number | null = null;
  let drawnDrawing: unknown = null;
  let wasNarrating = false;
  /** Who narrates the map now: the AI, else the selected place, else nobody. */
  let narratorNow: Narrator | null = null;
  /** The map is a small window in a corner (the full-screen reader): where the camera was, if it must come back to it. */
  let wasMini = false;
  let miniSaved: Camera | null = null;
  let drawnYear = NaN;
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

  const stage = $('stage');
  let lastReadMode: 'side' | 'full' | null = null;
  // The small window's way back to the whole map, and the overlays that change what the map has room for: the
  // labels are placed around them, and the cards keep clear of the foot of the stage.
  $('mini-expand').innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5L7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  $('mini-expand').addEventListener('click', () => presentation.closeRead());
  /**
   * The foot of the stage (the caption and the question box) is what the camera keeps the drawing clear of, and what
   * the cards keep clear of. A caption is short and has a fixed height whatever the answer, so this is just its size.
   */
  function syncFoot() {
    const foot = $('bottom').offsetHeight + 12;
    stage.style.setProperty('--foot-h', `${foot}px`);
    stage.style.setProperty('--guard-h', `${foot}px`);
  }
  const overlaysObserver = new ResizeObserver(() => {
    syncFoot();
    mapView?.overlaysChanged();
  });
  for (const id of ['stage', 'bottom', 'card-host', 'read', 'foot-guard']) overlaysObserver.observe($(id));
  /**
   * The stage tells the style sheet what is on it: which view, and whether the reader is beside the map or over
   * it. The map itself stays the whole stage, except in the full-screen reader, where it is a small window in a corner.
   */
  function syncStage() {
    const mode = readMode();
    if (mode !== lastReadMode) {
      const was = lastReadMode;
      lastReadMode = mode;
      // The reader beside the map covers part of it: the step is brought into view in what is left (and back again).
      if (mode !== 'full' && was !== 'full') {
        window.setTimeout(() => {
          if (presentation.narrating && director.following && director.drawing) frameDrawing(director.drawing);
        }, 260);
      }
    }
    stage.dataset.view = presentation.shown ? presentation.view : 'none';
    stage.dataset.read = mode ?? '';
    stage.dataset.narrating = String(presentation.narrating);
    const read = $('read');
    read.hidden = mode === null;
    read.toggleAttribute('data-avoid', mode === 'side'); // beside the map it covers part of it; over the map it is the map's frame
    const mini = mode === 'full';
    if (mini !== wasMini) {
      wasMini = mini;
      onMiniChange(mini);
    }
  }

  /**
   * The map became a small window (or the whole stage again): once it has its new size, the step on screen is brought
   * into view in it. Where the camera had been left to the reader (Harita takibi off), leaving the window puts the
   * camera back where the reader had it.
   */
  function onMiniChange(mini: boolean) {
    if (!mapView) return;
    mapView.setCompact(mini);
    if (mini && !director.following) miniSaved = cameraNow();
    let done = false;
    const settled = () => {
      if (done) return;
      done = true;
      if (!presentation.narrating || !director.drawing) return;
      if (mini || director.following) frameDrawing(director.drawing);
      else if (miniSaved) mapView.map.jumpTo({ center: [miniSaved.lng, miniSaved.lat], zoom: miniSaved.zoom });
      if (!mini) miniSaved = null;
    };
    mapView.map.once('resize', () => window.setTimeout(settled, 30));
    window.setTimeout(settled, 400); // the map did not need to change size
  }

  /** The steps of the answer on screen, for the timeline: each at the year its scene shows. */
  function stepMarks() {
    if (!presentation.narrating || !presentation.stepped) return [];
    const active = presentation.step?.n ?? null;
    return presentation.steps.flatMap((s) =>
      s.year === null ? [] : [{ n: s.n, year: s.year, title: s.title, active: s.n === active }],
    );
  }

  function update() {
    queued = false;
    const state = store.state;
    // The AI's year counts only while its answer is on screen; it overlays the reader's own cursor.
    const narrating = presentation.narrating;
    const aiYear = narrating ? director.year : null;
    // The view model depends on range, cursor, places and the open event only (not on hover).
    if (
      state.range !== vmState.range ||
      state.cursor !== vmState.cursor ||
      state.places !== vmState.places ||
      state.selectedEventId !== vmState.selectedEventId ||
      aiYear !== vmAiYear
    ) {
      vm = deriveView(state, data, aiYear);
      vmState = state;
      vmAiYear = aiYear;
      liveContext = contextFromView(vm, data);
      session.syncContext(liveContext);
    }

    if (!mapView) return;
    // The map's content: time only. The selected place only changes the highlight and the pin.
    mapView.setYear(vm.year);
    mapView.setEvents(vm.mapEvents, vm.year);
    mapView.setSelectedPolities(
      vm.places.map((p) => p.resolution.row?.id).filter((id): id is string => !!id),
      vm.places.map((p) => p.occupation?.id).filter((id): id is string => !!id),
    );
    mapView.setPlaces(state.places);
    const open = vm.selectedEvent;
    mapView.setSelectedEvent(open);
    mapView.setHoverEvent(state.hoverEventId);
    revealIfNew(open);

    // The map has one narrator at a time: the AI while its answer is on screen, else the selected place. With one
    // the globally important events leave the map (they stay on the timeline) and only the opened event and the ones
    // the AI talks about are drawn; with nobody selected and nothing asked, they are all there.
    narratorNow = narrating ? 'ai' : vm.places.length > 0 ? 'place' : null;
    mapView.setNarrator(narratorNow);
    // The answer comes back (the reader opened it again): its step's drawing returns to the map, and the camera
    // follows it.
    if (narrating && !wasNarrating && director.following && director.drawing) {
      window.setTimeout(() => {
        if (presentation.narrating && director.following && director.drawing) frameDrawing(director.drawing);
      }, 120);
    }
    wasNarrating = narrating;
    // What the AI has drawn is shown while its answer is on screen, for the year shown.
    const drawing = narrating ? director.drawing : null;
    if (drawing !== drawnDrawing || vm.year !== drawnYear) {
      drawnDrawing = drawing;
      drawnYear = vm.year;
      mapView.setAiDrawing(
        drawing ? resolveDrawing(drawing, session.resolver, vm.year) : null,
        drawing ? describe(drawing) : '',
      );
    }

    head.render(vm);
    syncStage();
    syncFoot();
    followPrompt.update(narrating && !miniMap());
    card.render(vm, { tucked: cardTucked, introOpen, closeIntro: () => ((introOpen = false), store.refresh()) });
    askBox.update();
    watchView.update();
    readView.update();
    ruler.render(vm.year, stepMarks());
    timeline.render(vm);

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
      // (with somebody narrating the world's events are off the map, so there is nothing to count there)
      if (!first)
        announce(
          narratorNow
            ? `Zaman aralığı ${rangeKey}.`
            : `Zaman aralığı ${rangeKey}. Haritada ${v.mapEvents.length} olay.`,
          500,
        );
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
      // The address was changed from outside since we last wrote it (a pasted link): its hashchange is on
      // its way and will replace the state. Writing now would overwrite the link before it was read.
      if (location.hash !== lastHash) return;
      let camera = null;
      if (cameraTouched) {
        const c = mapView.map.getCenter();
        camera = { lng: c.lng, lat: c.lat, zoom: mapView.map.getZoom() };
      }
      const next = stateToHash(store.state, camera);
      try {
        if (next !== location.hash) history.replaceState(null, '', next);
        lastHash = location.hash; // as the browser spells it, so the comparison above stays honest
      } catch {
        /* a sandboxed frame may refuse to touch the address: the link is a convenience, not a requirement */
      }
    }, 250);
  }

  /**
   * An event opened from the timeline, the list or a link is brought into view if it is off-screen (the
   * map zooms out just far enough, smoothly). One opened by clicking its own marker is already in sight,
   * so the map stays exactly where it is.
   */
  let revealed: string | null = store.state.selectedEventId;
  let skipReveal = false;
  function revealIfNew(open: HistoricalEvent | null) {
    const id = open?.id ?? null;
    if (id === revealed) return;
    revealed = id;
    const skip = skipReveal;
    skipReveal = false;
    if (open && !skip) mapView.revealEvent(open);
  }

  store.subscribe((state: AppState, prev: AppState) => {
    // Any change of range or cursor is the reader's own (the AI's year is an overlay, never written here).
    if (state.range !== prev.range || state.cursor !== prev.cursor) director.userChangedTime();
    if (state.selectedEventId && state.selectedEventId !== prev.selectedEventId) {
      focusCardAfterUpdate = keyboardUser;
      $('panel').scrollTo({ top: 0, behavior: 'instant' });
    }
    // The card steps aside when the reader asks; choosing something to read brings it back. An event opened over a
    // tucked card goes away again to where it was when it is closed.
    const eventOpened = !!state.selectedEventId && state.selectedEventId !== prev.selectedEventId;
    const eventClosed = !state.selectedEventId && !!prev.selectedEventId;
    if (eventOpened && !prev.selectedEventId) tuckedBeforeEvent = cardTucked;
    if ((state.places.length && state.places !== prev.places) || eventOpened) cardTucked = false;
    else if (eventClosed && tuckedBeforeEvent && presentation.shown) cardTucked = true;
    if (!state.selectedEventId) tuckedBeforeEvent = false;
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Text fields use Esc to undo their own edit.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    tip.hide(); // hover content can always be dismissed
    // The topmost thing goes first: the open event, then the reader (full screen, then the panel), then the
    // answer over the map, then the place.
    if (store.state.selectedEventId) store.selectEvent(null);
    else if (readMode() === 'full' && !narrowScreen.matches) presentation.setReadMode('side');
    else if (readMode() !== null) presentation.closeRead();
    else if (presentation.shown) presentation.hide();
    else if (store.state.places.length) store.selectPlace(null);
  });

  // Watch is stepped with the arrow keys. They are heard before the map hears them (a map that has focus would
  // pan), and not at all where they already mean something: a text field, a slider, a menu of choices.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!presentation.shown || presentation.view !== 'watch' || !presentation.stepped) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role=slider]')) return;
      if (e.key === 'ArrowRight') presentation.next();
      else if (e.key === 'ArrowLeft') presentation.prev();
      else if (e.key === 'Home') presentation.first();
      else if (e.key === 'End') presentation.last();
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // A link pasted into this tab (or an edited address) replaces the view; the map's own camera is not touched.
  // (history.replaceState, which this app uses to keep the address current, does not fire this event.)
  window.addEventListener('hashchange', () => {
    if (location.hash === lastHash) return; // our own write
    lastHash = location.hash;
    if (new URLSearchParams(location.hash.slice(1)).has('t')) store.replace(stateFromHash());
  });

  // Skip links move focus without touching the address.
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a.skip')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      root.querySelector<HTMLElement>(link.getAttribute('href')!)?.focus();
    });
  }

  // The conversation and the director change what the map and the panel show.
  let lastBusy = session.busy;
  let lastStatus: string | null = null;
  session.subscribe(() => {
    askBox.update();
    watchView.update();
    readView.update();
    if (session.busy !== lastBusy) {
      lastBusy = session.busy;
      store.refresh(); // the event card's "ask" button is off while an answer is being written
    }
    const last = [...session.items].reverse().find((i): i is AssistantItem => i.kind === 'assistant');
    const status = last ? `${last.id}:${last.status}` : null;
    if (status === lastStatus || !last) return;
    lastStatus = status;
    if (last.status === 'done') announce('Yanıt hazır.');
    else if (last.status === 'failed' && last.error) announce(errorCopy(last.error.code).title);
  });
  let wasAsking = false;
  director.subscribe(() => {
    askBox.update();
    watchView.update();
    readView.update();
    followPrompt.update(presentation.narrating && !miniMap());
    // A question the reader let pass starts the measure again from where the map is now: it comes back after
    // another far move, not after a nudge of the map that already lies far from where the page left it.
    if (wasAsking && !director.askingToRelease && director.following) watch.settle(cameraNow());
    wasAsking = director.askingToRelease;
    // in the small window of the full-screen reader the step on screen is always in view, followed or not
    const at = director.active ? `${director.active.itemId}:${director.active.n}` : '';
    if (miniMap() && at !== miniAt && director.drawing && !director.following) frameDrawing(director.drawing);
    miniAt = at;
    store.refresh(); // the drawing, the year and the camera follow the active step
  });
  /** What the director was on at its last change (for the small window to know when the step changed). */
  let miniAt = '';
  // The reader's own choices (the view, the mode, the autoplay) redraw the page too; with the answer closed the card is back.
  presentation.subscribe(() => {
    if (!presentation.shown) cardTucked = false;
    store.refresh();
  });

  // First paint of everything except the map, then the map itself.
  vm = deriveView(store.state, data);
  vmState = store.state;
  liveContext = contextFromView(vm, data);
  head.render(vm);
  card.render(vm, { tucked: cardTucked, introOpen, closeIntro: () => ((introOpen = false), store.refresh()) });
  ruler.render(vm.year, []);
  timeline.render(vm);
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
        onMarkerStats: ({ shown, total, thinned, offscreen, narrator }) => {
          const el = $('map-stats');
          el.hidden = total === 0;
          if (narrator === 'place' && shown === 0) {
            // A place is selected: the world's events have left the map. They are in the card's "elsewhere" list, and the
            // note says so and how they come back.
            render(
              html`<b>Yer seçili</b> <span> · dünya olayları haritadan çekildi, seçimi kaldırınca döner</span>`,
              el,
            );
          } else if (narrator) {
            // Somebody narrates: the others are off the map until it ends (or on the place's timeline), and the note says so.
            const rest = store.state.places.length ? 'gerisi çizelgede' : 'gerisi yanıt kapanınca döner';
            render(html`<b>${shown}</b> olay haritada <span> · ${rest}</span>`, el);
          } else {
            // Say honestly why some events are not drawn: zoom/collision thinning, or simply out of view.
            const hint =
              thinned > 0
                ? html`<span> · yakınlaştıkça artar</span>`
                : offscreen > 0
                  ? html`<span> · kalanlar görünüm dışında</span>`
                  : '';
            render(html`<b>${shown}</b> / ${total} olay haritada${hint}`, el);
          }
          mapView?.controlsChanged(); // the note's size is what labels keep clear of
        },
        onBordersLoading: (loading) => head.setLoading(loading),
        onWaterClick: () => toast('Burası deniz. Bir kara parçasına tıklayın; harita yerinden oynamaz.'),
        onHoverPolity: (id, x, y, noData) => {
          if (id) {
            const ent = data.entities.get(id);
            tip.show(html`<div class="tip-polity">${ent?.name ?? id}</div>`, x, y, 'cursor', 'polity');
          } else if (noData) {
            tip.show(html`<div class="tip-nodata">Bu dönem için sınır verisi yok</div>`, x, y, 'cursor', 'polity');
          } else {
            tip.hide('polity');
          }
        },
        avoidRects: () => {
          // Controls drawn over the map: a revealed event must not end up hidden behind one of them.
          const origin = $('map').getBoundingClientRect();
          const pad = 8;
          return [...root.querySelectorAll<HTMLElement>('.map-zoom, .legend, [data-avoid]:not([hidden])')].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              left: r.left - origin.left - pad,
              top: r.top - origin.top - pad,
              right: r.right - origin.left + pad,
              bottom: r.bottom - origin.top + pad,
            };
          });
        },
        onEventClick: (id) => {
          skipReveal = true; // the marker was clicked, so it is in sight: do not move the map
          store.selectEvent(store.state.selectedEventId === id ? null : id);
        },
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
  mapView.map.on('moveend', (e) => {
    scheduleHash();
    // A move the page made itself (a step brought into view, an event revealed, a resize) is where the camera now
    // rests. A move of the reader's is measured against that: small ones are just looking around, a substantial
    // one while the camera follows the narration makes the page ask whether it should let go.
    const camera = cameraNow();
    const reader = !!e.originalEvent || readerMove;
    readerMove = false;
    if (!reader) {
      watch.settle(camera);
      return;
    }
    if (!presentation.narrating || miniMap()) return; // in the small window the reader is only looking
    const box = mapView.map.getCanvas();
    director.userMovedCamera(watch.judge(camera, { width: box.clientWidth, height: box.clientHeight }));
  });
  update();
  loadingText.textContent = 'Harita çiziliyor…';
  await mapView.whenDrawn();
  // A link that opens an event may point at one outside the first view.
  if (vm.selectedEvent) mapView.revealEvent(vm.selectedEvent);
  $('loading').classList.add('is-done');
  window.setTimeout(() => $('loading').remove(), 400);

  window.__ayni = {
    map: mapView.map,
    store,
    data,
    view: () => vm,
    visibleMarkerIds: () => mapView.visibleMarkerIds(),
    bordersReady: () => mapView.bordersReady(),
    ai: { session, director, presentation },
  };
}
