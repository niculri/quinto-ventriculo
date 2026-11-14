// Text helpers for the notes' HTML: slugs and attribute escaping.

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

export function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
