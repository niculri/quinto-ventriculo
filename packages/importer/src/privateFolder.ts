// Finds the private repository next to this one (its `content/` and the real-material checks) and the material folder.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { ImportError } from './errors';

/** The private repository sits next to this one; the material itself is in the folder that contains both. */
export const PRIVATE_FOLDER_NAME = 'quinto-ventriculo-privado';

const REPOSITORY = resolve(import.meta.dirname, '../../..');

type Env = Record<string, string | undefined>;

export function privateFolder(env: Env = process.env, repository = REPOSITORY): string {
  return resolve(env.QV_PRIVATE_DIR ?? join(repository, '..', PRIVATE_FOLDER_NAME));
}

export function contentFolder(
  option: string | undefined,
  env: Env = process.env,
  repository = REPOSITORY,
): string {
  if (option) return resolve(option);
  if (env.QV_CONTENT_DIR) return resolve(env.QV_CONTENT_DIR);
  return join(privateFolder(env, repository), 'content');
}

export function requireContentFolder(folder: string): string {
  if (!existsSync(join(folder, 'catalog.json'))) {
    throw new ImportError(
      'environment',
      `No encuentro el contenido en ${folder} (falta catalog.json). El contenido vive en el repositorio ` +
        `privado, junto a este: «${PRIVATE_FOLDER_NAME}/content». Usa --content <carpeta> o la variable ` +
        'QV_CONTENT_DIR si está en otro lugar.',
    );
  }
  return folder;
}

/**
 * The real-material checks are skipped without the private repository, except with `QV_REQUIRE_PRIVATE=1` (the
 * pre-push hook with `git config qv.requirePrivate`), where that is an error, so none of them goes unrun.
 */
export interface PrivateMaterial {
  folder: string | null;
  content: string | null;
  root: string;
  config: RealMaterialConfig | null;
  skipReason: string;
}

/** Its paths are relative to the material folder (`root`). */
export interface RealMaterialConfig {
  quiz?: {
    skill: string;
    folder: string;
    html: string;
    manifest: string;
    expect: {
      questions: number;
      sections: [string, number][];
      positionalIdPattern?: string;
      newIdPattern?: string;
      newIds?: number;
      media: number;
      statements: number;
      statementExample?: { id: string; numerals: string[] };
      published: Record<string, string>;
      notices: { first: string; second: string; firstDescription: string; forbidden: string };
    };
  };
  releaseDecks?: {
    assessmentId: string;
    decks: { before: string; now: string }[];
    compare: string;
    changed: number;
    /** Relative to the private repository, not to `root`. */
    labels: string;
  };
  /** Digests of what the HTML code gives for this material (`html-real.test.ts`); `material` names the material. */
  html?: { material: string; digests: Record<string, string> };
}

const CONFIG = 'tests/real-material.json';

export function privateMaterial(env: Env = process.env, repository = REPOSITORY): PrivateMaterial {
  const folder = privateFolder(env, repository);
  const root = resolve(env.QV_MATERIAL_DIR ?? dirname(folder));
  const here = existsSync(join(folder, 'content', 'catalog.json'));
  if (!here) {
    const reason = `sin el repositorio privado (${folder}); en la CI pública no está`;
    if (env.QV_REQUIRE_PRIVATE === '1') {
      throw new ImportError(
        'environment',
        `QV_REQUIRE_PRIVATE=1 y no está el repositorio privado en ${folder} (QV_PRIVATE_DIR para otra carpeta).`,
      );
    }
    return { folder: null, content: null, root, config: null, skipReason: reason };
  }
  const file = join(folder, CONFIG);
  const config = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as RealMaterialConfig)
    : null;
  if (!config && env.QV_REQUIRE_PRIVATE === '1') {
    throw new ImportError('environment', `QV_REQUIRE_PRIVATE=1 y falta ${file}.`);
  }
  return {
    folder,
    content: join(folder, 'content'),
    root,
    config,
    skipReason: config ? '' : `falta ${CONFIG} en el repositorio privado`,
  };
}

export function realMaterialHere(paths: string[], env: Env = process.env): boolean {
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length && env.QV_REQUIRE_PRIVATE === '1') {
    throw new ImportError(
      'environment',
      `QV_REQUIRE_PRIVATE=1 y falta material real: ${missing.join(', ')}`,
    );
  }
  return missing.length === 0;
}

export function materialPath(base: string, path: string): string {
  if (path.startsWith('~/')) return join(process.env.HOME ?? '', path.slice(2));
  return isAbsolute(path) ? path : join(base, path);
}
