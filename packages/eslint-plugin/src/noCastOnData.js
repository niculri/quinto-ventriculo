// Rule qv/no-cast-on-data: in a data adapter, a database answer (`data`) is checked with its contract, never cast.

/** The expression under `!`, `?.` and other casts: `x?.data!` is still `x.data`. */
function unwrap(/** @type {any} */ node) {
  let n = node;
  while (
    n.type === 'ChainExpression' ||
    n.type === 'TSNonNullExpression' ||
    n.type === 'TSAsExpression' ||
    n.type === 'TSTypeAssertion' ||
    n.type === 'TSSatisfiesExpression'
  ) {
    n = n.expression;
  }
  return n;
}

/** What `node` may evaluate to: both sides of `??` and `||`, the right one of `&&`, both branches of `?:`. */
function outcomes(/** @type {any} */ node) {
  /** @type {any[]} */
  const out = [];
  const visit = (/** @type {any} */ n) => {
    const e = unwrap(n);
    if (e.type === 'LogicalExpression') {
      if (e.operator !== '&&') visit(e.left);
      visit(e.right);
    } else if (e.type === 'ConditionalExpression') {
      visit(e.consequent);
      visit(e.alternate);
    } else out.push(e);
  };
  visit(node);
  return out;
}

/** `x.data`, `x?.data` or `x['data']`. */
function isDataMember(/** @type {any} */ node) {
  const n = unwrap(node);
  if (n.type !== 'MemberExpression') return false;
  return n.computed
    ? n.property.type === 'Literal' && n.property.value === 'data'
    : n.property.type === 'Identifier' && n.property.name === 'data';
}

/**
 * Whether the declaration of `name` takes it from a `data`: `{ data: name }`, `{ data: name = … }`, `name = data` or
 * `name = x.data`.
 */
function isDataAlias(/** @type {any} */ variable) {
  return variable.defs.some((/** @type {any} */ def) => {
    if (def.type !== 'Variable') return false;
    let child = def.name;
    let parent = child.parent;
    if (parent.type === 'AssignmentPattern' && parent.left === child) {
      child = parent;
      parent = parent.parent;
    }
    if (
      parent.type === 'Property' &&
      parent.value === child &&
      parent.parent.type === 'ObjectPattern'
    ) {
      const key = parent.key;
      return !parent.computed && key.type === 'Identifier'
        ? key.name === 'data'
        : key.value === 'data';
    }
    const init = def.node.id === def.name ? def.node.init : null;
    if (!init) return false;
    return outcomes(init).some(
      (value) => isDataMember(value) || (value.type === 'Identifier' && value.name === 'data'),
    );
  });
}

const CASTS = new Set(['TSAsExpression', 'TSTypeAssertion']);

/** Whether `node` may be `data`, a member `data` or a name declared from one (also behind `??`, `||` or `?:`). */
function isData(/** @type {any} */ node, /** @type {any} */ sourceCode) {
  return outcomes(node).some((operand) => {
    if (operand.type !== 'Identifier') return isDataMember(operand);
    if (operand.name === 'data') return true;
    const ref = sourceCode
      .getScope(operand)
      .references.find((/** @type {any} */ r) => r.identifier === operand);
    return !!ref?.resolved && isDataAlias(ref.resolved);
  });
}

/** @type {import('eslint').Rule.RuleModule} */
export const noCastOnData = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A database answer is checked with its contract (fromDatabase), not cast.',
    },
    schema: [],
    messages: {
      cast: 'A database answer is checked with its contract (fromDatabase), not taken with `as`.',
    },
  },
  create(context) {
    /** @param {any} node */
    const check = (node) => {
      // `data as unknown as T` is one cast: reported once, on the outer one.
      if (CASTS.has(node.parent.type)) return;
      if (isData(node.expression, context.sourceCode)) context.report({ node, messageId: 'cast' });
    };
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};
