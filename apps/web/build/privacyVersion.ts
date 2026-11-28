// Vite plugin that names the privacy policy's version in force in index.html, for public/error-report.js: a static
// file that cannot import it, and that sends the account only if what this browser accepted is that version.
import type { LEGAL_VERSIONS } from '@qv/schema/constants';
import { runnerImport } from 'vite';
import type { Plugin } from 'vite';

type Constants = { LEGAL_VERSIONS: typeof LEGAL_VERSIONS };

/** Through Vite's module runner: Node alone cannot load the schema package's TypeScript from this config. */
async function versionInForce(root: string) {
  const { module } = await runnerImport<Constants>('@qv/schema/constants', {
    configFile: false,
    logLevel: 'silent',
    root,
  });
  return module.LEGAL_VERSIONS.privacy.version;
}

export function privacyVersion(): Plugin {
  let version = '';
  return {
    name: 'qv-privacy-version',
    async configResolved(config) {
      version = await versionInForce(config.root);
    },
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { name: 'qv-privacy-version', content: version },
        injectTo: 'head-prepend',
      },
    ],
  };
}
