// Where a key of a study screen comes from: a field, a menu or a dialog keeps it, and a button or link it would press.

export function keyOrigin(e: KeyboardEvent): Element | null {
  return (e.composedPath()[0] ?? e.target) as Element | null;
}

export function typedInto(origin: Element | null): boolean {
  return (
    origin instanceof Element &&
    !!origin.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')
  );
}

export function pressesControl(origin: Element | null): boolean {
  return origin instanceof Element && origin.matches('button, a[href], summary');
}
