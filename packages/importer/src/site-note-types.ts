// Site-only changes to the author's note types: the card footer shows only the code and the dates, in the flow at
// the end of the back. Note types without that footer are left exactly as in Anki.

const FOOTER_RE =
  /(?:\{\{#Código\}\})?\s*<div class="pie">[\s\S]*?<\/div>\s*(?:\{\{\/Código\}\})?/g;

export const SITE_FOOTER =
  '{{#Código}}<div class="pie">{{Código}} · creada el {{Creación}}' +
  '{{#Actualización}} · actualizada el {{Actualización}}{{/Actualización}}</div>{{/Código}}';

/** Appended after the note type's CSS, so it wins over its `position: fixed` footer. */
const SITE_FOOTER_CSS = `
/* El Quinto Ventrículo: the footer goes in the flow, at the end of the card, after the source. */
.pie {
  position: static; right: auto; bottom: auto; z-index: auto; pointer-events: auto;
  max-width: 720px; margin: 12px auto 0; text-align: center;
  font-size: 0.55em; line-height: 1.4; letter-spacing: 0.01em; opacity: 0.8;
}
`;

interface FooterNoteType {
  fields: string[];
  templates: { qfmt: string; afmt: string }[];
  css: string;
}

export function hasAuthorFooter(type: Omit<FooterNoteType, 'css'>): boolean {
  return (
    type.fields.includes('Código') &&
    type.fields.includes('Creación') &&
    type.templates.some((t) => (t.qfmt + t.afmt).includes('<div class="pie">'))
  );
}

export function forSite<T extends FooterNoteType>(type: T): T {
  if (!hasAuthorFooter(type)) return type;
  return {
    ...type,
    templates: type.templates.map((t) => ({
      ...t,
      // The front has no source yet, so no footer; on the back it goes after the source.
      qfmt: t.qfmt.replace(FOOTER_RE, '').trimEnd(),
      afmt: `${t.afmt.replace(FOOTER_RE, '').trimEnd()}\n${SITE_FOOTER}`,
    })),
    css: `${type.css}\n${SITE_FOOTER_CSS}`,
  };
}
