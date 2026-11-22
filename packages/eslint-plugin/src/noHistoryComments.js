// Rule qv/no-history-comments: comments say what the code does or why, not when, by whom or in which step it changed.
import { commentsOf, groupComments } from './comments.js';

/**
 * Narrow on purpose: a date or a code that is data (a study day, a card's code, a license) is not history, so a date
 * only counts in parentheses, and a step number only next to a word that makes it one. Each entry: its name, the
 * pattern, and whether it also counts inside «» (the interface is in Spanish, so an English step number there is
 * still history).
 * @type {[string, RegExp, boolean?][]}
 */
const HISTORY = [
  ['step', /(?<!(?:re)?learning )\b(?:plan )?steps? \d+(?:\.\d+)*(?: [a-z](?!\w))?(?!\w|\.\d)/i],
  ['step', /\bsteps? [1-9]\.\d{1,2}\b/i, true],
  ['step', /\((?:[^()\n]{0,30}, )?[1-9]\.\d{1,2}(?: ?[a-z])?\)/],
  ['step', /\b(?:before|since|until|after) (?:step )?[1-9]\.\d{1,2}\b/i],
  ['paso', /\bpasos? \d/i],
  ['fase', /\bfases? \d/i],
  ['part', /\bparte \d+\b|\(part \d+\)|\d,? part \d+\b/i],
  ['revisión', /\brevisión|\brevision de cero\b/i],
  ['review of a step', /\breview of (?:step )?\d+\.\d+|\bthe [1-9]\.\d{1,2}(?: [a-z])? review\b/i],
  ['the owner', /\bthe owner\b(?! of\b)|\bdue[ñn]o\b/i],
  [
    'asked for',
    /\b(?:owner|author)(?:'s)? (?:asked|requested|wanted|choice|words|yes)\b|\b(?:asked|requested) by the (?:owner|author|user)\b|\bat the (?:owner|author|user)'s request\b|\bas the user (?:asked|requested|wanted)\b|\bthe user (?:asked|requested|wanted) (?:it|this|that|so|to)\b|\bthe reviewer (?:found|asked|said|noted|caught)\b/i,
  ],
  ['tracker code', /\b(?!(?:BSD|UTF|SHA|ISO|RFC|CVE|GPL|MIT|UCS)-)[A-Z]{3}-[A-Z]?\d+\b/],
  ['review code', /\(\s*[BM]\d+(?:\s*(?:,|and|\+)\s*[ABM]\d+)*\s*\)/],
  ['version', /(?<!UUID )\bv[01]\.[1-9]\d?\b/i],
  ['date', /\((?:[^()\n]{0,40}, )?(?:20\d\d-\d\d-\d\d|\d{1,2}-\d{1,2}-20\d\d)\)/],
];

/** Text between «» is a quote (a button's label, Anki's own words): its words are not the comment's. */
const QUOTE = /«[^»]*»/g;

/** @param {string} text */
function historyIn(text) {
  const unquoted = text.replace(QUOTE, (q) => ' '.repeat(q.length));
  const found = HISTORY.filter(([, pattern, quoted]) => pattern.test(quoted ? text : unquoted));
  return [...new Set(found.map(([name]) => name))];
}

/** @type {import('eslint').Rule.RuleModule} */
export const noHistoryComments = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Comments carry no history: steps, reviews, versions, dates or who asked for it.',
    },
    schema: [],
    messages: {
      history:
        'History in a comment ({{found}}): say what the code does or why it is so, without the step, review, ' +
        'version, date or person. For the site owner role, «the site owner».',
    },
  },
  create(context) {
    const check = () => {
      const sourceCode = /** @type {import('./comments.js').AnySourceCode} */ (
        /** @type {unknown} */ (context.sourceCode)
      );
      for (const group of groupComments(commentsOf(sourceCode).comments)) {
        const found = historyIn(group.map((c) => c.value).join('\n'));
        const first = group[0];
        const last = group.at(-1);
        if (!found.length || !first || !last) continue;
        context.report({
          loc: { start: first.loc.start, end: last.loc.end },
          messageId: 'history',
          data: { found: found.join(', ') },
        });
      }
    };
    return { Program: check, Document: check };
  },
};
