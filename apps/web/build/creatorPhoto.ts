// Vite plugin for the creator's picture on /about: `vite build` takes it from the private repository (never from this
// one), shrinks it and emits it with the bundle, and the page gets its URL in VITE_CREATOR_PHOTO.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const ROOT = resolve(import.meta.dirname, '../../..');
const PRIVATE_FOLDER_NAME = 'quinto-ventriculo-privado';
export const CREATOR_PHOTO_SOURCE = 'content/site/creador.png';
/** 96 px on screen, twice that for sharp screens. */
const SIZE = 192;

export function creatorPhotoSource(env: Record<string, string | undefined> = process.env) {
  const folder = resolve(env.QV_PRIVATE_DIR ?? join(ROOT, '..', PRIVATE_FOLDER_NAME));
  const file = join(folder, CREATOR_PHOTO_SOURCE);
  return existsSync(file) ? file : null;
}

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
