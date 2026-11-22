// The rule that a topic id is never used again, checked against the committed versions of a taxonomy.
import { topicNumber } from '@qv/schema';
import type { TaxonomyFile } from '@qv/schema';

type Finding = [kind: string, message: string];

interface HistoryReference {
  nextTopic: number;
  version: number;
  topics: Map<string, { title: string; unit: string; gone?: string | undefined }>;
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

function topicsOf(current: TaxonomyFile) {
  return new Map(
    current.units.flatMap((u) => u.topics.map((x) => [x.id, { topic: x, unit: u.id }] as const)),
  );
}

/** The old topics that left, changed unit or came back, and the new ones that took a number already given. */
function topicFindings(ref: HistoryReference, current: TaxonomyFile): Finding[] {
  const out: Finding[] = [];
  const now = topicsOf(current);
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
  return out;
}

/**
 * The published map repeats `version` (item_topic_map.taxonomy_version): it never goes down and goes up when the
 * topics change, not their titles.
 */
function versionFindings(
  ref: HistoryReference,
  versions: readonly TaxonomyFile[],
  current: TaxonomyFile,
): Finding[] {
  if (current.version < ref.version) {
    return [
      [
        'version',
        `«version» bajó de ${ref.version} a ${current.version}: una versión ya dada no se vuelve a usar.`,
      ],
    ];
  }
  if (
    current.version === ref.version &&
    versions.some((v) => v.version === ref.version && topicShape(v) !== topicShape(current))
  ) {
    return [
      [
        'version',
        `los temas cambiaron (uno nuevo, juntado, retirado o de otra unidad) y «version» sigue en ${current.version}: súbela a ${current.version + 1}, y «taxonomyVersion» del mapa al mismo número.`,
      ],
    ];
  }
  return [];
}

export function historyFindings(
  versions: readonly TaxonomyFile[],
  current: TaxonomyFile,
): Finding[] {
  if (!versions.length) return [];
  const ref = referenceOf(versions);
  const out: Finding[] = [];
  if (current.nextTopic < ref.nextTopic) {
    out.push([
      'nextTopic',
      `«nextTopic» bajó de ${ref.nextTopic} a ${current.nextTopic}: los números ya dados no se vuelven a usar.`,
    ]);
  }
  return [...out, ...topicFindings(ref, current), ...versionFindings(ref, versions, current)];
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
