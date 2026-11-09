import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The creator's picture on /about (step 2.7). It is not this repository's to publish, so it never enters it: it lives
 * in the private repository (`content/site/creador.png`), and `vite build` takes it from there when it is next to this
 * one (or in `QV_PRIVATE_DIR`), shrinks it to what /about shows and emits it with the bundle, as
 * `assets/creator-<hash>.webp`, which only exists in `dist/` (ignored by git). The page learns its URL through
 * `import.meta.env.VITE_CREATOR_PHOTO`.
 *
 * Without the private repository (the public CI, anybody else's clone) and in development (`vite`, the demo and the
 * e2e tests) there is no picture: VITE_CREATOR_PHOTO is '' and /about shows the initials. `src/creator-photo.test.ts`
 * fails if the picture, or anything named like it, is ever tracked by git.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const PRIVATE_FOLDER_NAME = 'quinto-ventriculo-privado';
/** Where the picture is, relative to the private repository. */
export const CREATOR_PHOTO_SOURCE = 'content/site/creador.png';
/** 96 px on screen, twice that for sharp screens. */
const SIZE = 192;

/** The private repository's picture, or null when it is not here. */
export function creatorPhotoSource(env: Record<string, string | undefined> = process.env) {
  const folder = resolve(env.QV_PRIVATE_DIR ?? join(ROOT, '..', PRIVATE_FOLDER_NAME));
  const file = join(folder, CREATOR_PHOTO_SOURCE);
  return existsSync(file) ? file : null;
}

/** The picture as /about takes it: a 192 px WebP, named after its bytes (a new picture, a new name). */
export async function creatorPhotoAsset(file: string) {
  // Only the build (and the check in src/creator-photo.test.ts) needs it: sharp is never loaded in development.
  const { default: sharp } = await import('sharp');
  const source = await sharp(file)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
  return { fileName: `assets/creator-${hash}.webp`, source: new Uint8Array(source) };
}

export function creatorPhoto(): Plugin {
  let picture: { fileName: string; source: Uint8Array } | null = null;
  let building = false;
  return {
    name: 'qv-creator-photo',
    async config(_config, { command }) {
      building = command === 'build';
      const file = building ? creatorPhotoSource() : null;
      if (file) picture = await creatorPhotoAsset(file);
      return {
        define: {
          'import.meta.env.VITE_CREATOR_PHOTO': JSON.stringify(
            picture ? `/${picture.fileName}` : '',
          ),
        },
      };
    },
    configResolved(config) {
      // Said in every build, so that `npm run deploy` shows whether the picture went in (without the private
      // repository the build does not fail: /about shows the initials).
      if (building) {
        config.logger.info(
          picture
            ? `Foto del creador: ${picture.fileName} (de ${CREATOR_PHOTO_SOURCE} del repositorio privado).`
            : 'Sin la foto del creador (no está el repositorio privado): /about muestra las iniciales.',
        );
      }
    },
    generateBundle() {
      if (picture)
        this.emitFile({ type: 'asset', fileName: picture.fileName, source: picture.source });
    },
  };
}
