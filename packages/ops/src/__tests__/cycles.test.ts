// Tests for the import cycles between files and between the web's top folders, and for their baseline.
import { describe, expect, it } from 'vitest';
import {
  count,
  currentCycles,
  folderCycles,
  gained,
  readBaseline,
  webFolder,
  writeBaseline,
} from '../cycles';
import type { Cruise } from '../cycles';

const W = 'apps/web/src/';
const mod = (source: string, ...to: string[]) => ({
  source: W + source,
  dependencies: to.map((t) => ({ resolved: t.startsWith('packages/') ? t : W + t })),
});

describe('webFolder', () => {
  it('a feature, a shared folder, or the first folder under src', () => {
    expect(webFolder(`${W}features/study/StudyPage.tsx`)).toBe(`${W}features/study`);
    expect(webFolder(`${W}features/study/hooks/useStudy.ts`)).toBe(`${W}features/study`);
    expect(webFolder(`${W}shared/ui/Button.tsx`)).toBe(`${W}shared/ui`);
    expect(webFolder(`${W}ui/AppNav.tsx`)).toBe(`${W}ui`);
    expect(webFolder(`${W}main.tsx`)).toBe(`${W}main.tsx`);
    expect(webFolder('packages/srs/src/index.ts')).toBeNull();
  });
});

describe('folderCycles', () => {
  it('only the dependencies between folders that reach each other', () => {
    const keys = folderCycles([
      mod('features/a/x.ts', 'features/b/y.ts'),
      mod('features/b/y.ts', 'features/c/z.ts'),
      mod('features/c/z.ts', 'features/a/w.ts', 'ui/Button.tsx', 'packages/srs/src/index.ts'),
      mod('features/a/w.ts'),
      mod('ui/Button.tsx'),
    ]);
    expect(keys).toEqual([
      `${W}features/a → ${W}features/b`,
      `${W}features/b → ${W}features/c`,
      `${W}features/c → ${W}features/a`,
    ]);
  });

  it('a cycle between two files of different folders of one feature is not a folder cycle', () => {
    expect(
      folderCycles([
        mod('features/a/api/x.ts', 'features/a/hooks/y.ts'),
        mod('features/a/hooks/y.ts', 'features/a/api/x.ts'),
      ]),
    ).toEqual([]);
  });

  it('a module outside the web, or a dependency on a folder with no module of its own, takes no part in a cycle', () => {
    expect(
      folderCycles([
        { source: 'packages/srs/src/a.ts', dependencies: [{ resolved: `${W}ui/b.ts` }] },
        mod('ui/b.ts', 'app/c.ts'),
      ]),
    ).toEqual([]);
  });

  it('a folder reached by two paths is not part of a cycle just for being visited twice', () => {
    expect(
      folderCycles([
        mod('features/a/x.ts', 'features/b/y.ts', 'features/c/z.ts'),
        mod('features/c/z.ts', 'features/b/y.ts'),
        mod('features/b/y.ts'),
      ]),
    ).toEqual([]);
  });

  it('splitting a feature into folders keeps the keys of its cycles', () => {
    const before = folderCycles([
      mod('features/a/x.ts', 'features/b/y.ts'),
      mod('features/b/y.ts', 'features/a/x.ts'),
    ]);
    const after = folderCycles([
      mod('features/a/hooks/x.ts', 'features/b/api/y.ts'),
      mod('features/b/api/y.ts', 'features/a/model/x.ts'),
      mod('features/a/model/x.ts'),
    ]);
    expect(after).toEqual(before);
    expect(before).toHaveLength(2);
  });
});

describe('currentCycles', () => {
  it('the file cycles of dependency-cruiser and the folder cycles of the web', () => {
    const cruise: Cruise = {
      modules: [mod('ui/a.ts', 'app/b.ts'), mod('app/b.ts', 'ui/a.ts')],
      summary: {
        violations: [
          { from: 'packages/q/src/a.ts', to: 'packages/q/src/b.ts', rule: { name: 'no-circular' } },
          { from: 'packages/q/src/a.ts', to: 'packages/q/src/b.ts', rule: { name: 'no-circular' } },
        ],
      },
    };
    expect(currentCycles(cruise)).toEqual({
      files: ['packages/q/src/a.ts → packages/q/src/b.ts'],
      folders: [`${W}app → ${W}ui`, `${W}ui → ${W}app`],
    });
  });
});

describe('the baseline', () => {
  const base = { files: ['a → b'], folders: ['x → y', 'y → x'] };

  it('what was gained, by kind', () => {
    const now = { files: ['a → b', 'c → d'], folders: ['y → x'] };
    expect(gained(now, base)).toEqual({ files: ['c → d'], folders: [] });
    expect(count(gained(base, now))).toBe(1);
  });

  it('is written as JSON with two spaces and a final newline, and reads back the same', () => {
    expect(writeBaseline(base)).toBe(
      '{\n  "files": [\n    "a → b"\n  ],\n  "folders": [\n    "x → y",\n    "y → x"\n  ]\n}\n',
    );
    expect(readBaseline(writeBaseline(base))).toEqual(base);
  });

  it('reads only its own shape', () => {
    expect(readBaseline(JSON.stringify(base))).toEqual(base);
    expect(() => readBaseline('{"files": [1], "folders": []}')).toThrow();
    expect(() => readBaseline('[]')).toThrow();
  });
});
