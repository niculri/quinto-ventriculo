// Tests of the build's obfuscation: the site's own chunks come out with no readable name or text and doing the same,
// the bundler's imports untouched, nothing that needs `eval`, and the libraries' chunks as they were.
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { obfuscate, obfuscateChunk } from '../obfuscate';

// Inside a function, as a module's code is after the bundler: the names at the top of a chunk are the minifier's to
// shorten, which runs after this.
const OWN = `
  (() => {
    const unsavedMessage = (count) => 'Sin conexión · ' + count + ' por guardar';
    const waitingAnswers = [1, 2, 3].map((n) => n * 2);
    globalThis.result = unsavedMessage(waitingAnswers.length) + ' / ' + waitingAnswers.join(',');
  })();
`;

type RenderChunk = (code: string, chunk: { name: string; moduleIds: string[] }) => unknown;
const renderChunk = obfuscate().renderChunk as unknown as RenderChunk;

describe('obfuscateChunk', () => {
  it('hides the names and the texts, and the code does the same as before', () => {
    const out = obfuscateChunk(OWN, 'StudyPage');
    expect(out).not.toMatch(/Sin conexión|por guardar|unsavedMessage|waitingAnswers/);
    const before: { result?: string } = {};
    const after: { result?: string } = {};
    runInNewContext(OWN, before);
    runInNewContext(out, after);
    expect(after.result).toBe('Sin conexión · 3 por guardar / 2,4,6');
    expect(after.result).toBe(before.result);
  });

  it('builds no code from text: the page forbids eval and the Function constructor', () => {
    expect(obfuscateChunk(OWN, 'StudyPage')).not.toMatch(/\beval\(|\bFunction\(|constructor\(/);
  });

  it('leaves the file names of the imports for the bundler, which writes their hashes afterwards', () => {
    const code = `
      import { paths } from "./paths.!~{003}~.js";
      export const load = () => import("./NotePage.!~{01a}~.js");
      export const home = paths.home + 'inicio';
    `;
    const out = obfuscateChunk(code, 'index');
    expect(out).toMatch(/from\s*["']\.\/paths\.!~\{003\}~\.js["']/);
    expect(out).toMatch(/import\(["'`]\.\/NotePage\.!~\{01a\}~\.js["'`]\)/);
    expect(out).not.toContain('inicio');
  });

  it('the same chunk always comes out the same, so that its file name changes only when its code does', () => {
    expect(obfuscateChunk(OWN, 'StudyPage')).toBe(obfuscateChunk(OWN, 'StudyPage'));
  });
});

describe('the plugin', () => {
  it('runs only in the build', () => {
    expect(obfuscate().apply).toBe('build');
  });

  it('obfuscates a chunk that carries code of the site, also beside a library’s', () => {
    const out = renderChunk(OWN, {
      name: 'index',
      moduleIds: ['/repo/node_modules/lucide-react/dist/x.js', '/repo/apps/web/src/main.tsx'],
    }) as { code: string; map: null };
    expect(out.map).toBeNull();
    expect(out.code).not.toContain('Sin conexión');
  });

  it('leaves as it is a chunk with only libraries and the bundler’s own modules', () => {
    const chunk = {
      name: 'react',
      moduleIds: ['/repo/node_modules/react-dom/index.js', '\0rolldown/runtime.js'],
    };
    expect(renderChunk(OWN, chunk)).toBeNull();
  });
});
