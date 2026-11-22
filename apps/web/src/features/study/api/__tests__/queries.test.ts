// Tests the summary of «Listo por hoy»: it reads the day only after the session's writes, also when one failed.

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences, localStudyRepository } from '../../../progress/api/repository';
import { deckNode } from '../../../../test/decksFakes';
import { daySummaryQuery } from '../queries';

const root = deckNode('root', '() Raíz', null);
const course = deckNode('course', 'Ramo', deckNode('sem', 'Semestre', root));
const assessment = deckNode('cert', 'Certamen', course);

function summaryOf(saved: () => Promise<unknown>) {
  const study = localStudyRepository(null);
  const order: string[] = [];
  const rated = study.ratedBetween.bind(study);
  study.ratedBetween = (from, to) => {
    order.push('read');
    return rated(from, to);
  };
  const query = daySummaryQuery({
    study,
    client: new QueryClient(),
    node: assessment,
    prefs: defaultPreferences('UTC'),
    saved: async () => {
      await saved();
      order.push('saved');
    },
    visit: 1,
  });
  return { order, run: () => new QueryClient().query(query) };
}

describe('the summary of the day', () => {
  it('waits for the writes of the session before reading', async () => {
    const { order, run } = summaryOf(() => new Promise((r) => setTimeout(r, 5)));
    const result = await run();
    expect(order).toEqual(['saved', 'read']);
    expect(result.summary).toBeTruthy();
  });

  it('a write that failed does not stop it: it shows what the database has', async () => {
    const { order, run } = summaryOf(() => Promise.reject(new Error('sin red')));
    const result = await run();
    expect(order).toEqual(['read']);
    expect(typeof result.today).toBe('number');
  });

  it('each visit is read again', () => {
    const key = (visit: number) =>
      daySummaryQuery({
        study: localStudyRepository(null),
        client: new QueryClient(),
        node: assessment,
        prefs: defaultPreferences('UTC'),
        saved: vi.fn(),
        visit,
      }).queryKey;
    expect(key(1)).not.toEqual(key(2));
  });
});
