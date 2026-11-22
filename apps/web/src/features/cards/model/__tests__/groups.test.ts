// Tests the cards page's groups: by lecture in the order they come, by topic inside, a lecture's images together, and
// a grid for an image group that is mostly photos.
import { describe, expect, it } from 'vitest';
import type { Matched } from '../filters';
import { groupNotes } from '../groups';

const m = (lectureId: string, guid: string, topic: string, kind = 'basic', image = false) =>
  ({ note: { lectureId, image, note: { guid, topic, kind } }, cards: [] }) as unknown as Matched;

const shape = (matched: Matched[]) =>
  groupNotes(matched).map((l) => [
    l.id,
    l.notes,
    l.groups.map((g) => [g.title, g.grid, g.items.map((i) => i.note.note.guid)]),
  ]);

describe('the groups of the list', () => {
  it('keep the lectures and topics in the order they first come, and the notes of a topic together', () => {
    expect(
      shape([
        m('L2', 'a', 'Tema B'),
        m('L1', 'b', 'Tema A'),
        m('L2', 'c', 'Tema C'),
        m('L2', 'd', 'Tema B'),
      ]),
    ).toEqual([
      [
        'L2',
        3,
        [
          ['Tema B', false, ['a', 'd']],
          ['Tema C', false, ['c']],
        ],
      ],
      ['L1', 1, [['Tema A', false, ['b']]]],
    ]);
  });

  it('put the notes without a topic in one group without a title', () => {
    expect(shape([m('L1', 'a', ''), m('L1', 'b', 'Tema'), m('L1', 'c', '')])).toEqual([
      [
        'L1',
        3,
        [
          [null, false, ['a', 'c']],
          ['Tema', false, ['b']],
        ],
      ],
    ]);
  });

  it('put a lecture’s images in one group whatever their heading, apart from a topic called the same', () => {
    expect(
      shape([
        m('L1', 'a', 'Figura 1', 'occlusion', true),
        m('L1', 'b', 'Imágenes'),
        m('L1', 'c', 'Figura 2', 'occlusion', true),
      ]),
    ).toEqual([
      [
        'L1',
        3,
        [
          ['Imágenes', false, ['a', 'c']],
          ['Imágenes', false, ['b']],
        ],
      ],
    ]);
  });

  it('draw an image group as a grid when at least 80 % are photos', () => {
    const photos = (n: number, others: number) => [
      ...Array.from({ length: n }, (_, i) => m('L1', `p${i}`, 'Foto', 'photo', true)),
      ...Array.from({ length: others }, (_, i) => m('L1', `o${i}`, 'Figura', 'occlusion', true)),
    ];
    expect(groupNotes(photos(4, 1))[0]!.groups[0]!.grid).toBe(true);
    expect(groupNotes(photos(3, 1))[0]!.groups[0]!.grid).toBe(false);
  });

  it('are none for no notes', () => {
    expect(groupNotes([])).toEqual([]);
  });
});
