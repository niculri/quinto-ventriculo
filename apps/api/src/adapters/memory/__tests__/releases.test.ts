// Tests for the release panel without a database: the files it reads, the marks, and the rules of publishing and undoing.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonBody } from '../../../ports/content';
import type { PublishInput } from '../../../ports/releases';
import { folderReleaseRepository } from '../releases';

const FP = 'a'.repeat(32);

type Page = { items: unknown[]; next: string | null };
type Summary = {
  fingerprint: string;
  schemaVersion: number | null;
  marks: unknown[];
  decks: unknown[];
};
const read = async (answer: Promise<JsonBody>) => {
  const body = await answer;
  if (typeof body !== 'string') throw new Error('the repository gives text, not a stream');
  return body;
};
const asPage = async (answer: Promise<JsonBody>) => JSON.parse(await read(answer)) as Page;
const asSummary = async (answer: Promise<JsonBody>) => JSON.parse(await read(answer)) as Summary;
const asList = async (answer: Promise<JsonBody>) => JSON.parse(await read(answer)) as unknown[];
const PUBLISHED_FP = 'f'.repeat(32);
const READY = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-release-'));
  await mkdir(join(folder, 'release'));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

const write = (name: string, data: unknown) =>
  writeFile(join(folder, 'release', name), typeof data === 'string' ? data : JSON.stringify(data));

const draft = () =>
  write('summary.json', { fingerprint: FP, schemaVersion: 3, decks: [{ id: 'd' }] });

const publishInput = (over: Partial<PublishInput> = {}): PublishInput => ({
  fingerprint: FP,
  title: 'Primera',
  schemaVersion: 3,
  checks: READY,
  marks: [],
  by: 'admin@example.test',
  ...over,
});

async function markAll(repo: Awaited<ReturnType<typeof folderReleaseRepository>>, fp = FP) {
  await repo.setMark(fp, 'phone', true, 'a');
  await repo.setMark(fp, 'answers', true, 'a');
}

describe('the files of the draft', () => {
  it('a folder without them shows an empty draft that nobody can mistake for a published one', async () => {
    const repo = await folderReleaseRepository(folder);
    const summary = await asSummary(repo.summaryJson());
    expect(summary).toMatchObject({ fingerprint: '0'.repeat(32), schemaVersion: null, marks: [] });
    expect(await asPage(repo.itemsJson('c', 'card', null))).toEqual({
      items: [],
      next: null,
    });
    expect(await asPage(repo.textsJson(null))).toEqual({ items: [], next: null });
    expect(await asList(repo.browseIndexesJson())).toEqual([]);
    expect(await repo.media(null, 10)).toEqual({ keys: [], next: null });
  });

  it('a file that is not valid JSON counts as missing, not as an error', async () => {
    await write('summary.json', '{ roto');
    const repo = await folderReleaseRepository(folder);
    expect((await asSummary(repo.summaryJson())).fingerprint).toBe('0'.repeat(32));
  });
});

describe('the pages', () => {
  it('items are paged by their guid, then key, then id, and `after` resumes after that key', async () => {
    await write('items.json', {
      'c|card': [{ guid: 'a' }, { key: 'b' }, { id: 'c' }, {}],
    });
    const repo = await folderReleaseRepository(folder);
    const page = await asPage(repo.itemsJson('c', 'card', 'a'));
    expect(page.items).toEqual([{ key: 'b' }, { id: 'c' }]);
    expect(page.next).toBeNull();
  });

  it('a page has 200 items and names the last as the place to continue from', async () => {
    const all = Array.from({ length: 205 }, (_, i) => ({ guid: String(i).padStart(4, '0') }));
    await write('items.json', { 'c|article': all });
    const repo = await folderReleaseRepository(folder);
    const first = await asPage(repo.itemsJson('c', 'article', null));
    expect(first.items).toHaveLength(200);
    expect(first.next).toBe('0199');
    const second = await asPage(repo.itemsJson('c', 'article', first.next));
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeNull();
  });

  it('exactly one full page has nothing after it', async () => {
    await write('items.json', {
      'c|card': Array.from({ length: 200 }, (_, i) => ({ guid: String(i).padStart(4, '0') })),
    });
    const repo = await folderReleaseRepository(folder);
    expect((await asPage(repo.itemsJson('c', 'card', null))).next).toBeNull();
  });

  it('the media list honors the limit it is asked and `after`', async () => {
    await write('media.json', ['a.png', 'b.png', 'c.png']);
    const repo = await folderReleaseRepository(folder);
    expect(await repo.media(null, 2)).toEqual({ keys: ['a.png', 'b.png'], next: 'b.png' });
    expect(await repo.media('b.png', 2)).toEqual({ keys: ['c.png'], next: null });
  });

  it('texts are paged by their key', async () => {
    await write('texts.json', [{ key: 'k1' }, { key: 'k2' }]);
    const repo = await folderReleaseRepository(folder);
    expect((await asPage(repo.textsJson('k1'))).items).toEqual([{ key: 'k2' }]);
  });
});

describe('the marks', () => {
  it('a mark on a fingerprint that is not the draft’s is stale and changes nothing', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    expect(await repo.setMark('b'.repeat(32), 'phone', true, 'a')).toBe('stale');
    expect((await asSummary(repo.summaryJson())).marks).toEqual([]);
  });

  it('marks come back sorted by name, one per kind, and unchecking removes it', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    await repo.setMark(FP, 'phone', true, 'ana');
    await repo.setMark(FP, 'announcement', true, 'beto');
    const two = await repo.setMark(FP, 'phone', true, 'carla');
    expect(two).toMatchObject([
      { mark: 'announcement', checkedBy: 'beto' },
      { mark: 'phone', checkedBy: 'carla' },
    ]);
    expect(await repo.setMark(FP, 'announcement', false, 'beto')).toMatchObject([
      { mark: 'phone' },
    ]);
  });
});

describe('publishing', () => {
  it('refuses, in this order: fingerprint, schema version, missing marks, blocking checks', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    expect(await repo.publish(publishInput({ fingerprint: 'b'.repeat(32) }))).toMatchObject({
      reason: 'fingerprint',
    });
    expect(await repo.publish(publishInput({ schemaVersion: 2 }))).toMatchObject({
      reason: 'schema_version',
    });
    expect(await repo.publish(publishInput())).toMatchObject({ reason: 'marks' });
    await repo.setMark(FP, 'phone', true, 'a');
    expect(await repo.publish(publishInput())).toMatchObject({ reason: 'marks' });
    await repo.setMark(FP, 'answers', true, 'a');
    expect(await repo.publish(publishInput({ marks: ['announcement'] }))).toMatchObject({
      reason: 'marks',
    });
    expect(await repo.publish(publishInput({ checks: { ...READY, blocking: 1 } }))).toMatchObject({
      reason: 'blocked',
    });
    expect(await repo.publish(publishInput({ checks: { ...READY, ready: false } }))).toMatchObject({
      reason: 'blocked',
    });
  });

  it('when several things are wrong the first of them is the one it says', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    const wrong = publishInput({
      fingerprint: 'b'.repeat(32),
      schemaVersion: 2,
      checks: { ...READY, blocking: 1 },
    });
    expect(await repo.publish(wrong)).toMatchObject({ reason: 'fingerprint' });
    expect(await repo.publish({ ...wrong, fingerprint: FP })).toMatchObject({
      reason: 'schema_version',
    });
    expect(await repo.publish({ ...wrong, fingerprint: FP, schemaVersion: 3 })).toMatchObject({
      reason: 'marks',
    });
    await markAll(repo);
    expect(await repo.publish({ ...wrong, fingerprint: FP, schemaVersion: 3 })).toMatchObject({
      reason: 'blocked',
    });
  });

  it('publishing empties the draft, clears the marks and takes the published fingerprint', async () => {
    await write('items.json', { 'c|card': [{ guid: 'a' }] });
    await write('media.json', ['a.png']);
    await draft();
    const repo = await folderReleaseRepository(folder);
    await markAll(repo);
    const done = await repo.publish(publishInput());
    expect(done).toMatchObject({ ok: true, result: { id: 1, title: 'Primera' } });
    const summary = await asSummary(repo.summaryJson());
    expect(summary).toMatchObject({ fingerprint: PUBLISHED_FP, marks: [], decks: [] });
    expect((await asPage(repo.itemsJson('c', 'card', null))).items).toEqual([]);
    expect(await repo.media(null, 10)).toEqual({ keys: [], next: null });
    expect(await asList(repo.browseIndexesJson())).toEqual([]);
    expect((await asPage(repo.textsJson(null))).items).toEqual([]);
  });

  it('once published there is nothing left to publish', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    await markAll(repo);
    await repo.publish(publishInput());
    expect(await repo.publish(publishInput({ fingerprint: PUBLISHED_FP }))).toMatchObject({
      ok: false,
      reason: 'empty',
    });
    expect(await repo.publish(publishInput())).toMatchObject({ ok: false, reason: 'fingerprint' });
    expect(await repo.setMark(FP, 'phone', true, 'a')).toBe('stale');
  });
});

describe('undoing', () => {
  it('only the last release can be undone, and only once', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    await markAll(repo);
    await repo.publish(publishInput());
    expect(await repo.revert(9, 'admin')).toMatchObject({ ok: false, reason: 'not_last' });
    expect(await repo.revert(1, 'admin')).toMatchObject({ ok: true, result: { id: 1 } });
    expect(await repo.revert(1, 'admin')).toMatchObject({ ok: false, reason: 'reverted' });
  });

  it('with nothing published there is nothing to undo', async () => {
    const repo = await folderReleaseRepository(folder);
    expect(await repo.revert(1, 'admin')).toMatchObject({ ok: false, reason: 'not_last' });
  });

  it('undoing brings the draft back, and a second release makes the first one final', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    await markAll(repo);
    await repo.publish(publishInput());
    await repo.revert(1, 'beto');
    expect(await asSummary(repo.summaryJson())).toMatchObject({
      fingerprint: FP,
      decks: [{ id: 'd' }],
      marks: [],
    });
    await markAll(repo);
    await repo.publish(publishInput({ title: 'Segunda' }));
    const { releases } = await repo.log();
    expect(releases.map((r) => [r.id, r.status, r.canRevert, r.revertedBy])).toEqual([
      [2, 'published', true, null],
      [1, 'reverted', false, 'beto'],
    ]);
  });

  it('the log is a copy: changing it does not change the releases', async () => {
    await draft();
    const repo = await folderReleaseRepository(folder);
    await markAll(repo);
    await repo.publish(publishInput());
    (await repo.log()).releases[0]!.canRevert = false;
    expect((await repo.log()).releases[0]!.canRevert).toBe(true);
  });
});
