// Tests a button of the table's toolbar: its name, its shortcut (only when it has one) and its title.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../ActionButton';

describe('ActionButton', () => {
  it('names the action, announces its shortcut and does it on a click', async () => {
    const onClick = vi.fn();
    render(
      <ActionButton
        onClick={onClick}
        disabled={false}
        icon={null}
        label="Suspender"
        shortcut="Ctrl+J"
        title="Ayuda"
      />,
    );
    const b = screen.getByRole('button', { name: 'Suspender' });
    expect(b).toHaveAttribute('aria-keyshortcuts', 'Ctrl+J');
    expect(b).toHaveAttribute('title', 'Ayuda');
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('without a shortcut announces none, and when off does nothing', async () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick} disabled={true} icon={null} label="Marcar" />);
    const b = screen.getByRole('button', { name: 'Marcar' });
    expect(b).not.toHaveAttribute('aria-keyshortcuts');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});
