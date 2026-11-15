// The keys of the card viewer, as in Anki: space or Enter turns the card, the arrows move through the list; not while
// a control inside the card, a field or another dialog has them.

import type { KeyboardEvent } from 'react';

export function viewerKeyDown(
  e: KeyboardEvent,
  content: HTMLDivElement | null,
  toggleAnswer: () => void,
  go: (delta: number) => void,
): void {
  // From inside the card's shadow root the target is its host: the element is the first of the path
  // (the «toggle» button of an occlusion, a hint link).
  const origin = e.nativeEvent.composedPath()[0] ?? e.target;
  const activates =
    origin instanceof Element &&
    origin.matches('button, a[href], summary, input, select, textarea');
  if (activates && (e.key === ' ' || e.key === 'Enter')) return;
  if (
    origin instanceof Element &&
    (origin.closest('input, textarea, select, [contenteditable]') ||
      (origin.getRootNode() === document && origin.closest('[role="dialog"]') !== content))
  ) {
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    toggleAnswer();
  } else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
}
