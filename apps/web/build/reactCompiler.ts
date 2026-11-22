// The React Compiler options the build and Vitest share, so the tests run the same compiled code as the site.
import { reactCompilerPreset } from '@vitejs/plugin-react';

// `panicThreshold: 'none'` skips what it cannot compile instead of failing the build; the ratchet in
// `build/__tests__/react-compiler.test.ts` keeps that list at zero.
export const compilerOptions = { target: '19', panicThreshold: 'none' } as const;

export const compilerPreset = reactCompilerPreset(compilerOptions);
