// The ratchet of the React Compiler: every component and hook of the web has to compile. One that the compiler skips
// would go on working, but without the memoization the rest of the site has, and nobody would notice.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import compiler from 'babel-plugin-react-compiler';
import type { LoggerEvent } from 'babel-plugin-react-compiler';
import { describe, expect, it } from 'vitest';
import { compilerOptions } from '../react-compiler';

const SRC = resolve(import.meta.dirname, '../../src');

// The Babel the build's plugin runs on (its peer): the web does not declare it, and has no types for it.
const babel = createRequire(createRequire(import.meta.url).resolve('@rolldown/plugin-babel'))(
  '@babel/core',
) as {
  transformSync(
    code: string,
    options: {
      filename: string;
      babelrc: false;
      configFile: false;
      parserOpts: { plugins: string[] };
      plugins: unknown[];
    },
  ): unknown;
};

// The compiler skips a function with this directive without a word in its log.
const OPT_OUT = /^\s*['"]use no memo['"]/m;

interface Report {
  compiled: number;
  problems: string[];
}

function compileReport(code: string, filename: string): Report {
  const report: Report = { compiled: 0, problems: [] };
  const line = (event: { fnLoc?: { start: { line: number } } | null }) =>
    `${filename}:${event.fnLoc?.start.line ?? '?'}`;
  const logger = {
    logEvent(_file: string | null, event: LoggerEvent) {
      if (event.kind === 'CompileSuccess') report.compiled += 1;
      else if (event.kind === 'CompileError' || event.kind === 'CompileDiagnostic')
        report.problems.push(`${line(event)} ${event.detail.reason}`);
      else if (event.kind === 'CompileSkip') report.problems.push(`${line(event)} ${event.reason}`);
      else if (event.kind === 'PipelineError') report.problems.push(`${line(event)} ${event.data}`);
    },
  };
  babel.transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [[compiler, { ...compilerOptions, logger }]],
  });
  return report;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === '__tests__' || entry.name === 'test' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : [];
  });
}

describe('the React Compiler', () => {
  it.each([
    [
      'a hook called conditionally',
      `import { useState } from 'react';
       export function Bad({ on }: { on: boolean }) {
         if (on) useState(0);
         return null;
       }`,
    ],
    [
      'a try … finally',
      `import { useState } from 'react';
       export function useBad() {
         const [n, setN] = useState(0);
         const run = () => {
           try {
             setN(1);
           } finally {
             setN(2);
           }
         };
         return [n, run] as const;
       }`,
    ],
    [
      'a disabled react-hooks rule',
      `import { useEffect } from 'react';
       export function Bad({ a }: { a: number }) {
         useEffect(() => {
           console.log(a);
           // eslint-disable-next-line react-hooks/exhaustive-deps
         }, []);
         return <div />;
       }`,
    ],
    [
      'a "use no memo" in a component',
      `export function Bad({ a }: { a: number }) {
         'use no memo';
         return <div>{a}</div>;
       }`,
    ],
  ])('reports %s', (_name, code) => {
    const report = compileReport(code, 'Bad.tsx');
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatch(/^Bad\.tsx:\d+ /);
  });

  it('does not log a "use no memo" in a function that is no component, so the text of the file is looked for it', () => {
    const code = `export function plain() {
         'use no memo';
         return 1;
       }`;
    expect(compileReport(code, 'plain.ts').problems).toEqual([]);
    expect(OPT_OUT.test(code)).toBe(true);
  });

  it('compiles every component and hook of the web', { timeout: 120_000 }, () => {
    const problems: string[] = [];
    let compiled = 0;
    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, 'utf8');
      if (OPT_OUT.test(code)) problems.push(`${relative(SRC, file)} opts out with "use no memo"`);
      const report = compileReport(code, relative(SRC, file));
      compiled += report.compiled;
      problems.push(...report.problems);
    }
    expect(problems).toEqual([]);
    // A walk that found nothing would pass for the wrong reason.
    expect(compiled).toBeGreaterThan(500);
  });
});
