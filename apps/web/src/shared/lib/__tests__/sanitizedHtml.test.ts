// Tests that only the sanitizers mark a text as sanitized HTML, the one kind SafeHtml puts in the page.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markSanitized } from '../sanitizedHtml';

const SRC = join(import.meta.dirname, '../../..');

const SANITIZERS = [
  'features/notes/model/articleHtml.ts',
  'features/notes/model/sanitize.ts',
  'features/quiz/model/html.ts',
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe('sanitized HTML', () => {
  it('is marked only by the sanitizers', () => {
    const marking = sources(SRC)
      .filter((path) => /\bmarkSanitized\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
      .filter((path) => path !== 'shared/lib/sanitizedHtml.ts')
      .sort();
    expect(marking).toEqual(SANITIZERS);
  });

  it('is the same text, only marked', () => {
    expect(markSanitized('<b>x</b>')).toBe('<b>x</b>');
  });
});
