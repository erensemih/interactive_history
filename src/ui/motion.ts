/** Smooth scrolling unless the reader asked the system for reduced motion (an explicit `smooth` would override that). */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
