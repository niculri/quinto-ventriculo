// Tests the end of a round: its count of cards and of «Otra vez», and its own title and button.

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Round } from '@qv/study';
import { RoundDone } from '../RoundDone';
import { structure } from '../../../../test/dom';

const round = (total: number, again: number): Round => ({
  queue: [],
  total,
  done: total,
  again,
  revealed: false,
});

function html(r: Round, extra: { title?: string; againLabel?: string } = {}) {
  const { container } = render(
    <MemoryRouter>
      <RoundDone round={r} deckPath="/deck" label="Certamen 1" onAgain={() => {}} {...extra} />
    </MemoryRouter>,
  );
  return structure(container);
}

describe('the end of a round', () => {
  it('counts the cards and the «Otra vez»', () => {
    expect(html(round(1, 0))).toMatchSnapshot();
    expect(html(round(1200, 1))).toMatchSnapshot();
    expect(html(round(3, 2), { title: 'Terminaste', againLabel: 'Otra ronda' })).toMatchSnapshot();
  });
});
