import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The licenses of the third-party packages that go in the web and in the Worker (step 2.4), generated at build time
 * from node_modules, never by hand. /licenses shows them (`/third-party-licenses.json` and, with every license
 * text, `/third-party-licenses.txt`).
 *
 * - The web: the packages of the modules the bundle really contains (Rollup's module graph).
 * - The Worker: Wrangler bundles it apart, so it is the production dependencies of apps/api, walked through
 *   node_modules (the workspace's own packages, @qv/*, are this repository's code and are walked through).
 * In development (`vite` serve) there is no bundle: the web's list is the walk of apps/web's dependencies.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const OWN_SCOPE = '@qv/';

export interface ThirdPartyPackage {
  name: string;
  version: string;
  /** SPDX expression of its package.json («MIT», «(MIT OR Apache-2.0)»), or «UNKNOWN». */
  license: string;
  repository: string | null;
  /** Where it runs: the web (the browser), the Worker (the server) or both. */
  usedBy: ('web' | 'server')[];
  /** The text of its LICENSE / LICENCE / COPYING / NOTICE files, if it brings them. */
  text: string;
}

interface PackageJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

const readJson = (file: string): PackageJson =>
  JSON.parse(readFileSync(file, 'utf8')) as PackageJson;

/** The folder of package `name` as Node would find it from `from` (walking up the node_modules folders). */
function findPackage(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return dirname(candidate);
    if (dirname(dir) === dir) return null;
  }
}

/** The package folder that contains a module (its last «node_modules/<name>» or «node_modules/@scope/<name>»). */
export function packageFolderOf(moduleId: string): string | null {
  const path = moduleId.replace(/^\0/, '').split('?')[0]!;
  const marker = `${sep}node_modules${sep}`;
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = path.slice(at + marker.length).split(sep);
  const parts = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1);
  if (!parts.length || parts.some((p) => !p)) return null;
  const folder = join(path.slice(0, at + marker.length), ...parts);
  return existsSync(join(folder, 'package.json')) ? folder : null;
}

/**
 * Every package folder reached from `starts` through `dependencies` (and the optional and non-optional peer
 * dependencies that are installed). Workspace packages (@qv/*) are walked but not listed.
 */
export function dependencyFolders(starts: string[]): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const folder = queue.pop()!;
    if (seen.has(folder)) continue;
    seen.add(folder);
    const pkg = readJson(join(folder, 'package.json'));
    if (!pkg.name?.startsWith(OWN_SCOPE) && !starts.includes(folder)) out.add(folder);
    const names = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}).filter(
        (n) => !pkg.peerDependenciesMeta?.[n]?.optional,
      ),
    ]);
    for (const name of names) {
      const found = findPackage(name, folder);
      if (found) queue.push(found);
    }
  }
  return out;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;

function licenseOf(pkg: PackageJson): string {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  const old = (pkg.licenses ?? []).map((l) => l.type).filter(Boolean);
  return old.length ? `(${old.join(' OR ')})` : 'UNKNOWN';
}

function repositoryOf(pkg: PackageJson): string | null {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!raw) return null;
  const url = raw
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/');
  return /^github:/.test(url)
    ? url.replace(/^github:/, 'https://github.com/')
    : /^[\w.-]+\/[\w.-]+$/.test(url)
      ? `https://github.com/${url}`
      : url;
}

/** The list for /licenses: one entry per name and version, sorted by name. */
export function describePackages(web: Set<string>, server: Set<string>): ThirdPartyPackage[] {
  const byKey = new Map<string, ThirdPartyPackage>();
  const add = (folder: string, where: 'web' | 'server') => {
    const pkg = readJson(join(folder, 'package.json'));
    if (!pkg.name || pkg.name.startsWith(OWN_SCOPE)) return;
    const key = `${pkg.name}@${pkg.version ?? ''}`;
    const known = byKey.get(key);
    if (known) {
      if (!known.usedBy.includes(where)) known.usedBy.push(where);
      return;
    }
    const files = readdirSync(folder)
      .filter((f) => LICENSE_FILE.test(f))
      .sort();
    byKey.set(key, {
      name: pkg.name,
      version: pkg.version ?? '',
      license: licenseOf(pkg),
      repository: repositoryOf(pkg),
      usedBy: [where],
      text: files.map((f) => readFileSync(join(folder, f), 'utf8').trim()).join('\n\n'),
    });
  };
  for (const f of web) add(f, 'web');
  for (const f of server) add(f, 'server');
  return [...byKey.values()]
    .map((p) => ({ ...p, usedBy: p.usedBy.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/**
 * The repository's NOTICE.md: the code adapted from other projects (Anki, fsrs-rs) with the notices their licenses
 * ask to carry, also in the site's files (Revisión de cero, 2.4: fsrs-rs is BSD-3-Clause).
 */
export function readNotices(): string {
  const file = join(ROOT, 'NOTICE.md');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

/** The plain text with every license, for `/third-party-licenses.txt`; `notices` (NOTICE.md) goes at the end. */
export function licensesText(packages: ThirdPartyPackage[], notices = ''): string {
  const head = [
    'El Quinto Ventrículo: licencias de los paquetes de terceros que usan la web y el servidor.',
    'El código del sitio: AGPL-3.0-or-later (ver /licenses).',
    '',
  ];
  const tail = notices
    ? ['='.repeat(78), 'Código adaptado de otros proyectos (NOTICE.md del código)', '', notices, '']
    : [];
  return (
    head
      .concat(
        packages.flatMap((p) => [
          '='.repeat(78),
          `${p.name} ${p.version} · ${p.license}${p.repository ? ` · ${p.repository}` : ''}`,
          `Usado en: ${p.usedBy.map((u) => (u === 'web' ? 'la web' : 'el servidor')).join(' y ')}`,
          '',
          p.text || '(El paquete no trae el texto de su licencia: ver su repositorio.)',
          '',
        ]),
        tail,
      )
      .join('\n') + '\n'
  );
}

/**
 * What goes in the web without being one of the bundle's JavaScript modules: the direct production dependencies of
 * apps/web (the fonts are imported from the CSS: their files are assets) and Tailwind, whose base styles are in the
 * CSS although it is a development dependency.
 */
export function webDirectExtras(): string[] {
  const web = join(ROOT, 'apps/web');
  const names = [
    ...Object.keys(readJson(join(web, 'package.json')).dependencies ?? {}),
    'tailwindcss',
  ];
  return names
    .filter((n) => !n.startsWith(OWN_SCOPE))
    .map((n) => findPackage(n, web))
    .filter((f): f is string => f !== null);
}

/** The Worker's packages: the production dependencies of apps/api. */
export const serverPackages = () => dependencyFolders([join(ROOT, 'apps/api')]);

/** The web's packages without a bundle (development): the production dependencies of apps/web. */
export const webPackagesByDependencies = () =>
  new Set([...dependencyFolders([join(ROOT, 'apps/web')]), ...webDirectExtras()]);

const summary = (packages: ThirdPartyPackage[]) =>
  JSON.stringify(packages.map(({ text: _text, ...p }) => p));

/** The Vite plugin: emits both files in the build and serves them in development. */
export function thirdPartyLicenses(): Plugin {
  return {
    name: 'qv-third-party-licenses',
    generateBundle() {
      const web = new Set<string>();
      for (const id of this.getModuleIds()) {
        const folder = packageFolderOf(id);
        if (folder) web.add(folder);
      }
      for (const folder of webDirectExtras()) web.add(folder);
      const packages = describePackages(web, serverPackages());
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.json',
        source: summary(packages),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        source: licensesText(packages, readNotices()),
      });
    },
    configureServer(server) {
      let cached: ThirdPartyPackage[] | null = null;
      const packages = () =>
        (cached ??= describePackages(webPackagesByDependencies(), serverPackages()));
      server.middlewares.use((req, res, next) => {
        if (req.url === '/third-party-licenses.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(summary(packages()));
        } else if (req.url === '/third-party-licenses.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(licensesText(packages(), readNotices()));
        } else next();
      });
    },
  };
}
