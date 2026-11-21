// ESLint for the web's layers: shared → data features → page features → app, each importing only from itself and the
// ones below.
import boundaries from 'eslint-plugin-boundaries';

// The web's data features: what the page features share (the catalog and its deck tree, the user's progress). They sit
// under the page features and import none of them.
const DATA_FEATURES = ['catalog', 'progress'];

export const webLayers = [
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
];
