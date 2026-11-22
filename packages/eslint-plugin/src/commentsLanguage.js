// An ESLint language that only reads the comments of CSS, YAML, shell scripts and JSON with comments.
import { TextSourceCodeBase, VisitNodeStep } from '@eslint/plugin-kit';

/** @typedef {import('./comments.js').Comment} Comment */
/** @typedef {{ line: string | null, block: boolean }} Syntax */
/**
 * @typedef {{ type: 'Document', comments: Comment[], codeStart: number, range: [number, number],
 *   loc: Comment['loc'] }} DocumentNode
 */

/**
 * CSS has only block comments, JSON with comments has JavaScript's two, and the rest (YAML, shell, hooks) has `#`.
 * @param {string} path
 * @returns {Syntax}
 */
export function syntaxOf(path) {
  if (/\.css$/i.test(path)) return { line: null, block: true };
  if (/\.jsonc$/i.test(path)) return { line: '//', block: true };
  return { line: '#', block: false };
}

/**
 * Turns an index into a line (from 1) and a column (from 0).
 * @param {string} text
 */
function locator(text) {
  const starts = [0];
  const start = (/** @type {number} */ line) => /** @type {number} */ (starts[line]);
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  /** @param {number} index */
  return (index) => {
    let line = starts.length - 1;
    while (start(line) > index) line--;
    return { line: line + 1, column: index - start(line) };
  };
}

/**
 * With `#` comments (YAML and shell), a quote inside a word is an apostrophe («don't») and no string spans lines.
 * @param {string} text @param {number} i @param {Syntax} syntax
 * @returns {number | null}
 */
function stringEnd(text, i, syntax) {
  const quote = text[i];
  if (quote !== '"' && quote !== "'") return null;
  const hash = syntax.line === '#';
  if (hash && i > 0 && !/[\s[{(:,=$]/.test(text.charAt(i - 1))) return null;
  let j = i + 1;
  while (j < text.length && text[j] !== quote && !(hash && text[j] === '\n')) {
    j += text[j] === '\\' && quote === '"' ? 2 : 1;
  }
  return j + 1;
}

/**
 * @param {string} text @param {number} i @param {Syntax} syntax
 * @returns {{ type: Comment['type'], start: number, end: number, value: string } | null}
 */
function commentAt(text, i, syntax) {
  if (syntax.block && text.startsWith('/*', i)) {
    const close = text.indexOf('*/', i + 2);
    const end = close < 0 ? text.length : close + 2;
    return {
      type: 'Block',
      start: i,
      end,
      value: text.slice(i + 2, close < 0 ? text.length : close),
    };
  }
  const line = syntax.line;
  if (!line || !text.startsWith(line, i)) return null;
  if (line === '#' && i > 0 && !/\s/.test(text.charAt(i - 1))) return null;
  const newline = text.indexOf('\n', i);
  const end = newline < 0 ? text.length : newline;
  const type = i === 0 && text.startsWith('#!') ? 'Shebang' : 'Line';
  return { type, start: i, end, value: text.slice(i + line.length, end) };
}

/**
 * `codeStart` is the length of the text when it has no code.
 * @param {string} text @param {Syntax} syntax
 * @returns {{ comments: Comment[], codeStart: number }}
 */
export function scanComments(text, syntax) {
  const at = locator(text);
  /** @type {Comment[]} */
  const comments = [];
  let codeStart = -1;
  let i = 0;
  while (i < text.length) {
    const comment = commentAt(text, i, syntax);
    if (comment) {
      const { type, start, end, value } = comment;
      comments.push({ type, value, range: [start, end], loc: { start: at(start), end: at(end) } });
      i = end;
      continue;
    }
    if (codeStart < 0 && !/\s/.test(text.charAt(i))) codeStart = i;
    i = stringEnd(text, i, syntax) ?? i + 1;
  }
  return { comments, codeStart: codeStart < 0 ? text.length : codeStart };
}

/**
 * @extends {TextSourceCodeBase<{ LangOptions: {}, RootNode: DocumentNode, SyntaxElementWithLoc: DocumentNode | Comment,
 *   ConfigNode: never }>}
 */
class CommentsSourceCode extends TextSourceCodeBase {
  getAllComments() {
    return this.ast.comments;
  }

  /** @override */
  *traverse() {
    yield new VisitNodeStep({ target: this.ast, phase: 1, args: [this.ast, null] });
    yield new VisitNodeStep({ target: this.ast, phase: 2, args: [this.ast, null] });
  }
}

export const commentsLanguage = {
  fileType: /** @type {const} */ ('text'),
  lineStart: /** @type {const} */ (1),
  columnStart: /** @type {const} */ (0),
  nodeTypeKey: 'type',
  visitorKeys: { Document: [] },
  validateLanguageOptions() {
    // A text file has no language options.
  },
  /** @param {{ body: string | Uint8Array, path: string }} file */
  parse(file) {
    const text = typeof file.body === 'string' ? file.body : new TextDecoder().decode(file.body);
    const { comments, codeStart } = scanComments(text, syntaxOf(file.path));
    const at = locator(text);
    /** @type {DocumentNode} */
    const ast = {
      type: 'Document',
      comments,
      codeStart,
      range: [0, text.length],
      loc: { start: at(0), end: at(text.length) },
    };
    return { ok: /** @type {const} */ (true), ast };
  },
  /** @param {{ body: string | Uint8Array }} file @param {{ ast: unknown }} parsed */
  createSourceCode(file, parsed) {
    const text = typeof file.body === 'string' ? file.body : new TextDecoder().decode(file.body);
    return new CommentsSourceCode({ text, ast: /** @type {DocumentNode} */ (parsed.ast) });
  },
};
