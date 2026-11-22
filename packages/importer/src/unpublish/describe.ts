// The summary of what taking a piece off the site would do.
import { KIND_NAMES } from './types';
import type { UnpublishResult } from './types';

const USER_KIND = { note: 'apunte', quiz: 'test', ankiNote: 'nota de Anki' } as const;

function deckLines(r: UnpublishResult): string[] {
  const n = r.removed;
  const lines = [
    `  ${n.decks ?? 0} ${n.decks === 1 ? 'mazo' : 'mazos'} (con los de abajo), ${n.ankiNotes ?? 0} notas y ${n.cards ?? 0} tarjetas` +
      (n.staleNotes ? `; ${n.staleNotes} notas siguen con sus tarjetas de otros mazos` : ''),
  ];
  const assessments = n.assessments ?? [];
  if (assessments.length && !(assessments.length === 1 && assessments[0] === r.assessmentId))
    lines.push(
      `  ${assessments.length === 1 ? 'Evaluación' : `${assessments.length} evaluaciones`}: ${assessments.join(', ')}`,
    );
  lines.push(
    '  El avance de cada alumno queda guardado y oculto; si el mazo vuelve, sigue donde iba.',
  );
  return lines;
}

function imageLines(r: UnpublishResult, storeHas: boolean | undefined): string[] {
  return [
    storeHas ? '  Se borra de R2 (queda en 404).' : '  Ya no está en R2.',
    r.usedBy.length
      ? `  La usan ${r.usedBy.length}: ${r.usedBy
          .slice(0, 10)
          .map((u) => `${USER_KIND[u.kind]} ${u.title}`)
          .join(
            ', ',
          )}${r.usedBy.length > 10 ? '…' : ''}. Se verá rota en ellas hasta reemplazarla e importar.`
      : '  Ninguna pieza publicada la usa.',
  ];
}

export function describe(r: UnpublishResult, storeHas?: boolean): string {
  const n = r.removed;
  const name = r.title ? ` «${r.title}»` : '';
  const lines = [`${KIND_NAMES[r.kind]} ${r.id}${name}`];
  if (r.kind === 'note' && r.found) lines.push(`  1 artículo con ${n.sections ?? 0} secciones`);
  if (r.kind === 'quiz' && r.found) lines.push(`  1 test con ${n.questions ?? 0} preguntas`);
  if (r.kind === 'deck' && r.found) lines.push(...deckLines(r));
  if (r.kind === 'image') lines.push(...imageLines(r, storeHas));
  if (r.assessmentId) lines.push(`  Evaluación: ${r.assessmentId}`);
  return lines.join('\n');
}
