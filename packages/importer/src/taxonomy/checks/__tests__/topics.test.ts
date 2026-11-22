// Tests the check of the topics the map names: which ones do not serve, and what the message tells to use instead.
import { describe, expect, it } from 'vitest';
import { checkMapTopics } from '../topics';
import { contextOf, mapOf, taxonomyOf } from './contexts';

const unit = (topics: { id: string; mergedInto?: string; retired?: true }[]) =>
  taxonomyOf([
    { id: 'u1', title: 'u1', topics: topics.map((t) => ({ title: t.id.toUpperCase(), ...t })) },
  ]);

describe('checkMapTopics', () => {
  it('a topic joined into another says which to use, following the chain to the one that is active', () => {
    const ctx = contextOf(
      unit([{ id: 't1' }, { id: 't2', mergedInto: 't1' }, { id: 't3', mergedInto: 't2' }]),
      mapOf([{ guid: 'g', topic: 't3' }]),
    );
    checkMapTopics(ctx);
    expect(ctx.problems.all()).toEqual([
      'La nota g apunta al tema t3 «T3», que se juntó con t1 «T1»: usa t1.',
    ]);
  });

  it('a topic joined into one that does not exist names it as it is written', () => {
    const ctx = contextOf(
      unit([{ id: 't2', mergedInto: 'zz' }]),
      mapOf([], [{ id: 'q/p', topic: 't2', secondary: ['t2'] }]),
    );
    checkMapTopics(ctx);
    expect(ctx.problems.all()).toEqual([
      'La pregunta q/p apunta al tema t2 «T2», que se juntó con zz: usa zz.',
      'La pregunta q/p tiene como secundario el tema t2 «T2», que se juntó con zz: usa zz.',
    ]);
  });
});
