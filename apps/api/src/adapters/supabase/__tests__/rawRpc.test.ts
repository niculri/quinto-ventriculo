// Tests for the RPCs over plain HTTP: the headers per schema, the URL and what a failure carries.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rawRpcOf } from '../rawRpc';

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('rawRpcOf', () => {
  it('posts the arguments to the function, without the double slash of a trailing one', async () => {
    const fetchMock = stubFetch(new Response('{}'));
    await rawRpcOf('https://c.example.co//', 'clave')('anki_deck_detail', {
      deck_id: '7',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://c.example.co/rest/v1/rpc/anki_deck_detail');
    expect(init.body).toBe('{"deck_id":"7"}');
    expect(init.headers).toMatchObject({ apikey: 'clave', Authorization: 'Bearer clave' });
  });

  it('only the draft names its schema, public is the default of PostgREST', async () => {
    const fetchMock = stubFetch(new Response('{}'));
    await rawRpcOf('https://c.example.co', 'k')('anki_deck_detail', { deck_id: '1' });
    await rawRpcOf('https://c.example.co', 'k', 'draft')('anki_deck_detail', { deck_id: '1' });
    const headers = fetchMock.mock.calls.map((c) => c[1].headers);
    expect(headers[0]).not.toHaveProperty('Content-Profile');
    expect(headers[1]).toMatchObject({ 'Content-Profile': 'draft' });
  });

  it('a refusal carries the function, the status and the start of the detail', async () => {
    stubFetch(new Response('x'.repeat(500), { status: 500 }));
    const error = await rawRpcOf('https://c.example.co', 'k')('anki_deck_detail', {
      deck_id: '1',
    }).catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      `Content database (anki_deck_detail): 500 ${'x'.repeat(300)}`,
    );
  });

  it('a detail that cannot be read does not hide the status', async () => {
    const broken = new Response('x', { status: 502 });
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('cortado'));
    stubFetch(broken);
    await expect(
      rawRpcOf('https://c.example.co', 'k')('anki_deck_detail', { deck_id: '1' }),
    ).rejects.toThrow('Content database (anki_deck_detail): 502 ');
  });

  it('an answer with no body is a failure too, not an empty stream', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(
      rawRpcOf('https://c.example.co', 'k')('anki_deck_detail', { deck_id: '1' }),
    ).rejects.toThrow('204');
  });
});
