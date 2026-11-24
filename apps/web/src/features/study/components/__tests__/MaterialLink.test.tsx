// Tests the link to a card's material: a new tab, and the focus does not stay on it.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MaterialLink } from '../MaterialLink';

describe('the link to a card’s material', () => {
  it('opens in a new tab and lets go of the focus, so that Enter answers again', () => {
    render(<MaterialLink href="/apunte">Ver apunte</MaterialLink>);
    const link = screen.getByRole('link', { name: 'Ver apunte' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    link.focus();
    fireEvent.click(link);
    expect(document.activeElement).not.toBe(link);
  });
});
