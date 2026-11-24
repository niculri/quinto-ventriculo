// Tests for the Worker's requests by UTC day, read from the GraphQL Analytics API with made-up answers.
import { describe, expect, it } from 'vitest';
import { requestDays, workerRequestsReader } from '../workerRequests';

const TODAY = Date.UTC(2026, 10, 23, 15, 0, 0);
const rows = (list: unknown[] | null) => ({
  data: { viewer: { accounts: [{ workersInvocationsAdaptive: list }] } },
  errors: null,
});

describe('requestDays', () => {
  it('fourteen UTC days, oldest first, the rows of one day added and a day without rows as zero', () => {
    const days = requestDays(
      rows([
        { sum: { requests: 900 }, dimensions: { date: '2026-11-23' } },
        { sum: { requests: 100 }, dimensions: { date: '2026-11-23' } },
        { sum: { requests: 42 }, dimensions: { date: '2026-11-10' } },
        { sum: { requests: 7 }, dimensions: { date: '2026-11-01' } },
        { sum: { requests: 'x' }, dimensions: { date: '2026-11-20' } },
        { sum: { requests: 5 }, dimensions: {} },
      ]),
      TODAY,
    );
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ day: '2026-11-10', requests: 42 });
    expect(days.at(-1)).toEqual({ day: '2026-11-23', requests: 1000 });
    expect(days.find((d) => d.day === '2026-11-20')).toEqual({ day: '2026-11-20', requests: 0 });
    expect(days.reduce((a, d) => a + d.requests, 0)).toBe(1042);
  });

  it('a refused query or an answer without rows is an error', () => {
    expect(() =>
      requestDays({ data: null, errors: [{ message: 'not authorized' }] }, TODAY),
    ).toThrow('not authorized');
    for (const body of [null, {}, { data: { viewer: { accounts: [] } } }, rows(null)]) {
      expect(() => requestDays(body, TODAY)).toThrow('without rows');
    }
  });
});

describe('workerRequestsReader', () => {
  it('asks the whole account for the window with the analytics token', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const reader = workerRequestsReader({
      accountId: 'cuenta',
      token: 'token-de-prueba',
      now: () => TODAY,
      fetch: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return new Response(JSON.stringify(rows([])));
      }) as unknown as typeof fetch,
    });
    expect((await reader.read()).at(-1)).toEqual({ day: '2026-11-23', requests: 0 });
    expect(seen[0]!.url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-de-prueba',
    );
    const body = JSON.parse(seen[0]!.init.body as string) as { variables: unknown; query: string };
    expect(body.variables).toEqual({ account: 'cuenta', from: '2026-11-10', to: '2026-11-23' });
    expect(body.query).not.toContain('scriptName');
  });

  it('an answer that is not 200 is an error', async () => {
    const reader = workerRequestsReader({
      accountId: 'cuenta',
      token: 't',
      fetch: async () => new Response('no', { status: 403 }),
    });
    await expect(reader.read()).rejects.toThrow('403');
  });
});
