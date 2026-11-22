// Rendering every card of a collection: which note, note type and deck each card is looked up in, and the cards that
// cannot be rendered.
import { describe, expect, it } from 'vitest';
import { createCardRenderer } from '../collection';

const collection = {
  noteTypes: [
    {
      id: 'nt',
      name: 'Basic',
      kind: 'normal' as const,
      fields: ['Front', 'Back'],
      templates: [
        {
          name: 'Card 1',
          qfmt: '{{Front}} in {{Deck}} / {{Subdeck}}',
          afmt: '{{FrontSide}}<hr>{{Back}} {{CardFlag}} {{CardID}}',
        },
      ],
    },
  ],
  decks: [
    { id: 'd1', name: 'A::B' },
    { id: 'd2', name: 'Filtered' },
  ],
  notes: [
    { id: 'n1', noteTypeId: 'nt', fields: ['q', 'a'], tags: ['t'] },
    { id: 'n2', noteTypeId: 'gone', fields: ['q', 'a'], tags: [] },
  ],
};
const card = (over: Partial<Parameters<ReturnType<typeof createCardRenderer>>[0]> = {}) => ({
  id: 'c1',
  noteId: 'n1',
  ord: 0,
  deckId: 'd1',
  originalDeckId: null,
  flags: 0,
  ...over,
});

describe('createCardRenderer', () => {
  const render = createCardRenderer(collection);

  it('renders a card with the deck it is in and its flag and id', () => {
    expect(render(card({ flags: 3 }))).toEqual({
      question: 'q in A::B / B',
      answer: 'q in A::B / B<hr>a flag3 c1',
      isEmpty: false,
      error: null,
    });
  });

  it('a card in a filtered deck is rendered as in the deck it came from', () => {
    expect(render(card({ deckId: 'd2', originalDeckId: 'd1' })).question).toBe('q in A::B / B');
    expect(render(card({ deckId: 'd2' })).question).toBe('q in Filtered / Filtered');
  });

  it('a deck that is not in the collection reads as «(Deck)»', () => {
    expect(render(card({ deckId: 'nowhere' })).question).toBe('q in (Deck) / (Deck)');
  });

  it('a card whose note does not exist, or whose note type does not, comes out as an empty card with its reason', () => {
    for (const noteId of ['n-missing', 'n2']) {
      expect(render(card({ noteId, id: 'c9' }))).toEqual({
        question: 'Card c9 without its note or note type.',
        answer: 'Card c9 without its note or note type.',
        isEmpty: true,
        error: 'Card c9 without its note or note type.',
      });
    }
  });

  it('a template that does not exist is an error of that card only', () => {
    expect(render(card({ ord: 4 })).error).toBe('The note type «Basic» has no template 5.');
    expect(render(card()).error).toBeNull();
  });
});
