/**
 * Questions of statements: the text brings «I. …», «II. …», «III. …», one per line, and the alternatives
 * say which are right («Sólo I», «I y II»). The owner asked to show them as a list of their own, apart from
 * the text and from the alternatives (2026-11-01). They are recognized in the question's HTML (lines are
 * separated by `<br>`): a run of two or more lines that start with the numerals in order from I (as the
 * sources write them: «I.», «I)», «I.-», «I -», «I » or lowercase «i.»). A line between two statements that
 * does not start with a numeral is part of the one before; what comes after the last one goes after the list.
 */

export interface Statement {
  /** The numeral as the source writes it, without its punctuation: «I», «iv». */
  numeral: string;
  html: string;
}

export interface StatementSplit {
  /** The text before the list (HTML); may be empty. */
  before: string;
  items: Statement[];
  /** The text after the list (HTML); usually empty. */
  after: string;
}

const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const MARK = /^\s*(viii|vii|vi|ix|iv|v|x|iii|ii|i)(?:\s*[.):–—-]+\s*|\s+)(?=\S)/i;
const BREAK = /<br\s*\/?>/i;

export function splitStatements(html: string): StatementSplit | null {
  const lines = html.split(BREAK);
  let start = -1;
  for (let j = 0; j < lines.length; j++) {
    const m = MARK.exec(lines[j]!);
    if (m && m[1]!.toLowerCase() === 'i') {
      start = j;
      break;
    }
  }
  if (start < 0) return null;
  const items: Statement[] = [];
  let end = start;
  for (let j = start; j < lines.length; j++) {
    const line = lines[j]!;
    const m = MARK.exec(line);
    const expected = NUMERALS[items.length];
    if (m && expected && m[1]!.toLowerCase() === expected) {
      items.push({ numeral: m[1]!, html: line.slice(m[0].length).trim() });
      end = j;
      continue;
    }
    // A line that does not start a statement: the continuation of the one before, if another one follows.
    const rest = lines.slice(j + 1);
    const follows = rest.findIndex((l) => {
      const n = MARK.exec(l);
      return n && n[1]!.toLowerCase() === NUMERALS[items.length];
    });
    if (follows < 0 || !items.length) break;
    items[items.length - 1]!.html += `<br>${line}`;
  }
  if (items.length < 2) return null;
  return {
    before: lines.slice(0, start).join('<br>').trim(),
    items,
    after: lines
      .slice(end + 1)
      .join('<br>')
      .trim(),
  };
}
