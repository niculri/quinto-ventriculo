// The extras buttons of the author's note types: each `.bt[data-k]` shows or hides the `.panel[data-k]` of its
// `.extras` (the template does it with an inline handler and a script, which the sanitizing removes).

const BUTTON = '.extras .bt[data-k]';

function panelOf(button: Element): HTMLElement | null {
  const extras = button.closest('.extras');
  const key = button.getAttribute('data-k');
  // Every button reached matched BUTTON, so it has an `.extras` above it and its `data-k`.
  /* v8 ignore next */
  if (!extras || key === null) return null;
  const panels = extras.querySelectorAll<HTMLElement>('.panel[data-k]');
  return [...panels].find((p) => p.getAttribute('data-k') === key) ?? null;
}

function showState(button: Element, panel: HTMLElement): void {
  button.classList.toggle('on', !panel.hidden);
  button.setAttribute('aria-expanded', String(!panel.hidden));
}

/** Returns true when the event was a click on an extras button. */
export function toggleExtraPanel(target: Element | null): boolean {
  const button = target?.closest(BUTTON);
  if (!button) return false;
  const panel = panelOf(button);
  if (panel) {
    panel.hidden = !panel.hidden;
    showState(button, panel);
  }
  return true;
}

/** A panel holding an `.abrir-imagen` marker starts open; every button starts as its panel is. */
export function initExtras(root: ParentNode): void {
  for (const marker of root.querySelectorAll('.extras .abrir-imagen')) {
    const panel = marker.closest<HTMLElement>('.panel');
    if (panel) panel.hidden = false;
  }
  for (const button of root.querySelectorAll(BUTTON)) {
    const panel = panelOf(button);
    if (panel) showState(button, panel);
  }
}
