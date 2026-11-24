// Tests the on/off switch: its name and state, a change, and the whole row as its area with `wholeRow`.
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

  it('covers only itself by default, and its row with wholeRow', () => {
    const { container, rerender } = render(<Switch label="A" checked onChange={() => {}} />);
    const wrapper = () => container.firstElementChild!;
    expect(wrapper().className).toMatch(/\brelative\b/);
    rerender(<Switch label="A" checked wholeRow onChange={() => {}} />);
    expect(wrapper().className).not.toMatch(/\brelative\b/);
    expect(screen.getByRole('switch').className).toMatch(/absolute inset-0/);
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
});
