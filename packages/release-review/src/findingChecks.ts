// The checks that come from the database's findings: one handler per rule, each adding the items it finds.
import type { ReleaseFinding, ReleaseSummary } from '@qv/schema/release';
import { changedGuids, renumbered } from './cardChanges';
import type { Candidate } from './cardChanges';
import type { AddCheck } from './reviewTypes';
import { assessmentName, detail } from './summaryText';

interface Context {
  s: ReleaseSummary;
  add: AddCheck;
  /** The pairs of removed and added notes already told, whichever finding found them. */
  guidPairs: Set<string>;
}

type Handler = (f: ReleaseFinding, c: Context) => void;

const keyOutOfRange: Handler = (f, { add }) => {
  add('key_out_of_range', {
    key: f.key,
    assessmentId: f.assessmentId,
    text: `${f.key}: la correcta es la ${Number(detail(f, 'correct')) + 1} de ${detail(f, 'options') ?? '?'} alternativas.`,
  });
};

const PRACTICE: Record<string, string> = {
  quiz: 'su test no está',
  section: 'la pestaña del test no está',
  group: 'un tema del test no está',
  deck: 'su mazo no está',
};

const practiceBroken: Handler = (f, { add }) => {
  const what = detail(f, 'what') ?? '';
  const value = detail(f, 'value');
  add('practice_broken', {
    key: `${f.key}:${what}:${value ?? ''}`,
    assessmentId: f.assessmentId,
    text: `${detail(f, 'title') ?? f.key}: ${PRACTICE[what] ?? what}${value ? ` («${value}»)` : ''}.`,
  });
};

const classWithoutYear: Handler = (f, { add }) => {
  add('class_without_year', {
    key: f.key,
    assessmentId: f.assessmentId,
    text: `${detail(f, 'title') ?? f.key} (${f.key}) no dice de qué año es la clase.`,
  });
};

const KIND: Record<string, string> = {
  note: 'artículo',
  quiz: 'test',
  deck: 'mazo',
  image: 'imagen',
};

const unpublishedInDraft: Handler = (f, { add }) => {
  add('unpublished_in_draft', {
    key: `${String(detail(f, 'kind'))}:${f.key}`,
    assessmentId: f.assessmentId,
    text: `El ${KIND[detail(f, 'kind') ?? ''] ?? 'material'} «${detail(f, 'title') ?? f.key}» está en content/unpublished.json y sigue en el borrador.`,
  });
};

const imaios: Handler = (f, { add }) => {
  add('imaios', {
    key: f.key,
    assessmentId: f.assessmentId,
    text: `${detail(f, 'code') ?? detail(f, 'title') ?? f.key} nombra IMAIOS.`,
  });
};

const questionIdShifted: Handler = (f, { add }) => {
  const other = detail(f, 'other') ?? '';
  add('question_id_shifted', {
    key: f.key,
    assessmentId: f.assessmentId,
    text:
      detail(f, 'kind') === 'renamed'
        ? `${f.key} es la pregunta ${other} con otro id: su historial se perdería.`
        : `${f.key} tiene ahora el texto de ${other}: el historial de una quedaría en la otra.`,
  });
};

// Same-code pairs first (the database finds them in any assessment, without the limit of 300 candidates), then
// the ones with almost the same text among the candidates.
const guidSameCode: Handler = (f, { add, guidPairs }) => {
  if (guidPairs.has(f.key)) return;
  guidPairs.add(f.key);
  add('guid_changed', {
    key: f.key,
    assessmentId: f.assessmentId,
    text: `${detail(f, 'codeBefore') ?? detail(f, 'removed') ?? '?'} sale y entra ${
      detail(f, 'code') ?? detail(f, 'added') ?? '?'
    }, con el mismo código: el avance de los alumnos quedaría en la vieja.`,
  });
};

const countsText = (removed: number, added: number): string =>
  `${removed === 1 ? 'sale 1 nota' : `salen ${removed} notas`} y ${added === 1 ? 'entra 1' : `entran ${added}`}`;

const guidCandidates: Handler = (f, { s, add, guidPairs }) => {
  const removed = (f.detail.removed as Candidate[] | undefined) ?? [];
  const added = (f.detail.added as Candidate[] | undefined) ?? [];
  const pairs = changedGuids(removed, added);
  for (const p of pairs) {
    const key = `${p.removed.guid}>${p.added.guid}`;
    if (guidPairs.has(key)) continue;
    guidPairs.add(key);
    add('guid_changed', {
      key,
      assessmentId: f.assessmentId,
      text: `${p.removed.code ?? p.removed.guid} sale y entra ${p.added.code ?? p.added.guid}, ${
        p.why === 'code' ? 'con el mismo código' : 'casi igual'
      }: el avance de los alumnos quedaría en la vieja.`,
    });
  }
  const removedTotal = Number(f.detail.removedTotal ?? removed.length);
  const addedTotal = Number(f.detail.addedTotal ?? added.length);
  if (removedTotal > removed.length || addedTotal > added.length) {
    add('guid_maybe', {
      key: `${f.key}:limit`,
      assessmentId: f.assessmentId,
      text: `${assessmentName(s, f.assessmentId)}: salen ${removedTotal} notas y entran ${addedTotal}; el texto se comparó solo en las primeras ${removed.length} y ${added.length}.`,
    });
  }
  if (!pairs.length && removed.length && added.length) {
    add('guid_maybe', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${assessmentName(s, f.assessmentId)}: ${countsText(removed.length, added.length)}, sin ninguna casi igual a otra.`,
    });
  }
};

const clozeSignatures: Handler = (f, { add }) => {
  const before = (f.detail.before as Record<string, string> | undefined) ?? {};
  const after = (f.detail.after as Record<string, string> | undefined) ?? {};
  const occlusion = f.detail.occlusion === true;
  const r = renumbered(before, after, occlusion);
  const code = detail(f, 'code') ?? f.key;
  const n = (ords: number[]) => ords.map((o) => `c${o + 1}`).join(', ');
  if (r.renumbered.length) {
    add('ord_meaning', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${code}: ${occlusion ? 'las máscaras' : 'los huecos'} ${n(r.renumbered)} preguntan ahora lo que preguntaba otro número.`,
    });
  }
  if (r.moved.length) {
    add('mask_moved', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${code}: ${n(r.moved)} tapan ahora otro lugar de la imagen.`,
    });
  }
};

const HANDLERS: readonly (readonly [string, Handler])[] = [
  ['key_out_of_range', keyOutOfRange],
  ['practice_broken', practiceBroken],
  ['class_without_year', classWithoutYear],
  ['unpublished_in_draft', unpublishedInDraft],
  ['imaios', imaios],
  ['question_id_shifted', questionIdShifted],
  ['guid_same_code', guidSameCode],
  ['guid_candidates', guidCandidates],
  ['cloze_signatures', clozeSignatures],
];

export function findingChecks(s: ReleaseSummary, add: AddCheck): void {
  const context: Context = { s, add, guidPairs: new Set() };
  for (const [rule, handler] of HANDLERS) {
    for (const f of s.findings) if (f.rule === rule) handler(f, context);
  }
}
