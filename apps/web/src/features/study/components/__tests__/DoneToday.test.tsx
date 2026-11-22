// Tests what «Listo por hoy» says in each case: the Extras off, nothing turned on, and the day done with or without a
// date, from a deck, an assessment and a course.

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CongratsInfo } from '@qv/study';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree, hasPage } from '../../../catalog/model/tree';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { DoneToday } from '../DoneToday';
import { CONGRATS_BASE } from '../../../../test/fixtures/congrats';
import { structure } from '../../../../test/dom';

const tree = buildAnkiTree(CATALOG);
const at = (depth: number) =>
  tree.nodes.find((n): n is CourseDeckNode => n.depth === depth && hasPage(n))!;

const EXAM = {
  computed: false,
  finalReview: false,
  lastNewDay: false,
  roseTo: null,
  catchUp: null,
};

function html(info: Partial<CongratsInfo>, node = at(5), seen = false) {
  const { container } = render(
    <MemoryRouter>
      <DoneToday
        info={{ ...CONGRATS_BASE, ...info }}
        node={node}
        deckPath="/deck"
        hasSeen={() => seen}
        summary={<p>resumen</p>}
      />
    </MemoryRouter>,
  );
  return structure(container);
}

describe('«Listo por hoy»', () => {
  it('with the Extras off, from a deck and from a course', () => {
    expect(html({ extrasOff: true, dueTomorrow: 1 })).toMatchSnapshot();
    expect(html({ extrasOff: true, dueTomorrow: 2 }, at(2))).toMatchSnapshot();
  });

  it('with nothing turned on, with and without the next learning card', () => {
    expect(
      html({ nothingActive: true, learnMessage: 'La próxima en 5 minutos.' }),
    ).toMatchSnapshot();
    expect(html({ nothingActive: true }, at(2))).toMatchSnapshot();
  });

  it('done for the day, without a date', () => {
    expect(html({})).toMatchSnapshot();
    expect(
      html({ newLimitReached: true, buried: true, inactiveNew: 3 }, at(5), true),
    ).toMatchSnapshot();
    expect(html({ newLimitReached: true, dueTomorrow: 4 }, at(2), true)).toMatchSnapshot();
  });

  it('done for the day, with a date', () => {
    const catchUp = { overdue: 12, perDay: 4, days: 3 };
    expect(
      html({ newLimitReached: true, exam: { ...EXAM, finalReview: true, roseTo: 9, catchUp } }),
    ).toMatchSnapshot();
    expect(html({ buried: true, exam: { ...EXAM, lastNewDay: true } })).toMatchSnapshot();
    expect(
      html({ newLimitReached: true, exam: { ...EXAM, computed: true } }, at(3), true),
    ).toMatchSnapshot();
  });
});

describe('the final reviews «Listo por hoy» offers', () => {
  const done = (
    node: CourseDeckNode,
    seen: (id: string) => boolean,
    info: Partial<CongratsInfo> = {},
  ) =>
    render(
      <MemoryRouter>
        <DoneToday
          info={{ ...CONGRATS_BASE, ...info }}
          node={node}
          deckPath="/deck"
          hasSeen={seen}
          summary={null}
        />
      </MemoryRouter>,
    );
  const reviews = () =>
    screen.queryAllByRole('link', { name: /^Repasar/ }).map((a) => a.textContent);

  it('from a course with two assessments seen, one for each, named', () => {
    const catalog = structuredClone(CATALOG);
    const first = catalog.anki.decks.find((d) => d.id === '4')!;
    catalog.anki.decks.push({
      ...first,
      id: '30',
      name: first.name.replace('Certamen 1', 'Certamen 2'),
    });
    const course = buildAnkiTree(catalog).nodes.find(
      (n): n is CourseDeckNode => n.depth === 2 && hasPage(n),
    )!;
    done(course, () => true);
    expect(reviews()).toEqual([
      'Repasar Certamen 1, sin cambiar fechas',
      'Repasar Certamen 2, sin cambiar fechas',
    ]);
    expect(screen.getAllByRole('link', { name: /^Repasar/ })[1]).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-2/review',
    );
  });

  it('only those already seen; with one, it is not named', () => {
    done(at(2), (id) => id === '4');
    expect(reviews()).toEqual(['Repasar igual, sin cambiar fechas']);
  });

  it('none from a deck with no assessment above it', () => {
    const lone = { ...at(5), parent: null } as CourseDeckNode;
    done(lone, () => true);
    expect(reviews()).toEqual([]);
  });

  it('a learning card still to come says when, also with the day done', () => {
    done(at(5), () => false, { learnMessage: 'La próxima en 5 minutos.' });
    expect(screen.getByText('La próxima en 5 minutos.')).toBeInTheDocument();
  });
});
