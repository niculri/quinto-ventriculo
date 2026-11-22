// Tests the card viewer on its own: the arrows and the keys ask for the card beside it, never one outside the list.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { fakeApi } from '../../../../test/fakes/api';
import { DECK } from '../../../../test/fixtures/deck';
import { CardViewer } from '../CardViewer';

const CARDS = DECK.cards.slice(0, 3);

function show(index: number) {
  const onIndexChange = vi.fn();
  render(
    <ApiClientContext value={fakeApi()}>
      <QueryClientProvider client={new QueryClient()}>
        <CardViewer cards={CARDS} index={index} onIndexChange={onIndexChange} onClose={() => {}} />
      </QueryClientProvider>
    </ApiClientContext>,
  );
  return onIndexChange;
}

describe('moving through the list', () => {
  it('from the middle, each arrow and each button asks for the card beside it', async () => {
    const onIndexChange = show(1);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
    await userEvent.click(screen.getByRole('button', { name: 'Tarjeta anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tarjeta siguiente' }));
    expect(onIndexChange.mock.calls).toEqual([[0], [2], [0], [2]]);
  });

  it('at the ends, the keys ask for nothing outside the list', async () => {
    const first = show(0);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{ArrowLeft}');
    expect(first).not.toHaveBeenCalled();
  });

  it('on the last card, «→» asks for nothing', async () => {
    const last = show(CARDS.length - 1);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{ArrowRight}');
    expect(last).not.toHaveBeenCalled();
  });
});
