// ESLint for the whole repository. The rules are errors; what the code broke before they existed is listed in
// eslint-suppressions.json, whose total may only go down (`npm run suppressions`).
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import qv from '@qv/eslint-plugin';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import { domainPackages } from './eslint.domain-packages.js';
import { webLayers } from './eslint.web-layers.js';

// Files that the size and complexity rules do not apply to: tests, their fixtures and helpers, and scripts.
const TESTS_AND_SCRIPTS = [
  '**/*.test.{ts,tsx}',
  '**/test/**',
  '**/e2e/**',
  '**/scripts/**',
  'db/tests/**',
];

// The only files that may import Supabase (type-only imports are allowed anywhere; tests build their own clients).
const SUPABASE_ADAPTERS = [
  'apps/web/src/features/*/api/repository/supabase*.ts',
  'apps/web/src/features/session/api/service.ts',
  'apps/web/src/app/services.tsx',
  'apps/api/src/repositories/supabase/{client,content,raw-rpc,release,settings,unpublished}.ts',
  'packages/importer/src/targets.ts',
  '**/*.test.{ts,tsx}',
];

// The web's and the API's adapters, without their tests: what the database answers is checked with its contract.
const DATA_ADAPTERS = SUPABASE_ADAPTERS.filter(
  (g) => g.startsWith('apps/') && !g.includes('.test.'),
);

const PORTED_FROM_ANKI = [
  ...['ast', 'compile', 'errors', 'parser', 'term', 'text'].map(
    (f) => `packages/anki-search/src/${f}.ts`,
  ),
  ...['cloze', 'filters', 'html', 'render', 'template'].map(
    (f) => `packages/anki-render/src/${f}.ts`,
  ),
  ...['card', 'config', 'fsrs', 'fuzz', 'random', 'states', 'steps', 'timespan', 'timing'].map(
    (f) => `packages/srs/src/${f}.ts`,
  ),
];
const FIXED_TEXT_PAGES = [
  'apps/web/src/features/legal/pages/AboutPage.tsx',
  'apps/web/src/features/legal/pages/LicensesPage.tsx',
  'apps/web/src/features/legal/pages/PrivacyPage.tsx',
  'apps/web/src/features/legal/pages/TermsPage.tsx',
  'apps/web/src/features/help/pages/HelpPage.tsx',
];

// What qv/no-literal-text reads as text besides the HTML and ARIA text attributes: the text props of the web's
// components (not `name`, which is also a form control's name), the props that take a list of texts (with the keys of
// their items that are text), the functions whose arguments are all text, and those whose are never (keys, locales).
const LITERAL_TEXT = {
  componentTextProps: [
    'againLabel',
    'busyLabel',
    'confirm',
    'empty',
    'heading',
    'help',
    'longest',
    'message',
    'sectionLabel',
    'sectionName',
    'text',
    'unit',
    'why',
  ],
  listProps: ['choices', 'columns', 'items', 'lines', 'options'],
  textKeys: ['description', 'help', 'label', 'text', 'title'],
  textFunctions: ['plural'],
  ignoreFunctions: ['keys', 'shortcut', 'toLocaleString'],
};

// OTHER_FILES are linted only for their comments, with the qv/comments language.
const CODE = ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'];
const OTHER_FILES = ['**/*.css', '**/*.{yml,yaml}', '**/*.sh', '**/*.jsonc', '.githooks/pre-push'];
const onCode = (config) => ({ ...config, files: config.files ?? CODE });

// The React plugin's recommended preset with types, every warning an error like the rest of the rules.
const reactPreset = eslintReact.configs['recommended-type-checked'];
const reactRules = Object.fromEntries(
  Object.entries(reactPreset.rules).map(([rule, level]) => [
    rule,
    level === 'warn' ? 'error' : level,
  ]),
);

const LEAF_PACKAGES = ['srs', 'quiz', 'anki-search', 'anki-render', 'anki-format'];

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/.output',
      '**/.wrangler',
      '**/coverage',
      '**/playwright-report',
      '.cache/**',
    ],
  },
  // An `eslint-disable` that no longer silences anything is an error; the ones that do are counted by the ratchet.
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  ...[
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
  ].map(onCode),
  {
    files: CODE,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // With noUncheckedIndexedAccess, «x[0]!» after checking the length is the idiomatic way.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: [...CODE, ...OTHER_FILES],
    plugins: { qv },
    rules: { 'qv/file-header': 'error', 'qv/no-history-comments': 'error' },
  },
  { files: OTHER_FILES, language: 'qv/comments' },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/vitest.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // A number in a template is fine; `undefined`, `null` and objects are what the rule is for.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
          allowNever: false,
        },
      ],
      // A `type` alias is assignable to an index signature (`Json`, `Record`) and an interface is not.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // `onClick={() => setOpen(true)}` is how handlers are written; a void value mixed into an expression is not.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    // A test double implements an async port without awaiting anything, and a mock that does nothing is `() => {}`.
    files: TESTS_AND_SCRIPTS,
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  // Configuration files outside every tsconfig, and plain JavaScript, are linted without type information.
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.{js,mjs,cjs}', '**/vitest.config.ts', 'vitest.config.ts'],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    ignores: TESTS_AND_SCRIPTS,
    plugins: { sonarjs },
    rules: {
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 90, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    // Permanent exceptions: a file ported from Anki that keeps the original's shape, to compare it line by line (not
    // srs/src/queue/, which is split as Anki splits it), and a page that is only fixed text, without state or data.
    files: [...PORTED_FROM_ANKI, ...FIXED_TEXT_PAGES],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    // Generated by `npm run db:types` in the Supabase CLI's format: what nobody writes by hand has no thresholds, comment
    // rules nor style rules that would rewrite it (its header says where it comes from).
    files: ['packages/db-types/src/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'qv/file-header': 'off',
      'qv/no-history-comments': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts', 'db/tests/**/*.ts'],
    ignores: SUPABASE_ADAPTERS,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              allowTypeImports: true,
              message: 'Supabase is reached only through a repository (data adapter).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^@supabase\\//]',
          message: 'Supabase is reached only through a repository (data adapter).',
        },
        {
          selector: 'Literal[value=/\\/rest\\/v1/], TemplateElement[value.raw=/\\/rest\\/v1/]',
          message: 'PostgREST (/rest/v1) is reached only through a repository (data adapter).',
        },
      ],
    },
  },
  {
    files: DATA_ADAPTERS,
    rules: { 'qv/no-cast-on-data': 'error' },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@qv/web', '@qv/web/*', '@qv/api', '@qv/api/*', '**/apps/**'],
              message: 'A package does not depend on an app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: LEAF_PACKAGES.map((name) => `packages/${name}/src/**/*.ts`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@qv/*', '**/apps/**'],
              message: 'A leaf package depends on no other package nor app of this repository.',
            },
          ],
        },
      ],
    },
  },
  ...domainPackages,
  ...webLayers,
  {
    // The text a person reads goes in a strings.ts; pages that are only fixed text are their own document.
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.tsx', 'apps/web/src/test/**', ...FIXED_TEXT_PAGES],
    rules: { 'qv/no-literal-text': ['error', LITERAL_TEXT] },
  },
  {
    // The answers of the landing page's FAQ are fixed text too.
    files: ['apps/web/src/features/landing/components/Faq.tsx'],
    rules: { 'qv/no-literal-text': ['error', { ...LITERAL_TEXT, fixedText: ['Question'] }] },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    // A dependency array that is not complete is an error: React Compiler skips what disables the rule.
    rules: { ...reactHooks.configs.recommended.rules, 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: reactPreset.plugins,
    settings: reactPreset.settings,
    // react-hooks already checks the dependency arrays, and the code explains where it leaves one out.
    rules: { ...reactRules, '@eslint-react/exhaustive-deps': 'off' },
  },
  {
    // The specs take `test` from e2e/test.ts, which pins the page's clock at midday.
    files: ['apps/web/e2e/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test'],
              allowTypeImports: true,
              message: "Import `test` from './test' (the clock pinned at midday).",
            },
          ],
        },
      ],
    },
  },
);
