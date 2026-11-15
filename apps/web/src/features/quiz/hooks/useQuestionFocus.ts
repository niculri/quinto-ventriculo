// The focus on a question: «Siguiente» once answered; and with the focus lost («Siguiente» disabled again), the new
// question's text, so a screen reader reads it.
import { useEffect, useRef } from 'react';
import type { Round } from '@qv/quiz';

export function useQuestionFocus(round: Round, done: boolean) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (done) nextRef.current?.focus({ preventScroll: true });
  }, [done, round.index]);
  const queued = round.queue[round.index];
  useEffect(() => {
    if (done) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || (active as HTMLButtonElement).disabled;
    if (!lost) return;
    const start = sectionRef.current?.querySelector<HTMLElement>('.enun, .preg');
    if (!start) return;
    start.tabIndex = -1;
    start.focus({ preventScroll: true });
  }, [done, round.index, queued]);

  return { nextRef, sectionRef };
}
