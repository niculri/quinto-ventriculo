// Rule qv/file-header: a file starts with a short comment that says what it does.
import { commentsOf, groupComments, isDirective, textLines, wordsIn } from './comments.js';

/** @typedef {import('./comments.js').Comment} Comment */

/**
 * The comment that should be the header: the first group before the code, after the shebang, the tools' directives
 * and the license block (the line comments that start with an SPDX identifier, and the attribution right under it).
 * @param {import('./comments.js').AnySourceCode} sourceCode
 * @returns {Comment[] | null}
 */
function headerOf(sourceCode) {
  const { comments, codeStart } = commentsOf(sourceCode);
  const before = comments.filter((c) => c.range[1] <= codeStart && !isDirective(c));
  const groups = groupComments(before).filter(
    (group) => !group.some((c) => c.value.includes('SPDX-License-Identifier')),
  );
  return groups[0] ?? null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const fileHeader = {
  meta: {
    type: 'suggestion',
    docs: { description: 'A file starts with a short comment that says what it does.' },
    schema: [
      {
        type: 'object',
        properties: { maxLines: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        'The file has no header: start it with a comment of one or two lines that says what the file does ' +
        '(after the shebang, and after a blank line under an SPDX block).',
      empty:
        'The header says nothing: write, in a few words, what the file does (not a separator, a TODO or an empty comment).',
      long: 'The header has {{lines}} lines: at most {{max}}. Say what the file does; the rest goes next to the code it explains, or out.',
    },
  },
  create(context) {
    const max = /** @type {{ maxLines?: number }} */ (context.options[0] ?? {}).maxLines ?? 2;
    const check = () => {
      const sourceCode = /** @type {import('./comments.js').AnySourceCode} */ (
        /** @type {unknown} */ (context.sourceCode)
      );
      const header = headerOf(sourceCode);
      if (!header) {
        context.report({ loc: { line: 1, column: 0 }, messageId: 'missing' });
        return;
      }
      if (wordsIn(header) < 2) {
        context.report({ loc: { line: 1, column: 0 }, messageId: 'empty' });
        return;
      }
      const lines = textLines(header);
      if (lines > max) {
        const first = header[0];
        const last = header.at(-1);
        if (!first || !last) return;
        context.report({
          loc: { start: first.loc.start, end: last.loc.end },
          messageId: 'long',
          data: { lines: String(lines), max: String(max) },
        });
      }
    };
    return { Program: check, Document: check };
  },
};
