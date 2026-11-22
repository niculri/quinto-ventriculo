// Tests the initials that stand for a person: first and last word of the name, else of the email, and «?» at worst.
import { describe, expect, it } from 'vitest';
import { initials } from '../initials';

describe('the initials of a person', () => {
  it.each([
    ['the first and the last word of the name', 'ana maría pérez', 'x@u.cl', 'AP'],
    ['one letter for a name of one word', 'Ana', 'x@u.cl', 'A'],
    [
      'the email’s name when there is no name, cut at dots, dashes and underscores',
      null,
      'ana.perez@u.cl',
      'AP',
    ],
    ['the email’s name when the name is only spaces', '   ', 'bruno_soto-lara@u.cl', 'BL'],
    ['«?» when the email has no name before the @', null, '@u.cl', '?'],
    ['«?» when the email’s name is only separators', null, '._-@u.cl', '?'],
  ])('%s', (_, name, email, expected) => {
    expect(initials(name, email)).toBe(expected);
  });
});
