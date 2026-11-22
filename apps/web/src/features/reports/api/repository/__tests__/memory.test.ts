// Tests the database rules that the local reports repository re-implements.
import { describe, expect, it } from 'vitest';
import { REPORT_LIMITS } from '@qv/schema';
import { localReportsRepository, placeOf, REPORT_MESSAGES } from '..';
import type { NewReport } from '..';
import { memoryStorage } from '../../../../../test/storage';

const NOW = Date.parse('2026-03-10T15:00:00Z');
const DAY = 86_400_000;

function clock(start = NOW) {
  let at = start;
  return { now: () => new Date(at), move: (ms: number) => (at += ms) };
}

const cardReport = (id: string, comment = 'Dice otra cosa'): NewReport => ({
  kind: 'card',
  id,
  code: 'T-XX-01-001',
  version: 1,
  location: { deckId: 'd1' },
  category: 'fact',
  comment,
});

const noteReport = (quote: string, section = 's1'): NewReport => ({
  kind: 'note',
  id: 'note-1',
  code: 'QV-XX-01',
  version: 1,
  location: { section, quote: { exact: quote } },
  category: 'text',
  comment: 'Falta una palabra',
});

describe('sending', () => {
  it(`at most ${REPORT_LIMITS.perDay} in the last 24 hours, not by calendar day`, async () => {
    const time = clock();
    const repo = localReportsRepository({ now: time.now });
    for (let i = 0; i < REPORT_LIMITS.perDay; i++) await repo.send(cardReport(`g${i}:0`));
    await expect(repo.send(cardReport('other:0'))).rejects.toThrow(REPORT_MESSAGES.dailyLimit);
    time.move(DAY - 1);
    await expect(repo.send(cardReport('other:0'))).rejects.toThrow(REPORT_MESSAGES.dailyLimit);
    time.move(1);
    await repo.send(cardReport('other:0'));
  });

  it(`up to ${REPORT_LIMITS.openPerPlace} open in one place; resolving them frees it`, async () => {
    const repo = localReportsRepository({ admin: true });
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) await repo.send(noteReport('una frase'));
    await expect(repo.send(noteReport('una frase'))).rejects.toThrow(REPORT_MESSAGES.placeLimit);
    await repo.send(noteReport('una frase', 's2'));
    await repo.resolve({
      kind: 'note',
      targetId: 'note-1',
      status: 'wont_fix',
      note: null,
      fixedVersion: null,
    });
    await repo.send(noteReport('una frase'));
  });

  it('the place takes the quote with its spaces as one, and a long quote is cut to 500', async () => {
    expect(placeOf(noteReport('una  frase'))).toBe(placeOf(noteReport('una frase')));
    expect(placeOf(cardReport('g1:0'))).toBe('');
    const repo = localReportsRepository();
    await repo.send(noteReport('x'.repeat(600)));
    expect((await repo.mine())[0]!.location.quote!.exact).toHaveLength(500);
  });

  it('the comment is kept trimmed, the newest report first', async () => {
    const repo = localReportsRepository();
    await repo.send(cardReport('g1:0', '  primero  '));
    await repo.send(cardReport('g2:0', 'segundo'));
    expect((await repo.mine()).map((r) => r.comment)).toEqual(['segundo', 'primero']);
  });
});

describe('the panel', () => {
  it('only an administrator uses it', async () => {
    const repo = localReportsRepository();
    const decision = {
      kind: 'card' as const,
      targetId: 'g1:0',
      status: 'fixed' as const,
      note: null,
      fixedVersion: 2,
    };
    await expect(repo.queue()).rejects.toThrow(REPORT_MESSAGES.adminOnly);
    await expect(repo.resolve(decision)).rejects.toThrow(REPORT_MESSAGES.adminOnly);
    await expect(repo.reopen('r1')).rejects.toThrow(REPORT_MESSAGES.adminOnly);
    await expect(repo.setBlocked('demo', true)).rejects.toThrow(REPORT_MESSAGES.adminOnly);
  });

  it('resolving closes every open report of the content, whatever its place, and each one sees it', async () => {
    const repo = localReportsRepository({ admin: true });
    await repo.send(noteReport('una frase'));
    await repo.send(noteReport('otra frase', 's2'));
    await repo.send(cardReport('g1:0'));
    const closed = await repo.resolve({
      kind: 'note',
      targetId: 'note-1',
      status: 'fixed',
      note: '  Arreglado  ',
      fixedVersion: 2,
    });
    expect(closed).toBe(2);
    const queue = await repo.queue();
    expect(queue.open.map((g) => g.targetId)).toEqual(['g1:0']);
    expect(queue.resolved).toHaveLength(1);
    expect(queue.resolved[0]!.reports).toHaveLength(2);
    expect(queue.resolved[0]!.resolution).toMatchObject({ note: 'Arreglado', fixedVersion: 2 });
    expect((await repo.mine()).filter((r) => r.resolution?.status === 'fixed')).toHaveLength(2);
    await expect(
      repo.resolve({
        kind: 'note',
        targetId: 'note-1',
        status: 'fixed',
        note: null,
        fixedVersion: 3,
      }),
    ).rejects.toThrow(REPORT_MESSAGES.nothingOpen);
  });

  it('«no es un error» keeps no version, and reopening opens its reports again', async () => {
    const repo = localReportsRepository({ admin: true });
    await repo.send(cardReport('g1:0'));
    await repo.resolve({
      kind: 'card',
      targetId: 'g1:0',
      status: 'not_an_error',
      note: '   ',
      fixedVersion: 4,
    });
    const resolved = (await repo.queue()).resolved[0]!;
    expect(resolved.resolution).toMatchObject({ note: null, fixedVersion: null });
    await repo.reopen(resolved.resolution!.id);
    expect((await repo.queue()).open).toHaveLength(1);
    await expect(repo.reopen(resolved.resolution!.id)).rejects.toThrow(REPORT_MESSAGES.nothingOpen);
  });

  it('an administrator is never blocked', async () => {
    const repo = localReportsRepository({ admin: true });
    await expect(repo.setBlocked('demo', true)).rejects.toThrow(REPORT_MESSAGES.adminStays);
    await repo.send(cardReport('g1:0'));
    expect((await repo.queue()).blocked).toHaveLength(0);
    await repo.setBlocked('demo', false);
    await repo.send(cardReport('g1:0'));
  });
});

describe('the reports in the browser', () => {
  const KEY = 'qv-demo-content-reports';

  it('what one tab sends, another one reads; an unreadable storage starts empty', async () => {
    const storage = memoryStorage();
    await localReportsRepository({ storage }).send(cardReport('g1:0'));
    expect(await localReportsRepository({ storage }).mine()).toHaveLength(1);
    storage.setItem(KEY, '{roto');
    expect(await localReportsRepository({ storage }).mine()).toEqual([]);
  });

  it('a person blocked (as another tab left it) cannot send, and the panel lists them as blocked', async () => {
    const time = clock();
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ blocked: true }));
    const repo = localReportsRepository({
      storage,
      admin: true,
      email: 'yo@ug.uchile.cl',
      now: time.now,
    });
    await expect(repo.send(cardReport('g1:0'))).rejects.toThrow(REPORT_MESSAGES.blocked);
    expect((await repo.queue()).blocked).toEqual([
      {
        id: 'demo',
        name: 'Estudiante de prueba',
        email: 'yo@ug.uchile.cl',
        blockedAt: new Date(NOW).toISOString(),
      },
    ]);
  });

  it('a storage that cannot be written keeps the reports in memory', async () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('blocked');
    };
    const repo = localReportsRepository({ storage });
    await repo.send(cardReport('g1:0'));
    expect(await repo.mine()).toHaveLength(1);
  });

  it('the resolved ones go newest first', async () => {
    const time = clock();
    const repo = localReportsRepository({ admin: true, now: time.now });
    for (const id of ['g1:0', 'g2:0']) {
      await repo.send(cardReport(id));
      time.move(1000);
      await repo.resolve({
        kind: 'card',
        targetId: id,
        status: 'wont_fix',
        note: null,
        fixedVersion: null,
      });
    }
    expect((await repo.queue()).resolved.map((g) => g.targetId)).toEqual(['g2:0', 'g1:0']);
  });
});

describe('the place of a note', () => {
  it('a section or a figure without a quote is a place of its own', () => {
    const at = (location: NewReport['location']) => placeOf({ kind: 'note', location });
    expect(at({ section: 's1' })).not.toBe(at({ section: 's2' }));
    expect(at({ figure: 'f1' })).not.toBe(at({}));
    expect(at({})).toBe('');
  });
});
