// Vitest project of the web: its tests in jsdom.
import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
import { compilerPreset } from './build/reactCompiler.ts';

// The compiler wraps each component in cache checks (`if ($[0] !== x)`) that v8 reports as branches of the source file
// and that no source line can reach; the coverage run measures the source as written, the normal run the compiled code.
const measuringCoverage = process.argv.some(
  (arg) => arg === '--coverage' || arg.startsWith('--coverage.'),
);

export default defineProject({
  plugins: [react(), ...(measuringCoverage ? [] : [babel({ presets: [compilerPreset] })])],
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    // A whole study session in the browser's DOM takes seconds, more with the machine busy.
    testTimeout: 60_000,
  },
});
