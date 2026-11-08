import { ROUND_ORIGINS, newRoundId } from './round';
import type { QuestionInfo, Round, RoundAnswer, RoundOrigin, Screen } from './round';

/**
 * Saving and continuing: a round and the cover's choices, as they are stored (the users database, or the
 * browser in demo mode), and read back against the questions of the test as they are today. If the test
 * changed and the round no longer fits (a question of its queue is gone), it is discarded, as the page of
 * `pauta-a-test` does; what still fits is kept (with stable ids, a question whose text changed keeps its
 * answer). A question the author took out leaves the round, and the round goes on with the others.
 */

/** The cover's choices of a section: which groups, and whether to shuffle questions and alternatives. */
export interface Preferences {
  groups: string[];
  shuffle: boolean;
  shuffleOptions: boolean;
}

/** The choices saved, or the defaults (every group, nothing shuffled); groups that no longer exist go away. */
export function restorePreferences(raw: unknown, groupIds: readonly string[]): Preferences {
  const p = isObject(raw) ? raw : {};
  const saved = Array.isArray(p.groups) ? p.groups.filter((g) => typeof g === 'string') : null;
  let groups = saved ? groupIds.filter((g) => saved.includes(g)) : groupIds.slice();
  if (!groups.length) groups = groupIds.slice();
  return { groups, shuffle: p.shuffle === true, shuffleOptions: p.shuffleOptions === true };
}

/** The questions of the chosen groups, in the order of the groups. */
export function selectQuestions<G extends { id: string; questions: readonly unknown[] }>(
  groups: readonly G[],
  chosen: readonly string[],
): G['questions'][number][] {
  return groups.filter((g) => chosen.includes(g.id)).flatMap((g) => [...g.questions]);
}

const SCREENS: Screen[] = ['cover', 'question', 'results'];

/**
 * A saved round, checked against today's questions; null if it does not fit any more (or is not a round).
 * Out-of-range positions are clamped, answers that do not fit are dropped and an order of alternatives
 * that no longer fits (the question has another number of alternatives) goes back to the original one.
 *
 * A question of its queue that is no longer in the test leaves the round, with its answer: the others keep
 * theirs, and the round goes on where it was (on the next question, if the one on screen is the one that
 * left). The positions after it move, so a round still being answered gets a new id (`options.id`, or a
 * random one): the history of the old one (its answers, by position) stays as it was, and the new positions
 * do not land on it. A finished round keeps its id (it takes no more answers). Only if none of its questions
 * is left, null.
 */
export function restoreRound(
  raw: unknown,
  questions: ReadonlyMap<string, QuestionInfo>,
  options: { id?: string } = {},
): Round | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const saved = raw.queue;
  if (!Array.isArray(saved) || !saved.length || !saved.every((id) => typeof id === 'string')) {
    return null;
  }
  const savedTop = clamp(raw.top, 0, saved.length - 1);
  const savedIndex = clamp(raw.index, 0, savedTop);
  // The positions that are still in the test, and where each one goes.
  const kept = saved.flatMap((id, i) => (questions.has(id as string) ? [i] : []));
  if (!kept.length) return null;
  const removed = kept.length < saved.length;
  const newPosition = new Map(kept.map((old, i) => [old, i]));
  /** Where an old position goes: itself, or the next one still there. */
  const moved = (old: number) => kept.filter((k) => k < old).length;
  const queue = kept.map((i) => saved[i] as string);
  const n = queue.length;
  const top = Math.min(moved(savedTop), n - 1);
  const index = Math.min(moved(savedIndex), top);
  const ordersRaw = Array.isArray(raw.orders) ? raw.orders : [];
  const orders = kept.map((old, i) => {
    const o = ordersRaw[old];
    const q = questions.get(queue[i]!)!;
    return Array.isArray(o) && validOrder(o, q.options ?? 0) ? (o as number[]).slice() : null;
  });
  const seen = new Set<number>();
  const answers: RoundAnswer[] = [];
  for (const a of Array.isArray(raw.answers) ? raw.answers : []) {
    if (!isObject(a)) continue;
    const old = a.position;
    if (typeof old !== 'number' || !Number.isInteger(old) || old < 0 || old > savedTop) continue;
    const position = newPosition.get(old);
    if (position === undefined || position > top) continue;
    if (seen.has(position) || a.questionId !== queue[position]) continue;
    const q = questions.get(queue[position]!)!;
    const choice = (q.options ?? 0) >= 2;
    let chosen: number | null;
    let correct: boolean;
    if (choice) {
      if (typeof a.chosen !== 'number' || !Number.isInteger(a.chosen)) continue;
      if (a.chosen < 0 || a.chosen >= q.options!) continue;
      chosen = a.chosen;
      // The verdict is the test's of today: if the author fixed the key, the round says so.
      correct = a.chosen === q.correct;
    } else {
      if (a.chosen !== null || typeof a.correct !== 'boolean') continue;
      chosen = null;
      correct = a.correct;
    }
    seen.add(position);
    answers.push({
      position,
      questionId: q.id,
      chosen,
      correct,
      at: typeof a.at === 'string' ? a.at : new Date(0).toISOString(),
    });
  }
  answers.sort((a, b) => a.position - b.position);
  const finished = raw.finished === true;
  let screen: Screen = SCREENS.includes(raw.screen as Screen) ? (raw.screen as Screen) : 'cover';
  if (screen === 'results' && !finished) screen = 'cover';
  // A finished round takes no more answers (from its results there is no way back to a question), so nothing
  // new can land on the old positions: it keeps its id. A new one would leave in the history a second round,
  // marked finished and without answers, the first time the round is saved again («Inicio» from the results).
  if (removed && finished && screen === 'question') screen = 'results';
  return {
    version: 1,
    id:
      removed && !finished
        ? (options.id ?? newRoundId())
        : typeof raw.id === 'string' && raw.id
          ? raw.id
          : '00000000-0000-4000-8000-000000000000',
    origin: ROUND_ORIGINS.includes(raw.origin as RoundOrigin)
      ? (raw.origin as RoundOrigin)
      : 'cover',
    queue,
    index,
    top,
    shuffled: raw.shuffled === true,
    shuffleOptions: raw.shuffleOptions === true,
    orders,
    answers,
    screen,
    finished,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date(0).toISOString(),
  };
}

function validOrder(o: unknown[], n: number) {
  if (o.length !== n || n < 2) return false;
  const s = new Set(o);
  return (
    s.size === n && o.every((i) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < n)
  );
}

function clamp(v: unknown, min: number, max: number): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.min(max, Math.max(min, x));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** What the history keeps of a round (for statistics): when, how many and how it went. */
export interface RoundSummary {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  finished: boolean;
}

export function summarize(round: Round, now: Date = new Date()): RoundSummary {
  const correct = round.answers.filter((a) => a.correct).length;
  return {
    id: round.id,
    startedAt: round.startedAt,
    finishedAt: round.finished ? now.toISOString() : null,
    total: round.queue.length,
    answered: round.answers.length,
    correct,
    wrong: round.answers.length - correct,
    finished: round.finished,
  };
}
