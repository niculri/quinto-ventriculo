// The skill's inline marks (**, *, ^, ~) as escaped HTML, and the check for a text that is not blank.

/** The skill's inline marks (**, *, ^, ~) to escaped HTML, as modelo.py's `md()` with Python's Unicode `\w`. */
export function inlineHtml(text: unknown): string {
  const W = '[\\p{L}\\p{N}_]';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/gu, '<b>$1</b>')
    .replace(
      new RegExp(`(?<!${W}|\\*)\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*(?!${W}|\\*)`, 'gu'),
      '<i>$1</i>',
    )
    .replace(/\^(?=\S)([^\s^]+?)\^/gu, '<sup>$1</sup>')
    .replace(/(?<!~)~(?=\S)([^\s~]+?)~(?!~)/gu, '<sub>$1</sub>')
    .replace(/\n/g, '<br>');
}

/** A JSON value as text, as the skill's Python would write it: «null» for null, the JSON of an object. */
export const asText = (x: unknown): string =>
  typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x);

/** `value || fallback` as the skill's own code reads it: any empty value (nothing, empty text, 0) takes the fallback. */
export function orFallback<T, F>(value: T, fallback: F): T | F {
  return value ? value : fallback;
}

export const textOk = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
