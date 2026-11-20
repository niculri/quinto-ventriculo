// A screen's chunk asked for ahead of the click: the screen says how it loads, a link asks for it when a pointer or the
// keyboard reaches it.

type Load = () => Promise<unknown>;

const loads = new Map<string, Load>();

export function registerPreload(name: string, load: Load): void {
  loads.set(name, load);
}

/** A phone with the browser's data saver on: nothing is fetched that nobody asked for. */
export function savesData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export function preload(name: string): void {
  if (savesData()) return;
  loads
    .get(name)?.()
    .catch(() => undefined);
}

/** For a link: a mouse over it, a touch on it (pointer events go before the click) and the focus ask for its screen. */
export function preloadOnIntent(name: string) {
  const ask = () => preload(name);
  return { onPointerEnter: ask, onFocus: ask };
}
