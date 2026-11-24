// Tests for the demo's published site: publishing puts the draft where the students read, undoing takes it back, and
// a refusal changes nothing.
import { describe, expect, it } from 'vitest';
import { bundle, releases, state } from '../../../test/draftApp';
import { memoryRepository } from '../content';
import { publishingSite } from '../publishing';

const input = {
  fingerprint: 'f'.repeat(32),
  title: 'Biología celular · Certamen 2',
  schemaVersion: 1,
  checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
  marks: [],
  by: 'dueno@ug.uchile.cl',
};

const titleOf = async (site: ReturnType<typeof publishingSite>) =>
  (await site.repository.note('11-traduccion'))?.title;

describe('publishingSite', () => {
  it('publishing reads the draft, undoing the published, and the version changes each time', async () => {
    const site = publishingSite({
      published: memoryRepository(bundle('Traducción')),
      draft: memoryRepository(bundle('Traducción (borrador)')),
      releases,
    });
    const start = await site.contentVersion.current();
    expect(await titleOf(site)).toBe('Traducción');
    expect((await site.releases.publish(input)).ok).toBe(true);
    expect(await titleOf(site)).toBe('Traducción (borrador)');
    const published = await site.contentVersion.current();
    expect(published).not.toBe(start);
    expect((await site.releases.revert(7, input.by)).ok).toBe(true);
    expect(await titleOf(site)).toBe('Traducción');
    expect(await site.contentVersion.current()).not.toBe(published);
  });

  it('a refusal changes neither what the students read nor the version', async () => {
    const site = publishingSite({
      published: memoryRepository(bundle('Traducción')),
      draft: memoryRepository(bundle('Traducción (borrador)')),
      releases,
    });
    const start = await site.contentVersion.current();
    state.refusal = 'blocked';
    try {
      expect((await site.releases.publish(input)).ok).toBe(false);
      expect((await site.releases.revert(7, input.by)).ok).toBe(false);
    } finally {
      state.refusal = null;
    }
    expect(await titleOf(site)).toBe('Traducción');
    expect(await site.contentVersion.current()).toBe(start);
  });

  it('every read goes to the side in use', async () => {
    const site = publishingSite({
      published: memoryRepository(bundle('Traducción')),
      draft: memoryRepository(bundle('Traducción (borrador)')),
      releases,
    });
    const r = site.repository;
    expect((await r.catalog()).semesters).toHaveLength(1);
    expect(await r.search('traduccion', 5, ['otro'])).toEqual([]);
    expect(await r.deckJson('1')).toBeNull();
    expect(await r.cardChanges(0, 10)).toMatchObject({ changes: [] });
    expect(await r.card('x', 0)).toBeNull();
    expect(await r.quizzes()).toEqual([]);
    expect(await r.quiz('x')).toBeNull();
    expect(await r.quizSectionJson('x', 'y')).toBeNull();
    expect((await r.courses()).map((c) => c.id)).toEqual(['biologia-celular']);
    expect(await r.deckCourse('1')).toBeNull();
    expect(await site.releases.log()).toMatchObject({ releases: [{ id: 7 }] });
  });
});
