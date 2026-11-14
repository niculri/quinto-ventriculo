// A practice-test round: one question at a time, verdicts, skip, back, results and repeats. The round is plain
// JSON and every change returns a new one, so it can be saved as it is and continued after reloading.

export interface QuestionInfo {
  id: string;
  /** None: a short-answer question (the user says whether they knew it). */
  options?: number;
  correct?: number;
  /** The alternatives name each other («a y c», «todas las anteriores»), so they never shuffle. */
  fixedOrder?: boolean;
}

export type Random = () => number;

export type Screen = 'cover' | 'question' | 'results';

export type RoundOrigin = 'cover' | 'restart' | 'repeat_all' | 'repeat_wrong';
export const ROUND_ORIGINS: readonly RoundOrigin[] = [
  'cover',
  'restart',
  'repeat_all',
  'repeat_wrong',
];

export interface RoundAnswer {
  position: number;
  questionId: string;
  /** Original index of the alternative, not its place on screen. */
  chosen: number | null;
  correct: boolean;
  at: string;
}

export interface Round {
  version: 1;
  id: string;
  origin: RoundOrigin;
  queue: string[];
  index: number;
  /** The furthest question reached. */
  top: number;
  shuffled: boolean;
  shuffleOptions: boolean;
  /** Each position's alternatives as shown, fixed at the start so going back or reloading keeps them; null: as is. */
  orders: (number[] | null)[];
  answers: RoundAnswer[];
  screen: Screen;
  finished: boolean;
  startedAt: string;
}

export interface StartOptions {
  shuffle: boolean;
  shuffleOptions: boolean;
  random?: Random;
  id?: string;
  origin?: RoundOrigin;
  now?: Date;
}

export function shuffled<T>(items: readonly T[], random: Random = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Mulberry32: a small seeded generator, for tests and reproducible orders. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newRoundId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const isChoice = (q: QuestionInfo) => (q.options ?? 0) >= 2;

function orderFor(q: QuestionInfo, shuffleOptions: boolean, random: Random): number[] | null {
  if (!shuffleOptions || !isChoice(q) || q.fixedOrder) return null;
  return shuffled(
    Array.from({ length: q.options! }, (_, i) => i),
    random,
  );
}

export function startRound(questions: readonly QuestionInfo[], options: StartOptions): Round {
  if (!questions.length) throw new Error('Una ronda necesita al menos una pregunta.');
  const random = options.random ?? Math.random;
  const list = options.shuffle ? shuffled(questions, random) : questions.slice();
  return {
    version: 1,
    id: options.id ?? newRoundId(),
    origin: options.origin ?? 'cover',
    queue: list.map((q) => q.id),
    index: 0,
    top: 0,
    shuffled: options.shuffle,
    shuffleOptions: options.shuffleOptions,
    orders: list.map((q) => orderFor(q, options.shuffleOptions, random)),
    answers: [],
    screen: 'question',
    finished: false,
    startedAt: (options.now ?? new Date()).toISOString(),
  };
}

export function currentQuestionId(round: Round): string {
  return round.queue[round.index]!;
}

export function answerAt(round: Round, position = round.index): RoundAnswer | null {
  return round.answers.find((a) => a.position === position) ?? null;
}

export function isAnswered(round: Round, position = round.index): boolean {
  return answerAt(round, position) !== null;
}

/** Original indexes in the order shown: the letters A, B… on screen are positions in this list. */
export function displayOrder(
  round: Round,
  question: QuestionInfo,
  position = round.index,
): number[] {
  const n = question.options ?? 0;
  const order = round.orders[position];
  if (order && isPermutation(order, n)) return order.slice();
  return Array.from({ length: n }, (_, i) => i);
}

export function letterOf(
  round: Round,
  question: QuestionInfo,
  original: number,
  position = round.index,
) {
  return LETTERS[displayOrder(round, question, position).indexOf(original)] ?? '';
}

export const LETTERS = 'ABCDEF';

function isPermutation(order: readonly number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Set(order);
  return seen.size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}

function check(round: Round, question: QuestionInfo) {
  if (round.screen !== 'question') throw new Error('No hay una pregunta en pantalla.');
  if (currentQuestionId(round) !== question.id) {
    throw new Error(`La pregunta en pantalla es ${currentQuestionId(round)}, no ${question.id}.`);
  }
}

export function answerChoice(
  round: Round,
  question: QuestionInfo,
  chosen: number,
  now: Date = new Date(),
): Round {
  check(round, question);
  if (!isChoice(question)) throw new Error('Esta pregunta no tiene alternativas.');
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= question.options!) {
    throw new Error(`La alternativa ${chosen} no existe.`);
  }
  if (isAnswered(round)) return round;
  const answer: RoundAnswer = {
    position: round.index,
    questionId: question.id,
    chosen,
    correct: chosen === question.correct,
    at: now.toISOString(),
  };
  return { ...round, answers: [...round.answers, answer] };
}

export function selfAssess(
  round: Round,
  question: QuestionInfo,
  knewIt: boolean,
  now: Date = new Date(),
): Round {
  check(round, question);
  if (isChoice(question))
    throw new Error('Esta pregunta tiene alternativas: se responde eligiendo una.');
  if (isAnswered(round)) return round;
  const answer: RoundAnswer = {
    position: round.index,
    questionId: question.id,
    chosen: null,
    correct: knewIt,
    at: now.toISOString(),
  };
  return { ...round, answers: [...round.answers, answer] };
}

export function next(round: Round): Round {
  if (round.screen !== 'question' || !isAnswered(round)) return round;
  if (round.index < round.top) return { ...round, index: round.index + 1 };
  if (round.index + 1 < round.queue.length) {
    return { ...round, index: round.index + 1, top: round.index + 1 };
  }
  return finish(round);
}

/** Moves the question on screen to the end; only the ones after it move, so answers keep their positions. */
export function skip(round: Round): Round {
  if (!canSkip(round)) return round;
  const i = round.index;
  const move = <T>(items: readonly T[]) => [...items.slice(0, i), ...items.slice(i + 1), items[i]!];
  return { ...round, queue: move(round.queue), orders: move(round.orders) };
}

export function canSkip(round: Round): boolean {
  return (
    round.screen === 'question' &&
    round.index === round.top &&
    round.index + 1 < round.queue.length &&
    !isAnswered(round) &&
    // A round answers in order up to `top`; this keeps it so.
    round.answers.every((a) => a.position < round.index)
  );
}

export function back(round: Round): Round {
  if (round.screen !== 'question' || round.index === 0) return round;
  return { ...round, index: round.index - 1 };
}

export function canGoBack(round: Round): boolean {
  return round.screen === 'question' && round.index > 0;
}

export function finish(round: Round): Round {
  return { ...round, screen: 'results', finished: true };
}

export function toCover(round: Round): Round {
  return { ...round, screen: 'cover' };
}

export function resume(round: Round): Round {
  if (round.finished) return { ...round, screen: 'results' };
  return { ...round, screen: 'question' };
}

export function isResumable(round: Round | null): round is Round {
  return !!round && !round.finished && round.queue.length > 0;
}

/** A new round with the same questions, so the old one stays in the history as it was. */
export function restart(
  round: Round,
  questions: ReadonlyMap<string, QuestionInfo>,
  options: Omit<StartOptions, 'shuffle' | 'shuffleOptions' | 'origin'> = {},
): Round {
  return startRound(resolve(round.queue, questions), {
    ...options,
    origin: 'restart',
    shuffle: round.shuffled,
    shuffleOptions: round.shuffleOptions,
  });
}

export function repeatAll(
  round: Round,
  questions: ReadonlyMap<string, QuestionInfo>,
  options: Omit<StartOptions, 'shuffleOptions' | 'origin'>,
): Round {
  return startRound(resolve(round.queue, questions), {
    ...options,
    origin: 'repeat_all',
    shuffleOptions: round.shuffleOptions,
  });
}

export function repeatWrong(
  round: Round,
  questions: ReadonlyMap<string, QuestionInfo>,
  options: Omit<StartOptions, 'shuffle' | 'shuffleOptions' | 'origin'> = {},
): Round | null {
  const wrong = wrongAnswers(round).map((a) => a.questionId);
  if (!wrong.length) return null;
  return startRound(resolve(wrong, questions), {
    ...options,
    origin: 'repeat_wrong',
    shuffle: false,
    shuffleOptions: round.shuffleOptions,
  });
}

function resolve(ids: readonly string[], questions: ReadonlyMap<string, QuestionInfo>) {
  return ids.map((id) => {
    const q = questions.get(id);
    if (!q) throw new Error(`No existe la pregunta ${id}.`);
    return q;
  });
}

export function wrongAnswers(round: Round): RoundAnswer[] {
  return round.answers.filter((a) => !a.correct).sort((a, b) => a.position - b.position);
}

export interface Score {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  percent: number;
}

export function score(round: Round): Score {
  const correct = round.answers.filter((a) => a.correct).length;
  const answered = round.answers.length;
  return {
    total: round.queue.length,
    answered,
    correct,
    wrong: answered - correct,
    percent: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

export function progress(round: Round): number {
  if (round.screen === 'results') return 1;
  return round.queue.length ? round.top / round.queue.length : 0;
}

export function resultTitle(percent: number): string {
  return percent >= 85
    ? 'Muy bien preparado'
    : percent >= 60
      ? 'Vas bien, falta afinar'
      : 'Hay que repasar';
}

export function resumeLine(round: Round): string {
  const s = score(round);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    `Vas en la pregunta ${round.top + 1} de ${round.queue.length} · ` +
    `${plural(s.correct, 'buena', 'buenas')} y ${plural(s.wrong, 'mala', 'malas')}`
  );
}
