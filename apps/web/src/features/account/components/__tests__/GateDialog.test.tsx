// Tests the popup that is answered, not closed: neither Escape nor a click outside closes it, and what it holds is
// what answers it.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GateDialog } from '../GateDialog';

describe('GateDialog', () => {
  it('stays after Escape and a click outside, and only its own button answers it', async () => {
    const answered = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <GateDialog title="Antes de seguir">
        <button type="button" onClick={answered}>
          Entendido
        </button>
      </GateDialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Antes de seguir' });
    await user.keyboard('{Escape}');
    await user.click(document.body);
    expect(screen.getByRole('dialog', { name: 'Antes de seguir' })).toBe(dialog);
    expect(within(dialog).queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(answered).toHaveBeenCalledTimes(1);
  });
});
