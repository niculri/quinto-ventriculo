// What a student does next in a random session: the choices, with the weights each moment of the screen gives them.
import type { Rating } from '@qv/srs';
import type { HideAction } from '../../session';
import { random } from './fixtures';
import type { ReferenceStudySession } from './reference-session';

export type Step =
  | { kind: 'advance'; ms: number }
  | { kind: 'showNext' }
  | { kind: 'tick' }
  | { kind: 'reveal' }
  | { kind: 'answer'; rating: Rating }
  | { kind: 'hide'; action: HideAction }
  | { kind: 'flag'; value: number }
  | { kind: 'undo' }
  | { kind: 'skipMissing'; missing: boolean };

const HIDES: HideAction[] = ['bury_card', 'bury_note', 'suspend_card', 'suspend_note'];
const SHORT = [
  1_000,
  5_000,
  40_000,
  130_000,
  11 * 60_000,
  25 * 60_000,
  3 * 3600_000,
  17 * 3600_000,
];
const LONG = [9 * 3600_000, 30 * 3600_000, 49 * 3600_000];

type Choice = readonly [weight: number, make: () => Step];

export function chooseStep(seed: number) {
  const rnd = random(seed * 7919 + 13);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!;
  const jump = (): Step => ({ kind: 'advance', ms: pick(rnd() < 0.85 ? SHORT : LONG) });
  const rating = (): Step => ({ kind: 'answer', rating: (1 + Math.floor(rnd() * 4)) as Rating });
  const hide = (): Step => ({ kind: 'hide', action: pick(HIDES) });
  const flag = (): Step => ({ kind: 'flag', value: 1 + Math.floor(rnd() * 7) });
  const common: Choice[] = [
    [6, hide],
    [6, flag],
    [10, () => ({ kind: 'undo' })],
    [2, () => ({ kind: 'skipMissing', missing: false })],
    [2, () => ({ kind: 'skipMissing', missing: true })],
    [3, () => ({ kind: 'showNext' })],
    [3, () => ({ kind: 'tick' })],
    [8, jump],
  ];
  const whileHidden: Choice[] = [
    [50, () => ({ kind: 'reveal' })],
    [6, () => ({ kind: 'answer', rating: 1 })],
    ...common,
  ];
  const whileRevealed: Choice[] = [[58, rating], [2, () => ({ kind: 'reveal' })], ...common];
  const nothingShown: Choice[] = [
    [35, () => ({ kind: 'tick' })],
    [40, jump],
    [10, () => ({ kind: 'undo' })],
    [10, () => ({ kind: 'showNext' })],
    [5, rating],
  ];

  return {
    roll: rnd,
    next(session: ReferenceStudySession): Step {
      const choices = !session.shown
        ? nothingShown
        : session.revealed
          ? whileRevealed
          : whileHidden;
      let at = rnd() * choices.reduce((sum, [w]) => sum + w, 0);
      for (const [weight, make] of choices) {
        at -= weight;
        if (at < 0) return make();
      }
      return choices[0]![1]();
    },
  };
}
