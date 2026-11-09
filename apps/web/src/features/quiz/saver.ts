import type { QuizRepository, QuizStep } from './repository';

/**
 * The steps of a test, saved in order and in the background (the page does not wait for them). A step that
 * only moves around (Siguiente, Saltar, back to the cover) joins the one still waiting, if it is of the same round; an
 * answer is never dropped. If saving fails it retries twice; then it stops (`failed`) and keeps the steps for
 * the next try (the next step or «Reintentar»).
 */
export class StepSaver {
  private queue: QuizStep[] = [];
  private running = false;
  private listeners = new Set<() => void>();
  failed: Error | null = null;

  constructor(
    private readonly repository: QuizRepository,
    private readonly delays: number[] = [500, 2000],
  ) {}

  /** Steps not saved yet (the browser asks before closing). */
  get pending(): number {
    return this.queue.length;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  push(step: QuizStep): void {
    const last = this.queue.length > (this.running ? 1 : 0) ? this.queue.at(-1) : undefined;
    if (last && canJoin(last, step)) {
      this.queue[this.queue.length - 1] = {
        ...last,
        ...step,
        preferences: step.preferences ?? last.preferences,
        roundInfo: step.roundInfo ?? last.roundInfo,
        answer: last.answer ?? step.answer,
      };
    } else {
      this.queue.push(step);
    }
    this.emit();
    void this.run();
  }

  /** Tries again after a failure. */
  retry(): void {
    void this.run();
  }

  /** Resolves when everything was saved (or it stopped on a failure). */
  async flush(): Promise<void> {
    while (this.running) await new Promise((r) => setTimeout(r, 10));
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    this.failed = null;
    this.emit();
    try {
      while (this.queue.length) {
        const step = this.queue[0]!;
        let error: Error | null = null;
        for (let attempt = 0; attempt <= this.delays.length; attempt++) {
          try {
            await this.repository.save(step);
            error = null;
            break;
          } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            if (attempt < this.delays.length) {
              await new Promise((r) => setTimeout(r, this.delays[attempt]));
            }
          }
        }
        if (error) {
          this.failed = error;
          return;
        }
        this.queue.shift();
        this.emit();
      }
    } finally {
      this.running = false;
      this.emit();
    }
  }
}

/** Two steps of the same section and round, the later one without an answer of its own if the first has one. */
function canJoin(a: QuizStep, b: QuizStep): boolean {
  if (a.quizId !== b.quizId || a.sectionId !== b.sectionId) return false;
  if (a.answer && b.answer) return false;
  const ra = a.roundInfo?.id ?? null;
  const rb = b.roundInfo?.id ?? null;
  // A step of another round (or none, «Descartar») goes after: the round it replaces must be saved first.
  return ra === rb;
}
