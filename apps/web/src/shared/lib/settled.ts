// A promise of what `run` gives, or rejected with what it throws: a function that answers like an async one without waiting.
export function settled<T>(run: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(run());
  });
}
