import type {
  ReleaseAssessment,
  ReleaseChecks,
  ReleaseFinding,
  ReleaseMarkId,
  ReleaseSummary,
  ReleaseText,
} from './release';

/**
 * The review list before publishing (step 1.7, part 2, B5): what stops a release, what warns and what the author
 * checks by hand. The database sees most of it (`findings` of `release_summary()`); this decides what each finding
 * means, adds what needs the texts or the image store, and puts it in the panel's order. Pure: no network.
 */

export type CheckSeverity = 'block' | 'warn';

export type CheckRule =
  | 'missing_image'
  | 'guid_changed'
  | 'ord_meaning'
  | 'question_id_shifted'
  | 'key_out_of_range'
  | 'schema_version'
  | 'practice_broken'
  | 'class_without_year'
  | 'unpublished_in_draft'
  | 'imaios'
  | 'process_phrase'
  | 'deck_drop'
  | 'near_test_date'
  | 'preset_changed'
  | 'guid_maybe'
  | 'mask_moved';

/** Each rule, in the order of the panel, with its severity and its name. */
export const CHECK_RULES: readonly { rule: CheckRule; severity: CheckSeverity; title: string }[] = [
  { rule: 'missing_image', severity: 'block', title: 'Imágenes que faltan' },
  { rule: 'guid_changed', severity: 'block', title: 'Tarjetas con el GUID cambiado' },
  { rule: 'ord_meaning', severity: 'block', title: 'Huecos o máscaras renumerados' },
  { rule: 'question_id_shifted', severity: 'block', title: 'Preguntas con el id corrido' },
  { rule: 'key_out_of_range', severity: 'block', title: 'Claves fuera de rango' },
  { rule: 'schema_version', severity: 'block', title: 'Versión del paquete' },
  { rule: 'practice_broken', severity: 'block', title: 'Enlaces de «Ponte a prueba» rotos' },
  { rule: 'class_without_year', severity: 'block', title: 'Clases sin año' },
  { rule: 'unpublished_in_draft', severity: 'block', title: 'Material sacado del sitio' },
  { rule: 'imaios', severity: 'block', title: 'Imágenes de IMAIOS' },
  { rule: 'process_phrase', severity: 'warn', title: 'Frases de proceso o del calendario' },
  { rule: 'deck_drop', severity: 'warn', title: 'Mazos que pierden más del 10 % de sus tarjetas' },
  { rule: 'near_test_date', severity: 'warn', title: 'Cambios a menos de 7 días de la prueba' },
  { rule: 'preset_changed', severity: 'warn', title: 'Configuraciones de mazo cambiadas' },
  {
    rule: 'guid_maybe',
    severity: 'warn',
    title: 'Tarjetas quitadas y nuevas en la misma evaluación',
  },
  { rule: 'mask_moved', severity: 'warn', title: 'Máscaras que cambiaron de lugar' },
];

/** One thing a rule found. */
export interface CheckItem {
  key: string;
  assessmentId: string | null;
  text: string;
}

export interface Check {
  rule: CheckRule;
  severity: CheckSeverity;
  title: string;
  /** Empty: the rule passes. */
  items: CheckItem[];
  /** The check could not run yet (the images or the texts are still being read). */
  pending: boolean;
}

export interface ManualMark {
  mark: ReleaseMarkId;
  label: string;
  checked: boolean;
  checkedBy: string | null;
}

export interface ReviewList {
  checks: Check[];
  manual: ManualMark[];
  /** How many rules stop the release, and how many of the checks are still running. */
  blocking: number;
  pending: number;
  /** Nothing stops it, nothing is still running and every mark is checked. */
  ready: boolean;
  /** The draft changes nothing. */
  empty: boolean;
}

export interface ReviewInput {
  summary: ReleaseSummary;
  /** The content version the deployed Worker understands. */
  supportedSchemaVersion: number;
  /** The new images that the image store does not have; null while they are being looked for. */
  missingImages: readonly string[] | null;
  /** What the process and calendar check found in the new texts; null while they are being read. */
  phrases: readonly PhraseHit[] | null;
  /** Today, YYYY-MM-DD (Santiago). */
  today: string;
  /**
   * The marks by hand that apply. The announcement's waits for step C1: while there are no announcements, it is not
   * asked for.
   */
  marks?: readonly ReleaseMarkId[];
}

const MARK_LABELS: Record<ReleaseMarkId, string> = {
  phone: 'Vi lo nuevo en el teléfono',
  answers: 'Revisé las respuestas cambiadas',
  announcement: 'Leí el anuncio',
};

// ─────────────────────────────────────── process and calendar (CON-9) ───────────────────────────────────────

/**
 * Phrases that only make sense for whoever made the material, or only this semester: the site is read by students of
 * other years (docs/plan/areas/contenido-semestres-1-y-2.md, step 9; «Sin frases de proceso»). A warning, not a
 * stop: the author decides. Each one has its case in `review.test.ts`.
 */
export const PROCESS_RULES: readonly { id: string; label: string; pattern: RegExp }[] = [
  {
    id: 'deduced',
    label: 'cómo se dedujo algo',
    // Only of the material («se dedujo de la pauta»): «su sitio de acción se dedujo por exclusión» is content.
    pattern:
      /\bse (?:dedujo|dedujeron|infiri[óo]|infirieron) (?:de|desde|a partir de|por) (?:la|el|los|las) (?:pauta|guía|imagen|figura|foto|letra|metadatos|audio|grabación|transcripción|diapositiva)s?\b/i,
  },
  {
    id: 'copied',
    label: 'qué se copió',
    // «la cola poli-A no se copia del DNA» is content: only what was copied from a source of the material.
    pattern:
      /\b(?:no )?se copi(?:a|an|ó|aron) (?:tal cual|textual(?:mente)?|(?:de|desde) (?:la|el) (?:pauta|guía|libro|apunte|diapositiva|transcripción))\b/i,
  },
  {
    id: 'translated',
    label: 'qué se tradujo',
    // Translation of the material, not of an mRNA («la que se tradujo»).
    pattern:
      /\b(?:van|fueron|están) traducid[oa]s\b|\btraducid[oa]s? (?:aquí|del inglés|del latín)\b|\b(?:los rótulos|las leyendas|los números|la figura|las figuras) (?:se tradujo|se tradujeron)\b/i,
  },
  {
    id: 'edition',
    label: 'de qué edición es una figura',
    pattern: /\bde una edici[óo]n anterior\b/i,
  },
  {
    id: 'revision',
    label: 'una revisión o una corrección del material',
    pattern:
      /\b(?:revisi[óo]n de cero|se revis[óo] (?:el|la|este|esta)|(?:esta|la) versi[óo]n (?:anterior|nueva) del (?:apunte|art[íi]culo|test|mazo)|qu[ée] se cambi[óo])\b/i,
  },
  {
    id: 'tools',
    label: 'una herramienta con que se hizo',
    pattern: /\b(?:ChatGPT|NotebookLM|Whisper|agente (?:revisor|autor))\b/i,
  },
  {
    id: 'this-term',
    label: 'el calendario de este semestre',
    pattern: /\b(?:este|el pr[óo]ximo) (?:semestre|certamen|control)\b|\beste año\b/i,
  },
  {
    id: 'enters',
    label: 'qué entra en qué prueba',
    pattern:
      /\b(?:no )?entra(?:n)? en (?:el|este) (?:certamen|control|examen)\b|\bmateria del (?:certamen|control) \d/i,
  },
  {
    id: 'date',
    label: 'una fecha de este semestre',
    pattern:
      /\b\d{1,2}[-/]\d{1,2}[-/]20\d\d\b|\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de 20\d\d\b/i,
  },
];

export interface PhraseHit {
  key: string;
  assessmentId: string | null;
  label: string;
  rule: string;
  /** The phrase with a little around it. */
  snippet: string;
}

/** The process and calendar phrases of one text. */
export function findProcessPhrases(
  text: string,
): { rule: string; label: string; snippet: string }[] {
  const out: { rule: string; label: string; snippet: string }[] = [];
  for (const r of PROCESS_RULES) {
    const flags = r.pattern.flags.includes('g') ? r.pattern.flags : `${r.pattern.flags}g`;
    for (const m of text.matchAll(new RegExp(r.pattern.source, flags))) {
      const at = m.index ?? 0;
      const from = Math.max(0, at - 40);
      const to = Math.min(text.length, at + m[0].length + 40);
      out.push({
        rule: r.id,
        label: r.label,
        snippet: `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`,
      });
    }
  }
  return out;
}

/** The process and calendar phrases of the texts the draft adds or changes. */
export function processPhrases(texts: readonly ReleaseText[]): PhraseHit[] {
  return texts.flatMap((t) =>
    findProcessPhrases(t.text).map((h) => ({
      key: t.key,
      assessmentId: t.assessmentId,
      label: t.label,
      rule: h.rule,
      snippet: h.snippet,
    })),
  );
}

// ─────────────────────────────────────────── changed GUIDs ───────────────────────────────────────────

/** Sørensen–Dice of the letter pairs: 1 = the same text. */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const pairs = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      m.set(p, (m.get(p) ?? 0) + 1);
    }
    return m;
  };
  const px = pairs(x);
  const py = pairs(y);
  let both = 0;
  for (const [p, n] of px) both += Math.min(n, py.get(p) ?? 0);
  return (2 * both) / (x.length - 1 + (y.length - 1));
}

/** «T-A1-S3-01-047.3» and «A1-S3-01-047» are the same card: its code without the «T-» and the version. */
export const codeBase = (code: string | null | undefined) =>
  code ? code.replace(/^T-/, '').replace(/\.\d+$/, '') : null;

interface Candidate {
  guid: string;
  code: string | null;
  text: string;
}

/**
 * In an assessment with notes taken out and notes added (`importar_anki.py` stops on that: it can be a GUID that
 * changed, and the students' progress would stay on the old one), the pairs that are almost the same note: the same
 * code, or 80 % of the same text.
 */
export function changedGuids(removed: readonly Candidate[], added: readonly Candidate[]) {
  const pairs: { removed: Candidate; added: Candidate; why: 'code' | 'text' }[] = [];
  for (const r of removed) {
    const base = codeBase(r.code);
    const byCode = base ? added.find((a) => codeBase(a.code) === base) : undefined;
    if (byCode) {
      pairs.push({ removed: r, added: byCode, why: 'code' });
      continue;
    }
    if (r.text.length < 8) continue;
    const byText = added.find((a) => a.text.length >= 8 && similarity(r.text, a.text) >= 0.8);
    if (byText) pairs.push({ removed: r, added: byText, why: 'text' });
  }
  return pairs;
}

// ──────────────────────────────────── clozes and masks renumbered ────────────────────────────────────

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The boxes of a mask signature («rect:left=.48:top=.08:width=.06:height=.03;…»; an ellipse, by its box too). */
export function maskBoxes(signature: string): Box[] {
  return signature
    .split(';')
    .map((shape) => {
      const v = (k: string) => {
        const m = new RegExp(`(?:^|:)${k}=(-?[\\d.]+)`).exec(shape);
        return m ? Number(m[1]) : NaN;
      };
      const box = { left: v('left'), top: v('top'), width: v('width'), height: v('height') };
      if (Object.values(box).some(Number.isNaN)) {
        // An ellipse or a polygon without width and height: its points (rx/ry are not of the image's units).
        const rx = v('rx');
        const ry = v('ry');
        if (
          !Number.isNaN(box.left) &&
          !Number.isNaN(box.top) &&
          !Number.isNaN(rx) &&
          !Number.isNaN(ry)
        ) {
          return { left: box.left, top: box.top, width: 2 * rx, height: 2 * ry };
        }
        return null;
      }
      return box;
    })
    .filter((b): b is Box => b !== null);
}

const area = (b: Box) => Math.max(0, b.width) * Math.max(0, b.height);
const iou = (a: Box, b: Box) => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const inter = w > 0 && h > 0 ? w * h : 0;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
};

/** How much two masks are the same place: for each box of one, its best overlap in the other, on average. */
export function maskOverlap(a: string, b: string): number {
  const x = maskBoxes(a);
  const y = maskBoxes(b);
  if (!x.length || !y.length) return a === b ? 1 : 0;
  const best = (p: Box[], q: Box[]) =>
    p.reduce((t, box) => t + Math.max(...q.map((o) => iou(box, o))), 0) / p.length;
  return Math.min(best(x, y), best(y, x));
}

/**
 * The cards of a cloze or occlusion note whose question became another one's (the progress of a card hangs from its
 * number: a hole or a mask inserted in the middle, or the numbers swapped, give a student's progress to another
 * question). `moved`: a mask that is now somewhere else, without being another one's (the author looks).
 */
export function renumbered(
  before: Record<string, string>,
  after: Record<string, string>,
  occlusion: boolean,
): { renumbered: number[]; moved: number[] } {
  const same = occlusion
    ? (a: string, b: string) => maskOverlap(a, b) >= 0.5
    : (a: string, b: string) => a === b;
  const out = { renumbered: [] as number[], moved: [] as number[] };
  for (const ord of Object.keys(after)) {
    const now = after[ord]!;
    const was = before[ord];
    if (was === undefined || now === was) continue;
    if (same(now, was)) continue;
    const others = (sigs: Record<string, string>, value: string) =>
      Object.entries(sigs).some(([o, s]) => o !== ord && same(value, s));
    // Its new question was another one's, or its old one is now another card's.
    if (others(before, now) || others(after, was)) out.renumbered.push(Number(ord));
    else if (occlusion) out.moved.push(Number(ord));
  }
  out.renumbered.sort((a, b) => a - b);
  out.moved.sort((a, b) => a - b);
  return out;
}

// ─────────────────────────────────────────────── the list ───────────────────────────────────────────────

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Has the draft any change at all? (Revisión de cero (1.7, parte 2): the decks above the assessments count too.) */
export function isEmptyRelease(s: ReleaseSummary): boolean {
  return (
    !s.assessments.length &&
    !s.catalog.length &&
    !s.noteTypes.length &&
    !s.presets.length &&
    !s.decks.length
  );
}

const assessmentName = (s: ReleaseSummary, id: string | null) => {
  const a = s.assessments.find((x) => x.id === id);
  return a ? `${a.courseName ?? a.courseId ?? ''} · ${a.name ?? a.id}` : (id ?? '');
};

const detail = (f: ReleaseFinding, k: string) => {
  const v = f.detail[k];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
};

/** The review list of a draft. */
export function buildReview(input: ReviewInput): ReviewList {
  const { summary: s } = input;
  const items = new Map<CheckRule, CheckItem[]>(CHECK_RULES.map((r) => [r.rule, []]));
  const add = (rule: CheckRule, item: CheckItem) => items.get(rule)!.push(item);
  const findings = (rule: string) => s.findings.filter((f) => f.rule === rule);
  const empty = isEmptyRelease(s);

  // What the database saw.
  for (const f of findings('key_out_of_range')) {
    add('key_out_of_range', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${f.key}: la correcta es la ${Number(detail(f, 'correct')) + 1} de ${detail(f, 'options') ?? '?'} alternativas.`,
    });
  }
  const PRACTICE: Record<string, string> = {
    quiz: 'su test no está',
    section: 'la pestaña del test no está',
    group: 'un tema del test no está',
    deck: 'su mazo no está',
  };
  for (const f of findings('practice_broken')) {
    const what = detail(f, 'what') ?? '';
    const value = detail(f, 'value');
    add('practice_broken', {
      key: `${f.key}:${what}:${value ?? ''}`,
      assessmentId: f.assessmentId,
      text: `${detail(f, 'title') ?? f.key}: ${PRACTICE[what] ?? what}${value ? ` («${value}»)` : ''}.`,
    });
  }
  for (const f of findings('class_without_year')) {
    add('class_without_year', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${detail(f, 'title') ?? f.key} (${f.key}) no dice de qué año es la clase.`,
    });
  }
  const KIND: Record<string, string> = {
    note: 'artículo',
    quiz: 'test',
    deck: 'mazo',
    image: 'imagen',
  };
  for (const f of findings('unpublished_in_draft')) {
    add('unpublished_in_draft', {
      key: `${detail(f, 'kind')}:${f.key}`,
      assessmentId: f.assessmentId,
      text: `El ${KIND[detail(f, 'kind') ?? ''] ?? 'material'} «${detail(f, 'title') ?? f.key}» está en content/unpublished.json y sigue en el borrador.`,
    });
  }
  for (const f of findings('imaios')) {
    add('imaios', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${detail(f, 'code') ?? detail(f, 'title') ?? f.key} nombra IMAIOS.`,
    });
  }
  for (const f of findings('question_id_shifted')) {
    const other = detail(f, 'other') ?? '';
    add('question_id_shifted', {
      key: f.key,
      assessmentId: f.assessmentId,
      text:
        detail(f, 'kind') === 'renamed'
          ? `${f.key} es la pregunta ${other} con otro id: su historial se perdería.`
          : `${f.key} tiene ahora el texto de ${other}: el historial de una quedaría en la otra.`,
    });
  }
  // Revisión de cero (1.7, parte 2): the pairs with the same code, which the database finds without the limit of 300
  // candidates (and in any assessment); then the ones of almost the same text among the candidates.
  const guidPairs = new Set<string>();
  for (const f of findings('guid_same_code')) {
    if (guidPairs.has(f.key)) continue;
    guidPairs.add(f.key);
    add('guid_changed', {
      key: f.key,
      assessmentId: f.assessmentId,
      text: `${detail(f, 'codeBefore') ?? detail(f, 'removed') ?? '?'} sale y entra ${
        detail(f, 'code') ?? detail(f, 'added') ?? '?'
      }, con el mismo código: el avance de los alumnos quedaría en la vieja.`,
    });
  }
  for (const f of findings('guid_candidates')) {
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
        text: `${assessmentName(s, f.assessmentId)}: ${
          removed.length === 1 ? 'sale 1 nota' : `salen ${removed.length} notas`
        } y ${added.length === 1 ? 'entra 1' : `entran ${added.length}`}, sin ninguna casi igual a otra.`,
      });
    }
  }
  for (const f of findings('cloze_signatures')) {
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
  }

  // What the summary says.
  const changes = !empty;
  if (changes && s.schemaVersion !== input.supportedSchemaVersion) {
    add('schema_version', {
      key: 'schema',
      assessmentId: null,
      text:
        s.schemaVersion === null
          ? 'El borrador no dice con qué versión del importador se subió: súbelo de nuevo.'
          : s.schemaVersion > input.supportedSchemaVersion
            ? `El borrador es de la versión ${s.schemaVersion} y el sitio en línea entiende hasta la ${input.supportedSchemaVersion}: despliega primero el sitio.`
            : `El borrador es de la versión ${s.schemaVersion} y el sitio en línea espera la ${input.supportedSchemaVersion}: súbelo de nuevo.`,
    });
  }
  for (const a of s.assessments) {
    for (const d of a.decks) {
      if (d.cardsBefore > 0 && d.cardsAfter < d.cardsBefore * 0.9) {
        add('deck_drop', {
          key: d.id,
          assessmentId: a.id,
          text: `${lastName(d.name)}: de ${d.cardsBefore} a ${d.cardsAfter} tarjetas.`,
        });
      }
      if (d.op === 'changed' && d.presetBefore !== d.presetAfter) {
        add('preset_changed', {
          key: `deck:${d.id}`,
          assessmentId: a.id,
          text: `${lastName(d.name)}: de «${d.presetBefore ?? 'sin configuración'}» a «${d.presetAfter ?? 'sin configuración'}».`,
        });
      }
    }
    const near = [a.suggestedDate, a.suggestedDateBefore]
      .filter((d): d is string => !!d)
      .map((d) => ({ d, days: daysBetween(input.today, d) }))
      .find((x) => x.days >= 0 && x.days <= 7);
    if (near) {
      add('near_test_date', {
        key: a.id,
        assessmentId: a.id,
        text: `${assessmentName(s, a.id)}: la prueba sugerida es ${
          near.days === 0 ? 'hoy' : near.days === 1 ? 'mañana' : `en ${near.days} días`
        } (${near.d}).`,
      });
    }
  }
  // The decks above the assessments (the root, a semester's, a course's).
  for (const d of s.decks) {
    if (d.op === 'changed' && d.presetBefore !== d.presetAfter) {
      add('preset_changed', {
        key: `deck:${d.id}`,
        assessmentId: null,
        text: `${lastName(d.name)}: de «${d.presetBefore ?? 'sin configuración'}» a «${d.presetAfter ?? 'sin configuración'}».`,
      });
    }
  }
  for (const p of s.presets) {
    add('preset_changed', {
      key: `preset:${p.name}`,
      assessmentId: null,
      text: `La configuración «${p.name}» ${p.op === 'added' ? 'es nueva' : p.op === 'removed' ? 'sale' : 'cambia'}.`,
    });
  }
  for (const key of input.missingImages ?? []) {
    add('missing_image', {
      key,
      assessmentId: null,
      text: `${key} no está en el almacén de imágenes.`,
    });
  }
  for (const h of input.phrases ?? []) {
    add('process_phrase', {
      key: `${h.key}:${h.rule}:${h.snippet}`,
      assessmentId: h.assessmentId,
      text: `${h.label}: «${h.snippet}» (${PROCESS_RULES.find((r) => r.id === h.rule)?.label ?? h.rule}).`,
    });
  }

  const checks: Check[] = CHECK_RULES.map((r) => ({
    ...r,
    items: items.get(r.rule)!,
    pending:
      (r.rule === 'missing_image' && input.missingImages === null) ||
      (r.rule === 'process_phrase' && input.phrases === null),
  }));
  const wanted = input.marks ?? (['phone', 'answers'] as const);
  const manual: ManualMark[] = wanted.map((mark) => {
    const m = s.marks.find((x) => x.mark === mark);
    return { mark, label: MARK_LABELS[mark], checked: !!m, checkedBy: m?.checkedBy ?? null };
  });
  const blocking = checks.filter((c) => c.severity === 'block' && c.items.length).length;
  const pending = checks.filter((c) => c.pending).length;
  return {
    checks,
    manual,
    blocking,
    pending,
    ready: !empty && !blocking && !pending && manual.every((m) => m.checked),
    empty,
  };
}

/**
 * What a publication keeps of the review list it was published with (step 1.7, part 3): `publish_release()` refuses
 * it unless `blocking` is 0 and `ready` is true, and it stays in the log.
 */
export function reviewChecks(r: ReviewList): ReleaseChecks {
  return {
    blocking: r.blocking,
    pending: r.pending,
    ready: r.ready,
    warnings: r.checks
      .filter((c) => c.severity === 'warn' && c.items.length)
      .map((c) => ({ rule: c.rule, title: c.title, count: c.items.length })),
    marks: r.manual.map((m) => ({ mark: m.mark, checkedBy: m.checkedBy })),
  };
}

/**
 * Revisión de cero (1.8): an assessment that only comes into the catalog (or leaves it) without any material, such as the
 * empty certámenes of the full catalog. «Qué cambia» says it in one line; it gets no card, no line of the popup and no
 * place in the publication's name, where it would hide what does change («… y 27 más»).
 */
export function onlyInCatalog(s: ReleaseSummary, a: ReleaseAssessment): boolean {
  const empty =
    a.articles.added + a.articles.removed + a.articles.content + a.articles.format === 0 &&
    a.questions.total + a.questions.added + a.questions.removed + a.questions.moved === 0 &&
    a.cards.added + a.cards.removed + a.cards.moved + a.cards.notes === 0 &&
    !a.quizzes.length &&
    !a.decks.length &&
    !a.impactDecks.length;
  return (
    empty && s.catalog.some((c) => c.kind === 'assessment' && c.id === a.id && c.op !== 'changed')
  );
}

/**
 * The name of a publication, from what it changes: «Biología celular · Certamen 2», «… y Anatomía I · Certamen 1»,
 * «… y 3 más». Without assessments (only the catalog, a deck above them, a note type or a preset), «Cambios del sitio».
 */
export function releaseTitle(s: ReleaseSummary): string {
  const names = s.assessments
    .filter((a) => !onlyInCatalog(s, a))
    .map((a) => assessmentName(s, a.id));
  if (!names.length) return 'Cambios del sitio';
  if (names.length === 1) return names[0]!;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} y ${names.at(-1)!}`;
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}

/** «() Medicina UCH::…::01 - Columna vertebral» → «01 - Columna vertebral». */
export const lastName = (deckName: string) => deckName.split('::').pop() ?? deckName;

// ─────────────────────────────────────────── before and after ───────────────────────────────────────────

/**
 * What a reader sees of an HTML field: the text, each image as «[img name]» (as `release_text()` in SQL: the name with
 * double, single or no quotes, and only what looks like a tag goes; a loose «p<0.05 y q>1» is text).
 */
export function plainText(html: string | null | undefined): string {
  return (html ?? '')
    .replace(
      /<(?:img|video|audio|source|embed)\b[^>]*\b(?:data-media|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>/gi,
      (_m, a?: string, b?: string, c?: string) => ` [img ${a ?? b ?? c ?? ''}] `,
    )
    .replace(/<\/?[a-z][^>]*>|<![^>]*>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DiffPart = { op: 'same' | 'del' | 'add'; text: string };

/**
 * A word diff of two texts (the longest common subsequence of their words), to mark what changed between the before
 * and the after. When the part that differs is too long to compare word by word, it goes out and comes in whole.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  // Common start and end first: most changes are a few words in the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  const n = x.length;
  const m = y.length;
  if (n * m > 4_000_000) {
    // Too long to compare word by word (a rewritten section): the middle goes out and comes in whole.
    return [
      ...(start ? [{ op: 'same' as const, text: a.slice(0, start).join('') }] : []),
      ...(n ? [{ op: 'del' as const, text: x.join('') }] : []),
      ...(m ? [{ op: 'add' as const, text: y.join('') }] : []),
      ...(end ? [{ op: 'same' as const, text: a.slice(a.length - end).join('') }] : []),
    ];
  }
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffPart[] = [];
  const push = (op: DiffPart['op'], text: string) => {
    const last = out.at(-1);
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  if (start) push('same', a.slice(0, start).join(''));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('same', x[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('del', x[i++]!);
    } else {
      push('add', y[j++]!);
    }
  }
  while (i < n) push('del', x[i++]!);
  while (j < m) push('add', y[j++]!);
  if (end) push('same', a.slice(a.length - end).join(''));
  return out;
}
