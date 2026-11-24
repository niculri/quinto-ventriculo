// What the verdict says: right, right with a typo, wrong, out of time, and turned around by the student.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CaResult } from '@qv/gymkana';
import { CaVerdict } from '../CaVerdict';

const result = (over: Partial<CaResult>): CaResult => ({
  text: 'recto lateal',
  score: 0.95,
  correct: true,
  timedOut: false,
  manual: false,
  at: '2026-11-24T12:00:00.000Z',
  ...over,
});

describe('CaVerdict', () => {
  it.each([
    [{}, '✓ Buena, revisa la ortografía'],
    [{ score: 1 }, '✓ Buena'],
    [{ correct: false, score: 0 }, '✗ Mala'],
    [{ correct: false, score: 0, timedOut: true }, '✗ Se acabó el tiempo'],
    [{ correct: false, timedOut: true, manual: true }, '✗ Mala (la corregiste tú)'],
    [{ manual: true }, '✓ Buena (la corregiste tú)'],
  ] as const)('%o says «%s»', (over, title) => {
    render(<CaVerdict result={result(over)} name="Músculo recto lateral" onToggle={vi.fn()} />);
    expect(screen.getByRole('status').firstChild).toHaveTextContent(title);
  });

  it('crosses out a wrong answer', () => {
    render(
      <CaVerdict
        result={result({ correct: false })}
        name="Músculo recto lateral"
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('recto lateal').tagName).toBe('DEL');
  });
});
