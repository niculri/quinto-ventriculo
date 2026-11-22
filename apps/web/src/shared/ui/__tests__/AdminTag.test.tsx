// Tests the admin mode's marks: nothing when the student sees it, the reasons in order, and the short word on a phone.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminMark, AdminTag } from '../AdminTag';

describe('the admin mode’s marks', () => {
  it('are nothing when a student sees the page or the element', () => {
    expect(render(<AdminTag reasons={[]} />).container).toBeEmptyDOMElement();
    expect(render(<AdminMark reasons={[]} />).container).toBeEmptyDOMElement();
  });

  it('a page’s tag has the long word on a wide screen and the short one on a phone, one word when they are equal', () => {
    const { container } = render(
      <AdminTag reasons={['draft', 'hiddenSemester', 'hiddenCourse']} />,
    );
    const pills = [...container.querySelectorAll('[data-admin-tag] > span')];
    expect(pills.map((p) => [...p.childNodes].map((n) => n.textContent))).toEqual([
      ['Borrador'],
      ['Semestre oculto', 'Oculto'],
      ['Ramo apagado', 'Apagado'],
    ]);
    expect(pills[1]!.querySelector('.sm\\:hidden')).toHaveTextContent('Oculto');
  });

  it('an element’s mark always has the long word', () => {
    const { container } = render(<AdminMark reasons={['hiddenCourse']} />);
    expect(container.querySelector('[data-admin-mark]')).toHaveTextContent(/^Ramo apagado$/);
  });
});
