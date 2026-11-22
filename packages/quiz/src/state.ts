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

interface SavedQueue {
  saved: string[];
  kept: number[];
  queue: string[];
  newPosition: Map<number, number>;
  removed: boolean;
  savedTop: number;
  top: number;
  index: number;
}

/** The saved queue without the questions that are gone, and where the top and the current question moved to. */
function restoreQueue(
  raw: Record<string, unknown>,
  questions: ReadonlyMap<string, QuestionInfo>,
): SavedQueue | null {
  const saved = raw.queue;
  if (
    !Array.isArray(saved) ||
    !saved.length ||
    !saved.every((id): id is string => typeof id === 'string')
  ) {
    return null;
  }
  const savedTop = clamp(raw.top, 0, saved.length - 1);
  const savedIndex = clamp(raw.index, 0, savedTop);
  const kept = saved.flatMap((id, i) => (questions.has(id) ? [i] : []));
  if (!kept.length) return null;
  const moved = (old: number) => kept.filter((k) => k < old).length;
  const top = Math.min(moved(savedTop), kept.length - 1);
  return {
    saved,
    kept,
    queue: kept.map((i) => saved[i]!),
    newPosition: new Map(kept.map((old, i) => [old, i])),
    removed: kept.length < saved.length,
    savedTop,
    top,
    index: Math.min(moved(savedIndex), top),
  };
}

function restoreOrders(
  raw: Record<string, unknown>,
  { kept, queue }: SavedQueue,
  questions: ReadonlyMap<string, QuestionInfo>,
): (number[] | null)[] {
  const ordersRaw: unknown[] = Array.isArray(raw.orders) ? raw.orders : [];
  return kept.map((old, i) => {
    const o = ordersRaw[old];
    const q = questions.get(queue[i]!)!;
    return Array.isArray(o) && validOrder(o, q.options ?? 0) ? (o as number[]).slice() : null;
  });
}

/** What was chosen and whether it is right by today's key, or null when the saved answer does not fit the question. */
function restoreVerdict(
  a: Record<string, unknown>,
  q: QuestionInfo,
): { chosen: number | null; correct: boolean } | null {
  if ((q.options ?? 0) >= 2) {
    if (typeof a.chosen !== 'number' || !Number.isInteger(a.chosen)) return null;
    if (a.chosen < 0 || a.chosen >= q.options!) return null;
    // Today's key, in case the author fixed it.
    return { chosen: a.chosen, correct: a.chosen === q.correct };
  }
  if (a.chosen !== null || typeof a.correct !== 'boolean') return null;
  return { chosen: null, correct: a.correct };
}

function restoreAnswer(
  a: unknown,
  saved: SavedQueue,
  questions: ReadonlyMap<string, QuestionInfo>,
  seen: ReadonlySet<number>,
): RoundAnswer | null {
  if (!isObject(a)) return null;
  const old = a.position;
  if (typeof old !== 'number' || !Number.isInteger(old) || old < 0 || old > saved.savedTop) {
    return null;
  }
  const position = saved.newPosition.get(old);
  if (position === undefined || position > saved.top) return null;
  if (seen.has(position) || a.questionId !== saved.queue[position]) return null;
  const q = questions.get(saved.queue[position]!)!;
  const verdict = restoreVerdict(a, q);
  if (!verdict) return null;
  return {
    position,
    questionId: q.id,
    chosen: verdict.chosen,
    correct: verdict.correct,
    at: typeof a.at === 'string' ? a.at : new Date(0).toISOString(),
  };
}

function restoreAnswers(
  raw: Record<string, unknown>,
  saved: SavedQueue,
  questions: ReadonlyMap<string, QuestionInfo>,
): RoundAnswer[] {
  const seen = new Set<number>();
  const answers: RoundAnswer[] = [];
  for (const a of Array.isArray(raw.answers) ? raw.answers : []) {
    const answer = restoreAnswer(a, saved, questions, seen);
    if (!answer) continue;
    seen.add(answer.position);
    answers.push(answer);
  }
  return answers.sort((a, b) => a.position - b.position);
}

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
  const saved = restoreQueue(raw, questions);
  if (!saved) return null;
  const finished = raw.finished === true;
  let screen: Screen = SCREENS.includes(raw.screen as Screen) ? (raw.screen as Screen) : 'cover';
  if (screen === 'results' && !finished) screen = 'cover';
  // A finished round keeps its id: a new one would leave a second, empty finished round in the history.
  if (saved.removed && finished && screen === 'question') screen = 'results';
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '00000000-0000-4000-8000-000000000000';
  return {
    version: 1,
    id: saved.removed && !finished ? (options.id ?? newRoundId()) : id,
    origin: ROUND_ORIGINS.includes(raw.origin as RoundOrigin)
      ? (raw.origin as RoundOrigin)
      : 'cover',
    queue: saved.queue,
    index: saved.index,
    top: saved.top,
    shuffled: raw.shuffled === true,
    shuffleOptions: raw.shuffleOptions === true,
    orders: restoreOrders(raw, saved, questions),
    answers: restoreAnswers(raw, saved, questions),
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
