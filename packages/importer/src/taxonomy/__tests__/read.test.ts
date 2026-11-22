// Tests reading the taxonomy files, the history of their topic ids and what git says of the committed versions.
import type { TaxonomyFile } from '@qv/schema';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import { readManifest } from '../../manifest/read';
import type { Manifest } from '../../manifest/schemas';
import { processCardImage, processImage } from '../../media/images';
import { privateMaterial } from '../../privateFolder';
import { A, createRoot, manifest, topicMap, tree } from '../../test/taxonomyFixtures';
import { compareWithHistory, compareWithPrevious } from '../historyRules';
import { readTaxonomies } from '../read';
import { taxonomyLines } from '../report';
import type { TaxonomyHistory } from '../types';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

const build = (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) =>
  buildBundle({
    manifest: m,
    root,
    process: processImage,
    processCardImage,
    now: () => new Date('2026-11-07T12:00:00Z'),
    ...extra,
  });

const failure = async (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) => {
  const e = await build(m, extra).catch((x: unknown) => x as Error);
  expect(e).toBeInstanceOf(Error);
  return (e as Error).message;
};
describe('the files: content/taxonomy/ and content/topic-map/', () => {
  const write = async (
    folder: string,
    t: unknown,
    m: unknown,
    name = 'anatomia-1-certamen-1.json',
  ) => {
    await mkdir(join(folder, 'taxonomy'), { recursive: true });
    await mkdir(join(folder, 'topic-map'), { recursive: true });
    if (t) await writeFile(join(folder, 'taxonomy', name), JSON.stringify(t));
    if (m) await writeFile(join(folder, 'topic-map', name), JSON.stringify(m));
  };
  const none = null;

  it('a tree goes with its map, of the same version and with the assessment’s file name', async () => {
    const ok = join(root, 'files-ok');
    await write(ok, tree(), topicMap());
    expect(await readTaxonomies(ok, none)).toEqual([
      {
        assessmentId: A,
        taxonomy: expect.objectContaining({ version: 1 }) as unknown,
        map: expect.objectContaining({ taxonomyVersion: 1 }) as unknown,
        history: 'none',
      },
    ]);
    expect(await readTaxonomies(join(root, 'no-hay'), none)).toEqual([]);

    const noMap = join(root, 'files-no-map');
    await write(noMap, tree(), null);
    await expect(readTaxonomies(noMap, none)).rejects.toThrow(
      /no tiene mapa: falta content\/topic-map\//,
    );
    const noTree = join(root, 'files-no-tree');
    await write(noTree, null, topicMap());
    await expect(readTaxonomies(noTree, none)).rejects.toThrow(/no tiene árbol/);
    const version = join(root, 'files-version');
    await write(version, { ...tree(), version: 2 }, topicMap());
    await expect(readTaxonomies(version, none)).rejects.toThrow(
      /se hizo para la versión 1 del árbol, y el árbol va en la 2/,
    );
    const name = join(root, 'files-name');
    await write(name, tree(), topicMap(), 'certamen-1.json');
    await expect(readTaxonomies(name, none)).rejects.toThrow(
      /es de anatomia-1\/certamen-1: se tiene que llamar anatomia-1-certamen-1\.json/,
    );
    const invalid = join(root, 'files-invalid');
    const t = tree();
    t.units[1]!.topics.push({ id: 't2', title: 'Repetido' });
    await write(invalid, t, topicMap());
    await expect(readTaxonomies(invalid, none)).rejects.toThrow(/El tema t2 está repetido/);
  });

  it('an id used again, against the last commit: a topic that left, one that came back, one that changed unit, an old number', () => {
    const before = tree();
    const same = compareWithPrevious(before, tree());
    expect(same).toEqual([]);
    const grown = tree();
    grown.version = 2;
    grown.nextTopic = 9;
    grown.units[0]!.topics[0]!.title = 'Vértebras típicas';
    grown.units[1]!.topics.push({ id: 't8', title: 'Nuevo' });
    expect(compareWithPrevious(before, grown)).toEqual([]);
    const reused = tree();
    reused.units[0]!.topics[2] = { id: 't3', title: 'Otra cosa' };
    expect(compareWithPrevious(before, reused)).toEqual([]);
    const gone = tree();
    gone.version = 2;
    gone.units[0]!.topics.splice(2, 1);
    expect(compareWithPrevious(before, gone)).toEqual([
      'el tema t3 («Imagen») ya no está: un tema nunca sale del archivo; márcalo «retired» o «mergedInto».',
    ]);
    const back = tree();
    back.version = 2;
    delete back.units[0]!.topics[3]!.retired;
    delete back.units[0]!.topics[4]!.mergedInto;
    expect(compareWithPrevious(before, back)).toEqual([
      'el tema t6 («Un tema viejo») estaba retirado y volvió: su id no se vuelve a usar; crea un tema nuevo (t8).',
      'el tema t7 («Cuerpo vertebral») estaba juntado con t1 y volvió: su id no se vuelve a usar; crea un tema nuevo (t8).',
    ]);
    const moved = tree();
    moved.version = 2;
    moved.units[1]!.topics.push(moved.units[0]!.topics.splice(1, 1)[0]!);
    expect(compareWithPrevious(before, moved)).toEqual([
      'el tema t2 («Ligamentos») pasó de la unidad s1 a la extras: un tema no cambia de unidad; déjalo en la s1 y, si hace falta en la extras, crea uno nuevo (t8) y junta este con él.',
    ]);
    const down = tree();
    down.nextTopic = 7;
    expect(compareWithPrevious(before, down)).toContain(
      '«nextTopic» bajó de 8 a 7: los números ya dados no se vuelven a usar.',
    );
    const holed = tree();
    holed.units[0]!.topics.splice(2, 1);
    expect(compareWithPrevious(holed, { ...tree(), version: 2 })).toEqual([
      'el tema t3 («Imagen») usa un número que ya se dio: un tema nuevo toma t8.',
    ]);
  });

  it('the version, against the last commit: it never goes down, and goes up when the topics change', () => {
    const before = { ...tree(), version: 3 };
    const at = (version: number, edit: (t: TaxonomyFile) => void = () => {}) => {
      const t = { ...tree(), version };
      edit(t);
      return compareWithPrevious(before, t);
    };
    expect(at(3)).toEqual([]);
    expect(at(2)).toEqual(['«version» bajó de 3 a 2: una versión ya dada no se vuelve a usar.']);
    const bump =
      'los temas cambiaron (uno nuevo, juntado, retirado o de otra unidad) y «version» sigue en 3: súbela a 4, y «taxonomyVersion» del mapa al mismo número.';
    const added = (t: TaxonomyFile) => {
      t.nextTopic = 9;
      t.units[1]!.topics.push({ id: 't8', title: 'Nuevo' });
    };
    expect(at(3, added)).toEqual([bump]);
    expect(at(4, added)).toEqual([]);
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[2]!, { retired: true }))).toEqual([bump]);
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[2]!, { mergedInto: 't2' }))).toEqual([
      bump,
    ]);
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[4]!, { mergedInto: 't2' }))).toEqual([
      bump,
    ]);
    expect(
      at(3, (t) => {
        t.units[0]!.topics[0]!.title = 'Vértebras típicas';
        t.units[0]!.topics[0]!.section = '2-ligamentos';
        t.units[1]!.decks = ['Mazo de prueba::Extras'];
      }),
    ).toEqual([]);
  });

  it('a file that is not JSON says which one; an invalid one, its problems in lines', async () => {
    const folder = join(root, 'files-syntax');
    await write(folder, null, topicMap());
    await writeFile(join(folder, 'taxonomy', 'anatomia-1-certamen-1.json'), '{ "version": 1, }');
    await expect(readTaxonomies(folder, none)).rejects.toThrow(
      /taxonomy\/anatomia-1-certamen-1\.json no es un JSON válido/,
    );
    const invalid = join(root, 'files-pretty');
    await write(invalid, { ...tree(), nextTopic: 9 }, topicMap());
    await expect(readTaxonomies(invalid, none)).rejects.toThrow(
      /anatomia-1-certamen-1\.json:\n✖ Falta el tema t8/,
    );
  });

  it('without a commit to compare with, the report says the reused ids were not checked', async () => {
    const r = await build(manifest((t) => Object.assign(t, { history: 'none' })));
    expect(r.taxonomy[0]!.unchecked).toEqual(['ids reutilizados (sin commit con qué comparar)']);
    expect(taxonomyLines(r.taxonomy)[0]).toContain(
      '(no se revisaron: ids reutilizados (sin commit con qué comparar))',
    );
  });

  it('npm run unpublish reads the manifest without the taxonomy: one being edited does not stop it', async () => {
    const folder = join(root, 'unpublish');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'catalog.json'), JSON.stringify(manifest().catalog));
    const t = tree();
    t.units[0]!.topics.splice(0, 1);
    await write(folder, t, topicMap());
    await expect(readManifest(folder, { history: none })).rejects.toThrow(/Falta el tema t1/);
    expect((await readManifest(folder, { taxonomies: false })).taxonomies).toEqual([]);
  });

  it('readManifest compares with git’s HEAD: a topic that left after the commit stops the import', async () => {
    const repo = join(root, 'repo');
    const content = join(repo, 'content');
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    await write(content, tree(), topicMap());
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'taxonomía');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'commit' }),
    ]);
    const t = tree();
    t.units[0]!.topics[2] = { id: 't3', title: 'Otra cosa', section: '3-imagen' };
    t.units[1]!.topics.push(...t.units[0]!.topics.splice(2, 1));
    await write(content, t, topicMap());
    await expect(readManifest(content)).rejects.toThrow(
      /content\/taxonomy\/anatomia-1-certamen-1\.json: el tema t3 \(«Imagen»\) pasó de la unidad s1 a la extras/,
    );
    expect((await readManifest(content, { history: none })).taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'none' }),
    ]);
  });

  it('every committed version counts: a bad edit already committed, a deleted taxonomy, a shallow clone', async () => {
    const repo = join(root, 'repo-history');
    const content = join(repo, 'content');
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    const back = tree();
    back.version = 2;
    delete back.units[0]!.topics[3]!.retired;
    await write(content, back, { ...topicMap(), taxonomyVersion: 2 });
    git('commit', '-q', '-am', 'v2');
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t6 \(«Un tema viejo»\) estaba retirado y volvió/,
    );

    const shallow = join(root, 'repo-shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo}`, shallow], {
      stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    const cloned = await readManifest(join(shallow, 'content'));
    expect(cloned.taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'shallow' }),
    ]);
    await rm(join(content, 'taxonomy'), { recursive: true });
    await rm(join(content, 'topic-map'), { recursive: true });
    const deleted =
      /content\/taxonomy\/anatomia-1-certamen-1\.json estaba en un commit y ya no está: una taxonomía con commit no se borra/;
    await expect(readManifest(content)).rejects.toThrow(deleted);
    git('add', '-A');
    git('commit', '-q', '-m', 'sin taxonomía');
    await expect(readManifest(content)).rejects.toThrow(deleted);
    await write(content, tree(), null, 'mal-nombre.json');
    git('add', '-A');
    git('commit', '-q', '-m', 'mal nombre');
    await rm(join(content, 'taxonomy', 'mal-nombre.json'));
    await expect(readManifest(content)).rejects.not.toThrow(/mal-nombre\.json estaba en un commit/);
  });
  const gitRepo = async (name: string, sub = 'content') => {
    const repo = join(root, name);
    const content = join(repo, sub);
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q', '-b', 'main');
    return { content, git };
  };
  const at = (version: number, edit: (t: TaxonomyFile) => void = () => {}) => {
    const t = { ...tree(), version };
    edit(t);
    return t;
  };
  const mapAt = (version: number) => ({ ...topicMap(), taxonomyVersion: version });

  it('a mistake already committed is fixed with another commit: a topic moved to another unit', async () => {
    const { content, git } = await gitRepo('repo-moved');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    const moved = at(2, (t) => t.units[1]!.topics.push(...t.units[0]!.topics.splice(1, 1)));
    await write(content, moved, mapAt(2));
    git('commit', '-q', '-am', 'v2: t2 a extras, sin importar');
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t2 \(«Ligamentos»\) pasó de la unidad s1 a la extras: un tema no cambia de unidad; déjalo en la s1/,
    );
    await write(content, at(3), mapAt(3));
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
  });

  it('two branches that gave one number to two topics: the merge keeps the main branch’s, and its own version counts', async () => {
    const { content, git } = await gitRepo('repo-branches');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    const add = (unit: number, title: string) =>
      at(2, (t) => {
        t.nextTopic = 9;
        t.units[unit]!.topics.push({ id: 't8', title });
      });
    git('checkout', '-q', '-b', 'x');
    await write(content, add(0, 'De x'), mapAt(2));
    git('commit', '-q', '-am', 'x: t8 en s1');
    git('checkout', '-q', 'main');
    await write(content, add(1, 'De y'), mapAt(2));
    git('commit', '-q', '-am', 'main: t8 en extras');
    expect(() => git('merge', '-q', 'x', '-m', 'merge')).toThrow();
    // Solved: main's t8 stays, x's becomes t9.
    const solved = at(3, (t) => {
      t.nextTopic = 10;
      t.units[1]!.topics.push({ id: 't8', title: 'De y' });
      t.units[0]!.topics.push({ id: 't9', title: 'De x' });
    });
    await write(content, solved, mapAt(3));
    git('add', '-A');
    git('commit', '-q', '-m', 'merge');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
    const without = at(4, (t) => {
      t.nextTopic = 9;
      t.units[1]!.topics.push({ id: 't8', title: 'De y' });
    });
    await write(content, without, mapAt(4));
    const m = await readManifest(content).catch((e: unknown) => (e as Error).message);
    expect(m).toContain('«nextTopic» bajó de 10 a 9');
    expect(m).toContain('el tema t9 («De x») ya no está');
  });

  it('every version together: one mistake gives one message, and a long list is cut', async () => {
    const versions = Array.from({ length: 40 }, (_, i) => at(40 - i));
    expect(compareWithHistory(versions, at(1))).toEqual([
      '«version» bajó de 40 a 1: una versión ya dada no se vuelve a usar.',
    ]);
    const retired = at(5, (t) => Object.assign(t.units[0]!.topics[2]!, { retired: true }));
    expect(compareWithHistory([retired, at(5)], retired)).toEqual([
      expect.stringContaining('«version» sigue en 5: súbela a 6'),
    ]);
    expect(compareWithHistory([retired, at(5)], { ...retired, version: 6 })).toEqual([]);
    const big = at(1, (t) => {
      t.nextTopic = 48;
      for (let n = 8; n < 48; n++) t.units[1]!.topics.push({ id: `t${n}`, title: `Tema ${n}` });
    });
    const history: TaxonomyHistory = {
      shallow: false,
      versions: async () => [JSON.stringify(big)],
      committedFiles: async () => ['anatomia-1-certamen-1.json'],
    };
    const folder = join(root, 'files-cut');
    await write(folder, at(2), mapAt(2));
    const e = await readTaxonomies(folder, history).then(
      () => '',
      (x: unknown) => (x as Error).message,
    );
    expect(e.match(/ya no está/g)).toHaveLength(25);
    expect(e).toContain('… y 15 más de «tema que salió».');
  });

  it('a path with accents: a deleted taxonomy is still seen', async () => {
    const { content, git } = await gitRepo('repo acentos', 'Materia médica/contenído');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
    await rm(join(content, 'taxonomy'), { recursive: true });
    await rm(join(content, 'topic-map'), { recursive: true });
    await expect(readManifest(content)).rejects.toThrow(/estaba en un commit y ya no está/);
  });

  it('a committed taxonomy of an assessment not in the catalog can leave; if it comes back, its old versions count', async () => {
    const typo = 'anatomia-1/certamen-9';
    const kept = manifest();
    kept.taxonomies!.push({
      assessmentId: typo,
      taxonomy: { ...tree(), assessmentId: typo },
      map: { ...topicMap(), assessmentId: typo },
    });
    expect(await failure(kept)).toContain(
      `content/taxonomy/anatomia-1-certamen-9.json: no existe la evaluación ${typo} en content/catalog.json.`,
    );
    const { content, git } = await gitRepo('repo-catalog');
    const name = 'anatomia-1-certamen-9.json';
    await write(
      content,
      { ...tree(), assessmentId: typo },
      { ...topicMap(), assessmentId: typo },
      name,
    );
    git('add', '.');
    git('commit', '-q', '-m', 'con un error de tipeo');
    await rm(join(content, 'taxonomy', name));
    await rm(join(content, 'topic-map', name));
    git('commit', '-q', '-am', 'fuera');
    expect((await readManifest(content)).taxonomies).toEqual([]);
    const back = { ...at(2, (t) => delete t.units[0]!.topics[3]!.retired), assessmentId: typo };
    await write(content, back, { ...mapAt(2), assessmentId: typo }, name);
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t6 \(«Un tema viejo»\) estaba retirado y volvió/,
    );
  });

  it('a repository with no commit yet: only the file, and the report says it', async () => {
    const { content } = await gitRepo('repo-empty');
    await write(content, tree(), topicMap());
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'none' }),
    ]);
  });
  const PRIVATE = privateMaterial();
  it.skipIf(!PRIVATE.content)(
    PRIVATE.content
      ? 'the private content/ reads, and each taxonomy it has is of an assessment of the catalog'
      : `the private content/ reads (se salta: ${PRIVATE.skipReason})`,
    async () => {
      const m = await readManifest(PRIVATE.content!);
      const assessments = new Set(m.catalog.assessments.map((a) => a.id));
      for (const t of m.taxonomies ?? []) {
        expect(assessments.has(t.assessmentId)).toBe(true);
        expect(t.map.taxonomyVersion).toBe(t.taxonomy.version);
      }
    },
  );
});

describe('readTaxonomies on its own', () => {
  let content: string;
  beforeAll(async () => {
    content = await mkdtemp(join(tmpdir(), 'qv-read-tax-'));
    await mkdir(join(content, 'taxonomy'), { recursive: true });
    await mkdir(join(content, 'topic-map'), { recursive: true });
    await writeFile(join(content, 'taxonomy/anatomia-1-certamen-1.json'), JSON.stringify(tree()));
    await writeFile(
      join(content, 'topic-map/anatomia-1-certamen-1.json'),
      JSON.stringify(topicMap()),
    );
  });
  afterAll(() => rm(content, { recursive: true, force: true }));

  it('a committed version that is not JSON, or not a taxonomy, is not a version: there is nothing to compare with', async () => {
    const history: TaxonomyHistory = {
      shallow: false,
      versions: async () => ['{no es json', '{"assessmentId": 3}'],
      committedFiles: async () => [],
    };
    const [t] = await readTaxonomies(content, history);
    expect(t!.history).toBe('none');
  });

  it('a version that is valid makes the history «commit», or «shallow» in a shallow clone', async () => {
    const versions = async () => [JSON.stringify(tree())];
    expect(
      (
        await readTaxonomies(content, { shallow: false, versions, committedFiles: async () => [] })
      )[0]!.history,
    ).toBe('commit');
    expect(
      (
        await readTaxonomies(content, { shallow: true, versions, committedFiles: async () => [] })
      )[0]!.history,
    ).toBe('shallow');
  });

  it('a folder that cannot be read is an error of the system; only a missing one is empty', async () => {
    const odd = await mkdtemp(join(tmpdir(), 'qv-read-tax-odd-'));
    try {
      expect(await readTaxonomies(odd, null)).toEqual([]);
      await writeFile(join(odd, 'taxonomy'), 'a file, not a folder');
      await expect(readTaxonomies(odd, null)).rejects.toMatchObject({ code: 'ENOTDIR' });
    } finally {
      await rm(odd, { recursive: true, force: true });
    }
  });
});
