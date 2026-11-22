// Tests the only component that puts HTML into the page: the tag, the attributes and the ref it is given.

import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { markSanitized } from '../../lib/sanitizedHtml';
import { SafeHtml } from '../SafeHtml';

describe('SafeHtml', () => {
  it('puts the sanitized HTML in a span unless it is told another tag', () => {
    const { container } = render(<SafeHtml html={markSanitized('a<sup>2</sup>')} />);
    expect(container.innerHTML).toBe('<span>a<sup>2</sup></span>');
  });

  it('passes the tag, the attributes, the handlers and the ref on', () => {
    const ref = createRef<HTMLElement>();
    let clicked = 0;
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <SafeHtml
              as="th"
              html={markSanitized('<b>x</b>')}
              colSpan={2}
              className="hl"
              ref={ref}
              onClick={() => (clicked += 1)}
            />
          </tr>
        </tbody>
      </table>,
    );
    const th = container.querySelector('th')!;
    expect(th.outerHTML).toBe('<th colspan="2" class="hl"><b>x</b></th>');
    expect(ref.current).toBe(th);
    th.click();
    expect(clicked).toBe(1);
  });
});
