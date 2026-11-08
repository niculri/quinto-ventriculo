/**
 * A round of a practice test, as the `pauta-a-test` page plays it: one question at a time, the verdict at
 * once, the score, «Volver» to read the previous one (answered, not again), «Siguiente» through the answered
 * ones up to the one that was next, the results, «Repetir todo» and «Repetir solo las malas». The round is a
 * plain JSON value: every change returns a new one (nothing is mutated), so it can be saved as it is and
 * continued after reloading.
 */

/** What the round needs to know of a question. */
export interface QuestionInfo {
  id: string;
  /** Number of alternatives; none = a question with a short answer (the user says whether they knew it). */
  options?: number;
  /** Index of the correct alternative, from 0, in the original order. */
  correct?: number;
  /** Its alternatives never shuffle (they name each other: «a y c», «todas las anteriores»). */
  fixedOrder?: boolean;
}

/** A number in [0, 1). `Math.random` in the web; a seeded one in tests. */
export type Random = () => number;

export type Screen = 'cover' | 'question' | 'results';

/** How a round started: from the cover, «Reiniciar», «Repetir todo» or «Repetir solo las malas». */
export type RoundOrigin = 'cover' | 'restart' | 'repeat_all' | 'repeat_wrong';
export const ROUND_ORIGINS: readonly RoundOrigin[] = [
  'cover',
  'restart',
  'repeat_all',
  'repeat_wrong',
];

export interface RoundAnswer {
  /** Position in the queue. */
  position: number;
  questionId: string;
  /** Original index of the chosen alternative; null in a question with a short answer. */
  chosen: number | null;
  correct: boolean;
  /** When it was answered (ISO). */
  at: string;
}

export interface Round {
  version: 1;
  /** Id of the round (the history in the database hangs from it). */
  id: string;
  origin: RoundOrigin;
  /** The questions, in the order they are asked. */
  queue: string[];
  /** The question on screen. */
  index: number;
  /** The furthest question reached: «Siguiente» goes through the answered ones up to it. */
  top: number;
  /** The questions were shuffled (restarting shuffles them again). */
  shuffled: boolean;
  /** «Mezclar también las alternativas». */
  shuffleOptions: boolean;
  /**
   * The order in which the alternatives of each position are shown (original indexes), fixed when the round
   * starts so it does not change when going back, reloading or continuing; null = the original order.
   */
  orders: (number[] | null)[];
  answers: RoundAnswer[];
  /** What is on screen: the cover (with the round saved, «Continuar»), a question or the results. */
  screen: Screen;
  /** It reached the results: the cover no longer offers to continue it. */
  finished: boolean;
  startedAt: string;
}

export interface StartOptions {
  shuffle: boolean;
  shuffleOptions: boolean;
  random?: Random;
  /** Id of the round; by default a random UUID. */
  id?: string;
  /** By default, «cover». */
  origin?: RoundOrigin;
  now?: Date;
}

/** Fisher–Yates, on a copy. */
export function shuffled<T>(items: readonly T[], random: Random = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Mulberry32: a small, seeded generator (tests and reproducible orders). */
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

/** A new round id (a random UUID). */
export function newRoundId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // An RFC 4122 v4 without crypto (old environments): only the round's id depends on it.
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

/** A new round with these questions (already chosen: the groups of the cover), on its first question. */
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

/**
 * The original indexes of the alternatives in the order they are shown at that position (the letters A, B…
 * on screen are positions in this list).
 */
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

/** The letter shown on screen for an original alternative («A»…). */
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

/**
 * Answers the question on screen with an alternative (its original index). An answered question is not
 * answered again (also when it was reached with «Volver»): the round stays as it was.
 */
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

/** A question with a short answer: after seeing the answer, whether the user knew it. */
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

/**
 * «Siguiente»: through the answered ones up to the furthest, then the next new one; after the last one, the
 * results. Only once the question on screen is answered.
 */
export function next(round: Round): Round {
  if (round.screen !== 'question' || !isAnswered(round)) return round;
  if (round.index < round.top) return { ...round, index: round.index + 1 };
  if (round.index + 1 < round.queue.length) {
    return { ...round, index: round.index + 1, top: round.index + 1 };
  }
  return finish(round);
}

/** «Volver»: the previous question, to read it as it was answered. */
export function back(round: Round): Round {
  if (round.screen !== 'question' || round.index === 0) return round;
  return { ...round, index: round.index - 1 };
}

export function canGoBack(round: Round): boolean {
  return round.screen === 'question' && round.index > 0;
}

/** «Terminar ahora» or the last «Siguiente»: the results, with what was answered. */
export function finish(round: Round): Round {
  return { ...round, screen: 'results', finished: true };
}

/** «Inicio»: back to the cover; the round stays saved and the cover offers to continue it. */
export function toCover(round: Round): Round {
  return { ...round, screen: 'cover' };
}

/** «Continuar», from the cover: the question where it was (with its verdict if it was answered). */
export function resume(round: Round): Round {
  if (round.finished) return { ...round, screen: 'results' };
  return { ...round, screen: 'question' };
}

/** A round that the cover offers to continue (saved halfway). */
export function isResumable(round: Round | null): round is Round {
  return !!round && !round.finished && round.queue.length > 0;
}

/**
 * «Reiniciar»: the same questions from the first one, without their answers (shuffled again if they were
 * shuffled). A new round: the one that is left stays in the history as it was.
 */
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

/** «Repetir todo», from the results: the same questions, shuffled or not as the cover says now. */
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

/** «Repetir solo las malas»: the wrong ones, in the order they were asked (not shuffled). */
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

/** The wrong answers, in the order they were asked. */
export function wrongAnswers(round: Round): RoundAnswer[] {
  return round.answers.filter((a) => !a.correct).sort((a, b) => a.position - b.position);
}

export interface Score {
  /** Questions in the round. */
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  /** Correct over answered, rounded (0 if none answered). */
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

/** The progress bar: up to the furthest question reached (the whole bar on the results). */
export function progress(round: Round): number {
  if (round.screen === 'results') return 1;
  return round.queue.length ? round.top / round.queue.length : 0;
}

/** The title of the results, by the percentage of correct answers. */
export function resultTitle(percent: number): string {
  return percent >= 85
    ? 'Muy bien preparado'
    : percent >= 60
      ? 'Vas bien, falta afinar'
      : 'Hay que repasar';
}

/** «Vas en la pregunta 4 de 20 · 2 buenas y 1 mala»: the cover's line of a round saved halfway. */
export function resumeLine(round: Round): string {
  const s = score(round);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    `Vas en la pregunta ${round.top + 1} de ${round.queue.length} · ` +
    `${plural(s.correct, 'buena', 'buenas')} y ${plural(s.wrong, 'mala', 'malas')}`
  );
}
