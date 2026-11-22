// Tests the viewer's cards: the list's cards as they were when it opened (an action does not move them), a card the
// list does not have shown alone, nothing for an unknown card, the table or missing data, and forgotten on closing.
import { renderHook } from '@testing-library/react';
import type { CardIndexNote } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import type { CardsData } from '../../model/cardsData';
import type { ExplorerCard, ExplorerNote } from '../../model/explorer';
import type { Lecture } from '../../model/groups';
import { useViewerCards } from '../useViewerCards';

function note(guid: string, ords: number[]): ExplorerNote {
  return {
    note: {
      guid,
      code: `T-${guid}`,
      version: 1,
      kind: 'basic',
      sortField: `Nota ${guid}`,
    } as CardIndexNote,
    assessmentId: 'a1',
    lectureId: 'l1',
    image: false,
    index: 0,
    cards: ords.map((ord) => ({ noteGuid: guid, ord, deckId: '20' }) as ExplorerCard),
  };
}

const A = note('a', [0, 1]);
const B = note('b', [0]);
const HIDDEN = note('h', [0]);
const lectures = (...notes: ExplorerNote[]): Lecture[] => [
  {
    id: 'l1',
    notes: notes.length,
    groups: [
      {
        key: 'g',
        lectureId: 'l1',
        title: null,
        grid: false,
        items: notes.map((n) => ({ note: n, cards: n.cards })),
      },
    ],
  },
];
const DATA = { notes: [A, B, HIDDEN] } as unknown as CardsData;

type Props = Parameters<typeof useViewerCards>[0];

function viewer(card: string | null, patch: Partial<Props> = {}) {
  const props: Props = {
    params: new URLSearchParams(card ? { card } : {}),
    data: DATA,
    table: false,
    lectures: lectures(A, B),
    ...patch,
  };
  return renderHook((p: Props) => useViewerCards(p), { initialProps: props });
}

const opened = (c: { noteGuid: string; ord: number }[] | null) =>
  c?.map((x) => `${x.ord}:${x.noteGuid}`) ?? null;

describe('the viewer’s cards', () => {
  it('are every card of the list, at the opened one', () => {
    const { result } = viewer('1:a');
    expect(opened(result.current.viewerCards)).toEqual(['0:a', '1:a', '0:b']);
    expect(result.current.viewerIndex).toBe(1);
    expect(result.current.viewerCards![2]).toEqual({
      noteGuid: 'b',
      ord: 0,
      deckId: '20',
      code: 'T-b',
      version: 1,
      kind: 'basic',
      text: 'Nota b',
    });
  });

  it('stay as they were when the list changes under them', () => {
    const { result, rerender } = viewer('0:b');
    rerender({
      params: new URLSearchParams({ card: '0:a' }),
      data: DATA,
      table: false,
      lectures: lectures(B),
    });
    expect(opened(result.current.viewerCards)).toEqual(['0:a', '1:a', '0:b']);
    expect(result.current.viewerIndex).toBe(0);
  });

  it('are the card alone when the list does not have it', () => {
    const { result } = viewer('0:h');
    expect(opened(result.current.viewerCards)).toEqual(['0:h']);
    expect(result.current.viewerIndex).toBe(0);
  });

  it.each([
    ['a card its note does not have', '3:a', {}],
    ['a note nobody has', '0:z', {}],
    ['the table, which has its own viewer', '0:a', { table: true }],
    ['the data on its way', '0:a', { data: undefined }],
  ] as const)('are none for %s', (_what, card, patch) => {
    const { result } = viewer(card, patch);
    expect(result.current.viewerCards).toBeNull();
    expect(result.current.viewerIndex).toBe(-1);
  });

  it('are forgotten on closing, and read again from the new list on opening', () => {
    const { result, rerender } = viewer('0:a');
    const closed = {
      params: new URLSearchParams(),
      data: DATA,
      table: false,
      lectures: lectures(B),
    };
    rerender(closed);
    expect(result.current.open).toBeNull();
    expect(result.current.viewerCards).toBeNull();
    rerender({ ...closed, params: new URLSearchParams({ card: '0:b' }) });
    expect(opened(result.current.viewerCards)).toEqual(['0:b']);
  });
});
