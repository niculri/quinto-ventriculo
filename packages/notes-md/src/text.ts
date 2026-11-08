import { decodeHTML } from 'entities';

/** «Núcleo celular: 1.º parte» → «nucleo-celular-1-o-parte». */
export function slugify(text: string, max = 64): string {
  const base = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, max).replace(/-+$/, '') || 'section';
}

/** Plain text of an HTML fragment: no tags, entities decoded and whitespace collapsed. */
export function plainText(html: string): string {
  const withoutTags = html
    .replace(/<(?:br|\/p|\/li|\/h\d|\/tr|\/td|\/th|\/figcaption)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeHTML(withoutTags).replace(/\s+/g, ' ').trim();
}

export function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
