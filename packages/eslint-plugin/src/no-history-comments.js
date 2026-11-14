// Rule qv/no-history-comments: comments say what the code does or why, not when, by whom or in which step it changed.
import { commentsOf, groupComments } from './comments.js';

/**
 * Each pattern with the name the message gives it. They are narrow on purpose: a date or a code that is data (a study
 * day, a card's code, «R2») is not history; a date only counts in parentheses, as «(2026-11-01)» or «(someone,
 * 7-11-2026)».
 * @type {[string, RegExp][]}
 */
const HISTORY = [
  ['step', /\b(?:plan )?steps? \d+(?:\.\d+)*(?: ?[a-z]\b)?/i],
  ['paso', /\bpasos? \d/i],
  ['phase', /\b(?:phase|fase) \d/i],
  ['part', /\bparte? \d+\b/i],
  ['revisión', /\brevisión|\brevision de cero\b/i],
  ['review of a step', /\breview of (?:step )?\d+\.\d+/i],
  ['the owner', /\bthe owner\b|\bdue[ñn]o\b/i],
  [
    'asked for',
    /\b(?:owner|author)(?:'s)? (?:asked|requested|wanted|decided|decision|choice|words|yes)\b|\b(?:asked|requested) by the (?:owner|author)\b/i,
  ],
  ['plan code', /\b(?:ANK|CON|ESC|EXP|GYM|PUB|REN|WIK)-[A-Z]?\d+\b/],
  ['review code', /(?:^|\()\s*[ABM]\d+(?:\s*(?:,|and|\+)\s*[ABM]\d+)*\s*[:)]/m],
  ['version', /\bv[01]\.\d+\b/i],
  ['date', /\((?:[^()\n]{0,40}, )?(?:20\d\d-\d\d-\d\d|\d{1,2}-\d{1,2}-20\d\d)\)/],
  ['plan', /\bdocs\/plan\b/],
];

/** Text between «» is a quote (a button's label, Anki's own words): its words are not the comment's. */
const QUOTE = /«[^»]*»/g;

/**
 * The names of the history patterns found in a text.
 * @param {string} text
 */
function historyIn(text) {
  const unquoted = text.replace(QUOTE, (q) => ' '.repeat(q.length));
  return HISTORY.filter(([, pattern]) => pattern.test(unquoted)).map(([name]) => name);
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
