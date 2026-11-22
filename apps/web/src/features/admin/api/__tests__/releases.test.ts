// Tests what «Publicaciones» reads: the texts and the missing images are read page after page until there is no
// next one, the impact goes 300 decks per call, and nothing is asked before there is a draft.
import { QueryClient } from '@tanstack/react-query';
import type { DeckImpact, ReleaseText } from '@qv/schema';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../../test/fakes/api';
import { RELEASE_OVERVIEW } from '../../../../test/releases';
import { localAdminRepository } from '../repository';
import { impactQuery, missingImagesQuery, phrasesQuery } from '../releases';

const text = (key: string, t: string): ReleaseText => ({
  kind: 'article',
  key,
  assessmentId: 'a',
  label: key,
  text: t,
});

describe('reading the draft page by page', () => {
  it('the texts of every page are checked for the process phrases', async () => {
    const releaseTexts = vi.fn(async (after: string | null) =>
      after === null
        ? { items: [text('uno', 'Nada raro.')], next: 'p2' }
        : { items: [text('dos', 'El dato se dedujo de la pauta.')], next: null },
    );
    const hits = await new QueryClient().query(phrasesQuery(fakeApi({ releaseTexts }), 'fp'));
    expect(releaseTexts.mock.calls.map(([after]) => after)).toEqual([null, 'p2']);
    expect(hits.map((h) => h.key)).toEqual(['dos']);
  });

  it('the missing images of every page are joined', async () => {
    const releaseMedia = vi.fn(async (after: string | null) =>
      after === null
        ? { checked: ['a.png'], missing: ['b.png'], next: 'x' }
        : { checked: [], missing: ['c.png'], next: null },
    );
    const missing = await new QueryClient().query(
      missingImagesQuery(fakeApi({ releaseMedia }), 'fp'),
    );
    expect(missing).toEqual(['b.png', 'c.png']);
  });

  it('without a draft neither is asked', () => {
    expect(phrasesQuery(fakeApi(), undefined).enabled).toBe(false);
    expect(missingImagesQuery(fakeApi(), undefined).enabled).toBe(false);
  });
});

describe('the impact of the decks', () => {
  const impact = (deckId: string): DeckImpact => ({
    deckId,
    studentsSeen: 1,
    cardsSeen: 2,
    studentsActive: 0,
  });

  it('asks 300 decks at a time and keeps each by its id', async () => {
    const admin = localAdminRepository({ admin: true });
    const deckImpact = vi
      .spyOn(admin, 'deckImpact')
      .mockImplementation(async (ids) => ids.map(impact));
    const ids = Array.from({ length: 601 }, (_, i) => String(i));
    const out = await new QueryClient().query(impactQuery(admin, RELEASE_OVERVIEW, ids));
    expect(deckImpact.mock.calls.map(([batch]) => batch.length)).toEqual([300, 300, 1]);
    expect(out.size).toBe(601);
    expect(out.get('600')).toEqual(impact('600'));
  });

  it('is not asked without a draft or without decks', () => {
    const admin = localAdminRepository({ admin: true });
    expect(impactQuery(admin, undefined, ['1']).enabled).toBe(false);
    expect(impactQuery(admin, RELEASE_OVERVIEW, []).enabled).toBe(false);
    expect(impactQuery(admin, RELEASE_OVERVIEW, ['1']).enabled).toBe(true);
  });
});
