// How the decks' options name a preset among the author's and the user's: its key in a list, and which one a page
// opens with (the one in the URL, or the one its deck uses).

import { presetOf } from '@qv/study';
import type { PresetChoice, PresetRef } from '@qv/study';
import type { AnkiTree } from '../../catalog/model/tree';
import type { DeckSetting } from '@qv/schema/user';

export const refKey = (r: PresetRef) => (r.kind === 'author' ? `author:${r.name}` : `user:${r.id}`);

export function initialRef(
  params: URLSearchParams,
  choices: PresetChoice[],
  tree: AnkiTree,
  settings: DeckSetting[],
): PresetRef {
  const wanted = params.get('preset');
  const byParam = wanted
    ? choices.find((c) => (c.ref.kind === 'user' ? c.ref.id : c.ref.name) === wanted)
    : undefined;
  if (byParam) return byParam.ref;
  const deck = tree.byId.get(params.get('deck') ?? '') ?? tree.root;
  if (deck) return presetOf(deck.id, deck.preset, choices, settings).ref;
  return choices[0]?.ref ?? { kind: 'author', name: 'Default' };
}
