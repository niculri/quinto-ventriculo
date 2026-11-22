// Saves a test's steps in order and in the background: a move joins the step waiting of the same round (an answer is
// never dropped), and after two retries it stops and keeps the steps for «Reintentar».
import type { QuizRepository, QuizStep } from './repository';

export class StepSaver {
  private queue: QuizStep[] = [];
  private running = false;
  private listeners = new Set<() => void>();
  failed: Error | null = null;

  constructor(
    private readonly repository: QuizRepository,
    private readonly delays: number[] = [500, 2000],
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  // An arrow property, so the same function is passed to `useSyncExternalStore` in every render.
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

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

  retry(): void {
    void this.run();
  }

  async flush(): Promise<void> {
    while (this.running) await new Promise((r) => setTimeout(r, 10));
  }

  /** Saves a step, trying again after each delay; the last error, or null if it saved. */
  private async saveWithRetries(step: QuizStep): Promise<Error | null> {
    let error: Error | null = null;
    for (let attempt = 0; attempt <= this.delays.length; attempt++) {
      try {
        await this.repository.save(step);
        return null;
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        if (attempt < this.delays.length) {
          await new Promise((r) => setTimeout(r, this.delays[attempt]));
        }
      }
    }
    return error;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    this.failed = null;
    this.emit();
    try {
      while (this.queue.length) {
        const step = this.queue[0]!;
        const error = await this.saveWithRetries(step);
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

function canJoin(a: QuizStep, b: QuizStep): boolean {
  if (a.quizId !== b.quizId || a.sectionId !== b.sectionId) return false;
  if (a.answer && b.answer) return false;
  const ra = a.roundInfo?.id ?? null;
  const rb = b.roundInfo?.id ?? null;
  // A step of another round (or none, «Descartar») goes after: the round it replaces must be saved first.
  return ra === rb;
}
