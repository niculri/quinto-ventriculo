// Rule qv/no-literal-text: the text a person reads (JSX text and text props) comes from a strings.ts, not a literal.

/** The props whose value a person reads or hears. */
const TEXT_PROPS = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
]);

const WORDS = /\p{L}/u;

/** The string literals an expression may render: both branches of `?:`, the right side of `&&`, `||` and `??`. */
function renderedStrings(/** @type {any} */ node) {
  /** @type {any[]} */
  const out = [];
  const visit = (/** @type {any} */ n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n);
    else if (n.type === 'TemplateLiteral') {
      if (n.quasis.some((/** @type {any} */ q) => WORDS.test(q.value.cooked ?? ''))) out.push(n);
    } else if (n.type === 'ConditionalExpression') {
      visit(n.consequent);
      visit(n.alternate);
    } else if (n.type === 'LogicalExpression') {
      if (n.operator !== '&&') visit(n.left);
      visit(n.right);
    } else if (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression')
      visit(n.expression);
  };
  visit(node);
  return out.filter((n) => n.type === 'TemplateLiteral' || WORDS.test(n.value));
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

/** @type {import('eslint').Rule.RuleModule} */
export const noLiteralText = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'The text a person reads comes from a strings.ts list, not a literal in the JSX.',
    },
    schema: [
      {
        type: 'object',
        properties: { fixedText: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      literal:
        'Text that a person reads goes in the strings.ts of its feature (or shared/strings.ts), not in the JSX.',
    },
  },
  create(context) {
    const fixed = new Set(context.options[0]?.fixedText ?? []);
    /** Inside an element whose content is fixed text (a page of its own, as the answers of the FAQ). */
    const inFixedText = (/** @type {any} */ node) => {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === 'JSXElement' && fixed.has(elementName(n.openingElement.name))) return true;
      }
      return false;
    };
    const report = (/** @type {any} */ node) => {
      if (!inFixedText(node)) context.report({ node, messageId: 'literal' });
    };
    return {
      JSXText(/** @type {any} */ node) {
        if (WORDS.test(node.value)) report(node);
      },
      JSXExpressionContainer(/** @type {any} */ node) {
        const parent = node.parent;
        const asChild = parent.type === 'JSXElement' || parent.type === 'JSXFragment';
        const asTextProp =
          parent.type === 'JSXAttribute' &&
          parent.name.type === 'JSXIdentifier' &&
          TEXT_PROPS.has(parent.name.name);
        if (!asChild && !asTextProp) return;
        if (node.expression.type === 'JSXEmptyExpression') return;
        for (const s of renderedStrings(node.expression)) report(s);
      },
      JSXAttribute(/** @type {any} */ node) {
        if (node.name.type !== 'JSXIdentifier' || !TEXT_PROPS.has(node.name.name)) return;
        const v = node.value;
        if (v && v.type === 'Literal' && typeof v.value === 'string' && WORDS.test(v.value))
          report(v);
      },
    };
  },
};
