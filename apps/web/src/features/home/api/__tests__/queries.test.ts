// Tests when the counts of «Hoy» are asked for, and that their key changes with the day and the decks.

import { describe, expect, it } from 'vitest';
import type { HomeStudyBase } from '@qv/study';
import { localStudyRepository } from '../../../progress/api/repository';
import { homeCountsQuery } from '../queries';

const study = localStudyRepository(null);
const base = {} as HomeStudyBase;

describe('the counts of «Hoy»', () => {
  it('wait for the study data, the day and at least one deck', () => {
    expect(homeCountsQuery(study, 20_000, undefined, base, ['a']).enabled).toBe(true);
    expect(homeCountsQuery(study, 20_000, undefined, undefined, ['a']).enabled).toBe(false);
    expect(homeCountsQuery(study, null, undefined, base, ['a']).enabled).toBe(false);
    expect(homeCountsQuery(study, 20_000, undefined, base, []).enabled).toBe(false);
  });

  it('are another query on another day or with other decks', () => {
    const key = (today: number | null, ids: string[]) =>
      JSON.stringify(homeCountsQuery(study, today, undefined, base, ids).queryKey);
    expect(key(20_000, ['a', 'b'])).not.toBe(key(20_001, ['a', 'b']));
    expect(key(20_000, ['a', 'b'])).not.toBe(key(20_000, ['a']));
    expect(key(null, ['a'])).toBe(key(-1, ['a']));
  });
});
