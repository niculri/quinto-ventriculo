// Vitest for the database tests (PGlite).
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'db',
    testTimeout: 30_000,
    // The test files of a worker share their modules, so tests/pglite.ts builds each database once per worker
    // instead of once per file. No helper of these tests keeps other state between files.
    isolate: false,
    setupFiles: ['./tests/setup.ts'],
  },
});
