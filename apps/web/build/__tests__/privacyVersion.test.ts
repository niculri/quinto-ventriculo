// Checks that index.html names the privacy policy's version in force, which public/error-report.js compares.
import { resolve } from 'node:path';
import { LEGAL_VERSIONS } from '@qv/schema/constants';
import type { IndexHtmlTransformHook, ResolvedConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { privacyVersion } from '../privacyVersion';

describe('privacyVersion', () => {
  it('puts a meta with the version in force first in the head', async () => {
    const plugin = privacyVersion();
    const configResolved = plugin.configResolved as (c: ResolvedConfig) => Promise<void>;
    await configResolved({ root: resolve(import.meta.dirname, '../..') } as ResolvedConfig);
    const hook = plugin.transformIndexHtml as IndexHtmlTransformHook;
    expect(hook.call({} as never, '<html></html>', {} as never)).toEqual([
      {
        tag: 'meta',
        attrs: { name: 'qv-privacy-version', content: LEGAL_VERSIONS.privacy.version },
        injectTo: 'head-prepend',
      },
    ]);
  });
});
