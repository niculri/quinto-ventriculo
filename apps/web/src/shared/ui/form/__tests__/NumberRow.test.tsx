// Tests a number of an options form: kept inside its range, rounded to its step when the field is left or on Enter.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberRow } from '../NumberRow';

function setup(props: { value?: number; step?: number; range?: [number, number] } = {}) {
  const onChange = vi.fn();
  const view = render(
    <NumberRow
      label="Límite"
      value={props.value ?? 20}
      range={props.range ?? [0, 100]}
      fallback={20}
      step={props.step ?? 1}
      unit="días"
      onChange={onChange}
    />,
  );
  return { onChange, box: screen.getByRole('spinbutton', { name: 'Límite' }), ...view };
}

async function typeIn(box: HTMLElement, text: string, end = '{Tab}') {
  await userEvent.clear(box);
  await userEvent.type(box, `${text}${end}`);
}

describe('a number of an options form', () => {
  it('rounds to a whole number with a step of 1, on leaving the field', async () => {
    const { onChange, box } = setup();
    await typeIn(box, '7.6');
    expect(onChange).toHaveBeenCalledWith(8);
    expect(box).toHaveValue(8);
  });

  it('is kept inside its range, on Enter too', async () => {
    const { onChange, box } = setup();
    await typeIn(box, '250', '{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(100);
    await typeIn(box, '-3', '{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('rounds to its step when it is a fraction, without the float’s noise', async () => {
    const { onChange, box } = setup({ value: 0.9, step: 0.05, range: [0.7, 0.99] });
    expect(box).toHaveAttribute('inputmode', 'decimal');
    await typeIn(box, '0.83');
    expect(onChange).toHaveBeenCalledWith(0.85);
    expect(box).toHaveValue(0.85);
  });

  it('says nothing when the number did not change', async () => {
    const { onChange, box } = setup();
    expect(box).toHaveAttribute('inputmode', 'numeric');
    await typeIn(box, '20.2');
    expect(box).toHaveValue(20);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a new value given from outside', () => {
    const { rerender, box } = setup();
    rerender(
      <NumberRow label="Límite" value={35} range={[0, 100]} fallback={20} onChange={() => {}} />,
    );
    expect(box).toHaveValue(35);
  });
});
