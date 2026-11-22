// IMAIOS is licensed for personal use only: nothing that names it goes up to the site.

export const IMAIOS = /imaios/i;

export function noteNamesImaios(note: {
  fields: readonly string[];
  tags: readonly string[];
}): boolean {
  return note.fields.some((f) => IMAIOS.test(f)) || note.tags.some((t) => IMAIOS.test(t));
}
