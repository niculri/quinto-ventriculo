// Tests of the shared cache of the material in memory: what goes in comes out the same until its time ends.
import { describe, expect, it } from 'vitest';
import { memoryContentCache } from '../contentCache';

describe('the shared cache in memory', () => {
  it('gives back the body and the type until its time ends, as many times as asked', async () => {
    let now = 100;
    const cache = memoryContentCache(() => now);
    await cache.put('k', new Response('hola', { headers: { 'Content-Type': 'text/plain' } }), 10);
    for (const _ of [1, 2]) {
      const hit = await cache.match('k');
      expect(hit?.contentType).toBe('text/plain');
      expect(await new Response(hit?.body).text()).toBe('hola');
    }
    expect(cache.keys()).toEqual(['k']);
    now = 110;
    expect(await cache.match('k')).toBeNull();
    expect(cache.keys()).toEqual([]);
  });

  it('an answer without a type is stored as bytes', async () => {
    const cache = memoryContentCache(() => 0);
    const body = new Response(new Uint8Array([1, 2])).body!;
    await cache.put('k', new Response(body), 5);
    expect((await cache.match('k'))?.contentType).toBe('application/octet-stream');
  });
});
