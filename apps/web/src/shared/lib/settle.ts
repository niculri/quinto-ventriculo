// The result of a function as a promise, with a throw as a rejection, for what answers like an `async` function without waiting.

export function settle<T>(run: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(run());
  });
}
