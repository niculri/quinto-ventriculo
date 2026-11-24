// The screens where one answers cards (studying, a final review, practicing), which have no site bar on a phone.
export function isAnswerScreen(pathname: string): boolean {
  return answerScreenBack(pathname, '') !== null;
}

/**
 * Where «Volver» of such a screen goes while its deck is not known yet (loading the catalog, or an error): the page
 * it was opened from.
 */
export function answerScreenBack(
  pathname: string,
  search: string,
): { to: string; label: string } | null {
  if (pathname.endsWith('/cards/practice')) {
    return { to: `${pathname.slice(0, -'/practice'.length)}${search}`, label: 'Tarjetas' };
  }
  if (pathname.endsWith('/gymkana/write')) {
    return { to: pathname.slice(0, -'/write'.length), label: 'Gymkana' };
  }
  for (const end of ['/study', '/review']) {
    if (pathname.endsWith(end)) return { to: pathname.slice(0, -end.length), label: 'Anki' };
  }
  return null;
}
