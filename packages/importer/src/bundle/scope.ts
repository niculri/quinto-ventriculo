// What an import covers: the assessments in scope, the kinds it brings and what content/unpublished.json leaves out.
import type { Assessment } from '@qv/schema';
import { ImportError } from '../errors';
import type { UnpublishedItem } from '../manifest/schemas';
import type { BuildOptions } from './types';

export interface BuildScope {
  assessments: Map<string, Assessment>;
  /** The assessments asked for with `--assessment`; null: all of them. */
  scope: Set<string> | null;
  inScope: (m: { assessmentId: string }) => boolean;
  off: readonly UnpublishedItem[];
  offNotes: Set<string>;
  offQuizzes: Set<string>;
  withNotes: boolean;
  withDecks: boolean;
  withTests: boolean;
}

export function buildScope(op: BuildOptions): BuildScope {
  const { catalog } = op.manifest;
  const assessments = new Map(catalog.assessments.map((a) => [a.id, a]));
  const scope = op.assessments?.length ? new Set(op.assessments) : null;
  const unknown = [...(scope ?? [])].filter((id) => !assessments.has(id));
  if (unknown.length) {
    throw new ImportError(
      'usage',
      `No existe la evaluación ${unknown.join(', ')} en content/catalog.json (usa su id, p. ej. «biologia-celular/certamen-2»).`,
    );
  }
  const off = op.manifest.unpublished ?? [];
  const offIds = (kind: string) => new Set(off.filter((i) => i.kind === kind).map((i) => i.id));
  const offNotes = offIds('note');
  const listedOnly = (op.only ?? []).filter((id) => offNotes.has(id));
  if (listedOnly.length) {
    throw new ImportError(
      'usage',
      `${listedOnly.join(', ')} está en content/unpublished.json: sácalo de la lista para volver a publicarlo.`,
    );
  }
  return {
    assessments,
    scope,
    inScope: (m) => !scope || scope.has(m.assessmentId),
    off,
    offNotes,
    offQuizzes: offIds('quiz'),
    withNotes: !op.onlyDecks && !op.onlyTests,
    withDecks: !op.only?.length && !op.onlyTests,
    withTests: !op.only?.length && !op.onlyDecks,
  };
}
