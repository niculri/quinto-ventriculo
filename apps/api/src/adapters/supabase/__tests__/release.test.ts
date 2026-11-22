// Tests for the release repository against a fake PostgREST: publishing and undoing, and what a refusal looks like.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
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

describe('the other calls of the release, with a client that answers what the test says', () => {
  const repo = (answers: Parameters<typeof fakeContentClient>[0]) => {
    const { client, calls } = fakeContentClient(answers);
    return { repo: supabaseReleaseRepository('https://c.example.co', 'k', client), calls };
  };

  it('the media keys are asked from a key on, and null at the start, in pages of the size asked', async () => {
    const { repo: r, calls } = repo({
      'rpc:release_media': ok({ keys: ['a.png', 'b.png'], next: 'b.png' }),
    });
    expect(await r.media(null, 50)).toEqual({ keys: ['a.png', 'b.png'], next: 'b.png' });
    expect(calls[0]!.args).toEqual({ after_key: null, max_rows: 50 });
    await r.media('b.png', 10);
    expect(calls[1]!.args).toEqual({ after_key: 'b.png', max_rows: 10 });
  });

  it('a failure of the media list says which function', async () => {
    const { repo: r } = repo({ 'rpc:release_media': failed('caído') });
    await expect(r.media(null, 1)).rejects.toThrow('Content database (release_media): caído');
  });

  it('a mark on an old fingerprint (P0409) is stale; any other error is an error', async () => {
    const mark = ['f'.repeat(32), 'phone', true, 'ana'] as const;
    const stale = repo({ 'rpc:set_release_mark': failed('set_release_mark: stale', 'P0409') });
    expect(await stale.repo.setMark(...mark)).toBe('stale');
    const other = repo({ 'rpc:set_release_mark': failed('caído', 'P0001') });
    await expect(other.repo.setMark(...mark)).rejects.toThrow(
      'Content database (set_release_mark): caído',
    );
    const noCode = repo({ 'rpc:set_release_mark': failed('caído') });
    await expect(noCode.repo.setMark(...mark)).rejects.toThrow('set_release_mark');
  });

  it('the marks that come back are read one by one', async () => {
    const { repo: r, calls } = repo({
      'rpc:set_release_mark': ok([{ mark: 'phone', checkedBy: 'ana', checkedAt: '2026-11-01' }]),
    });
    expect(await r.setMark('f'.repeat(32), 'phone', false, 'ana')).toEqual([
      { mark: 'phone', checkedBy: 'ana', checkedAt: '2026-11-01' },
    ]);
    expect(calls[0]!.args).toEqual({
      fingerprint: 'f'.repeat(32),
      mark: 'phone',
      checked: false,
      checked_by: 'ana',
    });
  });

  it('the log asks for 50 and a failure says which function', async () => {
    const good = repo({ 'rpc:release_log': ok({ releases: [] }) });
    expect(await good.repo.log()).toEqual({ releases: [] });
    expect(good.calls[0]!.args).toEqual({ max_rows: 50 });
    await expect(repo({ 'rpc:release_log': failed('caído') }).repo.log()).rejects.toThrow(
      'Content database (release_log): caído',
    );
  });

  it('a refusal needs both its SQLSTATE and its reason: a reason alone, or a code alone, is an error', async () => {
    const wrongCode = repo({ 'rpc:revert_release': failed('revert_release: not_last', 'P0001') });
    await expect(wrongCode.repo.revert(1, 'x')).rejects.toThrow('revert_release');
    const noReason = repo({ 'rpc:revert_release': failed('algo raro', 'P0409') });
    await expect(noReason.repo.revert(1, 'x')).rejects.toThrow('algo raro');
    const refused = repo({
      'rpc:revert_release': failed('revert_release: not_last', 'P0422', 'detalle'),
    });
    expect(await refused.repo.revert(1, 'x')).toEqual({
      ok: false,
      reason: 'not_last',
      detail: 'detalle',
    });
  });
});
