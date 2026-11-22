// Vite configuration of the web: its plugins, the demo and local modes (the API inside Vite) and the security headers.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { creatorPhoto } from './build/creatorPhoto';
import { compilerPreset } from './build/reactCompiler';
import { preloadFont } from './build/preloadFont';
import { thirdPartyLicenses } from './build/licenses';

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Mounts the API on the Vite server with the content of `.output/` and a fake session (demo mode), or the real
 * Supabase session with `supabaseUrl` (local mode). Development only: it never reaches the build.
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
        createDemoApp: (
          folder: string,
          options?: { supabaseUrl?: string },
        ) => Promise<{ fetch: (r: Request) => Response | Promise<Response> }>;
      };
      // QV_OUTPUT: another content folder (the e2e tests use a test one).
      const app = await createDemoApp(
        resolve(process.env.QV_OUTPUT ?? resolve(ROOT, '.output')),
        supabaseUrl ? { supabaseUrl } : {},
      );
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }
        forwardToApi(app, req, res).catch(next);
      });
    },
  };
}

async function forwardToApi(
  app: { fetch(r: Request): Response | Promise<Response> },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  // With the browser's own host and port: the API compares them with the `Origin` of the requests that carry one.
  const r = await app.fetch(
    new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? ''}`, {
      method: req.method ?? 'GET',
      headers,
      ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
    }),
  );
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
}

function securityHeaders(supabaseUrl: string): Plugin {
  const csp = [
    "default-src 'self'",
    // Cloudflare Web Analytics injects its beacon into the HTML; it reports to /cdn-cgi/rum on the site's own domain,
    // and to cloudflareinsights.com when installed by hand.
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
      babel({ presets: [compilerPreset] }),
      tailwindcss(),
      ...(demo ? [demoApi()] : []),
      ...(local ? [demoApi(env.VITE_USERS_SUPABASE_URL)] : []),
      securityHeaders(env.VITE_USERS_SUPABASE_URL ?? ''),
      thirdPartyLicenses(),
      creatorPhoto(),
      preloadFont(),
    ],
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '') },
    server: {
      port: 5173,
      // Development with the real API: `npx wrangler dev` in apps/api (port 8787).
      ...(demo || local ? {} : { proxy: { '/api': 'http://localhost:8787' } }),
    },
    build: {
      sourcemap: false,
      // A dot before the hash, not Vite's dash: the file names of the deploy of 19-11-2026 got the app's HTML cached as
      // `immutable` in some browsers (see apps/api/src/worker.ts), and new names are the only way those ever load again.
      rolldownOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },
  };
});
