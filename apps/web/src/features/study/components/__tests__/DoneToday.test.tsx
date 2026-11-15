// Tests what «Listo por hoy» says in each case: the Extras off, nothing turned on, and the day done with or without a
// date, from a deck, an assessment and a course.

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CongratsInfo } from '@qv/study';
import { CATALOG } from '../../../../test/render';
import { buildAnkiTree, hasPage } from '../../../catalog/model/tree';
import type { CourseDeckNode } from '../../../catalog/model/tree';
import { DoneToday } from '../DoneToday';

const tree = buildAnkiTree(CATALOG);
const at = (depth: number) =>
  tree.nodes.find((n): n is CourseDeckNode => n.depth === depth && hasPage(n))!;

const BASE: CongratsInfo = {
  learnMessage: '',
  reviewLimitReached: false,
  newLimitReached: false,
  buried: false,
  dueTomorrow: 0,
  inactiveNew: 0,
  nothingActive: false,
  extrasOff: false,
  exam: null,
};
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
        info={{ ...BASE, ...info }}
        node={node}
        deckPath="/deck"
        hasSeen={() => seen}
        summary={<p>resumen</p>}
      />
    </MemoryRouter>,
  );
  return container.innerHTML;
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
