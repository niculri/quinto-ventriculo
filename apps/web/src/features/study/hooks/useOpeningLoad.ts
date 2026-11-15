// What there is to study when the screen opens, in cards and minutes, and whether to warn of a heavy day first (only
// in the simple mode; «Seguir» takes the warning away).
import { useState } from 'react';
import { estimateMinutes, HEAVY_LOAD_MINUTES } from '@qv/study';
import type { StudySession } from '../api/StudySession';

export function useOpeningLoad(
  session: StudySession,
  full: boolean,
  medianAnswerMs: number | null,
) {
  const [opening] = useState(() => session.counts());
  const minutes = estimateMinutes(opening, medianAnswerMs);
  const [heavy, setHeavy] = useState(!full && minutes >= HEAVY_LOAD_MINUTES);
  return { opening, minutes, heavy, goOn: () => setHeavy(false) };
}
