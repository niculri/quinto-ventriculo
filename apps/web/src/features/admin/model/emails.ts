// What is pasted into «Invitar», read as emails: only what has an `@`, so a pasted person's name never leaves the
// browser; `ignored` counts the other words, so that an email written without its `@` is noticed.

// An email as `<…>`, a quoted name (whose comma does not separate) or a word; a quoted name stops at `<`, `>` or a
// line, so an unclosed quote does not swallow the emails after it.
const PIECES = /<([^<>]*)>|"([^"<>\n]*)"|[^\s,;<>"]+/g;
const SEPARATORS = /[\s,;]+/;

export function readEmails(text: string): { emails: string[]; ignored: number } {
  const emails: string[] = [];
  let ignored = 0;
  const take = (word: string) => {
    const w = word.replace(/^mailto:/i, '');
    if (w.includes('@')) emails.push(w);
    else if (w) ignored++;
  };
  for (const m of text.matchAll(PIECES)) {
    if (m[1] !== undefined) m[1].split(SEPARATORS).forEach(take);
    else if (m[2] !== undefined) ignored += m[2].split(SEPARATORS).filter(Boolean).length;
    else take(m[0]);
  }
  return { emails, ignored };
}
