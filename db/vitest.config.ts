import { defineProject } from 'vitest/config';

export default defineProject({ test: { name: 'db', testTimeout: 30_000 } });
