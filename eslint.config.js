// ESLint for the whole repository. The rules are errors; what the code broke before they existed is listed in
// eslint-suppressions.json, whose total may only go down (`npm run suppressions`).
import js from '@eslint/js';
import qv from '@qv/eslint-plugin';
import globals from 'globals';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import { domainPackages } from './eslint.domain-packages.js';

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

// The web's data features: what the page features share (the catalog and its deck tree, the user's progress). They sit
// under the page features and import none of them.
const DATA_FEATURES = ['catalog', 'progress'];

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
  ...[js.configs.recommended, ...tseslint.configs.strict].map(onCode),
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
    // Configuration files outside every tsconfig are linted without type information.
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/vitest.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
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
    // Generated by `npm run db:types` in the Supabase CLI's format: what nobody writes by hand has no thresholds nor
    // comment rules (its header says where it comes from).
    files: ['packages/db-types/src/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'qv/file-header': 'off',
      'qv/no-history-comments': 'off',
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
  {
    // Layers of the web: shared → data features → page features → app, each importing only from itself and the ones
    // below. A file at the root of src other than the entry point and Vite's types has no layer.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      'boundaries/include': ['apps/web/src/**/*'],
      'boundaries/elements': [
        { type: 'shared', pattern: 'apps/web/src/shared' },
        {
          type: 'feature-part',
          pattern: 'apps/web/src/features/*/(api|model|hooks|components|pages)',
          capture: ['feature', 'part'],
        },
        {
          type: 'feature',
          pattern: 'apps/web/src/features/*',
          capture: ['feature'],
        },
        { type: 'app', pattern: 'apps/web/src/app' },
      ],
      'boundaries/files': [{ pattern: 'apps/web/src/{main.tsx,vite-env.d.ts}', category: 'entry' }],
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              disallow: { to: { file: { categories: 'entry' } } },
              message: 'Nothing imports the entry point.',
            },
            {
              from: { element: { type: 'shared' } },
              disallow: { to: { element: { types: ['feature', 'feature-part', 'app'] } } },
              message: 'shared/ does not import a feature nor app.',
            },
            {
              from: { element: { types: ['feature', 'feature-part'] } },
              disallow: { to: { element: { type: 'app' } } },
              message: 'A feature does not import app.',
            },
            {
              from: {
                element: {
                  types: ['feature', 'feature-part'],
                  captured: { feature: `{${DATA_FEATURES.join(',')}}` },
                },
              },
              disallow: {
                to: {
                  element: {
                    types: ['feature', 'feature-part'],
                    captured: { feature: `!(${DATA_FEATURES.join('|')})` },
                  },
                },
              },
              message: 'A data feature (catalog, progress) does not import a page feature.',
            },
            {
              from: { element: { type: 'feature-part', captured: { part: 'model' } } },
              disallow: {
                to: {
                  element: {
                    type: 'feature-part',
                    captured: { part: '{api,hooks,components,pages}' },
                  },
                },
              },
              message: 'model/ is pure: it does not import api, hooks, components or pages.',
            },
            {
              from: { element: { type: 'feature-part', captured: { part: 'api' } } },
              disallow: {
                to: {
                  element: { type: 'feature-part', captured: { part: '{hooks,components,pages}' } },
                },
              },
              message: 'api/ does not import hooks, components or pages.',
            },
            {
              from: { element: { type: 'feature-part', captured: { part: 'hooks' } } },
              disallow: {
                to: { element: { type: 'feature-part', captured: { part: '{components,pages}' } } },
              },
              message: 'hooks/ does not import components or pages.',
            },
            {
              from: { element: { type: 'feature-part', captured: { part: 'components' } } },
              disallow: { to: { element: { type: 'feature-part', captured: { part: 'pages' } } } },
              message: 'components/ does not import pages.',
            },
          ],
        },
      ],
    },
  },
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
    rules: reactHooks.configs.recommended.rules,
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
