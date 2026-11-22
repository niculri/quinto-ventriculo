// Tests the popup to confirm publishing or undoing: idle, Escape and «Cancelar» ask to close; while it works nothing
// closes it and the button says so without changing its width; a refusal stays in it.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../ConfirmDialog';

type Props = Omit<Parameters<typeof ConfirmDialog>[0], 'onOpenChange' | 'onConfirm' | 'children'>;

const dialog = (over: Partial<Props> = {}) => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onConfirm = vi.fn<() => void>();
  render(
    <ConfirmDialog
      open
      title="¿Publicar?"
      confirm="Publicar"
      busy={false}
      busyLabel="Publicando…"
      error={null}
      {...over}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    >
      <p>Lo que cambia</p>
    </ConfirmDialog>,
  );
  return { onOpenChange, onConfirm };
};

const widthCell = (button: HTMLElement) =>
  button.querySelector('[aria-hidden="true"]')!.textContent;

describe('ConfirmDialog', () => {
  it('idle, Escape and «Cancelar» ask to close it, and the button confirms', async () => {
    const user = userEvent.setup();
    const props = dialog();
    const alert = screen.getByRole('alertdialog', { name: '¿Publicar?' });
    await user.keyboard('{Escape}');
    await user.click(within(alert).getByRole('button', { name: 'Cancelar' }));
    expect(props.onOpenChange.mock.calls).toEqual([[false], [false]]);
    await user.click(within(alert).getByRole('button', { name: 'Publicar' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(within(alert).queryByRole('alert')).toBeNull();
  });

  it('while it works, neither Escape nor a click outside closes it, and both buttons are off', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const props = dialog({ busy: true });
    const alert = screen.getByRole('alertdialog');
    await user.keyboard('{Escape}');
    await user.click(document.body.appendChild(document.createElement('div')));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(within(alert).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(within(alert).getByRole('button', { name: 'Publicando…' })).toBeDisabled();
  });

  it('the button keeps the width of its longer label, whichever it is', () => {
    dialog({ confirm: 'Sí', busyLabel: 'Trabajando…' });
    expect(widthCell(screen.getByRole('button', { name: 'Sí' }))).toBe('Trabajando…');
  });

  it('a confirm label longer than the busy one keeps its own width', () => {
    dialog({ confirm: 'Publicar todo ahora', busyLabel: 'Va…' });
    expect(widthCell(screen.getByRole('button', { name: 'Publicar todo ahora' }))).toBe(
      'Publicar todo ahora',
    );
  });

  it('a refusal stays in the popup as an alert', () => {
    dialog({ error: 'El borrador cambió.' });
    expect(screen.getByRole('alert')).toHaveTextContent('El borrador cambió.');
  });
});
