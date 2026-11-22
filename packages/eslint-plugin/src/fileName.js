// Rule qv/file-name: a file is named after what it exports (PascalCase for a component or a class, useCamelCase for a
// hook, camelCase for the rest) and a .tsx file has JSX.
import path from 'node:path';

const EXTENSION = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
// The kinds of file whose stem is the name of what they test or describe, from the longest suffix to the shortest.
const SUFFIXES = ['.flow.test', '.contract.test', '.test', '.spec', '.strings'];
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
// A component or class name has lowercase letters: an ALL_CAPS constant is not one even when it holds a function.
const PASCAL_NAME = /^[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*$/;
const HOOK = /^use[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;

/**
 * The stem of a file name, with the kind of file it is.
 * @param {string} base
 * @returns {{ stem: string, suffix: string }}
 */
export function parseName(base) {
  const withoutExtension = base.replace(EXTENSION, '');
  const suffix = SUFFIXES.find((s) => withoutExtension.endsWith(s)) ?? '';
  return { stem: withoutExtension.slice(0, withoutExtension.length - suffix.length), suffix };
}

/**
 * The kind of export a declaration is: a PascalCase function is a component (it needs no JSX to be one, as the
 * ones that only portal their children), and a hook is a `use` function.
 * @param {string} name
 * @param {{ isClass: boolean, isFunction: boolean }} declaration
 * @param {boolean} containsJsx whether the statement that declares it has JSX inside
 * @returns {'class' | 'hook' | 'component' | 'value'}
 */
function exportKind(name, declaration, containsJsx) {
  if (declaration.isClass) return 'class';
  if (HOOK.test(name)) return 'hook';
  if (PASCAL_NAME.test(name) && (containsJsx || declaration.isFunction)) return 'component';
  return 'value';
}

/**
 * The top-level declarations of a file, by name: the statement that declares each, and whether it is a class or a
 * function.
 * @typedef {{ statement: any, isClass: boolean, isFunction: boolean }} Declaration
 * @param {any[]} body
 * @returns {Map<string, Declaration>}
 */
function declarations(body) {
  /** @type {Map<string, Declaration>} */
  const declared = new Map();
  for (const statement of body) {
    const exportsIt =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
    const d = exportsIt ? statement.declaration : statement;
    if (!d) continue;
    for (const name of declaredNames(d)) {
      declared.set(name, {
        statement,
        isClass: d.type === 'ClassDeclaration',
        isFunction: isFunctionDeclaration(d, name),
      });
    }
  }
  return declared;
}

/**
 * Whether a declaration is a function: `function f() {}`, or `const f = () => {}` for the name `f`.
 * @param {any} d
 * @param {string} name
 */
function isFunctionDeclaration(d, name) {
  if (d.type === 'FunctionDeclaration') return true;
  if (d.type !== 'VariableDeclaration') return false;
  const v = d.declarations.find(
    (/** @type {any} */ x) => x.id.type === 'Identifier' && x.id.name === name,
  );
  return v?.init?.type === 'ArrowFunctionExpression' || v?.init?.type === 'FunctionExpression';
}

/**
 * The names a declaration exports (`export function f`, `export const a = 1, b = 2`), as local names.
 * @param {any} d
 * @returns {string[]}
 */
function declaredNames(d) {
  if (d.type === 'VariableDeclaration') {
    return d.declarations
      .filter((/** @type {any} */ v) => v.id.type === 'Identifier')
      .map((/** @type {any} */ v) => v.id.name);
  }
  return d.id ? [d.id.name] : [];
}

/**
 * The runtime exports of a statement as `[exported, local]` pairs, and how many re-exports it has.
 * @param {any} statement
 * @returns {{ pairs: [string, string][], reexports: number }}
 */
function exportsOf(statement) {
  if (statement.type === 'ExportAllDeclaration') {
    return { pairs: [], reexports: statement.exportKind === 'type' ? 0 : 1 };
  }
  if (statement.type === 'ExportDefaultDeclaration') {
    const d = statement.declaration;
    if (d.type === 'Identifier') return { pairs: [[d.name, d.name]], reexports: 0 };
    return { pairs: [[d.id ? d.id.name : 'default', d.id ? d.id.name : '']], reexports: 0 };
  }
  if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') {
    return { pairs: [], reexports: 0 };
  }
  const runtime = statement.specifiers.filter((/** @type {any} */ s) => s.exportKind !== 'type');
  if (statement.source) return { pairs: [], reexports: runtime.length };
  if (statement.declaration) {
    if (statement.declaration.type === 'TSEnumDeclaration') {
      return { pairs: [[statement.declaration.id.name, '']], reexports: 0 };
    }
    return { pairs: declaredNames(statement.declaration).map((n) => [n, n]), reexports: 0 };
  }
  return {
    pairs: runtime.map((/** @type {any} */ s) => [
      s.exported.name ?? s.exported.value,
      s.local.name,
    ]),
    reexports: 0,
  };
}

/**
 * What the file exports at runtime: `{ name, kind }` for each export, and the number of re-exports.
 * @param {any[]} body
 * @param {(statement: any) => boolean} hasJsx
 */
function runtimeExports(body, hasJsx) {
  const declared = declarations(body);
  /** @type {{ name: string, kind: ReturnType<typeof exportKind> }[]} */
  const exported = [];
  let reexports = 0;
  for (const statement of body) {
    const found = exportsOf(statement);
    reexports += found.reexports;
    for (const [name, local] of found.pairs) {
      const d = declared.get(local);
      exported.push({
        name,
        kind: d ? exportKind(local, d, hasJsx(d.statement)) : 'value',
      });
    }
  }
  return { exported, reexports };
}

/**
 * What is wrong between a file's name and what it exports, if anything.
 * @param {string} stem
 * @param {{ name: string, kind: string }[]} exported
 * @param {number} reexports
 * @returns {{ messageId: string, data?: Record<string, string> } | null}
 */
function contentProblem(stem, exported, reexports) {
  if (HOOK.test(stem)) {
    return exported.some((e) => e.kind === 'hook') ? null : { messageId: 'notHook' };
  }
  if (PASCAL.test(stem)) {
    if (!exported.some((e) => e.kind === 'class' || e.kind === 'component')) {
      return { messageId: 'notComponent' };
    }
  } else {
    const component = exported.find((e) => e.kind === 'component');
    if (component) return { messageId: 'component', data: { name: component.name } };
  }
  const only = exported[0];
  const alone = exported.length === 1 && reexports === 0 && only && only.kind !== 'value';
  return alone && only.name !== stem ? { messageId: 'mismatch', data: { name: only.name } } : null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const fileName = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'A file is PascalCase if it exports a component or a class, useCamelCase if it exports a hook, camelCase otherwise; .tsx only with JSX.',
    },
    schema: [],
    messages: {
      case: 'The file name «{{stem}}» is none of PascalCase (a component or a class), useCamelCase (a hook) or camelCase (the rest): no hyphens, underscores nor dots.',
      noJsx: 'A .tsx file has JSX: this one has none, so it is a .ts file.',
      notComponent:
        'A PascalCase file exports a component or a class, and this one exports none: name it in camelCase.',
      notHook: 'A useCamelCase file exports a hook, and this one exports none.',
      component:
        'The file exports the component {{name}}: a component lives in a PascalCase file, ideally named {{name}}.',
      mismatch: 'The only thing this file exports is {{name}}: name the file {{name}}.',
    },
  },
  create(context) {
    const base = path.basename(context.filename);
    const { stem, suffix } = parseName(base);
    const at = { loc: { line: 1, column: 0 } };
    /** @type {Set<any>} */
    const withJsx = new Set();
    let jsxSeen = false;
    const markJsx = (/** @type {any} */ node) => {
      jsxSeen = true;
      withJsx.add(context.sourceCode.getAncestors(node)[1]);
    };
    return {
      JSXElement: markJsx,
      JSXFragment: markJsx,
      'Program:exit'(/** @type {any} */ program) {
        if (!PASCAL.test(stem) && !HOOK.test(stem) && !CAMEL.test(stem)) {
          context.report({ ...at, messageId: 'case', data: { stem } });
          return;
        }
        if (/\.[jt]sx$/.test(base) && !jsxSeen) context.report({ ...at, messageId: 'noJsx' });
        if (suffix !== '') return;
        const { exported, reexports } = runtimeExports(program.body, (s) => withJsx.has(s));
        const problem = contentProblem(stem, exported, reexports);
        if (problem) context.report({ ...at, ...problem });
      },
    };
  },
};
