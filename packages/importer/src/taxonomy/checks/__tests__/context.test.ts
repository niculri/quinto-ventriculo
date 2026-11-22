// Tests what the context of a check says about what could not be compared, and how it names a topic.
import { describe, expect, it } from 'vitest';
import { labelOf, noteOfTopic } from '../context';
import { contextOf, mapOf, taxonomyOf } from './contexts';

const tax = taxonomyOf([{ id: 'u1', title: 'u1', topics: [{ id: 't1', title: 'Uno' }] }]);

describe('createContext', () => {
  it('says what the history could not check: without a commit or in a shallow clone, and nothing with the full one', () => {
    expect(contextOf(tax, mapOf(), { history: 'commit' }).unchecked).toEqual([]);
    expect(contextOf(tax, mapOf()).unchecked).toEqual([]);
    expect(contextOf(tax, mapOf(), { history: 'none' }).unchecked).toEqual([
      'ids reutilizados (sin commit con qué comparar)',
    ]);
    expect(contextOf(tax, mapOf(), { history: 'shallow' }).unchecked).toEqual([
      'ids reutilizados contra el historial completo (clon superficial)',
    ]);
  });
});

describe('labelOf and noteOfTopic', () => {
  it('a known topic is named with its title and an unknown one by its id alone', () => {
    const ctx = contextOf(tax, mapOf());
    expect(labelOf(ctx, 't1')).toBe('t1 «Uno»');
    expect(labelOf(ctx, 'zz')).toBe('zz');
  });

  it('the article of a topic is its own, or the only one of its unit, else none', () => {
    const topic = { id: 't', title: 'T' };
    expect(noteOfTopic({ id: 'u', title: 'u', topics: [] }, { ...topic, note: 'n9' })).toBe('n9');
    expect(noteOfTopic({ id: 'u', title: 'u', topics: [], notes: ['n1'] }, topic)).toBe('n1');
    expect(
      noteOfTopic({ id: 'u', title: 'u', topics: [], notes: ['n1', 'n2'] }, topic),
    ).toBeUndefined();
    expect(noteOfTopic({ id: 'u', title: 'u', topics: [] }, topic)).toBeUndefined();
  });
});
