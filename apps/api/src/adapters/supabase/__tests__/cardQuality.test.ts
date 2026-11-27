// Tests for the summary of «Tarjetas» in the users' database: the administrator's own token, a database without the
// migration and a refusal.
import { describe, expect, it } from 'vitest';
import { bodyOf, urlOf } from '../../../test/fetch';
import { supabaseCardQuality } from '../cardQuality';

const scope = { decks: ['4', '5'], limit: 100 };
const source = (
  answer: () => Response,
  seen: { url: string; headers: Headers; body: string }[] = [],
) =>
  supabaseCardQuality({
    supabaseUrl: 'https://u.example.co//',
    publishableKey: 'sb_publishable_x',
    fetch: async (url, init) => {
      seen.push({ url: urlOf(url), headers: new Headers(init?.headers), body: bodyOf(init) });
      return answer();
    },
  });

describe('supabaseCardQuality', () => {
  it('asks admin_card_quality() with the token of the person asking, not with the Worker’s key', async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    expect(
      await source(() => Response.json({ measured: 0 }), seen).read('token-de-ana', scope),
    ).toEqual({
      measured: 0,
    });
    expect(seen[0]!.url).toBe('https://u.example.co/rest/v1/rpc/admin_card_quality');
    expect(seen[0]!.headers.get('Authorization')).toBe('Bearer token-de-ana');
    expect(seen[0]!.headers.get('apikey')).toBe('sb_publishable_x');
    expect(JSON.parse(seen[0]!.body)).toEqual({ p: scope });
  });

  it('a database without the function gives null, so that the panel says it is not there yet', async () => {
    const missing = () =>
      Response.json({ code: 'PGRST202', message: 'Could not find' }, { status: 404 });
    expect(await source(missing).read('t', scope)).toBeNull();
  });

  it('another 404, a body that is not JSON or a refusal is an error with its status', async () => {
    for (const [answer, status] of [
      [() => Response.json({ code: 'PGRST000' }, { status: 404 }), 404],
      [() => Response.json(null, { status: 404 }), 404],
      [() => new Response('<html>', { status: 404 }), 404],
      [() => Response.json({ code: '42501', message: 'admin_only' }, { status: 403 }), 403],
    ] as const) {
      await expect(source(answer).read('t', scope)).rejects.toThrow(
        `admin_card_quality: ${status}`,
      );
    }
  });
});
