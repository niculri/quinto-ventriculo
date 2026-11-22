// Tests the «back» button: a link when it has a place, a button when it has an action, and the label of where it goes.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BackButton, backLabel } from '../BackButton';

describe('the back button', () => {
  it('is a link to its place, named after it', () => {
    render(
      <MemoryRouter>
        <BackButton label="Anatomía I" to="/semesters/1/courses/anatomia-1" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Volver a Anatomía I' });
    expect(link).toHaveAttribute('href', '/semesters/1/courses/anatomia-1');
    expect(link).toHaveAttribute('title', 'Anatomía I');
  });

  it('is a button that does its action when it has no place', async () => {
    const onClick = vi.fn();
    render(<BackButton label="Física" onClick={onClick} className="ml-2" />);
    const button = screen.getByRole('button', { name: 'Volver a Física' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.className).toMatch(/ ml-2$/);
  });

  it('goes back to the course and its assessment, or only to the course', () => {
    expect(backLabel('Anatomía I', 'Certamen 1')).toBe('Anatomía I · Certamen 1');
    expect(backLabel('Anatomía I', null)).toBe('Anatomía I');
    expect(backLabel('Anatomía I', undefined)).toBe('Anatomía I');
    expect(backLabel('Anatomía I', '')).toBe('Anatomía I');
  });
});
