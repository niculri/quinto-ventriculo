// Checks the security headers of the build: Google's sign-in addresses only with a Google client ID and only Google's
// /gsi/ paths, and the opener policy that lets Google's popup answer the page.
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, headersFile, securityHeaders } from '../securityHeaders';

const directives = (csp: string): Record<string, string[] | undefined> =>
  Object.fromEntries(
    csp.split('; ').map((d): [string, string[]] => {
      const [name = '', ...sources] = d.split(' ');
      return [name, sources];
    }),
  );

describe('contentSecurityPolicy', () => {
  it('without Google, it does not name Google nor allows frames', () => {
    const csp = contentSecurityPolicy('https://users.example.test', false);
    expect(csp).not.toContain('accounts.google.com');
    expect(directives(csp)['frame-src']).toBeUndefined();
    expect(directives(csp)['connect-src']).toEqual([
      "'self'",
      'https://users.example.test',
      'https://cloudflareinsights.com',
    ]);
  });

  it('with Google, only its script, stylesheet, frame and calls under /gsi/', () => {
    const d = directives(contentSecurityPolicy('https://users.example.test', true));
    expect(d['script-src']).toEqual([
      "'self'",
      'https://static.cloudflareinsights.com',
      'https://accounts.google.com/gsi/client',
    ]);
    expect(d['style-src']).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://accounts.google.com/gsi/style',
    ]);
    expect(d['frame-src']).toEqual(['https://accounts.google.com/gsi/']);
    expect(d['connect-src']).toContain('https://accounts.google.com/gsi/');
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['form-action']).toEqual(["'self'"]);
  });
});

describe('the _headers file', () => {
  it('carries the policy, the opener policy for the popup and the cache of the assets', () => {
    const file = headersFile('https://users.example.test', true);
    expect(file).toContain(
      `  Content-Security-Policy: ${contentSecurityPolicy('https://users.example.test', true)}\n`,
    );
    expect(file).toContain('  Cross-Origin-Opener-Policy: same-origin-allow-popups\n');
    expect(file).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  });

  it('is emitted only by the build', () => {
    const emitted: { fileName: string; source: string }[] = [];
    const plugin = securityHeaders('https://users.example.test', false);
    expect(plugin.apply).toBe('build');
    const generate = plugin.generateBundle as (this: unknown) => void;
    generate.call({ emitFile: (f: { fileName: string; source: string }) => emitted.push(f) });
    expect(emitted).toEqual([
      expect.objectContaining({
        fileName: '_headers',
        source: headersFile('https://users.example.test', false),
      }),
    ]);
  });
});
