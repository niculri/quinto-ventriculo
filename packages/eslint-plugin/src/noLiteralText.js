// Rule qv/no-literal-text: the text a person reads (JSX text, text props, text passed to what renders) comes from a
// strings/<Name>.strings.ts, not a literal.

/** The HTML and ARIA attributes a person reads or hears, on any element. */
const HTML_TEXT_PROPS = [
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
];

const WORDS = /\p{L}/u;
const NON_ASCII = /\P{ASCII}/u;
const CAPITALIZED = /^\P{L}*\p{Lu}\p{Ll}/u;
const CLASS_TOKEN = /[-:[\]/]/;

/**
 * Whether a string passed to an arbitrary function reads as text rather than as a key, a class list, a query or an
 * enum value: it has a letter and an accent, or starts with a capitalized word, or has words apart that are not class
 * names nor `key:value` pairs.
 */
function readsAsText(/** @type {string} */ s) {
  if (!WORDS.test(s)) return false;
  if (NON_ASCII.test(s) || CAPITALIZED.test(s)) return true;
  const tokens = s.trim().split(/\s+/);
  return tokens.length > 1 && !tokens.some((t) => CLASS_TOKEN.test(t));
}

const cooked = (/** @type {any} */ t) =>
  t.quasis.map((/** @type {any} */ q) => q.value.cooked).join(' ');

/** The last name of a callee: `plural`, `n.toLocaleString` → `toLocaleString`. */
function calleeName(/** @type {any} */ callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier')
    return callee.property.name;
  return '';
}

/**
 * The name of a JSX element: `Question`, `Dialog.Title`.
 * @returns {string}
 */
function elementName(/** @type {any} */ name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression')
    return `${elementName(name.object)}.${elementName(name.property)}`;
  return '';
}

/**
 * @typedef {{ textFunctions: Set<string>, ignoreFunctions: Set<string>, textKeys: Set<string> }} Options
 * @typedef {(node: any) => void} Report
 */

/** Whether a string literal is text: any letter when everything counts, else only what reads as text. */
const isText = (/** @type {string} */ s, /** @type {boolean} */ all) =>
  all ? WORDS.test(s) : readsAsText(s);

/**
 * @typedef {(n: any, all: boolean) => void} Visit
 * @type {Record<string, (n: any, all: boolean, visit: Visit, o: Options, report: Report) => void>}
 */
const VISITORS = {
  Literal: (n, all, _visit, _o, report) => {
    if (typeof n.value === 'string' && isText(n.value, all)) report(n);
  },
  TemplateLiteral: (n, all, visit, _o, report) => {
    if (isText(cooked(n), all)) report(n);
    else for (const e of n.expressions) visit(e, all);
  },
  ConditionalExpression: (n, all, visit) => {
    visit(n.consequent, all);
    visit(n.alternate, all);
  },
  LogicalExpression: (n, all, visit) => {
    if (n.operator !== '&&') visit(n.left, all);
    visit(n.right, all);
  },
  BinaryExpression: (n, all, visit) => {
    if (n.operator !== '+') return;
    visit(n.left, all);
    visit(n.right, all);
  },
  TSAsExpression: (n, all, visit) => visit(n.expression, all),
  TSSatisfiesExpression: (n, all, visit) => visit(n.expression, all),
  TSNonNullExpression: (n, all, visit) => visit(n.expression, all),
  CallExpression: (n, _all, visit, o) => {
    const name = calleeName(n.callee);
    if (o.ignoreFunctions.has(name)) return;
    for (const a of n.arguments) visit(a, o.textFunctions.has(name));
  },
  ArrayExpression: (n, _all, visit) => {
    for (const e of n.elements) visit(e, false);
  },
  ObjectExpression: (n, _all, visit, o) => {
    for (const p of n.properties) {
      if (p.type !== 'Property') continue;
      visit(p.value, o.textKeys.has(p.key.type === 'Identifier' ? p.key.name : p.key.value));
    }
  },
};

/**
 * What an expression renders. `strict`: every string with a letter is text (a JSX child, a text prop, an argument of
 * a text function); otherwise only what `readsAsText` (an argument of another function, an item of a list prop).
 * Callbacks are not followed: what they return is not rendered here.
 */
function rendered(
  /** @type {any} */ node,
  /** @type {boolean} */ strict,
  /** @type {Options} */ o,
  /** @type {Report} */ report,
) {
  /** @type {Visit} */
  const visit = (n, all) => {
    if (n) VISITORS[n.type]?.(n, all, visit, o, report);
  };
  visit(node, strict);
}

const list = { type: 'array', items: { type: 'string' } };

/** @type {import('eslint').Rule.RuleModule} */
export const noLiteralText = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'The text a person reads comes from a strings/<Name>.strings.ts list, not a literal in the JSX.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          componentTextProps: list,
          listProps: list,
          textKeys: list,
          textFunctions: list,
          ignoreFunctions: list,
          fixedText: list,
        },
        additionalProperties: false,
      },
    ],
    messages: {
      literal:
        'Text that a person reads goes in the strings/<Name>.strings.ts next to this file (or in shared/strings/), not in the JSX.',
    },
  },
  create(context) {
    const opts = context.options[0] ?? {};
    const htmlProps = new Set(HTML_TEXT_PROPS);
    const componentProps = new Set([...HTML_TEXT_PROPS, ...(opts.componentTextProps ?? [])]);
    const listProps = new Set(opts.listProps ?? []);
    /** @type {Options} */
    const o = {
      textFunctions: new Set(opts.textFunctions ?? []),
      ignoreFunctions: new Set(opts.ignoreFunctions ?? []),
      textKeys: new Set(opts.textKeys ?? []),
    };
    const fixed = new Set(opts.fixedText ?? []);
    /** Inside an element whose content is fixed text (a document of its own, as the answers of the FAQ). */
    const inFixedText = (/** @type {any} */ node) => {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === 'JSXElement' && fixed.has(elementName(n.openingElement.name))) return true;
      }
      return false;
    };
    const report = (/** @type {any} */ node) => {
      if (!inFixedText(node)) context.report({ node, messageId: 'literal' });
    };
    /** How a prop is read: `text` (all of it), `list` (its items that read as text) or not at all. */
    const propKind = (/** @type {any} */ attribute) => {
      if (attribute.name.type !== 'JSXIdentifier') return null;
      const prop = attribute.name.name;
      const component = /^[A-Z]/.test(elementName(attribute.parent.name));
      if ((component ? componentProps : htmlProps).has(prop)) return 'text';
      if (component && listProps.has(prop)) return 'list';
      return null;
    };
    return {
      JSXText(/** @type {any} */ node) {
        if (WORDS.test(node.value)) report(node);
      },
      JSXExpressionContainer(/** @type {any} */ node) {
        if (node.expression.type === 'JSXEmptyExpression') return;
        const parent = node.parent;
        if (parent.type === 'JSXElement' || parent.type === 'JSXFragment') {
          rendered(node.expression, true, o, report);
        } else {
          const kind = propKind(parent);
          if (kind) rendered(node.expression, kind === 'text', o, report);
        }
      },
      JSXAttribute(/** @type {any} */ node) {
        const v = node.value;
        if (!v || v.type !== 'Literal' || typeof v.value !== 'string') return;
        const kind = propKind(node);
        if (kind === 'text' ? WORDS.test(v.value) : kind === 'list' && readsAsText(v.value))
          report(v);
      },
    };
  },
};
