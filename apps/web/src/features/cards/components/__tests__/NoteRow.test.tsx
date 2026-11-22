// Tests a note's row in the cards page's list: what each kind of note shows, with the answers in view or hidden.

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { explorerCard, matched } from '../../../../test/cardsUiFakes';
import { NoteRow } from '../NoteRow';
import type { Matched } from '../../model/filters';

function row(
  m: Matched,
  { hideAnswers = false, wide = true, thumbs = 'q=1' } = {},
) {
  const onOpen = vi.fn();
  render(
    <NoteRow
      m={m}
      position={3}
      hideAnswers={hideAnswers}
      thumbs={thumbs}
      onOpen={onOpen}
      wide={wide}
    />,
  );
  return { button: screen.getByRole('button'), onOpen };
}

describe('NoteRow', () => {
  it('a basic note shows its answer beside the question on a wide screen, and under it on a narrow one', () => {
    const { button } = row(matched());
    expect(button).toHaveTextContent(
      /^Pregunta inventada — Respuesta inventada — 1 tarjeta: 1 sin ver$/,
    );
    expect(button.firstElementChild).toHaveClass('grid-cols-2');
    expect(button).toHaveAttribute('data-position', '3');
  });

  it('on a narrow screen the basic answer goes under the question', () => {
    const { button } = row(matched(), { wide: false });
    expect(button.firstElementChild).toHaveClass('grid-rows-2');
  });

  it('a basic note with the answers hidden, or without an answer, keeps only the question', () => {
    expect(row(matched(), { hideAnswers: true }).button).toHaveTextContent(
      /^Pregunta inventada — 1 tarjeta/,
    );
    cleanup();
    expect(row(matched({ note: { back: '' } })).button).not.toHaveTextContent('Respuesta');
  });

  it('opens its note with a click', async () => {
    const m = matched();
    const { button, onOpen } = row(m);
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(m);
  });

  it('a cloze shows its holes filled, or hidden with their hint or a «hueco» to a screen reader', () => {
    const m = matched({ note: { kind: 'cloze', front: 'A {{c1::uno}} y {{c2::dos::pista}}' } });
    const shown = row(m).button;
    expect(shown).toHaveTextContent(/^A uno y dos/);
    expect(shown.firstElementChild).toHaveClass('line-clamp-2');
    cleanup();
    const hidden = row(m, { hideAnswers: true, wide: false }).button;
    expect(hidden).toHaveTextContent(/^A \[…hueco\] y \[pista\] — /);
    expect(hidden.firstElementChild).toHaveClass('line-clamp-3');
  });

  it('an occlusion counts its labels and blurs its picture only when the answers are hidden', () => {
    const m = matched({
      note: {
        kind: 'occlusion',
        front: '',
        topic: 'Lámina inventada',
        labels: 1,
        thumb: 'cards/thumb/x.webp',
      },
    });
    const { button } = row(m);
    expect(button).toHaveTextContent(/^Lámina inventada — 1 rótulo — /);
    expect(button.querySelector('img')).not.toHaveClass('blur-[6px]');
    cleanup();
    const hidden = row(matched({ note: { ...m.note.note, labels: 2 } }), {
      hideAnswers: true,
    }).button;
    expect(hidden).toHaveTextContent(/^Lámina inventada — 2 rótulos — /);
    expect(hidden.querySelector('img')).toHaveClass('blur-[6px]');
  });

  it('a photo says so, and its answer hides like the others; without a title it is «Imagen»', () => {
    const photo = { kind: 'photo' as const, front: '', topic: '', back: 'Respuesta inventada' };
    expect(row(matched({ note: photo })).button).toHaveTextContent(
      /^Foto: Imagen — Respuesta inventada — /,
    );
    cleanup();
    const hidden = row(matched({ note: photo }), { hideAnswers: true }).button;
    expect(hidden).toHaveTextContent(/^Foto: Imagen — 1 tarjeta/);
    expect(hidden.querySelector('img')).toBeNull();
  });

  it('a photo without its answer shows the empty place, and its picture is never blurred', () => {
    const { button } = row(
      matched({
        note: { kind: 'photo', front: 'Foto inventada', back: '', thumb: 'cards/thumb/y.webp' },
      }),
      {
        hideAnswers: true,
      },
    );
    expect(button).toHaveTextContent(/^Foto: Foto inventada — 1 tarjeta/);
    expect(button.querySelector('img')).not.toHaveClass('blur-[6px]');
  });

  it('dims the dots of the cards the filters leave out', () => {
    const cards = [explorerCard(0), explorerCard(1, { status: 'seen' })];
    const { button } = row(matched({ cards, on: [cards[1]!] }));
    const dots = [...button.querySelectorAll('[aria-hidden="true"] > span')];
    expect(dots.map((d) => d.className)).toEqual(['opacity-35', '']);
  });
});
