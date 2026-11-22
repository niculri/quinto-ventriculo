// Tests for the release repository against a fake PostgREST: publishing and undoing, and what a refusal looks like.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KEY, startFakePostgrest } from '../../../test/postgrest';
import { supabaseReleaseRepository } from '../release';

let fake: Awaited<ReturnType<typeof startFakePostgrest>>;

beforeAll(async () => {
  fake = await startFakePostgrest();
});

afterAll(() => fake.close());

describe('publishing and undoing through PostgREST', () => {
  const input = {
    fingerprint: 'f'.repeat(32),
    title: 'Biología celular · Certamen 2',
    schemaVersion: 1,
    checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
    marks: [],
    by: 'dueno@ug.uchile.cl',
  };

  it('sends what publishing needs as its argument p, and reads what it did', async () => {
    fake.seen.length = 0;
    const r = await supabaseReleaseRepository(fake.base, KEY).publish(input);
    expect(r).toMatchObject({ ok: true, result: { id: 3, title: input.title } });
    expect(JSON.parse(fake.seen.at(-1)!.body)).toEqual({ p: input });
  });

  it('a refusal is its reason and detail; any other error, an error', async () => {
    const repo = supabaseReleaseRepository(fake.base, KEY);
    expect(await repo.publish({ ...input, title: 'cambió' })).toEqual({
      ok: false,
      reason: 'fingerprint',
      detail: 'x',
    });
    expect(await repo.revert(2, 'x')).toEqual({
      ok: false,
      reason: 'public_changed',
      detail: 'note X',
    });
    await expect(repo.publish({ ...input, title: 'roto' })).rejects.toThrow(/publish_release/);
    await expect(repo.revert(99, 'x')).rejects.toThrow(/revert_release/);
    expect(await repo.revert(1, 'x')).toMatchObject({ ok: true, result: { id: 1 } });
  });
});
