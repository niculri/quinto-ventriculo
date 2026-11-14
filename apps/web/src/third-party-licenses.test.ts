// Tests of the list of third-party licenses that the build writes from node_modules.
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dependencyFolders,
  describePackages,
  licensesText,
  packageFolderOf,
  readNotices,
  serverPackages,
  webPackagesByDependencies,
} from '../build/licenses';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('the third-party licenses, from node_modules', () => {
  const packages = describePackages(webPackagesByDependencies(), serverPackages());
  const byName = (name: string) => packages.find((p) => p.name === name);

  it('lists the web’s and the Worker’s packages with their license, never the workspace’s own', () => {
    expect(byName('react')).toMatchObject({ license: 'MIT', usedBy: ['web'] });
    expect(byName('hono')).toMatchObject({ license: 'MIT', usedBy: ['server'] });
    expect(byName('@supabase/supabase-js')?.usedBy).toEqual(['server', 'web']);
    expect(byName('ts-fsrs')).toMatchObject({ license: 'MIT' });
    expect(byName('@fontsource-variable/inter')?.license).toBe('OFL-1.1');
    expect(byName('tailwindcss')).toMatchObject({ license: 'MIT', usedBy: ['web'] });
    expect(packages.some((p) => p.name.startsWith('@qv/'))).toBe(false);
    for (const tool of ['vite', 'vitest', 'wrangler', 'typescript', '@playwright/test', 'eslint']) {
      expect(byName(tool), tool).toBeUndefined();
    }
    expect(packages.filter((p) => p.license === 'UNKNOWN').map((p) => p.name)).toEqual([]);
    expect(byName('react')?.text).toMatch(/MIT License/);
  });

  it('the package of a module of the bundle, scoped or not', () => {
    const nm = join(ROOT, 'node_modules');
    expect(packageFolderOf(join(nm, 'react', 'index.js'))).toBe(join(nm, 'react'));
    expect(packageFolderOf(`${join(nm, '@tanstack', 'react-query', 'build', 'x.js')}?v=1`)).toBe(
      join(nm, '@tanstack', 'react-query'),
    );
    expect(packageFolderOf(join(ROOT, 'packages', 'srs', 'src', 'index.ts'))).toBeNull();
    expect(packageFolderOf(`${sep}nowhere${sep}node_modules${sep}`)).toBeNull();
  });

  it('the text file names each package, where it runs and its license text', () => {
    const text = licensesText(packages);
    expect(text).toMatch(/^El Quinto Ventrículo: licencias/);
    expect(text).toMatch(
      /\nhono [\d.]+ · MIT · https:\/\/github\.com\/honojs\/hono\nUsado en: el servidor\n/,
    );
    // The notices of the code adapted from other projects go at the end (fsrs-rs is BSD-3-Clause: its notice has to
    // travel with the site's files too).
    expect(text).not.toMatch(/NOTICE\.md/);
    const withNotices = licensesText(packages, readNotices());
    expect(withNotices).toMatch(/Código adaptado de otros proyectos \(NOTICE\.md del código\)/);
    expect(withNotices).toMatch(/Ankitects Pty Ltd/);
    expect(withNotices).toMatch(/Copyright \(c\) 2023, Open Spaced Repetition/);
    expect(withNotices.indexOf('fsrs-rs')).toBeGreaterThan(withNotices.indexOf('honojs/hono'));
  });

  it('walks the workspace’s packages without listing them', () => {
    const folders = [...dependencyFolders([join(ROOT, 'apps', 'api')])];
    expect(folders.some((f) => f.endsWith(`${sep}hono`))).toBe(true);
    expect(folders.some((f) => f.includes(`${sep}@qv${sep}`))).toBe(false);
  });
});
