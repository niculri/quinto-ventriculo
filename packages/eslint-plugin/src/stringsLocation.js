// Rule qv/strings-location: the texts of a component or module live in `strings/<Name>.strings.ts`, next to the
// `<Name>` they belong to; what several features share lives in a `strings/` folder of the shared code.
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];
const SUFFIX = '.strings.ts';

/** @type {import('eslint').Rule.RuleModule} */
export const stringsLocation = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Texts go in strings/<Name>.strings.ts, next to the <Name>.ts(x) that uses them (shared ones, in a shared strings/ folder).',
    },
    schema: [
      {
        type: 'object',
        properties: { shared: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      loose:
        'A strings file lives in a strings/ folder next to its code: move it to strings/{{name}}.strings.ts (a strings.ts that serves a whole feature is split by component).',
      misplaced: 'Only <Name>.strings.ts files go in a strings/ folder.',
      orphan:
        '{{name}}.strings.ts belongs to a {{name}}.ts(x) in the folder above strings/, and there is none (shared texts go in the shared strings/ folder).',
    },
  },
  create(context) {
    const at = { loc: { line: 1, column: 0 } };
    const file = context.filename;
    const base = path.basename(file);
    const dir = path.dirname(file);
    const inStringsFolder = path.basename(dir) === 'strings';
    /** @type {string[]} */
    const shared = /** @type {{ shared?: string[] }} */ (context.options[0] ?? {}).shared ?? [];
    const isShared = shared.some((s) => dir.endsWith(`/${s}`) || dir.endsWith(`/${s}/strings`));
    return {
      'Program:exit'() {
        const isStrings = base.endsWith(SUFFIX) || base === 'strings.ts';
        if (!inStringsFolder) {
          if (isStrings) {
            context.report({
              ...at,
              messageId: 'loose',
              data: { name: base.replace(SUFFIX, '').replace(/^strings\.ts$/, '<Name>') },
            });
          }
          return;
        }
        if (!base.endsWith(SUFFIX)) {
          context.report({ ...at, messageId: 'misplaced' });
          return;
        }
        if (isShared) return;
        const name = base.slice(0, -SUFFIX.length);
        const parent = path.dirname(dir);
        if (!SOURCE_EXTENSIONS.some((e) => existsSync(path.join(parent, name + e)))) {
          context.report({ ...at, messageId: 'orphan', data: { name } });
        }
      },
    };
  },
};
