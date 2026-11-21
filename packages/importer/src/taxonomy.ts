// Reads and checks the assessments' taxonomies (topic trees and their maps): no topic id is reused in the git
// history, and every published card and question has a unit and a topic.
import { execFile, spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { TaxonomyFile, TopicMapFile, resolveTopic, topicNumber } from '@qv/schema';
import type { AnkiDeckRecord, ContentBundle, TaxonomyTopic, TaxonomyUnit } from '@qv/schema';
import type { Manifest, NoteEntry } from './manifest';

export interface AssessmentTaxonomy {
  assessmentId: string;
  taxonomy: TaxonomyFile;
  map: TopicMapFile;
  history?: 'commit' | 'shallow' | 'none';
}

export interface TaxonomyReport {
  assessmentId: string;
  version: number | null;
  units: number;
  /** Active topics only (not retired nor joined). */
  topics: number;
  cards: number;
  questions: number;
  unchecked: string[];
  notices: string[];
}

export function assessmentFileName(assessmentId: string): string {
  return `${assessmentId.replace(/\//g, '-')}.json`;
}

/**
 * Every committed version of the content folder's files, not only HEAD's: otherwise an edit or a deletion that was
 * already committed would pass. Paths are relative to the content folder.
 */
export interface TaxonomyHistory {
  shallow: boolean;
  /** Newest first, a side branch before the main one; merges included, deletions skipped. */
  versions(relativePath: string): Promise<string[]>;
  committedFiles(relativeDir: string): Promise<string[]>;
}

export async function gitHistory(folder: string): Promise<TaxonomyHistory | null> {
  const run = promisify(execFile);
  // A «[» or «*» in a file name is not a pattern.
  const git = async (...args: string[]) =>
    (
      await run('git', ['--literal-pathspecs', '-C', folder, ...args], {
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout;
  let prefix: string;
  try {
    prefix = (await git('rev-parse', '--show-prefix')).trim();
  } catch {
    return null;
  }
  const shallow =
    (await git('rev-parse', '--is-shallow-repository').catch(() => 'false')).trim() === 'true';
  // Only a repository without commits means «no history»; any other git failure stops the import, or the reused-id
  // check would turn off silently.
  const born = await git('rev-parse', '--verify', '--quiet', 'HEAD').then(
    () => true,
    () => false,
  );
  // One git log per folder, not per file. -m: a merge's own text is a version; --topo-order: the first parent is the
  // older; -z: otherwise git quotes paths with accents and nothing matches.
  const walks = new Map<string, Promise<Map<string, Set<string>>>>();
  const walk = (dir: string) => {
    let done = walks.get(dir);
    if (!done) {
      done = (
        born
          ? git(
              'log',
              '-m',
              '-z',
              '--topo-order',
              '--format=%x01%H',
              '--name-only',
              '--no-renames',
              '--diff-filter=AMT',
              '--',
              dir,
            )
          : Promise.resolve('')
      ).then((out) => {
        // «\x01<commit>\0\n<path>\0<path>\0\x01<commit>\0…», paths from the repository's root.
        const files = new Map<string, Set<string>>();
        let commit = '';
        for (const token of out.split('\0')) {
          const t = token.replace(/^\n+/, '');
          if (t.startsWith('\x01')) commit = t.slice(1);
          else if (t && commit) files.set(t, (files.get(t) ?? new Set()).add(commit));
        }
        return files;
      });
      walks.set(dir, done);
    }
    return done;
  };
  return {
    shallow,
    async versions(path) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
      const commits = (await walk(dir)).get(`${prefix}${path}`);
      if (!commits?.size) return [];
      const texts = await gitBatch(
        folder,
        [...commits].map((sha) => `${sha}:${prefix}${path}`),
      );
      return texts.filter((t): t is string => t !== null);
    },
    async committedFiles(dir) {
      const own = `${prefix}${dir}/`;
      return [...(await walk(dir)).keys()]
        .filter((n) => n.startsWith(own))
        .map((n) => n.slice(own.length))
        .filter((n) => !n.includes('/') && n.endsWith('.json'))
        .sort();
    },
  };
}

/** Reads many «<commit>:<path>» with one `git cat-file --batch`; null for one that is not there. */
function gitBatch(folder: string, specs: readonly string[]): Promise<(string | null)[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', folder, 'cat-file', '--batch'], { stdio: 'pipe' });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    // Drained too, or a full pipe would block git.
    child.stderr.on('data', (c: Buffer) => errors.push(c));
    child.stdin.on('error', () => {}); // git may exit before reading everything: «close» reports why
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const why = Buffer.concat(errors).toString('utf8').trim();
        reject(new Error(`git cat-file terminó con el código ${code}${why ? `: ${why}` : '.'}`));
        return;
      }
      const out = Buffer.concat(chunks);
      const texts: (string | null)[] = [];
      let at = 0;
      for (let i = 0; i < specs.length; i++) {
        const end = out.indexOf(0x0a, at);
        if (end < 0) {
          reject(new Error('git cat-file respondió menos de lo pedido.'));
          return;
        }
        const header = /^[0-9a-f]+ (\S+) (\d+)$/.exec(out.subarray(at, end).toString('utf8'));
        at = end + 1;
        if (!header) {
          texts.push(null);
          continue;
        }
        const size = Number(header[2]);
        texts.push(header[1] === 'blob' ? out.subarray(at, at + size).toString('utf8') : null);
        at += size + 1;
      }
      resolve(texts);
    });
    child.stdin.end(specs.map((s) => `${s}\n`).join(''));
  });
}

/**
 * Reads each tree with its map and compares it with every committed version of its file. A committed taxonomy is never
 * deleted, unless its assessment left the catalog (`assessments`).
 */
export async function readTaxonomies(
  folder: string,
  history?: TaxonomyHistory | null,
  assessments?: ReadonlySet<string>,
): Promise<AssessmentTaxonomy[]> {
  const git = history === undefined ? await gitHistory(folder) : history;
  const trees = await readJsonFolder(join(folder, 'taxonomy'), TaxonomyFile);
  const maps = await readJsonFolder(join(folder, 'topic-map'), TopicMapFile);
  const errors: string[] = [];
  const named = <T extends { assessmentId: string }>(dir: string, list: [string, T][]) => {
    for (const [file, data] of list) {
      if (file !== assessmentFileName(data.assessmentId)) {
        errors.push(
          `${dir}/${file} es de ${data.assessmentId}: se tiene que llamar ${assessmentFileName(data.assessmentId)}.`,
        );
      }
    }
  };
  named('content/taxonomy', trees);
  named('content/topic-map', maps);
  const mapsBy = new Map(maps.map(([, m]) => [m.assessmentId, m]));
  const committedOf = new Map(
    await Promise.all(
      trees.map(
        async ([file]) =>
          [file, git ? validVersions(await git.versions(`taxonomy/${file}`)) : []] as const,
      ),
    ),
  );
  const out: AssessmentTaxonomy[] = [];
  for (const [file, taxonomy] of trees) {
    const map = mapsBy.get(taxonomy.assessmentId);
    mapsBy.delete(taxonomy.assessmentId);
    if (!map) {
      errors.push(
        `content/taxonomy/${file} no tiene mapa: falta content/topic-map/${file} (con «taxonomyVersion»: ${taxonomy.version}).`,
      );
      continue;
    }
    if (map.taxonomyVersion !== taxonomy.version) {
      errors.push(
        `content/topic-map/${file} se hizo para la versión ${map.taxonomyVersion} del árbol, y el árbol va en la ${taxonomy.version}: revisa los ítems de los temas que cambiaron y pon «taxonomyVersion»: ${taxonomy.version}.`,
      );
    }
    // All versions together: one by one, two versions that disagree could never both be satisfied.
    const committed = committedOf.get(file) ?? [];
    const problems = new Problems();
    for (const [kind, message] of historyFindings(committed, taxonomy)) problems.add(kind, message);
    errors.push(...problems.all().map((m) => `content/taxonomy/${file}: ${m}`));
    out.push({
      assessmentId: taxonomy.assessmentId,
      taxonomy,
      map,
      history: !committed.length ? 'none' : git?.shallow ? 'shallow' : 'commit',
    });
  }
  for (const id of mapsBy.keys()) {
    errors.push(
      `content/topic-map/${assessmentFileName(id)} no tiene árbol: falta content/taxonomy/${assessmentFileName(id)}.`,
    );
  }
  // A deleted taxonomy would let its ids be given again. A misnamed file never was one, and an assessment out of the
  // catalog can neither keep nor drop it.
  if (git) {
    const now = new Set(trees.map(([file]) => file));
    for (const file of await git.committedFiles('taxonomy')) {
      if (now.has(file)) continue;
      const last = validVersions(await git.versions(`taxonomy/${file}`))[0];
      if (
        last &&
        assessmentFileName(last.assessmentId) === file &&
        (!assessments || assessments.has(last.assessmentId))
      ) {
        errors.push(
          `content/taxonomy/${file} estaba en un commit y ya no está: una taxonomía con commit no se borra (sus temas se retiran con «retired», y se queda con su mapa).`,
        );
      }
    }
  }
  if (errors.length) throw new Error(`Taxonomía con errores:\n- ${errors.join('\n- ')}`);
  return out;
}

function validVersions(texts: readonly string[]): TaxonomyFile[] {
  return [...new Set(texts)].flatMap((text) => {
    const parsed = TaxonomyFile.safeParse(safeJson(text));
    return parsed.success ? [parsed.data] : [];
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonFolder<T>(folder: string, schema: z.ZodType<T>): Promise<[string, T][]> {
  let files: string[];
  try {
    files = (await readdir(folder)).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return Promise.all(
    files.map(async (f): Promise<[string, T]> => {
      const path = join(folder, f);
      let data: unknown;
      try {
        data = JSON.parse(await readFile(path, 'utf8'));
      } catch (e) {
        throw new Error(`${path} no es un JSON válido: ${(e as Error).message}`, { cause: e });
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new Error(`${path}:\n${z.prettifyError(parsed.error)}`);
      return [f, parsed.data];
    }),
  );
}

/** A topic id is never used again: every old topic stays in its unit, a retired one never comes back. */
export function compareWithPrevious(previous: TaxonomyFile, current: TaxonomyFile): string[] {
  return historyFindings([previous], current).map(([, message]) => message);
}

/**
 * The same rules against every version at once: the highest `nextTopic` and `version`, each topic in the unit it had
 * first, retired if any version retired it. A mistake already committed is fixed with another commit.
 */
export function compareWithHistory(
  versions: readonly TaxonomyFile[],
  current: TaxonomyFile,
): string[] {
  return historyFindings(versions, current).map(([, message]) => message);
}

interface HistoryReference {
  nextTopic: number;
  version: number;
  topics: Map<string, { title: string; unit: string; gone?: string | undefined }>;
}

function referenceOf(versions: readonly TaxonomyFile[]): HistoryReference {
  const topics: HistoryReference['topics'] = new Map();
  // Oldest first: the first unit stays, the title and the way it left are the newest.
  for (const v of [...versions].reverse()) {
    for (const u of v.units) {
      for (const x of u.topics) {
        const was = topics.get(x.id);
        const gone = x.retired
          ? 'retirado'
          : x.mergedInto
            ? `juntado con ${x.mergedInto}`
            : undefined;
        topics.set(x.id, { title: x.title, unit: was?.unit ?? u.id, gone: gone ?? was?.gone });
      }
    }
  }
  return {
    nextTopic: versions.reduce((n, v) => Math.max(n, v.nextTopic), 0),
    version: versions.reduce((n, v) => Math.max(n, v.version), 0),
    topics,
  };
}

function historyFindings(
  versions: readonly TaxonomyFile[],
  current: TaxonomyFile,
): [kind: string, message: string][] {
  if (!versions.length) return [];
  const ref = referenceOf(versions);
  const out: [string, string][] = [];
  const now = new Map(
    current.units.flatMap((u) => u.topics.map((x) => [x.id, { topic: x, unit: u.id }] as const)),
  );
  if (current.nextTopic < ref.nextTopic) {
    out.push([
      'nextTopic',
      `«nextTopic» bajó de ${ref.nextTopic} a ${current.nextTopic}: los números ya dados no se vuelven a usar.`,
    ]);
  }
  for (const [id, was] of ref.topics) {
    const is = now.get(id);
    if (!is) {
      out.push([
        'tema que salió',
        `el tema ${id} («${was.title}») ya no está: un tema nunca sale del archivo; márcalo «retired» o «mergedInto».`,
      ]);
      continue;
    }
    if (is.unit !== was.unit) {
      out.push([
        'tema de otra unidad',
        `el tema ${id} («${was.title}») pasó de la unidad ${was.unit} a la ${is.unit}: un tema no cambia de unidad; déjalo en la ${was.unit} y, si hace falta en la ${is.unit}, crea uno nuevo (t${current.nextTopic}) y junta este con él.`,
      ]);
    }
    if (was.gone && !is.topic.retired && !is.topic.mergedInto) {
      out.push([
        'tema que volvió',
        `el tema ${id} («${was.title}») estaba ${was.gone} y volvió: su id no se vuelve a usar; crea un tema nuevo (t${current.nextTopic}).`,
      ]);
    }
  }
  for (const [id, is] of now) {
    if (!ref.topics.has(id) && topicNumber(id) < ref.nextTopic) {
      out.push([
        'número ya dado',
        `el tema ${id} («${is.topic.title}») usa un número que ya se dio: un tema nuevo toma t${current.nextTopic}.`,
      ]);
    }
  }
  // The published map repeats `version` (item_topic_map.taxonomy_version): it never goes down and goes up when the
  // topics change, not their titles.
  if (current.version < ref.version) {
    out.push([
      'version',
      `«version» bajó de ${ref.version} a ${current.version}: una versión ya dada no se vuelve a usar.`,
    ]);
  } else if (current.version === ref.version) {
    const shape = topicShape(current);
    if (versions.some((v) => v.version === ref.version && topicShape(v) !== shape)) {
      out.push([
        'version',
        `los temas cambiaron (uno nuevo, juntado, retirado o de otra unidad) y «version» sigue en ${current.version}: súbela a ${current.version + 1}, y «taxonomyVersion» del mapa al mismo número.`,
      ]);
    }
  }
  return out;
}

/** What makes the tree another version: each topic's unit and state, not its title or section. */
function topicShape(t: TaxonomyFile): string {
  return t.units
    .flatMap((u) =>
      u.topics.map(
        (x) => `${x.id}\u001f${u.id}\u001f${x.retired ? 'retired' : (x.mergedInto ?? '')}`,
      ),
    )
    .sort()
    .join('\u001e');
}

/** `##` titles that never have a topic. */
const NO_TOPIC = /^(?:resumen|fuentes?|bibliografia|referencias|glosario|ponte a prueba)\b/;

function plainTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .trim();
}

class Problems {
  private readonly counts = new Map<string, number>();
  readonly list: string[] = [];
  constructor(private readonly cap = 25) {}
  add(kind: string, message: string): void {
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    if (n <= this.cap) this.list.push(message);
  }
  all(): string[] {
    const more = [...this.counts]
      .filter(([, n]) => n > this.cap)
      .map(([kind, n]) => `… y ${n - this.cap} más de «${kind}».`);
    return [...this.list, ...more];
  }
}

export interface TaxonomyCheck {
  manifest: Manifest;
  scope: Set<string> | null;
  /** The bundle before and after content/unpublished.json: what only `before` has is off the site. */
  before: ContentBundle;
  after: ContentBundle;
  notes: boolean;
  partialNotes: boolean;
  decks: boolean;
  tests: boolean;
  offNotes: ReadonlySet<string>;
  offQuizzes: ReadonlySet<string>;
}

/**
 * Stops the import if a published card or question has no unit or topic, or the map points to an inactive topic, a
 * missing section or an unpublished item. An assessment without a taxonomy skips these checks.
 */
export function checkTaxonomies(op: TaxonomyCheck): TaxonomyReport[] {
  const { manifest } = op;
  const taxonomies = new Map((manifest.taxonomies ?? []).map((t) => [t.assessmentId, t]));
  const inScope = (id: string) => !op.scope || op.scope.has(id);
  const touched = new Set<string>();
  const kinds: { assessmentId: string }[][] = [
    op.notes ? manifest.notes : [],
    op.decks ? manifest.decks : [],
    op.tests ? (manifest.tests ?? []) : [],
  ];
  for (const list of kinds)
    for (const m of list) if (inScope(m.assessmentId)) touched.add(m.assessmentId);
  for (const id of taxonomies.keys()) if (inScope(id)) touched.add(id);

  const known = new Set(manifest.catalog.assessments.map((a) => a.id));
  const reports: TaxonomyReport[] = [];
  const failures: string[] = [];
  for (const assessmentId of [...touched].sort()) {
    const t = taxonomies.get(assessmentId);
    if (!t) {
      reports.push({
        assessmentId,
        version: null,
        units: 0,
        topics: 0,
        cards: 0,
        questions: 0,
        unchecked: [],
        notices: [],
      });
      continue;
    }
    if (!known.has(assessmentId)) {
      failures.push(
        `content/taxonomy/${assessmentFileName(assessmentId)}: no existe la evaluación ${assessmentId} en content/catalog.json.`,
      );
      continue;
    }
    const r = checkOne(op, t);
    if (r.errors.length) {
      failures.push(
        `Taxonomía de ${assessmentId} (content/taxonomy/, content/topic-map/):\n  - ${r.errors.join('\n  - ')}`,
      );
    }
    reports.push(r.report);
  }
  if (failures.length) throw new Error(`No se puede publicar:\n${failures.join('\n')}`);
  return reports;
}

function checkOne(
  op: TaxonomyCheck,
  { assessmentId, taxonomy, map, history }: AssessmentTaxonomy,
): { report: TaxonomyReport; errors: string[] } {
  const problems = new Problems();
  const notices: string[] = [];
  const unchecked: string[] = [];
  if (history === 'none') unchecked.push('ids reutilizados (sin commit con qué comparar)');
  if (history === 'shallow')
    unchecked.push('ids reutilizados contra el historial completo (clon superficial)');
  const topics = new Map<string, TaxonomyTopic>();
  const unitOfTopic = new Map<string, string>();
  for (const u of taxonomy.units) {
    for (const x of u.topics) {
      topics.set(x.id, x);
      unitOfTopic.set(x.id, u.id);
    }
  }
  const active = [...topics.values()].filter((x) => !x.retired && !x.mergedInto);
  const label = (id: string) => {
    const x = topics.get(id);
    return x ? `${id} «${x.title}»` : id;
  };

  const topicProblem = (id: string): string | null => {
    const x = topics.get(id);
    if (!x) return `tema ${id}, que no existe`;
    if (x.retired) return `tema ${label(id)}, que está retirado`;
    if (x.mergedInto) {
      const to = resolveTopic(topics, id);
      return `tema ${label(id)}, que se juntó con ${to ? label(to.id) : x.mergedInto}: usa ${to?.id ?? x.mergedInto}`;
    }
    return null;
  };
  for (const n of map.notes) {
    const who = `La nota ${n.code ?? n.guid}`;
    const p = topicProblem(n.topic);
    if (p) problems.add('tema que no sirve', `${who} apunta al ${p}.`);
    for (const [ord, id] of Object.entries(n.ords ?? {})) {
      const q = topicProblem(id);
      if (q) problems.add('tema que no sirve', `${who} (tarjeta ${ord}) apunta al ${q}.`);
    }
  }
  for (const q of map.questions) {
    const p = topicProblem(q.topic);
    if (p) problems.add('tema que no sirve', `La pregunta ${q.id} apunta al ${p}.`);
    for (const s of q.secondary ?? []) {
      const sp = topicProblem(s);
      if (sp)
        problems.add('tema que no sirve', `La pregunta ${q.id} tiene como secundario el ${sp}.`);
    }
  }

  const entries = new Map<string, NoteEntry>(
    op.manifest.notes
      .filter((m) => m.assessmentId === assessmentId)
      .flatMap((m) => m.notes.map((n) => [n.id, n] as const)),
  );
  const unitNotes = (u: TaxonomyUnit) => u.notes ?? [];
  for (const u of taxonomy.units) {
    for (const id of unitNotes(u)) {
      if (!entries.has(id)) {
        problems.add(
          'artículo que no existe',
          `La unidad ${u.id} nombra el artículo ${id}, que no está en content/notes/ de ${assessmentId}.`,
        );
      }
    }
    for (const x of u.topics) {
      if (x.note && !unitNotes(u).includes(x.note)) {
        problems.add(
          'sección que no existe',
          `El tema ${label(x.id)} nombra el artículo ${x.note}, que no es de la unidad ${u.id}.`,
        );
      }
      if (x.section && !x.note && unitNotes(u).length !== 1) {
        problems.add(
          'sección que no existe',
          unitNotes(u).length
            ? `El tema ${label(x.id)} tiene sección, y la unidad ${u.id} tiene ${unitNotes(u).length} artículos: di cuál («note»).`
            : `El tema ${label(x.id)} tiene sección, y la unidad ${u.id} no tiene artículo («notes»).`,
        );
      }
    }
  }
  const noteOfTopic = (u: TaxonomyUnit, x: TaxonomyTopic) =>
    x.note ?? (unitNotes(u).length === 1 ? unitNotes(u)[0] : undefined);

  const toc = new Map(op.after.notes.map((n) => [n.id, n.toc.filter((e) => e.level === 2)]));
  if (op.notes) {
    for (const u of taxonomy.units) {
      for (const noteId of unitNotes(u)) {
        if (!entries.has(noteId)) continue;
        if (op.offNotes.has(noteId)) {
          notices.push(
            `El artículo ${noteId} de la unidad ${u.id} está fuera del sitio (content/unpublished.json): no se revisaron sus secciones, y «Ver apunte» no lo abre mientras siga así.`,
          );
          continue;
        }
        const sections = toc.get(noteId);
        if (!sections) continue;
        const anchors = new Set(sections.map((s) => s.anchor));
        for (const x of u.topics) {
          if (x.retired || x.mergedInto || !x.section || noteOfTopic(u, x) !== noteId) continue;
          if (!anchors.has(x.section)) {
            const list = sections.map((s) => s.anchor);
            problems.add(
              'sección que no existe',
              `El tema ${label(x.id)} apunta a la sección «${x.section}», que no existe en ${noteId}. Sus títulos ## son: ${list.slice(0, 15).join(', ')}${list.length > 15 ? ', …' : ''}.`,
            );
          }
        }
      }
    }
    if (op.partialNotes)
      unchecked.push('secciones de los artículos que no están en esta importación');
  } else unchecked.push('secciones');

  const counted: { unit: string; topic: string }[] = [];

  // A card's unit is that of its closest deck that belongs to one; its topic, the map's.
  let cards = 0;
  if (op.decks) {
    const decksOf = (b: ContentBundle) =>
      b.ankiDecks.filter((d) => d.assessmentId === assessmentId);
    const beforeDecks = decksOf(op.before);
    const afterIds = new Set(decksOf(op.after).map((d) => d.id));
    const byId = new Map(beforeDecks.map((d) => [d.id, d]));
    const top = beforeDecks.find((d) => !d.parentId || !byId.has(d.parentId));
    const relative = (d: AnkiDeckRecord) =>
      top && d.name.startsWith(`${top.name}::`) ? d.name.slice(top.name.length + 2) : d.name;
    // A deck of several units gives each card the unit of its topic, one of those.
    const unitDecks = new Map<string, string[]>();
    for (const u of taxonomy.units) {
      const refs = u.decks ?? [
        ...new Set(unitNotes(u).flatMap((id) => entries.get(id)?.practice?.deck ?? [])),
      ];
      for (const ref of refs) {
        const found = beforeDecks.filter(
          (d) => d !== top && (relative(d) === ref || d.name.split('::').at(-1) === ref),
        );
        if (!found.length) {
          problems.add(
            'mazo que no existe',
            `La unidad ${u.id} nombra el mazo «${ref}», que no está en ${assessmentId}.`,
          );
          continue;
        }
        if (found.length > 1) {
          problems.add(
            'mazo que no existe',
            `La unidad ${u.id} nombra el mazo «${ref}», y en ${assessmentId} hay ${found.length} así: usa el nombre desde el certamen (${found.map((d) => `«${relative(d)}»`).join(', ')}).`,
          );
          continue;
        }
        const deck = found[0]!;
        const list = unitDecks.get(deck.id) ?? [];
        if (!list.includes(u.id)) unitDecks.set(deck.id, [...list, u.id]);
        if (!afterIds.has(deck.id) && !list.length) {
          notices.push(
            `El mazo «${relative(deck)}» de la unidad ${u.id} está fuera del sitio (content/unpublished.json).`,
          );
        }
      }
    }
    const unitsOfDeck = new Map<string, string[]>();
    const deckUnits = (id: string): string[] => {
      const cached = unitsOfDeck.get(id);
      if (cached) return cached;
      const own = unitDecks.get(id);
      const parent = byId.get(id)?.parentId;
      const units = own ?? (parent && byId.has(parent) ? deckUnits(parent) : []);
      unitsOfDeck.set(id, units);
      return units;
    };

    const mapNotes = new Map(map.notes.map((n) => [n.guid, n]));
    const types = new Map(op.before.ankiNoteTypes.map((t) => [t.id, t]));
    const ours = new Set<string>();
    for (const note of op.after.ankiNotes) {
      const mine = note.cards.filter((c) => byId.has(c.deckId));
      if (!mine.length) continue;
      ours.add(note.guid);
      const who = note.code ?? note.guid;
      const entry = mapNotes.get(note.guid);
      if (!entry) {
        problems.add('sin tema', `La nota ${who} (guid ${note.guid}) no tiene tema en el mapa.`);
      } else if (entry.code && entry.code !== note.code) {
        problems.add(
          'nota que no calza',
          `El mapa dice que la nota ${note.guid} es ${entry.code}, y es ${note.code ?? 'una nota sin código'}.`,
        );
      }
      for (const card of mine) {
        cards++;
        const units = deckUnits(card.deckId);
        if (!units.length) {
          problems.add(
            'sin unidad',
            `La tarjeta ${card.ord} de la nota ${who} está en el mazo «${relative(byId.get(card.deckId)!)}», que no es de ninguna unidad.`,
          );
          continue;
        }
        if (!entry) continue;
        const id = entry.ords?.[String(card.ord)] ?? entry.topic;
        const topic = resolveTopic(topics, id);
        if (!topic || topic.id !== id) continue;
        const its = unitOfTopic.get(id)!;
        if (!units.includes(its)) {
          problems.add(
            'otra unidad',
            units.length === 1
              ? `La tarjeta ${card.ord} de la nota ${who} es de la unidad ${units[0]} (su mazo), y su tema ${label(id)} es de la unidad ${its}.`
              : `La tarjeta ${card.ord} de la nota ${who} está en un mazo de las unidades ${units.join(', ')}, y su tema ${label(id)} es de la unidad ${its}.`,
          );
          continue;
        }
        counted.push({ unit: its, topic: id });
      }
      if (entry?.ords) {
        const kind = types.get(note.noteTypeId);
        if (kind && !kind.occlusion) {
          problems.add(
            'excepción por ord',
            `La nota ${who} tiene temas por tarjeta («ords»), y eso es solo para una oclusión.`,
          );
        }
      }
    }
    const beforeNotes = new Map(op.before.ankiNotes.map((n) => [n.guid, n]));
    const afterGuids = new Set(op.after.ankiNotes.map((n) => n.guid));
    for (const n of map.notes) {
      const was = beforeNotes.get(n.guid);
      for (const ord of Object.keys(n.ords ?? {})) {
        if (was && !was.cards.some((c) => String(c.ord) === ord)) {
          problems.add(
            'excepción por ord',
            `La nota ${n.code ?? n.guid} no tiene la tarjeta ${ord} («ords»).`,
          );
        }
      }
      if (ours.has(n.guid)) continue;
      if (afterGuids.has(n.guid)) {
        problems.add(
          'no publicada',
          `La nota ${n.code ?? n.guid} del mapa no es de ${assessmentId}: sus tarjetas están en mazos de otra evaluación.`,
        );
      } else if (was?.cards.some((c) => byId.has(c.deckId))) {
        notices.push(
          `La nota ${n.code ?? n.guid} del mapa está fuera del sitio (content/unpublished.json).`,
        );
      } else {
        problems.add(
          'no publicada',
          `La nota ${n.code ?? n.guid} del mapa no está publicada (¿un guid mal copiado, o una nota que salió de su mazo?): sácala del mapa.`,
        );
      }
    }
  } else unchecked.push('mazos');

  // A question's unit comes from its group; its topic, from the map.
  let questions = 0;
  if (op.tests) {
    const quizzes = op.after.quizzes.filter((q) => q.assessmentId === assessmentId);
    const quizById = new Map(op.after.quizzes.map((q) => [q.id, q]));
    const groupUnits = new Map<string, string[]>();
    for (const u of taxonomy.units) {
      const refs = u.quizGroups ?? [
        ...new Set(
          unitNotes(u).flatMap((id) => {
            const p = entries.get(id)?.practice;
            const quiz = p?.quizId ? quizById.get(p.quizId) : undefined;
            const section =
              p?.section ?? (quiz?.sections.length === 1 ? quiz.sections[0]!.id : undefined);
            return p?.quizId && section
              ? (p.groups ?? []).map((g) => `${p.quizId}/${section}/${g}`)
              : [];
          }),
        ),
      ];
      for (const ref of refs) {
        const [quizId, sectionId, groupId] = ref.split('/') as [string, string, string];
        const quiz = quizById.get(quizId);
        if (!quiz) {
          if (op.offQuizzes.has(quizId)) {
            notices.push(
              `El test ${quizId} de la unidad ${u.id} está fuera del sitio (content/unpublished.json).`,
            );
          } else {
            problems.add(
              'grupo que no existe',
              `La unidad ${u.id} nombra el test ${quizId}, que no está publicado.`,
            );
          }
          continue;
        }
        if (quiz.assessmentId !== assessmentId) {
          problems.add(
            'grupo que no existe',
            `La unidad ${u.id} nombra el test ${quizId}, que es de ${quiz.assessmentId}.`,
          );
          continue;
        }
        const section = quiz.sections.find((s) => s.id === sectionId);
        if (!section?.groups.some((g) => g.id === groupId)) {
          problems.add(
            'grupo que no existe',
            `La unidad ${u.id} nombra el grupo ${ref}, que no existe: ${section ? `la sección «${sectionId}» tiene ${section.groups.map((g) => g.id).join(', ')}` : `el test tiene las secciones ${quiz.sections.map((s) => s.id).join(', ')}`}.`,
          );
          continue;
        }
        const list = groupUnits.get(ref) ?? [];
        if (!list.includes(u.id)) groupUnits.set(ref, [...list, u.id]);
      }
    }
    const mapQuestions = new Map(map.questions.map((q) => [q.id, q]));
    const published = new Set<string>();
    for (const quiz of quizzes) {
      for (const s of quiz.sections) {
        for (const g of s.groups) {
          const units = groupUnits.get(`${quiz.id}/${s.id}/${g.id}`) ?? [];
          for (const question of g.questions) {
            questions++;
            const ref = `${quiz.id}/${question.id}`;
            published.add(ref);
            if (!units.length) {
              problems.add(
                'sin unidad',
                `La pregunta ${ref} está en el grupo ${quiz.id}/${s.id}/${g.id}, que no es de ninguna unidad («quizGroups»).`,
              );
              continue;
            }
            const entry = mapQuestions.get(ref);
            if (!entry) {
              problems.add('sin tema', `La pregunta ${ref} no tiene tema en el mapa.`);
              continue;
            }
            const topic = resolveTopic(topics, entry.topic);
            if (!topic || topic.id !== entry.topic) continue;
            const its = unitOfTopic.get(entry.topic)!;
            if (!units.includes(its)) {
              problems.add(
                'otra unidad',
                units.length === 1
                  ? `La pregunta ${ref} es de la unidad ${units[0]} (su grupo), y su tema ${label(entry.topic)} es de la unidad ${its}.`
                  : `La pregunta ${ref} está en un grupo de las unidades ${units.join(', ')}, y su tema ${label(entry.topic)} es de la unidad ${its}.`,
              );
              continue;
            }
            counted.push({ unit: its, topic: entry.topic });
          }
        }
      }
    }
    for (const q of map.questions) {
      if (published.has(q.id)) continue;
      const quizId = q.id.slice(0, q.id.indexOf('/'));
      const quiz = quizById.get(quizId);
      if (!quiz && op.offQuizzes.has(quizId)) {
        notices.push(
          `La pregunta ${q.id} del mapa está fuera del sitio (content/unpublished.json).`,
        );
      } else if (quiz && quiz.assessmentId !== assessmentId) {
        problems.add(
          'no publicada',
          `La pregunta ${q.id} del mapa es de ${quiz.assessmentId}, no de ${assessmentId}.`,
        );
      } else {
        problems.add(
          'no publicada',
          `La pregunta ${q.id} del mapa no está publicada: sácala del mapa.`,
        );
      }
    }
  } else unchecked.push('tests');

  // Notices, only when the import brings everything: a topic with > 25 % of its unit, a section with no item.
  if (op.notes && !op.partialNotes && op.decks && op.tests && !problems.list.length) {
    const byUnit = new Map<string, Map<string, number>>();
    for (const c of counted) {
      const m = byUnit.get(c.unit) ?? new Map<string, number>();
      m.set(c.topic, (m.get(c.topic) ?? 0) + 1);
      byUnit.set(c.unit, m);
    }
    for (const u of taxonomy.units) {
      const m = byUnit.get(u.id) ?? new Map<string, number>();
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      for (const [topic, n] of m) {
        if (n / total > 0.25) {
          notices.push(
            `El tema ${label(topic)} tiene ${n} de los ${total} ítems de la unidad ${u.id} (${Math.round((100 * n) / total)} %, más del 25 %).`,
          );
        }
      }
      for (const noteId of unitNotes(u)) {
        for (const s of toc.get(noteId) ?? []) {
          if (NO_TOPIC.test(plainTitle(s.title)) || u.skipSections?.includes(s.anchor)) continue;
          const hit = u.topics.some(
            (x) => x.section === s.anchor && noteOfTopic(u, x) === noteId && (m.get(x.id) ?? 0) > 0,
          );
          if (!hit) {
            notices.push(
              `La sección «${s.title}» (${s.anchor}) de ${noteId}, unidad ${u.id}, no tiene ningún ítem.`,
            );
          }
        }
      }
    }
  }

  return {
    report: {
      assessmentId,
      version: taxonomy.version,
      units: taxonomy.units.length,
      topics: active.length,
      cards,
      questions,
      unchecked,
      notices,
    },
    errors: problems.all(),
  };
}

export function taxonomyLines(reports: readonly TaxonomyReport[]): string[] {
  if (!reports.length) return [];
  const none = reports.filter((r) => r.version === null).map((r) => r.assessmentId);
  const lines = reports
    .filter((r) => r.version !== null)
    .map(
      (r) =>
        `Taxonomía de ${r.assessmentId}: versión ${r.version}, ${r.units} unidades, ${r.topics} temas; ` +
        `${r.cards} tarjetas y ${r.questions} preguntas, todas con unidad y tema` +
        (r.unchecked.length ? ` (no se revisaron: ${r.unchecked.join(', ')})` : '') +
        '.',
    );
  if (none.length) lines.push(`Sin taxonomía: ${none.join(', ')}.`);
  return lines;
}
