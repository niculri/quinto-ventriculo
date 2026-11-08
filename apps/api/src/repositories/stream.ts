const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

/**
 * The body of a JSON response, or null if the JSON is `null` (a function of the database that found
 * nothing). It reads only up to the first character that is not a space; the rest is passed on as it comes.
 */
export async function nonNull(
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array> | null> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      // Nothing but spaces: no value.
      return null;
    }
    head.push(value);
    const first = value.find((b) => !WHITESPACE.has(b));
    if (first === undefined) continue;
    if (first === 0x6e /* n: null */) {
      await reader.cancel();
      return null;
    }
    break;
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
