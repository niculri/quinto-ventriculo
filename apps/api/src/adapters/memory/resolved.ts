// The answer of an in-memory repository: a promise that rejects when the computation throws, as an async function does.
export const resolved = <T>(compute: () => T): Promise<T> =>
  new Promise((resolve) => {
    resolve(compute());
  });
