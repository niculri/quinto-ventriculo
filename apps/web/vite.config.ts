import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { thirdPartyLicenses } from './build/licenses';

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Demo mode (`npm run dev:demo`): mounts the API on the same Vite server with the content of `.output/`
 * (importer in dry-run mode) and a fake session. It only exists in development: it never reaches the build.
 * Local mode (`npm run dev:local`): the same, but with the real Supabase session (`supabaseUrl`).
 */
function demoApi(supabaseUrl?: string): Plugin {
  return {
    name: 'qv-demo-api',
    apply: 'serve',
    async configureServer(server) {
      // The demo token is public: with `--host` anyone on the same network (the university's, for example)
      // would see the material of .output without an account.
      const host = server.config.server.host;
      if (host !== undefined && !['localhost', '127.0.0.1', '::1'].includes(String(host))) {
        throw new Error('El modo demo solo escucha en localhost (sin --host).');
      }
      // No `typeof import(...)`: that way the web's type check does not walk the Worker's code.
      const { createDemoApp } = (await server.ssrLoadModule('@qv/api/demo')) as {
        createDemoApp(
          folder: string,
          options?: { supabaseUrl?: string },
        ): Promise<{ fetch(r: Request): Response | Promise<Response> }>;
      };
      // QV_OUTPUT: another content folder (the e2e tests use a test one).
      const app = await createDemoApp(
        resolve(process.env.QV_OUTPUT ?? resolve(ROOT, '.output')),
        supabaseUrl ? { supabaseUrl } : {},
      );
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers))
          if (typeof v === 'string') headers.set(k, v);
        // The body too (the release panel's marks are a PUT).
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const r = await app.fetch(
          new Request(`http://localhost${req.url}`, {
            method: req.method ?? 'GET',
            headers,
            ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
          }),
        );
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    },
  };
}

/** Cloudflare `_headers` with the web's security policy (CSP and friends). */
function securityHeaders(supabaseUrl: string): Plugin {
  const csp = [
    "default-src 'self'",
    // Cloudflare Web Analytics: Cloudflare injects its beacon into the HTML (automatic setup); it reports to
    // /cdn-cgi/rum on our own domain, and to cloudflareinsights.com when installed by hand.
    "script-src 'self' https://static.cloudflareinsights.com",
    // The widths of the note figures go in style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} https://cloudflareinsights.com`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'qv-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          '/*',
          `  Content-Security-Policy: ${csp}`,
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
          '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
          '/assets/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const demo = mode === 'demo';
  const local = mode === 'login';
  // The demo mode's fake session must never end up in a build that gets deployed.
  if (command === 'build' && (demo || local)) {
    throw new Error(
      'Los modos demo y local son solo para `vite` en desarrollo: no se pueden compilar.',
    );
  }
  if (local && !env.VITE_USERS_SUPABASE_URL) {
    throw new Error('El modo local necesita apps/web/.env.local (copia de .env.example).');
  }
  if (mode === 'production' && !env.VITE_USERS_SUPABASE_URL) {
    throw new Error('Falta VITE_USERS_SUPABASE_URL (ver apps/web/.env.example)');
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(demo ? [demoApi()] : []),
      ...(local ? [demoApi(env.VITE_USERS_SUPABASE_URL)] : []),
      securityHeaders(env.VITE_USERS_SUPABASE_URL ?? ''),
      thirdPartyLicenses(),
    ],
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '') },
    server: {
      port: 5173,
      // Development with the real API: `npx wrangler dev` in apps/api (port 8787).
      proxy: demo || local ? undefined : { '/api': 'http://localhost:8787' },
    },
    build: { sourcemap: false },
  };
});
