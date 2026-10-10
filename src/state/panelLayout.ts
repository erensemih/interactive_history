import type { SelectionRef } from './derive';

/**
 * How the info panel arranges its cards. Pure, so the rules are testable without a browser.
 *
 * The selected place is the context and an opened event is the focus: with only a place selected the
 * panel describes the place; once an event is open the event is the card being read and the place
 * shrinks to a one-line header above it. Everything is a list of references, never "one place card plus
 * one event card": a comparison mode (place against place, event against event, place against event)
 * only has to hand this function two references and lay the focus list out in two columns.
 *
 * With the chat open the panel is the conversation. The places are then the header (what the
 * conversation is about) and an opened event is a sheet over the conversation instead of replacing it:
 * closing the sheet returns to the same chat, exactly where it was.
 */
export interface PanelLayout {
  /** Compact one-line headers: what the focus (or the chat) is read in. Each returns to its full card when clicked. */
  context: SelectionRef[];
  /** Full cards, side by side when there is more than one. Empty means "show the introduction". */
  focus: SelectionRef[];
  /** The chat is open and takes the place of the cards. */
  chat: boolean;
  /** An opened event while the chat is open: drawn over the chat, which stays where it is underneath. */
  sheet: SelectionRef | null;
}

export function panelLayout(places: SelectionRef[], event: SelectionRef | null, chat = false): PanelLayout {
  if (chat) return { context: places, focus: [], chat: true, sheet: event };
  return event
    ? { context: places, focus: [event], chat: false, sheet: null }
    : { context: [], focus: places, chat: false, sheet: null };
}
