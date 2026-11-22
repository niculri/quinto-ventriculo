// The file name rule: PascalCase for a component or a class, useCamelCase for a hook, camelCase for the rest.
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { fileName, parseName } from '../fileName.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const component = 'export function Panel() { return <p />; }';
const hook = 'export function useThing() { return 1; }';

tester.run('qv/file-name', fileName, {
  valid: [
    { filename: '/x/Panel.tsx', code: component },
    {
      filename: '/x/Panel.tsx',
      code: `${component}\nexport function PanelRow() { return <b />; }`,
    },
    { filename: '/x/ApiError.ts', code: 'export class ApiError extends Error {}' },
    { filename: '/x/useThing.ts', code: hook },
    { filename: '/x/useThings.ts', code: `${hook}\nexport function useOther() { return 2; }` },
    {
      filename: '/x/queryClient.ts',
      code: 'export const queryClient = 1;\nexport const other = 2;',
    },
    { filename: '/x/index.ts', code: "export { a } from './a';" },
    { filename: '/x/types.ts', code: 'export interface A { b: string }' },
    {
      filename: '/x/errors.ts',
      code: 'export class A extends Error {}\nexport class B extends Error {}',
    },
    { filename: '/x/e2eBrowse.ts', code: 'export const a = 1;' },
    { filename: '/x/paths.ts', code: 'export const OUTPUT = (n: string) => n;' },
    { filename: '/x/Panel.test.tsx', code: 'render(<Panel />);' },
    { filename: '/x/panelParts.flow.test.tsx', code: 'render(<Panel />);' },
    { filename: '/x/routes.contract.test.ts', code: 'it("a", () => {});' },
    { filename: '/x/strings/Panel.strings.ts', code: 'export const panelStrings = {};' },
    { filename: '/x/Panel.tsx', code: 'export default function Panel() { return <p />; }' },
    { filename: '/x/Re.tsx', code: 'const Re = () => <p />;\nexport { Re };' },
    {
      filename: '/x/Rail.ts',
      code: 'export const Context = 1;\nexport function Rail() { return null; }',
    },
    // Statements that declare nothing do not count as exports.
    { filename: '/x/queryClient.ts', code: 'setup();\nexport const queryClient = 1;' },
    // A re-export of everything is not the only thing the file exports.
    { filename: '/x/Bar.ts', code: "export class Foo {}\nexport * from './b';" },
    // An export that is declared elsewhere: imported, renamed to a string, anonymous or an enum.
    { filename: '/x/a.ts', code: "import { a } from './other';\nexport { a };" },
    { filename: '/x/api.ts', code: "const a = 1;\nexport { a as 'b-c' };" },
    { filename: '/x/queryClient.ts', code: 'export default function () { return 1; }' },
    { filename: '/x/queryClient.ts', code: 'export default () => 1;' },
    { filename: '/x/color.ts', code: 'export enum Color { Red }' },
    {
      filename: '/x/Panel.tsx',
      code: 'const Panel = () => <p />;\nexport default Panel;',
    },
  ],
  invalid: [
    { filename: '/x/panel-row.ts', code: 'export const a = 1;', errors: [{ messageId: 'case' }] },
    { filename: '/x/panel_row.ts', code: 'export const a = 1;', errors: [{ messageId: 'case' }] },
    {
      filename: '/x/panel-row.test.ts',
      code: 'it("a", () => {});',
      errors: [{ messageId: 'case' }],
    },
    {
      filename: '/x/panel.config.ts',
      code: 'export const a = 1;',
      errors: [{ messageId: 'case' }],
    },
    { filename: '/x/panel.tsx', code: 'export const a = 1;', errors: [{ messageId: 'noJsx' }] },
    {
      filename: '/x/Panel.tsx',
      code: 'export const a = <p />;',
      errors: [{ messageId: 'notComponent' }],
    },
    { filename: '/x/useThing.ts', code: 'export const a = 1;', errors: [{ messageId: 'notHook' }] },
    { filename: '/x/panel.tsx', code: component, errors: [{ messageId: 'component' }] },
    {
      filename: '/x/rail.ts',
      code: 'export const Context = 1;\nexport function Rail() { return null; }',
      errors: [{ messageId: 'component' }],
    },
    { filename: '/x/readingFonts.ts', code: hook, errors: [{ messageId: 'mismatch' }] },
    {
      filename: '/x/saver.ts',
      code: 'export class StepSaver {}\nexport type A = 1;',
      errors: [{ messageId: 'mismatch' }],
    },
    {
      filename: '/x/Panel.test.tsx',
      code: 'export const a = 1;',
      errors: [{ messageId: 'noJsx' }],
    },
    // A re-export of types only does not make the file less of a single-export one.
    {
      filename: '/x/saver.ts',
      code: "export class StepSaver {}\nexport type * from './b';",
      errors: [{ messageId: 'mismatch' }],
    },
    // A type-only specifier is no runtime export, even re-exported next to a class.
    {
      filename: '/x/saver.ts',
      code: "export class StepSaver {}\nexport { type A } from './b';",
      errors: [{ messageId: 'mismatch' }],
    },
    // A default export that is a name is judged like a named one.
    {
      filename: '/x/panel.tsx',
      code: 'const Panel = () => <p />;\nexport default Panel;',
      errors: [{ messageId: 'component' }],
    },
  ],
});

describe('parseName', () => {
  it('splits the stem from the kind of file', () => {
    expect(parseName('panelParts.flow.test.tsx')).toEqual({
      stem: 'panelParts',
      suffix: '.flow.test',
    });
    expect(parseName('routes.contract.test.ts')).toEqual({
      stem: 'routes',
      suffix: '.contract.test',
    });
    expect(parseName('Panel.strings.ts')).toEqual({ stem: 'Panel', suffix: '.strings' });
    expect(parseName('Panel.tsx')).toEqual({ stem: 'Panel', suffix: '' });
  });
});
