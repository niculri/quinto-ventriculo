// The comments of a linted file, the same way for JavaScript and for the comments language (CSS, YAML, shell).

/**
 * @typedef {{ line: number, column: number }} Position
 * @typedef {{ type: 'Line' | 'Block' | 'Shebang', value: string, range: [number, number],
 *   loc: { start: Position, end: Position } }} Comment
 * @typedef {{ getAllComments(): Comment[], text: string, ast: unknown }} AnySourceCode
 */

/** What tools read from a comment (ESLint, TypeScript, Biome, Vite, coverage, Vitest, shellcheck…). */
const DIRECTIVE =
  /^(?:eslint(?:-disable|-enable)?\b|global\b|globals\b|exported\b|@ts-|\/\s*<reference\b|biome-ignore\b|@vite-ignore\b|istanbul\b|[vc]8 ignore\b|@vitest-environment\b|@jsx|[#@]__PURE__|shellcheck\b|yaml-language-server:)/;

/** @param {Comment} comment */
export function isDirective(comment) {
  return DIRECTIVE.test(comment.value.trim());
}

/** @param {Comment} comment @param {string} text */
function isShebang(comment, text) {
  return comment.type === 'Shebang' || (comment.range[0] === 0 && text.startsWith('#!'));
}

/**
 * Without the shebang; `codeStart` is the length of the text when it is only comments.
 * @param {AnySourceCode} sourceCode
 * @returns {{ comments: Comment[], codeStart: number }}
 */
export function commentsOf(sourceCode) {
  const comments = sourceCode.getAllComments().filter((c) => !isShebang(c, sourceCode.text));
  const ast = /** @type {{ codeStart?: number, tokens?: { range: [number, number] }[] }} */ (
    sourceCode.ast
  );
  const codeStart = ast.codeStart ?? ast.tokens?.[0]?.range[0] ?? sourceCode.text.length;
  return { comments, codeStart };
}

/**
 * Comments that read as one: line comments on consecutive lines; a block comment is a group of its own.
 * @param {Comment[]} comments
 * @returns {Comment[][]}
 */
export function groupComments(comments) {
  /** @type {Comment[][]} */
  const groups = [];
  for (const comment of comments) {
    const group = groups.at(-1);
    const last = group?.at(-1);
    const continues =
      group &&
      last &&
      comment.type === 'Line' &&
      last.type === 'Line' &&
      comment.loc.start.line === last.loc.end.line + 1;
    if (continues) group.push(comment);
    else groups.push([comment]);
  }
  return groups;
}

/**
 * A block comment's `*` and its empty first and last lines do not count.
 * @param {Comment[]} group
 */
export function textLines(group) {
  return group
    .flatMap((c) => c.value.split('\n'))
    .map((line) => line.replace(/^\s*\*?/, '').trim())
    .filter(Boolean).length;
}

/**
 * The words of a group: runs of two or more letters, without the markers that say nothing (TODO, FIXME, XXX).
 * @param {Comment[]} group
 */
export function wordsIn(group) {
  const text = group.map((c) => c.value).join(' ');
  return (text.match(/\p{L}{2,}/gu) ?? []).filter((w) => !/^(?:TODO|FIXME|XXX)$/i.test(w)).length;
}
