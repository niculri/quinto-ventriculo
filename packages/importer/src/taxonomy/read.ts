// Reads each assessment's topic tree with its map and compares the tree with its committed versions.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { TaxonomyFile, TopicMapFile } from '@qv/schema';
import { ImportError } from '../ImportError';
import { assessmentFileName } from './files';
import { gitHistory } from './gitHistory';
import { historyFindings } from './historyRules';
import { Problems } from './Problems';
import type { AssessmentTaxonomy, TaxonomyHistory } from './types';

type Named = [file: string, data: { assessmentId: string }][];

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
        throw new ImportError('manifest', `${path} no es un JSON válido: ${(e as Error).message}`, {
          cause: e,
        });
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new ImportError('manifest', `${path}:\n${z.prettifyError(parsed.error)}`);
      }
      return [f, parsed.data];
    }),
  );
}

/** A file is named after its assessment, so two assessments can never share one. */
function misnamed(dir: string, list: Named): string[] {
  return list
    .filter(([file, data]) => file !== assessmentFileName(data.assessmentId))
    .map(
      ([file, data]) =>
        `${dir}/${file} es de ${data.assessmentId}: se tiene que llamar ${assessmentFileName(data.assessmentId)}.`,
    );
}

/** The problems of one tree and its map; the map's own assessment is taken out of `mapsBy`. */
function pairingProblems(
  file: string,
  taxonomy: TaxonomyFile,
  map: TopicMapFile | undefined,
  committed: readonly TaxonomyFile[],
): string[] {
  if (!map) {
    return [
      `content/taxonomy/${file} no tiene mapa: falta content/topic-map/${file} (con «taxonomyVersion»: ${taxonomy.version}).`,
    ];
  }
  const errors: string[] = [];
  if (map.taxonomyVersion !== taxonomy.version) {
    errors.push(
      `content/topic-map/${file} se hizo para la versión ${map.taxonomyVersion} del árbol, y el árbol va en la ${taxonomy.version}: revisa los ítems de los temas que cambiaron y pon «taxonomyVersion»: ${taxonomy.version}.`,
    );
  }
  // All versions together: one by one, two versions that disagree could never both be satisfied.
  const problems = new Problems();
  for (const [kind, message] of historyFindings(committed, taxonomy)) problems.add(kind, message);
  errors.push(...problems.all().map((m) => `content/taxonomy/${file}: ${m}`));
  return errors;
}

/**
 * A deleted taxonomy would let its ids be given again. A misnamed file never was one, and an assessment out of the
 * catalog can neither keep nor drop it.
 */
async function deletedTaxonomies(
  git: TaxonomyHistory,
  now: ReadonlySet<string>,
  assessments: ReadonlySet<string> | undefined,
): Promise<string[]> {
  const errors: string[] = [];
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
  return errors;
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
  const errors = [...misnamed('content/taxonomy', trees), ...misnamed('content/topic-map', maps)];
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
    const committed = committedOf.get(file)!;
    errors.push(...pairingProblems(file, taxonomy, map, committed));
    if (!map) continue;
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
  if (git) {
    errors.push(
      ...(await deletedTaxonomies(git, new Set(trees.map(([file]) => file)), assessments)),
    );
  }
  if (errors.length) {
    throw new ImportError('manifest', `Taxonomía con errores:\n- ${errors.join('\n- ')}`);
  }
  return out;
}
