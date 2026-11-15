// Tests what the full mode's end screen says: the next learning card, the limits reached, buried cards and tomorrow.

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CongratsInfo } from '@qv/study';
import { Congrats } from '../Congrats';

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

function html(info: Partial<CongratsInfo>) {
  const { container } = render(
    <MemoryRouter>
      <Congrats info={{ ...BASE, ...info }} deckPath="/deck" summary={<p>resumen</p>} />
    </MemoryRouter>,
  );
  return container.innerHTML;
}

describe('the full mode’s end screen', () => {
  it('with nothing more to say', () => {
    expect(html({})).toMatchSnapshot();
  });

  it('with every note', () => {
    expect(
      html({
        learnMessage: 'La próxima en 5 minutos.',
        reviewLimitReached: true,
        newLimitReached: true,
        buried: true,
        dueTomorrow: 7,
      }),
    ).toMatchSnapshot();
  });
});
