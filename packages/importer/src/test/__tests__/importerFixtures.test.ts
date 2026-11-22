// Tests the one fixture that depends on the machine: how a real-material test is named when it will be skipped.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const folders: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })));
});

/** The fixtures as they load on a machine whose private repository is `folder`. */
async function fixturesWith(folder: string) {
  vi.stubEnv('QV_PRIVATE_DIR', folder);
  vi.stubEnv('QV_REQUIRE_PRIVATE', '');
  vi.resetModules();
  return import('../importerFixtures');
}

async function privateRepository(material: boolean) {
  const folder = await mkdtemp(join(tmpdir(), 'qv-private-'));
  folders.push(folder);
  if (material) {
    await mkdir(join(folder, 'content'), { recursive: true });
    await mkdir(join(folder, 'tests'), { recursive: true });
    await writeFile(join(folder, 'content', 'catalog.json'), '{}');
    await writeFile(join(folder, 'tests', 'real-material.json'), '{}');
  }
  return folder;
}

describe('privately', () => {
  it('a test keeps its name where the private repository has the material, and says why it is skipped where it has not', async () => {
    const without = await fixturesWith(await privateRepository(false));
    expect(without.privately('reads the real notes')).toMatch(
      /^reads the real notes \(se salta: sin el repositorio privado \(.+\); en la CI pública no está\)$/,
    );
    const here = await fixturesWith(await privateRepository(true));
    expect(here.privately('reads the real notes')).toBe('reads the real notes');
  });
});
