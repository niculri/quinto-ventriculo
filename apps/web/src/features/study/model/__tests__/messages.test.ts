// Tests the words of a session's toasts and of the failure that stops it.
import { describe, expect, it } from 'vitest';
import type { HideAction, SaveFailure, Toast, ToastKind } from '@qv/study';
import { failureText, toastText } from '../messages';

const toast = (kind: ToastKind): Toast => ({ ...kind, id: 1 });

describe('the words of a toast', () => {
  it('says what was hidden, in the full mode and in the simple one', () => {
    const hidden: [HideAction, string][] = [
      ['bury_card', 'Tarjeta enterrada.'],
      ['bury_note', 'Nota enterrada.'],
      ['suspend_card', 'Tarjeta suspendida.'],
      ['suspend_note', 'La nota se ha suspendido.'],
    ];
    for (const [action, text] of hidden) {
      expect(toastText(toast({ kind: 'hidden', action }), true)).toBe(text);
    }
    expect(toastText(toast({ kind: 'skipped' }), false)).toBe('Saltada por hoy.');
    expect(toastText(toast({ kind: 'neverAgain' }), false)).toBe(
      'Esta tarjeta no se mostrará más.',
    );
  });

  it('names the leech, and what was undone as the mode calls it', () => {
    expect(toastText(toast({ kind: 'leech' }), true)).toBe('La tarjeta era una sanguijuela.');
    expect(toastText(toast({ kind: 'leechSuspended' }), true)).toBe(
      'La tarjeta era una sanguijuela. Ha sido suspendida.',
    );
    expect(toastText(toast({ kind: 'nothingToUndo' }), true)).toBe('No hay nada que deshacer');
    expect(toastText(toast({ kind: 'undone', action: 'flag' }), true)).toMatch(/^Deshecho: /);
  });
});

describe('the words of the failure that stops a session', () => {
  it('uses its own texts, and the repository’s message as it came', () => {
    const failures: [SaveFailure, RegExp | string][] = [
      [{ kind: 'changedElsewhere' }, /cambió en otra pestaña/],
      [{ kind: 'notSaved' }, /No se pudo guardar tu avance/],
      [
        { kind: 'message', message: 'No se pudo guardar tu respuesta: red' },
        'No se pudo guardar tu respuesta: red',
      ],
    ];
    for (const [failure, text] of failures) {
      if (typeof text === 'string') expect(failureText(failure)).toBe(text);
      else expect(failureText(failure)).toMatch(text);
    }
  });
});
