// The nightly CI (step 1.9) must never publish: deploy.yml only deploys a CI run whose event is a push to main.
// These are text checks on the workflow files, so that a change to them that breaks it is caught.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CI_IGNORED_PATHS, CI_WORKFLOW_FILE, ciIgnored } from './deploy';
import { repositoryRoot } from './repository-root';

const workflow = (name: string) =>
  readFileSync(join(repositoryRoot(), '.github', 'workflows', name), 'utf8');

describe('GitHub workflows', () => {
  const ci = workflow('ci.yml');
  const deploy = workflow('deploy.yml');

  it('CI runs every night between 0:00 and 4:00 in Chile, and by hand', () => {
    const cron = /-\s*cron:\s*'(\d+) (\d+) \* \* \*'/.exec(ci);
    expect(cron).not.toBeNull();
    const utcMinutes = Number(cron![2]) * 60 + Number(cron![1]);
    // Chile is UTC−3 in summer and UTC−4 in winter: both have to fall inside [0:00, 4:00).
    for (const offset of [3, 4]) {
      const local = (utcMinutes - offset * 60 + 24 * 60) % (24 * 60);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThan(4 * 60);
    }
    expect(ci).toMatch(/^\s{2}workflow_dispatch:/m);
  });

  it('a push or a pull request of only docs does not run the CI: the same list as npm run deploy', () => {
    const lists = [...ci.matchAll(/paths-ignore: \[(.*)\]/g)].map((m) =>
      m[1]!.split(',').map((p) => p.trim().replace(/^'|'$/g, '')),
    );
    expect(lists).toEqual([[...CI_IGNORED_PATHS], [...CI_IGNORED_PATHS]]);
    // The nightly run is not filtered.
    expect(ci).not.toMatch(/schedule:[\s\S]*paths/);
    for (const path of ['docs/configuracion.md', '.claude/specs/x.md', 'README.md', 'CLAUDE.md']) {
      expect(ciIgnored(path)).toBe(true);
    }
    for (const path of [
      'packages/anki-search/README.md',
      'apps/web/src/app.tsx',
      'package.json',
      'content/catalog.json',
      'docs.ts',
      '.github/workflows/ci.yml',
    ]) {
      expect(ciIgnored(path)).toBe(false);
    }
  });

  it('a nightly run does not cancel a push run of the same commit (nor the other way round)', () => {
    expect(ci).toContain('group: ci-${{ github.event_name }}-${{ github.ref }}');
  });

  it('npm run deploy and deploy.yml look at the same workflow', () => {
    // npm run deploy asks for it by file; deploy.yml waits for it by name.
    expect(CI_WORKFLOW_FILE).toBe('ci.yml');
    expect(ci).toMatch(/^name: CI$/m);
    expect(deploy).toMatch(/workflows: \[CI\]/);
  });

  it('deploy.yml deploys only a CI run triggered by a push to this repository', () => {
    expect(deploy).toContain("github.event.workflow_run.event == 'push'");
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(deploy).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    );
    // No schedule of its own.
    expect(deploy).not.toMatch(/^\s*schedule:/m);
  });

  it('the pre-push hook does not run in the CI', () => {
    const hook = readFileSync(join(repositoryRoot(), '.githooks', 'pre-push'), 'utf8');
    expect(hook).toContain('CI');
    expect(hook).toContain('--no-verify');
  });
});
