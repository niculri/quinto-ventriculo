// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/** Mixing the queue's lists by the preset's mix options (rslib/src/scheduler/queue/builder/intersperser.rs). */
import type { ReviewMix } from '../config';

/** intersperser.rs: spreads one list evenly through the other. */
export function intersperse<T>(one: T[], two: T[]): T[] {
  const ratio = (one.length + 1) / (two.length + 1);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < one.length || j < two.length) {
    if (i < one.length && j < two.length) {
      if ((j + 1) * ratio < i + 1) out.push(two[j++]!);
      else out.push(one[i++]!);
    } else if (i < one.length) out.push(one[i++]!);
    else out.push(two[j++]!);
  }
  return out;
}

export function mix<T>(reviews: T[], other: T[], mode: ReviewMix): T[] {
  switch (mode) {
    case 'afterReviews':
      return [...reviews, ...other];
    case 'beforeReviews':
      return [...other, ...reviews];
    case 'mixWithReviews':
      return intersperse(reviews, other);
  }
}
