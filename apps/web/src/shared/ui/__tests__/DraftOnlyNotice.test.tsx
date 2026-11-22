// Tests what takes the place of «Estudiar» or «Comenzar» for what only the draft has: why, for a deck, a test or questions.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftOnlyNotice } from '../DraftOnlyNotice';

describe('the draft-only notice', () => {
  it('of a deck or a test says why it cannot be studied or answered', () => {
    render(<DraftOnlyNotice kind="deck" />);
    render(<DraftOnlyNotice kind="quiz" />);
    const [deck, quiz] = screen.getAllByRole('status');
    expect(deck).toHaveTextContent(
      /^Esto solo está en el borradorPuedes ver sus tarjetas, pero no estudiarlas/,
    );
    expect(quiz).toHaveTextContent(
      /^Esto solo está en el borradorPuedes ver de qué trata, pero no responderlo/,
    );
  });

  it('of questions counts them, in singular and plural', () => {
    render(<DraftOnlyNotice kind="questions" count={1} />);
    render(<DraftOnlyNotice kind="questions" count={4} />);
    const [one, four] = screen.getAllByRole('status');
    expect(one).toHaveTextContent(
      /^Preguntas solo del borradorHay 1 pregunta que todavía no tienen/,
    );
    expect(four).toHaveTextContent(
      /^Preguntas solo del borradorHay 4 preguntas que todavía no tienen/,
    );
  });
});
