// Tests the table's actions on the selection: the current card decides which way each goes, only the cards it changes
// are sent, a draft-only card or no card does nothing, and each says it in the words of the mode.
import { act as reactAct, renderHook } from '@testing-library/react';
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { storedCard } from '../../../../test/fixtures/storedCard';
import type { BrowseCard } from '../../model/browseCards';
import { useCardActions } from '../useCardActions';

const TIMING = { nextDayAt: 1_800_000_000 } as SchedTiming;
const row = storedCard('x', 0, '20');
const card = (guid: string, patch: Partial<BrowseCard> = {}) =>
  browseCard({ key: guid, deckId: `d-${guid}`, note: { guid }, ...patch });

const NEW = card('n');
const SUSPENDED = card('s', { queue: 'suspended', row });
const BURIED = card('b', { queue: 'buried', row });
const REVIEW = card('r', { queue: 'review', row, flag: 2 });

function actions(chosen: BrowseCard[], focus: BrowseCard | null, full = true) {
  const act = vi.fn(() => Promise.resolve());
  const hook = renderHook(() =>
    useCardActions({ chosen: () => chosen, focus, timing: TIMING, full, act }),
  );
  return { ...hook, act, last: () => act.mock.calls.at(-1) as unknown[] | undefined };
}

const sent = (w: unknown) => (w as { cards: { noteGuid: string }[] }).cards.map((c) => c.noteGuid);

describe('suspending', () => {
  it('suspends the ones not suspended yet when the current card is not', () => {
    const { result, last } = actions([NEW, SUSPENDED, REVIEW], REVIEW);
    result.current.toggleSuspend();
    expect(last()![0]).toBe('Suspendidas');
    expect(last()![1]).toMatchObject({ kind: 'suspend' });
    expect(sent(last()![1])).toEqual(['n', 'r']);
    expect((last()![1] as { cards: unknown[] }).cards[0]).toEqual({
      noteGuid: 'n',
      ord: 0,
      deckId: 'd-n',
    });
  });

  it('brings back the suspended ones when the current card is suspended', () => {
    const { result, last } = actions([NEW, SUSPENDED], SUSPENDED, false);
    result.current.toggleSuspend();
    expect(last()![0]).toBe('Se mostrarán de nuevo');
    expect(last()![1]).toMatchObject({ kind: 'unsuspend' });
    expect(sent(last()![1])).toEqual(['s']);
  });

  it.each([
    ['suspended', true, 'Suspendidas', 'Se quitó la suspensión'],
    ['hidden', false, 'No se mostrarán más', 'Se mostrarán de nuevo'],
  ])('says it with the words of the mode (%s)', (_mode, full, on, off) => {
    const a = actions([NEW], null, full);
    a.result.current.toggleSuspend();
    expect(a.last()![0]).toBe(on);
    const b = actions([SUSPENDED], SUSPENDED, full);
    b.result.current.toggleSuspend();
    expect(b.last()![0]).toBe(off);
  });
});

describe('burying', () => {
  it('buries until the next day the ones neither buried nor suspended', () => {
    const { result, last } = actions([NEW, BURIED, SUSPENDED, REVIEW], null, false);
    result.current.toggleBury();
    expect(last()![0]).toBe('Saltadas por hoy');
    expect(last()![1]).toMatchObject({ kind: 'bury', until: new Date(TIMING.nextDayAt * 1000) });
    expect(sent(last()![1])).toEqual(['n', 'r']);
  });

  it('does nothing when every chosen card is already buried or suspended', () => {
    const { result, act } = actions([BURIED, SUSPENDED], REVIEW);
    result.current.toggleBury();
    expect(act).not.toHaveBeenCalled();
  });

  it('unburies the buried ones when the current card is buried', () => {
    const { result, last } = actions([NEW, BURIED], BURIED, true);
    result.current.toggleBury();
    expect(last()![0]).toBe('Desenterradas');
    expect(last()![1]).toMatchObject({ kind: 'unbury' });
    expect(sent(last()![1])).toEqual(['b']);
    const simple = actions([BURIED], BURIED, false);
    simple.result.current.toggleBury();
    expect(simple.last()![0]).toBe('Vuelven hoy');
    const full = actions([NEW], null, true);
    full.result.current.toggleBury();
    expect(full.last()![0]).toBe('Enterradas hasta mañana');
  });
});

describe('flags', () => {
  it('put a flag on every chosen card', () => {
    const { result, last } = actions([NEW, REVIEW], NEW);
    result.current.flag(3);
    expect(last()).toEqual(['Marcadas', expect.objectContaining({ kind: 'flags', flag: 3 })]);
    expect(sent(last()![1])).toEqual(['n', 'r']);
  });

  it('take it away when the current card already has that flag', () => {
    const { result, last } = actions([NEW, REVIEW], REVIEW, true);
    result.current.flag(2);
    expect(last()).toEqual(['Sin bandera', expect.objectContaining({ flag: 0 })]);
    const simple = actions([REVIEW], REVIEW, false);
    simple.result.current.flag(2);
    expect(simple.last()![0]).toBe('Sin marca');
  });
});

describe('forgetting', () => {
  it('forgets only the cards the student has seen, and closes the dialog', () => {
    const { result, last } = actions([NEW, REVIEW], REVIEW);
    reactAct(() => result.current.setForgetting(true));
    expect(result.current.forgetting).toBe(true);
    reactAct(() => result.current.forget(true));
    expect(result.current.forgetting).toBe(false);
    expect(last()).toEqual([
      'Olvidadas: vuelven a ser nuevas',
      expect.objectContaining({ kind: 'forget', reset: true }),
    ]);
    expect(sent(last()![1])).toEqual(['r']);
  });

  it('closes the dialog and does nothing when no chosen card was seen', () => {
    const { result, act } = actions([NEW], NEW);
    reactAct(() => result.current.setForgetting(true));
    reactAct(() => result.current.forget(false));
    expect(result.current.forgetting).toBe(false);
    expect(act).not.toHaveBeenCalled();
  });
});

describe('every action', () => {
  it.each(['toggleSuspend', 'toggleBury', 'flag', 'forget'] as const)(
    '%s does nothing without a chosen card',
    (name) => {
      const { result, act } = actions([], null);
      reactAct(() => (result.current[name] as (x?: unknown) => void)(1));
      expect(act).not.toHaveBeenCalled();
    },
  );

  it.each(['toggleSuspend', 'toggleBury', 'flag', 'forget'] as const)(
    '%s does nothing when a chosen card only the draft has is among them',
    (name) => {
      const draft = card('x', { draftOnly: true, row });
      const { result, act } = actions([REVIEW, draft], REVIEW);
      expect(result.current.blocked).toBe(true);
      reactAct(() => (result.current[name] as (x?: unknown) => void)(1));
      expect(act).not.toHaveBeenCalled();
    },
  );
});
