/**
 * Site-only presentation changes to the author's note types. Anki keeps its own footer (fixed at the bottom
 * right, «Creado por Nico Ulriksen el … · T-…»); on the site the author asked for (2026-10-31): only the code and
 * the dates, not floating, at the end of the card after the source, and without «Creado por».
 *
 * It only touches note types that carry the author's footer (`<div class="pie">` with the «Código» and «Creación»
 * fields); anything else is left exactly as in Anki.
 */

const FOOTER_RE =
  /(?:\{\{#Código\}\})?\s*<div class="pie">[\s\S]*?<\/div>\s*(?:\{\{\/Código\}\})?/g;

export const SITE_FOOTER =
  '{{#Código}}<div class="pie">{{Código}} · creada el {{Creación}}' +
  '{{#Actualización}} · actualizada el {{Actualización}}{{/Actualización}}</div>{{/Código}}';

/** Appended after the note type's CSS, so it wins over its `position: fixed` footer. */
export const SITE_FOOTER_CSS = `
/* El Quinto Ventrículo: the footer goes in the flow, at the end of the card, after the source. */
.pie {
  position: static; right: auto; bottom: auto; z-index: auto; pointer-events: auto;
  max-width: 720px; margin: 12px auto 0; text-align: center;
  font-size: 0.55em; line-height: 1.4; letter-spacing: 0.01em; opacity: 0.8;
}
`;

/** What these functions need from a note type (any template with qfmt/afmt works). */
interface FooterNoteType {
  fields: string[];
  templates: { qfmt: string; afmt: string }[];
  css: string;
}

export function hasAuthorFooter(type: Omit<FooterNoteType, 'css'>): boolean {
  return (
    type.fields.includes('Código') &&
    type.fields.includes('Creación') &&
    type.templates.some((t) => /<div class="pie">/.test(t.qfmt + t.afmt))
  );
}

export function forSite<T extends FooterNoteType>(type: T): T {
  if (!hasAuthorFooter(type)) return type;
  return {
    ...type,
    templates: type.templates.map((t) => ({
      ...t,
      // Front: no footer (there is no source yet). Back: the footer at the very end, after the source.
      qfmt: t.qfmt.replace(FOOTER_RE, '').trimEnd(),
      afmt: `${t.afmt.replace(FOOTER_RE, '').trimEnd()}\n${SITE_FOOTER}`,
    })),
    css: `${type.css}\n${SITE_FOOTER_CSS}`,
  };
}
