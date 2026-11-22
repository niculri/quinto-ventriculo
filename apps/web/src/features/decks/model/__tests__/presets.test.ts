// Tests which preset the decks' options open with: the one in the URL, else the one of the deck, else a fallback.

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@qv/srs';
import type { PresetChoice } from '@qv/study';
import type { AnkiTree, DeckNode } from '../../../catalog/model/tree';
import { initialRef, refKey } from '../presets';
import { deckNode } from '../../../../test/decksFakes';

const author = (name: string): PresetChoice => ({
  ref: { kind: 'author', name },
  name,
  config: defaultConfig(),
  row: null,
});
const user = (id: string, name: string): PresetChoice => ({
  ref: { kind: 'user', id },
  name,
  config: defaultConfig(),
  row: { id, name, replaces: null, config: {}, updatedAt: '2026-01-01T00:00:00Z' },
});
const CHOICES = [author('Default'), author('Intenso'), user('u1', 'Mío')];

const root = deckNode('root', 'Raíz', null, 'Intenso');
const child = deckNode('child', 'Hijo', root, 'Default');
const treeOf = (nodes: DeckNode[]): AnkiTree => ({
  root: nodes[0] ?? null,
  byId: new Map(nodes.map((n) => [n.id, n])),
  nodes,
});
const TREE = treeOf([root, child]);
const params = (q: string) => new URLSearchParams(q);

describe('the key of a preset', () => {
  it('tells apart an author preset and a user preset of the same name', () => {
    expect(refKey({ kind: 'author', name: 'x' })).toBe('author:x');
    expect(refKey({ kind: 'user', id: 'x' })).toBe('user:x');
  });
});

describe('the preset the options open with', () => {
  it('the URL names a user preset by its id and an author preset by its name', () => {
    expect(initialRef(params('preset=u1'), CHOICES, TREE, [])).toEqual({ kind: 'user', id: 'u1' });
    expect(initialRef(params('preset=Intenso&deck=child'), CHOICES, TREE, [])).toEqual({
      kind: 'author',
      name: 'Intenso',
    });
  });

  it('a user preset is not found by its name, nor an author one by an id', () => {
    expect(initialRef(params('preset=Mío&deck=child'), CHOICES, TREE, [])).toEqual({
      kind: 'author',
      name: 'Default',
    });
  });

  it("without a preset in the URL, the deck's own: its setting first, then the author's", () => {
    expect(initialRef(params('deck=child'), CHOICES, TREE, [])).toEqual({
      kind: 'author',
      name: 'Default',
    });
    const settings = [{ deckId: 'child', presetId: 'u1', authorPreset: null }];
    expect(initialRef(params('deck=child'), CHOICES, TREE, settings)).toEqual({
      kind: 'user',
      id: 'u1',
    });
  });

  it('without a deck, or with one that is not in the tree, the root deck', () => {
    expect(initialRef(params(''), CHOICES, TREE, [])).toEqual({ kind: 'author', name: 'Intenso' });
    expect(initialRef(params('deck=gone'), CHOICES, TREE, [])).toEqual({
      kind: 'author',
      name: 'Intenso',
    });
  });

  it('without decks: the first preset, and without presets the default one', () => {
    const empty = treeOf([]);
    expect(initialRef(params(''), [user('u1', 'Mío')], empty, [])).toEqual({
      kind: 'user',
      id: 'u1',
    });
    expect(initialRef(params(''), [], empty, [])).toEqual({ kind: 'author', name: 'Default' });
  });
});
