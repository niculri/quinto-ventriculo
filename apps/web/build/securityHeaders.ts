// Vite plugin that writes the `_headers` of the build: the Content-Security-Policy and the other security headers.
import type { Plugin } from 'vite';

/** Google's sign-in button: its script, the stylesheet it adds, the iframe it draws in and the calls it makes. */
const GOOGLE = {
  script: 'https://accounts.google.com/gsi/client',
  style: 'https://accounts.google.com/gsi/style',
  frame: 'https://accounts.google.com/gsi/',
  connect: 'https://accounts.google.com/gsi/',
};

/** With `googleButton` false (a build without a Google client ID), none of Google's addresses are allowed. */
export function contentSecurityPolicy(supabaseUrl: string, googleButton: boolean): string {
  const google = (part: keyof typeof GOOGLE) => (googleButton ? ` ${GOOGLE[part]}` : '');
  return [
    "default-src 'self'",
    // Cloudflare Web Analytics injects its beacon into the HTML; it reports to /cdn-cgi/rum on the site's own domain,
    // and to cloudflareinsights.com when installed by hand.
    `script-src 'self' https://static.cloudflareinsights.com${google('script')}`,
    // The widths of the note figures go in style attributes.
    `style-src 'self' 'unsafe-inline'${google('style')}`,
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} https://cloudflareinsights.com${google('connect')}`,
    ...(googleButton ? [`frame-src ${GOOGLE.frame}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function headersFile(supabaseUrl: string, googleButton: boolean): string {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(supabaseUrl, googleButton)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    // Google's popup keeps its link to the page that opened it; a page of another origin that opens this site does not
    // get one.
    '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

export function securityHeaders(supabaseUrl: string, googleButton: boolean): Plugin {
  return {
    name: 'qv-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: headersFile(supabaseUrl, googleButton),
      });
    },
  };
}
