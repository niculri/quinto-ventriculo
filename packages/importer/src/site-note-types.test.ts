import { describe, expect, it } from 'vitest';
import { renderCard } from '@qv/anki-render';
import { SITE_FOOTER, forSite, hasAuthorFooter } from './site-note-types';

const FOOTER =
  '{{#Código}}<div class="pie">Creado por Nico Ulriksen el {{Creación}}{{#Actualización}} · actualizado el {{Actualización}}{{/Actualización}} · {{Código}}</div>{{/Código}}';

const basic = {
  fields: ['Frente', 'Reverso', 'Fuente', 'Código', 'Creación', 'Actualización'],
  templates: [
    {
      name: 'Tarjeta 1',
      qfmt: `<div class="pregunta">{{Frente}}</div>\n${FOOTER}`,
      afmt: `<div class="pregunta">{{Frente}}</div><hr id="answer">{{Reverso}}\n<div class="fuente">{{Fuente}}</div>\n${FOOTER}`,
    },
  ],
  css: '.pie { position: fixed; right: 10px; bottom: 6px; }',
};

describe('forSite', () => {
  it('takes the footer off the front and puts the new one at the end of the back', () => {
    const t = forSite(basic).templates[0]!;
    expect(t.qfmt).not.toContain('pie');
    expect(t.afmt).not.toContain('Creado por');
    expect(t.afmt.endsWith(SITE_FOOTER)).toBe(true);
    expect(t.afmt.indexOf('fuente')).toBeLessThan(t.afmt.indexOf('class="pie"'));
  });

  it('keeps the note type CSS and adds the in-flow footer after it', () => {
    const css = forSite(basic).css;
    expect(css.startsWith(basic.css)).toBe(true);
    expect(css).toMatch(/\.pie \{[^}]*position: static/);
  });

  it('leaves note types without the author footer exactly as in Anki', () => {
    const other = { ...basic, fields: ['Front', 'Back'] };
    expect(hasAuthorFooter(other)).toBe(false);
    expect(forSite(other)).toBe(other);
  });

  it('renders the code and the dates, with «actualizada» only when there is one', () => {
    const names = ['Código', 'Creación', 'Actualización'];
    const field = (f: Record<string, string>) =>
      renderCard({
        noteType: {
          name: 'Medicina (código) · Básica',
          kind: 'normal',
          fields: names,
          templates: [{ name: 'Tarjeta 1', qfmt: '{{Código}}', afmt: SITE_FOOTER }],
        },
        fields: names.map((n) => f[n] ?? ''),
        tags: [],
        ord: 0,
        deckName: 'Mazo',
      }).answer;
    expect(field({ Código: 'T-A1-S3-01-002.1', Creación: '8-10-2026', Actualización: '' })).toBe(
      '<div class="pie">T-A1-S3-01-002.1 · creada el 8-10-2026</div>',
    );
    expect(
      field({ Código: 'T-A1-S3-01-131.3', Creación: '8-10-2026', Actualización: '26-10-2026' }),
    ).toBe(
      '<div class="pie">T-A1-S3-01-131.3 · creada el 8-10-2026 · actualizada el 26-10-2026</div>',
    );
  });
});
