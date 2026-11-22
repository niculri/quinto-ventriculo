// Tells a JSON `null` (a database function that found nothing) from a body to stream, reading only its first bytes.
const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

export async function nonNull(
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array> | null> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
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
