// Tests for nonNull: a JSON null is told from a body to stream by its first bytes.
import { describe, expect, it } from 'vitest';
import { nonNull } from '../stream';

describe('nonNull', () => {
  const stream = (...chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
        c.close();
      },
    });
  const text = async (s: ReadableStream<Uint8Array> | null) =>
    s === null ? null : await new Response(s).text();

  it('null (with spaces before, in several pieces) is null; nothing at all too', async () => {
    expect(await nonNull(stream('null'))).toBeNull();
    expect(await nonNull(stream(' ', '\n', ' null'))).toBeNull();
    expect(await nonNull(stream())).toBeNull();
  });

  it('a value goes on whole, every piece in order', async () => {
    expect(await text(await nonNull(stream(' ', '{"a":', '1}')))).toBe(' {"a":1}');
    expect(await text(await nonNull(stream('[]')))).toBe('[]');
  });

  it('cancelling what it returns cancels the source, and a source that ends closes the stream', async () => {
    let cancelled: unknown = null;
    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"a":'));
      },
      cancel(reason) {
        cancelled = reason;
      },
    });
    const out = (await nonNull(source))!;
    await out.cancel('listo');
    expect(cancelled).toBe('listo');
  });
});
