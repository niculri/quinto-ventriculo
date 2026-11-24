// Vite plugin that obfuscates the build's chunks that carry the site's own code: names mangled and texts moved to an
// encoded table, with nothing that needs `eval` (the page's Content-Security-Policy forbids it).
import JavaScriptObfuscator from 'javascript-obfuscator';
import type { ObfuscatorOptions } from 'javascript-obfuscator';
import type { Plugin } from 'vite';

/**
 * The lightest set that still hides names and texts. Left out on purpose: control-flow flattening and dead code (they
 * double the size and slow every render), the debug protection and self-defending (they build code from strings), and
 * the renaming of globals and of properties (they break what the browser and the libraries call by name).
 */
const OPTIONS: ObfuscatorOptions = {
  compact: true,
  target: 'browser',
  sourceMap: false,
  // An `import()` keeps its file name as it is: the bundler writes the hashed name in it afterwards.
  ignoreImports: true,
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,
  renameProperties: false,
  transformObjectKeys: false,
  simplify: true,
  numbersToExpressions: false,
  splitStrings: false,
  unicodeEscapeSequence: false,
  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayCallsTransform: false,
  stringArrayWrappersCount: 1,
  stringArrayWrappersType: 'variable',
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  disableConsoleOutput: false,
};

/** A package's own file: its code is public already, and obfuscating it would only make the site heavier. */
const isThirdParty = (id: string) => id.includes('/node_modules/') || id.startsWith('\0');

/** By the chunk's name, so that the same code always gives the same file (its hash is of what comes out of here). */
export function obfuscateChunk(code: string, name: string): string {
  return JavaScriptObfuscator.obfuscate(code, { ...OPTIONS, seed: name }).getObfuscatedCode();
}

export function obfuscate(): Plugin {
  return {
    name: 'qv-obfuscate',
    apply: 'build',
    renderChunk(code, chunk) {
      if (chunk.moduleIds.every(isThirdParty)) return null;
      return { code: obfuscateChunk(code, chunk.name), map: null };
    },
  };
}
