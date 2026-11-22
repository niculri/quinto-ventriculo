// Tests «Olvidar…»: it forgets with or without resetting the counts, and closing it is cancelling.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForgetDialog } from '../ForgetDialog';

function dialog() {
  const onCancel = vi.fn();
  const onForget = vi.fn();
  render(<ForgetDialog open={true} count={2} onCancel={onCancel} onForget={onForget} />);
  return { onCancel, onForget };
}

describe('ForgetDialog', () => {
  it('forgets keeping the counts unless the switch is on', async () => {
    const { onForget } = dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar' }));
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar' }));
    expect(onForget.mock.calls).toEqual([[false], [true]]);
  });

  it('Escape and «Cancelar» cancel, and forget nothing', async () => {
    const { onCancel, onForget } = dialog();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onForget).not.toHaveBeenCalled();
  });
});
