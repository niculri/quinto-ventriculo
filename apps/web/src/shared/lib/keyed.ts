// A key for each item of a list that has none of its own: what it says plus how many identical ones came before it.

export function keyed<T>(
  items: readonly T[],
  textOf: (item: T) => string,
): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const text = textOf(item);
    const before = seen.get(text) ?? 0;
    seen.set(text, before + 1);
    return { key: `${text}#${before}`, item };
  });
}
