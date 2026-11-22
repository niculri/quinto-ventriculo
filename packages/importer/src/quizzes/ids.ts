// The ids of a test and of its questions: the skill's own, else the note's source tag, else the place in the group.

export function defaultQuizId(assessmentId: string, slug: string): string {
  return `${assessmentId.replace(/\//g, '-')}-${slug}`;
}

/**
 * The skill's `id`, else the source tag that starts the note («[D-p02-04 + …]»), else «<group>-<n>» as the skill's
 * page keys its rounds; from the second tab on, prefixed by the section so the first tab keeps its ids.
 */
export function questionId(
  q: { id?: unknown; nota?: unknown },
  groupId: string,
  n: number,
  section?: string,
): string {
  return stableQuestionId(q) ?? `${section ? `${section}.` : ''}${groupId}-${n}`;
}

export function stableQuestionId(q: { id?: unknown; nota?: unknown }): string | null {
  if (typeof q.id === 'string') return q.id;
  const tag =
    typeof q.nota === 'string'
      ? /^\[([A-Za-z0-9][A-Za-z0-9._-]{0,63})(?=[\s+,\]])/.exec(q.nota)
      : null;
  return tag ? tag[1]! : null;
}
