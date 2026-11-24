// Tests a list image's thumbnail: the signed picture once its key and signature are there (kept once drawn), the icon
// before, an expired signature asked for again and the icon for one that still fails.

import { QueriesWrapper } from '../../../../test/QueriesWrapper';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Thumb } from '../Thumb';

describe('Thumb', () => {
  it('shows the picture signed with the query, blurred only when asked', () => {
    const { container } = render(<Thumb thumb="cards/thumb/a.webp" thumbs="s=1" blur={true} />, {
      wrapper: QueriesWrapper,
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/cards\/thumb\/a\.webp\?s=1$/);
    expect(img).toHaveClass('blur-[6px]');
  });

  it.each([
    [null, 's=1'],
    ['cards/thumb/a.webp', null],
  ])('without the key or the signature it is the icon (%s, %s)', (thumb, thumbs) => {
    const { container } = render(<Thumb thumb={thumb} thumbs={thumbs} blur={false} />, {
      wrapper: QueriesWrapper,
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.lucide-image')).not.toBeNull();
  });

  it('an expired signature is asked for again, and a thumbnail that still fails is the icon', async () => {
    const { container } = render(
      <Thumb thumb="cards/thumb/a.webp" thumbs="e=1&p=cards%2Fthumb%2F&s=vieja" blur={false} />,
      { wrapper: QueriesWrapper },
    );
    fireEvent.error(container.querySelector('img')!);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(
      '/api/media/cards/thumb/a.webp?e=4102444800&p=cards%2Fthumb%2F&s=prueba',
    );
    fireEvent.error(img);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.lucide-image')).not.toBeNull();
  });

  it('a drawn thumbnail keeps its URL when the signature changes: it is not downloaded again', () => {
    const { container, rerender } = render(
      <Thumb thumb="cards/thumb/a.webp" thumbs="e=4102444800&s=una" blur={false} />,
      { wrapper: QueriesWrapper },
    );
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    rerender(<Thumb thumb="cards/thumb/a.webp" thumbs="e=4102448400&s=otra" blur={false} />);
    expect(container.querySelector('img')).toBe(img);
    expect(img.getAttribute('src')).toBe('/api/media/cards/thumb/a.webp?e=4102444800&s=una');
  });
});
