import { html, render, type TemplateResult } from 'lit-html';

/** One floating tooltip for the whole app (map polities, event markers, timeline nodes). */
export class Tooltip {
  private readonly el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tip';
    this.el.setAttribute('role', 'tooltip');
    this.el.hidden = true;
    host.appendChild(this.el);
  }

  /** Shows content near viewport coordinates, keeping inside the window. */
  show(content: TemplateResult, x: number, y: number, placement: 'above' | 'below' | 'cursor' = 'cursor') {
    render(html`${content}`, this.el);
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect();
    const pad = 10;
    let left = x - r.width / 2;
    let top = placement === 'above' ? y - r.height - 12 : placement === 'below' ? y + 16 : y + 18;
    if (placement === 'cursor') left = x + 14;
    left = Math.max(pad, Math.min(window.innerWidth - r.width - pad, left));
    if (top < pad) top = y + 18;
    if (top + r.height > window.innerHeight - pad) top = Math.max(pad, y - r.height - 14);
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  hide() {
    this.el.hidden = true;
  }
}
