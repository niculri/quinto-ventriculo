// The API for local development only (`npm run dev:demo`), with the importer's dry-run content and a fake session.
// The production Worker does not import this file.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { memoryClientErrors } from '../adapters/memory/client-errors';
import { memoryRepository } from '../adapters/memory/content';
import { folderReleaseRepository } from '../adapters/memory/releases';
import { memorySiteSettings } from '../adapters/memory/settings';
import { folderUnpublishedRepository } from '../adapters/memory/unpublished';
import { demoUsageEvents, demoUsageStats } from '../adapters/memory/usage';
import { supabaseVerifier } from '../adapters/supabase/session';
import { createApp } from '../app';
import type { MediaStore } from '../ports/media';
import type { SessionVerifier } from '../ports/session';
import { deepHealth } from '../services/health';
import { MediaSigner, isValidKey } from '../services/media-signer';

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
  const clientErrors = memoryClientErrors();
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
    clientErrors,
    clientErrorsReader: clientErrors,
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
