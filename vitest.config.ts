import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'db', 'apps/api', 'apps/web'],
  },
});
