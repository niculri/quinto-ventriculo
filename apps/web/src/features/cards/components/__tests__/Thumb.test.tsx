// Tests a list image's thumbnail: the signed picture once its key and the signature are there, the icon before.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Thumb } from '../Thumb';

describe('Thumb', () => {
  it('shows the picture signed with the query, blurred only when asked', () => {
    const { container } = render(<Thumb thumb="cards/thumb/a.webp" thumbs="s=1" blur={true} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/cards\/thumb\/a\.webp\?s=1$/);
    expect(img).toHaveClass('blur-[6px]');
  });

  it.each([
    [null, 's=1'],
    ['cards/thumb/a.webp', null],
  ])('without the key or the signature it is the icon (%s, %s)', (thumb, thumbs) => {
    const { container } = render(<Thumb thumb={thumb} thumbs={thumbs} blur={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.lucide-image')).not.toBeNull();
  });
});
