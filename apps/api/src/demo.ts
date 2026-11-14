// The API for local development only (`npm run dev:demo`), with the importer's dry-run content and a fake session.
// The production Worker does not import this file.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { createApp } from './app';
import { deepHealth } from './health';
import { MediaSigner, isValidKey } from './media';
import type { MediaStore } from './media';
import { memoryRepository } from './repositories/memory';
import { folderReleaseRepository } from './repositories/memory-release';
import { memorySiteSettings } from './repositories/memory-settings';
import { folderUnpublishedRepository } from './repositories/memory-unpublished';
import { demoUsageEvents, demoUsageStats } from './repositories/memory-usage';
import { supabaseVerifier } from './session';
import type { SessionVerifier } from './session';

export const DEMO_TOKEN = 'demo-local';
export const DEMO_USER = {
  id: '00000000-0000-4000-8000-0000000000de',
  email: 'demo@ug.uchile.cl',
};

export interface DemoOptions {
  /** For `npm run dev:local`: a real Supabase session with the folder's content. */
  supabaseUrl?: string;
}

export async function createDemoApp(outputFolder: string, options: DemoOptions = {}) {
  const readBundle = async (path: string) =>
    ContentBundle.parse(JSON.parse(await readFile(path, 'utf8')));
  const bundle = await readBundle(join(outputFolder, 'content.json'));
  const draft = await readBundle(join(outputFolder, 'draft', 'content.json')).catch(() => bundle);
  const verifier: SessionVerifier = options.supabaseUrl
    ? supabaseVerifier({ supabaseUrl: options.supabaseUrl })
    : { verify: async (token) => (token === DEMO_TOKEN ? DEMO_USER : null) };
  const media: MediaStore = {
    async get(key) {
      if (!isValidKey(key)) return null;
      try {
        return {
          body: await readFile(join(outputFolder, 'media', key)),
          contentType: 'image/webp',
        };
      } catch {
        return null;
      }
    },
    async has(key) {
      if (!isValidKey(key)) return false;
      return access(join(outputFolder, 'media', key)).then(
        () => true,
        () => false,
      );
    },
  };
  const usageEvents = demoUsageEvents(bundle);
  const repository = memoryRepository(bundle);
  return createApp({
    verifier,
    repository,
    media,
    signer: new MediaSigner('secreto-solo-para-desarrollo-local-0123456789'),
    preview: memoryRepository(draft),
    releases: await folderReleaseRepository(outputFolder),
    settings: memorySiteSettings(),
    unpublished: await folderUnpublishedRepository(outputFolder),
    admins: { isAdmin: async (token) => !options.supabaseUrl && token === DEMO_TOKEN },
    usageStats: demoUsageStats(),
    usageOpens: usageEvents,
    usageEvents,
    deepHealth: deepHealth({
      content: async () => {
        await repository.catalog();
      },
      media: async () => {
        await access(join(outputFolder, 'media'));
      },
    }),
  });
}
