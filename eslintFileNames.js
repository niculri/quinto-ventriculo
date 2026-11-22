// The rules about where a file lives and what it is called: its name follows what it exports, and its texts go in
// strings/<Name>.strings.ts next to it.
import qv from '@qv/eslint-plugin';

const CODE = ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'];

export const fileNames = [
  {
    files: CODE,
    plugins: { qv },
    rules: {
      'qv/file-name': 'error',
      'qv/strings-location': ['error', { shared: ['apps/web/src/shared'] }],
    },
  },
  {
    // Permanent exceptions to the file names, each with the tool or the contract that fixes the name.
    files: [
      // A declaration file is named after what it declares.
      '**/*.d.ts',
      // Tools look for these files by name.
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/playwright.config.ts',
      'eslint.config.js',
      '.dependency-cruiser.cjs',
      // Served at their own URL, which the pages already loaded and cached request.
      'apps/web/public/*.js',
    ],
    rules: { 'qv/file-name': 'off' },
  },
];
