// ESLint for the whole repository. The rules are errors; what the code broke before they existed is listed in
// eslint-suppressions.json, whose total may only go down (`npm run suppressions`).
import js from '@eslint/js';
import globals from 'globals';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// Files that the size and complexity rules do not apply to: tests, their fixtures and helpers, and scripts.
const TESTS_AND_SCRIPTS = [
  '**/*.test.{ts,tsx}',
  '**/test/**',
  '**/e2e/**',
  '**/scripts/**',
  'db/tests/**',
];

// Where Supabase (`@supabase/*`, also with `import()`) may be imported: the data adapters only (repositories, the
// session service, service composition, the API's Supabase repository and the importer's targets). Type-only imports
// are allowed anywhere. Tests may build their own clients.
const SUPABASE_ADAPTERS = [
  'apps/web/src/features/*/repository.ts',
  'apps/web/src/features/session/service.ts',
  'apps/web/src/app/services.tsx',
  'apps/api/src/repositories/supabase.ts',
  'packages/importer/src/targets.ts',
  '**/*.test.{ts,tsx}',
];

// Permanent exceptions to the size and complexity rules (their criterion is next to where they are used).
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
  'apps/web/src/features/legal/AboutPage.tsx',
  'apps/web/src/features/legal/PrivacyPage.tsx',
  'apps/web/src/features/legal/TermsPage.tsx',
  'apps/web/src/features/help/HelpPage.tsx',
];

// The packages that depend on nothing else of this repository.
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
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
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
    // Rules that need type information. Configuration files outside every tsconfig are linted without types.
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
    // Size and complexity of production code.
    files: ['**/*.{ts,tsx,js,mjs}'],
    ignores: TESTS_AND_SCRIPTS,
    plugins: { sonarjs },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    // Permanent exceptions to the size and complexity rules, by one criterion each:
    // - PORTED_FROM_ANKI: a file ported from Anki (SPDX header with Anki's attribution) in a package that keeps the
    //   original's shape, so that it can be compared with Anki line by line. Not srs/src/queue.ts, which is to be
    //   split as Anki splits it, nor the web's files that only take portions of Anki.
    // - FIXED_TEXT_PAGES: a page that is only fixed text (legal or help), without state, data or effects.
    files: [...PORTED_FROM_ANKI, ...FIXED_TEXT_PAGES],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    // Data boundary: Supabase is reached only through the adapters (SUPABASE_ADAPTERS).
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
    // Packages never depend on the apps; leaf packages depend on no other package of this repository.
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
  {
    // Layers of the web: shared (ui, lib) → features → app. Each layer imports only from itself and the ones below.
    // At the root of src only the entry point (main.tsx, which nothing imports) and Vite's types: any other file there
    // has no layer and is an error.
    // The future folders (shared/, and api/model/hooks/components/pages inside a feature) are already classified.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      'boundaries/include': ['apps/web/src/**/*'],
      'boundaries/elements': [
        { type: 'shared', pattern: 'apps/web/src/{ui,lib,shared}' },
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
              message: 'shared (ui, lib) does not import a feature nor app.',
            },
            {
              from: { element: { types: ['feature', 'feature-part'] } },
              disallow: { to: { element: { type: 'app' } } },
              message: 'A feature does not import app.',
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
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The specs take `test` from e2e/test.ts, which pins the page's clock at midday (step 1.9).
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
