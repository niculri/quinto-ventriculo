// Tests what the full mode's end screen says: the next learning card, the limits reached, buried cards and tomorrow.

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CongratsInfo } from '@qv/study';
import { Congrats } from '../Congrats';
import { CONGRATS_BASE } from '../../../../test/fixtures/congrats';
import { structure } from '../../../../test/dom';

function html(info: Partial<CongratsInfo>) {
  const { container } = render(
    <MemoryRouter>
      <Congrats info={{ ...CONGRATS_BASE, ...info }} deckPath="/deck" summary={<p>resumen</p>} />
    </MemoryRouter>,
  );
  return structure(container);
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
