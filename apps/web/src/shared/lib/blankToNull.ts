// A text without anything in it (none, or an empty one) as null: what `||` did, saying it.

export function blankToNull(text: string | null | undefined): string | null {
  if (text === undefined || text === null || text === '') return null;
  return text;
}
