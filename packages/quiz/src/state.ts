// Restores a saved round and the cover's choices against the test's questions as they are today, and summarizes
// a round for the history.
import { ROUND_ORIGINS, newRoundId } from './round';
import type { QuestionInfo, Round, RoundAnswer, RoundOrigin, Screen } from './round';

export interface Preferences {
  groups: string[];
  shuffle: boolean;
  shuffleOptions: boolean;
}

export function restorePreferences(raw: unknown, groupIds: readonly string[]): Preferences {
  const p = isObject(raw) ? raw : {};
  const saved = Array.isArray(p.groups) ? p.groups.filter((g) => typeof g === 'string') : null;
  let groups = saved ? groupIds.filter((g) => saved.includes(g)) : groupIds.slice();
  if (!groups.length) groups = groupIds.slice();
  return { groups, shuffle: p.shuffle === true, shuffleOptions: p.shuffleOptions === true };
}

export function selectQuestions<G extends { id: string; questions: readonly unknown[] }>(
  groups: readonly G[],
  chosen: readonly string[],
): G['questions'][number][] {
  return groups.filter((g) => chosen.includes(g.id)).flatMap((g) => [...g.questions]);
}

const SCREENS: Screen[] = ['cover', 'question', 'results'];

/**
 * A saved round checked against today's questions. When a question is gone the later positions move, so an
 * unfinished round gets a new id: the history, kept by position, must not mix the old positions with the new.
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
  const kept = saved.flatMap((id, i) => (questions.has(id) ? [i] : []));
  if (!kept.length) return null;
  const removed = kept.length < saved.length;
  const newPosition = new Map(kept.map((old, i) => [old, i]));
  const moved = (old: number) => kept.filter((k) => k < old).length;
  const queue = kept.map((i) => saved[i]!);
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
      // Today's key, in case the author fixed it.
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
  // A finished round keeps its id: a new one would leave a second, empty finished round in the history.
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
