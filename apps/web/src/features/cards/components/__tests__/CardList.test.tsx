// Tests the cards page's virtual list: the photos of a lecture drawn as a grid, and the lecture and topic pinned
// under the site's bar only once the list goes under it.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { explorerCard, matched } from '../../../../test/cardsUiFakes';
import { compiled } from '../../../../test/compiled';
import { groupNotes } from '../../model/groups';
import type { Matched } from '../../model/filters';
import { listItems } from '../../model/list';
import { CardList } from '../CardList';

vi.mock('../../model/list', async (original) => {
  const model = await original<{ listItems: typeof listItems }>();
  return { ...model, listItems: vi.fn(model.listItems) };
});

const photo = (guid: string) =>
  matched({
    note: {
      guid,
      kind: 'photo',
      front: `Foto ${guid}`,
      back: `Respuesta ${guid}`,
      topic: 'Láminas',
    },
    cards: [explorerCard(0, { noteGuid: guid, key: `${guid}/0` })],
  });

function list(lectures = groupNotes([photo('p1'), photo('p2'), photo('p3')])) {
  const onOpen = vi.fn();
  render(
    <CardList
      lectures={lectures}
      lectureTitle={(id) => `Clase ${id}`}
      hideAnswers={false}
      thumbs={null}
      onOpen={onOpen}
      reveal={null}
    />,
  );
  const section = screen.getByRole('region', { name: /Tarjetas|Lista/ });
  const pinned = section.querySelector<HTMLElement>('.sticky > div')!;
  return { section, pinned, onOpen };
}

function listAt(top: number, lectures?: Parameters<typeof list>[0]) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top,
    width: 360,
    height: 0,
    left: 0,
    right: 360,
    bottom: top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  return list(lectures);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CardList', () => {
  it('a lecture of photos draws them in a grid, two to a row on a phone, and a photo opens its note', async () => {
    const { section, onOpen } = list();
    const cells = within(section).getAllByRole('button');
    expect(cells.map((c) => c.getAttribute('data-position'))).toEqual(['0', '1', '2']);
    expect(cells[0]!.closest('.grid')).toBe(cells[1]!.closest('.grid'));
    expect(cells[2]!.closest('.grid')).not.toBe(cells[0]!.closest('.grid'));
    await userEvent.click(cells[2]!);
    expect((onOpen.mock.calls[0]![0] as Matched).note.note.guid).toBe('p3');
  });

  it('while the list is below the site’s bar, its lecture is not pinned', () => {
    const { pinned } = listAt(500);
    expect(pinned).toHaveClass('invisible');
  });

  it('once the list goes under the bar, its lecture and topic are pinned', () => {
    const { pinned } = listAt(-200);
    expect(pinned).not.toHaveClass('invisible');
    expect(pinned).toHaveTextContent('Clase 20› Imágenes');
  });

  it('a lecture whose notes have no topic pins only the lecture', () => {
    const { pinned } = listAt(-200, groupNotes([matched({ note: { topic: '' } })]));
    expect(pinned.textContent).toBe('Clase 20');
  });

  it('an empty list pins nothing', () => {
    const { pinned } = listAt(-200, []);
    expect(pinned).toHaveClass('invisible');
    expect(pinned.textContent).toBe('');
  });

  // What the compiler gives and the coverage run, without it, does not: the layout of a long list is the heaviest step.
  it.skipIf(!compiled)('a scroll draws the list again without laying it out again', async () => {
    const { section } = listAt(0);
    await waitFor(() => expect(within(section).getAllByRole('button')).toHaveLength(3));
    const laidOut = vi.mocked(listItems).mock.calls.length;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: -300,
      width: 360,
      height: 0,
      left: 0,
      right: 360,
      bottom: -300,
      x: 0,
      y: -300,
      toJSON: () => ({}),
    });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(vi.mocked(listItems).mock.calls.length).toBe(laidOut);
  });
});
