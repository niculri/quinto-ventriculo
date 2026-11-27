// Tests the on/off switch: its name and state, a change, the whole row as its area with `wholeRow`, and half on.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch, SwitchTrack } from '../Switch';

describe('the switch', () => {
  it('is a named switch that says its state and changes it', async () => {
    const onChange = vi.fn();
    render(<Switch label="Incluir extras" checked={false} onChange={onChange} />);
    const input = screen.getByRole('switch', { name: 'Incluir extras' });
    expect(input).not.toBeChecked();
    await userEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('covers a finger’s 44 px around itself by default, and its row with wholeRow', () => {
    const { container, rerender } = render(<Switch label="A" checked onChange={() => {}} />);
    const wrapper = () => container.firstElementChild!;
    expect(wrapper().className).toMatch(/\brelative\b/);
    expect(screen.getByRole('switch').className).toMatch(/-inset-x-0\.5 -inset-y-2\.5/);
    rerender(<Switch label="A" checked wholeRow onChange={() => {}} />);
    expect(wrapper().className).not.toMatch(/\brelative\b/);
    expect(screen.getByRole('switch').className).toMatch(/\binset-0\b/);
  });

  it('does nothing while disabled', async () => {
    const onChange = vi.fn();
    render(<Switch label="A" checked={false} disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws a track that shows its state for a row that is the control', () => {
    const { container, rerender } = render(<SwitchTrack checked />);
    expect(container.innerHTML).toMatch(/bg-brand/);
    rerender(<SwitchTrack checked={false} />);
    expect(container.innerHTML).toMatch(/bg-border-strong/);
  });

  it('half on, described by the text that says how many, turns all on', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <>
        <span id="how-many">2 de 5 temas activados</span>
        <Switch label="Semana" checked={false} mixed describedBy="how-many" onChange={onChange} />
      </>,
    );
    const input = screen.getByRole('switch', { name: 'Semana' });
    expect(input).toHaveAccessibleDescription('2 de 5 temas activados');
    expect(input).not.toBeChecked();
    expect(container.innerHTML).toMatch(/translate-x-2/);
    // Half the track in full color, half off: a faded track could not be told from off in the dark theme.
    expect(container.innerHTML).toMatch(/from-brand from-50% to-border-strong to-50%/);
    await userEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch label="Semana" checked mixed onChange={onChange} />);
    expect(container.innerHTML).not.toMatch(/translate-x-2|from-brand/);
  });
});
