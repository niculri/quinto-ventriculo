// Vitest project of the web: its tests in jsdom.
import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
import { compilerPreset } from './build/react-compiler.ts';

export default defineProject({
  plugins: [react(), babel({ presets: [compilerPreset] })],
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    // A whole study session in the browser's DOM takes seconds, more with the machine busy.
    testTimeout: 60_000,
  },
});
