// The ids a piece goes by: the manifest's own for a note or a test, and the assessment it belongs to.
import { ImportError } from '../ImportError';
import type { Manifest, UnpublishedKind } from '../manifest/schemas';
import { defaultQuizId } from '../quizzes/ids';

type Listed = Pick<Manifest, 'notes' | 'tests'>;

export function canonicalId(manifest: Listed, kind: UnpublishedKind, id: string): string | null {
  if (kind === 'note') {
    for (const m of manifest.notes) {
      const n = m.notes.find((x) => x.id === id || x.code === id || x.slug === id);
      if (n) return n.id;
    }
    return null;
  }
  if (kind === 'quiz') {
    const all = (manifest.tests ?? []).flatMap((m) =>
      m.tests.map((t) => ({ id: t.id ?? defaultQuizId(m.assessmentId, t.slug), slug: t.slug })),
    );
    const byId = all.find((t) => t.id === id);
    if (byId) return byId.id;
    const bySlug = all.filter((t) => t.slug === id);
    if (bySlug.length > 1) {
      throw new ImportError(
        'usage',
        `Hay ${bySlug.length} tests con el slug «${id}» (${bySlug.map((t) => t.id).join(', ')}): usa su id.`,
      );
    }
    return bySlug[0]?.id ?? null;
  }
  return null;
}

export function assessmentOf(manifest: Listed, kind: UnpublishedKind, id: string): string | null {
  if (kind === 'note')
    return manifest.notes.find((m) => m.notes.some((n) => n.id === id))?.assessmentId ?? null;
  if (kind === 'quiz') {
    return (
      (manifest.tests ?? []).find((m) =>
        m.tests.some((t) => (t.id ?? defaultQuizId(m.assessmentId, t.slug)) === id),
      )?.assessmentId ?? null
    );
  }
  return null;
}
