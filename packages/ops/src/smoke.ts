// The smoke test of `npm run smoke` and `npm run deploy`: a few reads, without a session, that tell if the site answers.

export const DEFAULT_SITE = 'https://www.quintoventriculo.cl';

// A deep route, which the Worker has to answer with the single-page app.
const APP_ROUTE = '/semesters/1';
const REDIRECT_PROBE = '/semesters/1?smoke=1';

interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SmokeResult {
  ok: boolean;
  checks: SmokeCheck[];
  version: string | null;
}

export interface SmokeOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function normalizeBase(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`«${url}» no es una dirección (ejemplo: ${DEFAULT_SITE}).`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`«${url}» no es una dirección http(s).`);
  }
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

export function firstAsset(html: string): string | null {
  const match = /["'](\/assets\/[^"'\s>]+\.js)["']/.exec(html);
  return match ? match[1]! : null;
}

export async function runSmoke(url: string, options: SmokeOptions = {}): Promise<SmokeResult> {
  const base = normalizeBase(url);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checks: SmokeCheck[] = [];
  let version: string | null = null;

  // Never follows a redirect: one where there should not be one is a failure.
  const get = async (target: string | URL) => {
    return doFetch(new URL(target, base), {
      redirect: 'manual',
      headers: { 'user-agent': 'qv-smoke/1 (El Quinto Ventriculo)', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const check = async (name: string, body: () => Promise<string>) => {
    try {
      checks.push({ name, ok: true, detail: await body() });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  const expectStatus = (res: Response, status: number) => {
    if (res.status !== status) {
      const where = res.headers.get('location');
      throw new Error(`respondió ${res.status}${where ? ` → ${where}` : ''}, no ${status}`);
    }
  };

  let asset: string | null = null;
  await check('La portada responde con la app', async () => {
    const res = await get('/');
    expectStatus(res, 200);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) throw new Error(`respondió ${type || 'sin tipo'}, no HTML`);
    const html = await res.text();
    if (!/id=["']?root/.test(html)) throw new Error('el HTML no trae la app (falta id="root")');
    asset = firstAsset(html);
    return `200, HTML con la app${asset ? '' : ' (sin scripts de /assets/)'}`;
  });

  await check('Un archivo de assets/ responde', async () => {
    if (!asset) throw new Error('la portada no nombra ningún /assets/…js');
    const res = await get(asset);
    expectStatus(res, 200);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('javascript')) throw new Error(`${asset}: respondió ${type || 'sin tipo'}`);
    await res.arrayBuffer();
    return `200, ${asset}`;
  });

  await check('Una ruta de la app responde con la app', async () => {
    const res = await get(APP_ROUTE);
    expectStatus(res, 200);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) throw new Error(`respondió ${type || 'sin tipo'}, no HTML`);
    await res.text();
    return `200, ${APP_ROUTE}`;
  });

  await check('La API responde (/api/health)', async () => {
    const res = await get('/api/health');
    expectStatus(res, 200);
    const body = (await res.json()) as { ok?: unknown; version?: unknown };
    if (body.ok !== true) throw new Error('respondió 200 sin { ok: true }');
    if (typeof body.version === 'string') version = body.version;
    return version ? `200, versión ${version}` : '200 (sin versión)';
  });

  await check('La API pide sesión (/api/me sin sesión da 401)', async () => {
    const res = await get('/api/me');
    if (res.status === 200) throw new Error('¡respondió 200 sin sesión!');
    expectStatus(res, 401);
    await res.text();
    return '401';
  });

  // The bare domain goes to www with the same path and query (Cloudflare's Redirect Rule).
  if (base.hostname.startsWith('www.')) {
    const bare = new URL(base);
    bare.hostname = base.hostname.slice('www.'.length);
    const from = new URL(REDIRECT_PROBE, bare);
    const to = new URL(REDIRECT_PROBE, base).href;
    await check(`${bare.hostname} redirige a ${base.hostname}`, async () => {
      const res = await get(from);
      if (res.status !== 301) throw new Error(`${from.href} respondió ${res.status}, no 301`);
      const location = res.headers.get('location');
      if (location !== to) throw new Error(`301 a ${location ?? '(sin destino)'}, no a ${to}`);
      return `301 → ${to}`;
    });
  }

  return { ok: checks.every((c) => c.ok), checks, version };
}

export function formatSmoke(url: string, result: SmokeResult): string[] {
  const lines = [`Prueba de humo de ${normalizeBase(url).origin}:`];
  for (const c of result.checks) lines.push(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  lines.push(
    result.ok
      ? 'Todo responde.'
      : `Falló ${result.checks.filter((c) => !c.ok).length} de ${result.checks.length}.`,
  );
  return lines;
}
