// Splits the «I. …», «II. …», «III. …» statements out of a question's HTML, so they show as a list apart from the
// text and the alternatives.

interface Statement {
  numeral: string;
  html: string;
}

export interface StatementSplit {
  before: string;
  items: Statement[];
  after: string;
}

const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const MARK = /^\s*(viii|vii|vi|ix|iv|v|x|iii|ii|i)(?:\s*[.):–—-]+\s*|\s+)(?=\S)/i;
const BREAK = /<br\s*\/?>/i;

/** Two or more `<br>` lines numbered in order from I; a line between two statements belongs to the one before. */
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
