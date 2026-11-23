// Tests StudyCard's warm-up: while the front is up its back's images are asked for, once, and not after the flip.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientContext } from '../../../../shared/hooks/useApi';
import { warmImages } from '../../../../shared/lib/warmImages';
import { fakeApi } from '../../../../test/fakes/api';
import { CARDS } from '../../../../test/fixtures/cards';
import { StudyCard } from '../StudyCard';

vi.mock('../../../../shared/lib/warmImages', () => ({ warmImages: vi.fn() }));

afterEach(() => vi.mocked(warmImages).mockClear());

const SRC = '/api/media/cards/answer.webp?e=7200&s=signature';
const base = CARDS['s@/AqX%n?#/0']!;
const card = { ...base, back: `${base.back}<img src="${SRC.replace('&', '&amp;')}">` };
const entry = { noteGuid: card.noteGuid, ord: card.ord };

function mount(revealed: boolean, client = new QueryClient()) {
  const api = { ...fakeApi(), card: () => Promise.resolve(card) };
  const tree = (shown: boolean) => (
    <ApiClientContext value={api}>
      <QueryClientProvider client={client}>
        <StudyCard entry={entry} revealed={shown} night={false} />
      </QueryClientProvider>
    </ApiClientContext>
  );
  const view = render(tree(revealed));
  return { flip: () => view.rerender(tree(true)) };
}

describe('the card on screen', () => {
  it('asks for its back’s images while its front is up, ahead of the next cards', async () => {
    const { flip } = mount(false);
    await screen.findByRole('region', { name: 'Frente de la tarjeta' });
    expect(warmImages).toHaveBeenCalledExactlyOnceWith([SRC], 'high');
    flip();
    await screen.findByRole('region', { name: 'Reverso de la tarjeta' });
    expect(warmImages).toHaveBeenCalledOnce();
  });

  it('asks for nothing when it opens already turned', async () => {
    mount(true);
    await screen.findByRole('region', { name: 'Reverso de la tarjeta' });
    expect(warmImages).not.toHaveBeenCalled();
  });
});
