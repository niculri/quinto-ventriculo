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

/**
 * Demo mode, ONLY for local development (mounted by the Vite server with `npm run dev:demo`): content from
 * the importer in dry-run mode and a fake session. The production Worker does not import this file.
 */
export const DEMO_TOKEN = 'demo-local';
export const DEMO_USER = {
  id: '00000000-0000-4000-8000-0000000000de',
  email: 'demo@ug.uchile.cl',
};

export interface DemoOptions {
  /**
   * Local mode (`npm run dev:local`): REAL Supabase session (Google login) and content from the folder.
   * Useful to test the login before creating the content database and R2.
   */
  supabaseUrl?: string;
}

export async function createDemoApp(outputFolder: string, options: DemoOptions = {}) {
  const readBundle = async (path: string) =>
    ContentBundle.parse(JSON.parse(await readFile(path, 'utf8')));
  const bundle = await readBundle(join(outputFolder, 'content.json'));
  // The draft (step 1.7): `<folder>/draft/content.json` if there is one; if not, the same as what is published.
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
  // «Uso» (step 2.9): made-up figures, and the opens of the demo (made-up, plus the ones counted while it is used).
  const usageEvents = demoUsageEvents(bundle);
  const repository = memoryRepository(bundle);
  return createApp({
    verifier,
    repository,
    media,
    signer: new MediaSigner('secreto-solo-para-desarrollo-local-0123456789'),
    preview: memoryRepository(draft),
    releases: await folderReleaseRepository(outputFolder),
    // In memory: the switch of the panel lasts until the server stops.
    settings: memorySiteSettings(),
    unpublished: await folderUnpublishedRepository(outputFolder),
    // The demo's user is an administrator (as in the web's demo); with a real session, nobody is.
    admins: { isAdmin: async (token) => !options.supabaseUrl && token === DEMO_TOKEN },
    usageStats: demoUsageStats(),
    usageOpens: usageEvents,
    usageEvents,
    // Step 2.5: the demo has no databases, bucket or copies: only that the content and the images' folder answer.
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
