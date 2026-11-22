// Vitest for the whole repository: one project per workspace. `npm run coverage` adds the coverage of the source.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'db', 'apps/api', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', '**/__tests__/**', 'apps/*/src/test/**'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
