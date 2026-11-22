// Collects the problems of a check, at most `cap` messages per kind and a count of the rest.

export class Problems {
  private readonly counts = new Map<string, number>();
  readonly list: string[] = [];
  constructor(private readonly cap = 25) {}
  add(kind: string, message: string): void {
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    if (n <= this.cap) this.list.push(message);
  }
  all(): string[] {
    const more = [...this.counts]
      .filter(([, n]) => n > this.cap)
      .map(([kind, n]) => `… y ${n - this.cap} más de «${kind}».`);
    return [...this.list, ...more];
  }
}
