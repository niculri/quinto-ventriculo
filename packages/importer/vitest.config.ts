import { defineProject } from 'vitest/config';

export default defineProject({ test: { name: 'importer', testTimeout: 30_000 } });
