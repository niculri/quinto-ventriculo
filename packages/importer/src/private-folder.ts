import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * The code and the material live in two repositories (step 2.4): this one (public, AGPL) and a private one next to
 * it, with `content/` (what is published: catalog, manifests, taxonomies, unpublished.json) and the checks that need
 * the author's real material. The material itself (notes, decks, tests) stays outside both, in the folder that
 * contains them (`--root`).
 *
 *   <root>/
 *     <this repository>/
 *     quinto-ventriculo-privado/    the private one: content/, tests/real-material.json
 */
export const PRIVATE_FOLDER_NAME = 'quinto-ventriculo-privado';

/** The root of this repository (packages/importer/src → three levels up). */
export const REPOSITORY = resolve(import.meta.dirname, '../../..');

type Env = Record<string, string | undefined>;

/** The private repository: `QV_PRIVATE_DIR`, or the sibling folder of this repository. */
export function privateFolder(env: Env = process.env, repository = REPOSITORY): string {
  return resolve(env.QV_PRIVATE_DIR ?? join(repository, '..', PRIVATE_FOLDER_NAME));
}

/** `content/` to read: `--content`, `QV_CONTENT_DIR`, or `content/` of the private repository. */
export function contentFolder(
  option: string | undefined,
  env: Env = process.env,
  repository = REPOSITORY,
): string {
  if (option) return resolve(option);
  if (env.QV_CONTENT_DIR) return resolve(env.QV_CONTENT_DIR);
  return join(privateFolder(env, repository), 'content');
}

/** Throws a clear error when `folder` is not a content folder (no catalog.json). */
export function requireContentFolder(folder: string): string {
  if (!existsSync(join(folder, 'catalog.json'))) {
    throw new Error(
      `No encuentro el contenido en ${folder} (falta catalog.json). El contenido vive en el repositorio ` +
        `privado, junto a este: «${PRIVATE_FOLDER_NAME}/content». Usa --content <carpeta> o la variable ` +
        'QV_CONTENT_DIR si está en otro lugar.',
    );
  }
  return folder;
}

/**
 * The checks against the author's real material (step 2.4): they run where the private repository is (the owner's
 * computer) and are skipped elsewhere (the public CI, anybody else's clone), saying why. With
 * `QV_REQUIRE_PRIVATE=1` (the pre-push hook of the owner's clone, where `git config qv.requirePrivate` is true) a
 * missing private repository is an error, not a skip, so that none of them goes unrun.
 */
export interface PrivateMaterial {
  /** The private repository, or null when it is not here. */
  folder: string | null;
  /** `content/` of the private repository (null without it). */
  content: string | null;
  /** The folder with the material (notes, decks, tests): the parent of both repositories. */
  root: string;
  /** `tests/real-material.json` of the private repository: paths and expected numbers (null without it). */
  config: RealMaterialConfig | null;
  /** Why the checks are skipped (empty when they run). */
  skipReason: string;
}

/** `tests/real-material.json` of the private repository. Paths are relative to the material folder (`root`). */
export interface RealMaterialConfig {
  /** A practice test made with the quiz skill, compared with its published page and the skill's model. */
  quiz?: {
    /** The skill's folder (`~` = the home folder). */
    skill: string;
    folder: string;
    html: string;
    /** The manifest of content/tests/ that publishes it, and what it must publish. */
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
  /** Real decks before and after a sweep of changes, compared by the release review. */
  releaseDecks?: {
    assessmentId: string;
    decks: { before: string; now: string }[];
    /** The script that lists the notes that changed between two .apkg (python3). */
    compare: string;
    /** How many notes changed text (what the script says). */
    changed: number;
    /** The hand labels, relative to the private repository. */
    labels: string;
  };
}

const CONFIG = 'tests/real-material.json';

export function privateMaterial(env: Env = process.env, repository = REPOSITORY): PrivateMaterial {
  const folder = privateFolder(env, repository);
  const root = resolve(env.QV_MATERIAL_DIR ?? dirname(folder));
  const here = existsSync(join(folder, 'content', 'catalog.json'));
  if (!here) {
    const reason = `sin el repositorio privado (${folder}); en la CI pública no está`;
    if (env.QV_REQUIRE_PRIVATE === '1') {
      throw new Error(
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
    throw new Error(`QV_REQUIRE_PRIVATE=1 y falta ${file}.`);
  }
  return {
    folder,
    content: join(folder, 'content'),
    root,
    config,
    skipReason: config ? '' : `falta ${CONFIG} en el repositorio privado`,
  };
}

/**
 * Whether a check against real material runs: its files are here. With `QV_REQUIRE_PRIVATE=1` a missing file is an
 * error (the owner's pre-push hook must run every check), elsewhere the check is skipped.
 */
export function realMaterialHere(paths: string[], env: Env = process.env): boolean {
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length && env.QV_REQUIRE_PRIVATE === '1') {
    throw new Error(`QV_REQUIRE_PRIVATE=1 y falta material real: ${missing.join(', ')}`);
  }
  return missing.length === 0;
}

/** A path of the config: `~` is the home folder, a relative path is relative to `base`. */
export function materialPath(base: string, path: string): string {
  if (path.startsWith('~/')) return join(process.env.HOME ?? '', path.slice(2));
  return isAbsolute(path) ? path : join(base, path);
}
