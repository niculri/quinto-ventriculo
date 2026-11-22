// Tests an options row's «restore» button: it puts the default back, and keeps its room when there is nothing to restore.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Revert, Row } from '../Row';

describe('a row of an options form', () => {
  it('names its control with its label, and shows its help', () => {
    render(
      <Row
        label="Tarjetas nuevas por día"
        id="nuevas"
        help="Cuántas tarjetas nuevas salen cada día."
      >
        <input id="nuevas" />
      </Row>,
    );
    expect(screen.getByRole('textbox', { name: 'Tarjetas nuevas por día' })).toBeInTheDocument();
    expect(screen.getByText('Cuántas tarjetas nuevas salen cada día.')).toBeInTheDocument();
  });
});

describe('the restore button', () => {
  it('puts the default back', async () => {
    const onChange = vi.fn();
    render(<Revert value={[1, 10]} fallback={[1, 5]} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Restablecer el valor predeterminado' }),
    );
    expect(onChange).toHaveBeenCalledWith([1, 5]);
  });

  it('is an empty box of the same size when the value is the default, also for an equal list', () => {
    const { container } = render(<Revert value={[1, 5]} fallback={[1, 5]} onChange={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild).toHaveClass('size-7');
  });
});
