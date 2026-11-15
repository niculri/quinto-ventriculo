// The table's grid without React: its row height, the rows drawn around the view, and where a key moves to.

export const ROW = 34;

/** The rows to draw for a scroll position, ten more on each side. */
export function rowWindow(top: number, height: number, length: number) {
  return {
    first: Math.max(0, Math.floor(top / ROW) - 10),
    last: Math.min(length, Math.ceil((top + height) / ROW) + 10),
  };
}

const STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };

/** The row a key goes to (unclamped), or null for a key that does not move. */
export function gridTarget(key: string, current: number, length: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  const step = STEPS[key] ?? 0;
  return step ? current + step : null;
}
