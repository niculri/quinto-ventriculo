// ESLint for the domain packages: each imports of this repository only the packages it lists, and no app, React,
// Supabase, nor the browser's storage or the network.

// Each domain package and what it may import from this repository.
const DOMAIN_PACKAGES = { study: ['@qv/schema', '@qv/srs'] };
const BROWSER_AND_NETWORK = [
  'globalThis',
  'self',
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
];

export const domainPackages = Object.entries(DOMAIN_PACKAGES).map(([name, allowed]) => ({
  files: [`packages/${name}/src/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@qv/*', ...allowed.flatMap((p) => [`!${p}`, `!${p}/*`]), '**/apps/**'],
            message: `@qv/${name} imports only ${allowed.join(' and ')} of this repository, and no app.`,
          },
          {
            group: ['react', 'react/*', 'react-*', '@tanstack/*', '@supabase/*'],
            message: 'A domain package has no React, network nor Supabase.',
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      ...BROWSER_AND_NETWORK.map((global) => ({
        name: global,
        message: 'A domain package does not touch the browser, its storage nor the network.',
      })),
    ],
  },
}));
