// Tests readEmails: what is pasted into «Invitar» is split into emails, and the names around them never pass.
import { describe, expect, it } from 'vitest';
import { readEmails } from '../emails';

describe('«Acceso»', () => {
  it('splits what is pasted by lines, commas, semicolons and spaces', () => {
    expect(
      readEmails(' a@ug.uchile.cl,b@ug.uchile.cl\n\n c@ug.uchile.cl ; d@ug.uchile.cl e@x '),
    ).toEqual({
      emails: ['a@ug.uchile.cl', 'b@ug.uchile.cl', 'c@ug.uchile.cl', 'd@ug.uchile.cl', 'e@x'],
      ignored: 0,
    });
  });

  it('of «Nombre Apellido <correo>» only the email, never the name', () => {
    expect(
      readEmails(
        'Ana Pérez <ana.perez@ug.uchile.cl>, "Soto, Luis" <Luis.Soto@ug.uchile.cl>\n' +
          'Rosa Díaz <rosa.diaz@ug.uchile.cl>; otra@ug.uchile.cl\n' +
          'mailto:alguien@ug.uchile.cl <dos@ug.uchile.cl, tres@ug.uchile.cl>',
      ),
    ).toEqual({
      emails: [
        'ana.perez@ug.uchile.cl',
        'Luis.Soto@ug.uchile.cl',
        'rosa.diaz@ug.uchile.cl',
        'otra@ug.uchile.cl',
        'alguien@ug.uchile.cl',
        'dos@ug.uchile.cl',
        'tres@ug.uchile.cl',
      ],
      ignored: 6,
    });
    // An unclosed quote does not swallow the emails after it; an unclosed «<» still gives its email.
    expect(readEmails('Ana "Pérez <ana@ug.uchile.cl>, "Luis" <luis@ug.uchile.cl>')).toEqual({
      emails: ['ana@ug.uchile.cl', 'luis@ug.uchile.cl'],
      ignored: 3,
    });
    expect(readEmails('Rosa Díaz <rosa@ug.uchile.cl')).toEqual({
      emails: ['rosa@ug.uchile.cl'],
      ignored: 2,
    });
    expect(readEmails('ana.perez.ug.uchile.cl')).toEqual({ emails: [], ignored: 1 });
  });

  it('a bare «mailto:» or an empty piece between separators inside «<…>» is not a word left out', () => {
    expect(readEmails('mailto: <, ana@ug.uchile.cl,>')).toEqual({
      emails: ['ana@ug.uchile.cl'],
      ignored: 0,
    });
  });
});
