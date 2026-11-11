import { readFile, writeFile } from 'node:fs/promises';
import { thumbKeyOf } from '@qv/schema';
import { defaultQuizId } from './quizzes';
import type { ContentDatabase } from './targets';
import { UnpublishedItem, readUnpublished } from './manifest';
import type { Manifest, UnpublishedKind } from './manifest';

/** The images in R2, as the command needs them. */
export interface MediaRemover {
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /**
   * Deletes every object whose key starts with `prefix` (the browser's index files of an assessment, step 3.3) and says
   * how many. Without it, they stay in the store (no row names them any more).
   */
  deletePrefix?(prefix: string): Promise<number>;
}

/** What unpublish_content() says. */
export interface UnpublishResult {
  kind: UnpublishedKind;
  id: string;
  found: boolean;
  title: string | null;
  assessmentId: string | null;
  removed: Partial<
    Record<
      | 'notes'
      | 'sections'
      | 'quizzes'
      | 'questions'
      | 'decks'
      | 'ankiNotes'
      | 'cards'
      | 'staleNotes',
      number
    >
  > & { assessments?: string[] };
  usedBy: { kind: 'note' | 'ankiNote' | 'quiz'; id: string; title: string }[];
  logId: number | null;
}

export interface UnpublishOptions {
  db: ContentDatabase;
  store: MediaRemover;
  /** content/unpublished.json */
  listFile: string;
  /** The manifest, to find an article by its code or slug and a test by its slug (and to accept what is not published yet). */
  manifest: Pick<Manifest, 'notes' | 'tests'>;
  kind: UnpublishedKind;
  /** As written: an article by its id (AP-…), its web code (QV-…) or its slug; a test by its id or slug; a deck by its id or full name; an image by its key. */
  id: string;
  reason?: string;
  by: string;
  /** Only say what it would take off. */
  dryRun?: boolean;
  /** Accept a deck above an assessment (of a course, a semester or the root), which takes all the assessments below. */
  aboveAssessment?: boolean;
  /** Asked after showing what goes (`--yes`: always true). */
  confirm: (summary: string) => Promise<boolean>;
  log?: (line: string) => void;
  now?: () => Date;
}

export interface UnpublishOutcome {
  /** What went (or would go, with dryRun). */
  result: UnpublishResult;
  /** True if it was taken off (false with dryRun, if it was not confirmed or if it was already off). */
  applied: boolean;
  /** It was already in content/unpublished.json. */
  alreadyListed: boolean;
  /**
   * Whether it was also in the draft and left it (step 1.7). When it is published, unpublish_content() takes it out of
   * the draft in the same transaction (a trigger of unpublish_log): this is the case of a piece that is only in the
   * draft (never published, or listed before). Null: not asked.
   */
  draft: { found: boolean; removed: number } | null;
  /** Calls to the content database and to R2. */
  calls: { db: number; store: number };
  /**
   * The browser's index files deleted (step 3.3): a deck taken off takes its assessments' indexes (the database takes
   * their rows); an image, its thumbnail.
   */
  indexFiles?: number;
  ms: number;
}

const KIND_NAMES: Record<UnpublishedKind, string> = {
  note: 'el artículo',
  deck: 'el mazo',
  quiz: 'el test',
  image: 'la imagen',
};

/** The id the list keeps, from what the manifest knows (null: the manifest does not have it). */
export function canonicalId(
  manifest: Pick<Manifest, 'notes' | 'tests'>,
  kind: UnpublishedKind,
  id: string,
): string | null {
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
      throw new Error(
        `Hay ${bySlug.length} tests con el slug «${id}» (${bySlug.map((t) => t.id).join(', ')}): usa su id.`,
      );
    }
    return bySlug[0]?.id ?? null;
  }
  return null;
}

/** What the result says, in a few lines. */
export function describe(r: UnpublishResult, storeHas?: boolean): string {
  const n = r.removed;
  const name = r.title ? ` «${r.title}»` : '';
  const lines = [`${KIND_NAMES[r.kind]} ${r.id}${name}`];
  if (r.kind === 'note' && r.found) lines.push(`  1 artículo con ${n.sections ?? 0} secciones`);
  if (r.kind === 'quiz' && r.found) lines.push(`  1 test con ${n.questions ?? 0} preguntas`);
  if (r.kind === 'deck' && r.found) {
    lines.push(
      `  ${n.decks} ${n.decks === 1 ? 'mazo' : 'mazos'} (con los de abajo), ${n.ankiNotes} notas y ${n.cards} tarjetas` +
        (n.staleNotes ? `; ${n.staleNotes} notas siguen con sus tarjetas de otros mazos` : ''),
    );
    const assessments = n.assessments ?? [];
    if (assessments.length && !(assessments.length === 1 && assessments[0] === r.assessmentId))
      lines.push(
        `  ${assessments.length === 1 ? 'Evaluación' : `${assessments.length} evaluaciones`}: ${assessments.join(', ')}`,
      );
    lines.push(
      '  El avance de cada alumno queda guardado y oculto; si el mazo vuelve, sigue donde iba.',
    );
  }
  if (r.kind === 'image') {
    lines.push(storeHas ? '  Se borra de R2 (queda en 404).' : '  Ya no está en R2.');
    lines.push(
      r.usedBy.length
        ? `  La usan ${r.usedBy.length}: ${r.usedBy
            .slice(0, 10)
            .map(
              (u) =>
                `${u.kind === 'note' ? 'apunte' : u.kind === 'quiz' ? 'test' : 'nota de Anki'} ${u.title}`,
            )
            .join(
              ', ',
            )}${r.usedBy.length > 10 ? '…' : ''}. Se verá rota en ellas hasta reemplazarla e importar.`
        : '  Ninguna pieza publicada la usa.',
    );
  }
  if (r.assessmentId) lines.push(`  Evaluación: ${r.assessmentId}`);
  return lines.join('\n');
}

async function writeList(file: string, items: UnpublishedItem[]) {
  // Kept as the file was (it may not exist yet): only `items` changes.
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await writeFile(file, `${JSON.stringify({ ...base, items }, null, 2)}\n`);
}

/**
 * Takes a piece off the site (step 1.5): one call to see what goes, the confirmation, the entry in
 * content/unpublished.json (first: so that no import publishes it again, even if what follows fails) and one call that
 * takes it off and records it (unpublish_content). An image is also deleted from R2. With `dryRun`, only the first
 * call (and, for an image, whether R2 has it). Never writes in the users' database.
 */
export async function unpublish(op: UnpublishOptions): Promise<UnpublishOutcome> {
  const started = Date.now();
  const log = op.log ?? (() => {});
  const calls = { db: 0, store: 0 };
  const rpc = async (apply: boolean, id: string) => {
    calls.db++;
    const r = await op.db.rpc('unpublish_content', {
      kind: op.kind,
      item: id,
      reason: op.reason ?? null,
      requested_by: op.by,
      apply,
    });
    if (r.error) throw new Error(`unpublish_content: ${r.error.message}`);
    return r.data as UnpublishResult;
  };
  if (!op.dryRun && !op.reason?.trim()) {
    throw new Error(
      'Falta el motivo: --reason "…" (queda en content/unpublished.json y en el registro).',
    );
  }

  const inManifest = canonicalId(op.manifest, op.kind, op.id);
  const id = inManifest ?? op.id;
  const parsed = UnpublishedItem.safeParse({
    kind: op.kind,
    id,
    reason: op.reason?.trim() || 'dry-run',
    date: '2026-01-01',
  });
  // A deck can be named by its full name: the database says its id.
  if (!parsed.success && op.kind !== 'deck') {
    throw new Error(`No es un id de ${op.kind} válido: ${op.id}`);
  }

  const preview = await rpc(false, id);
  let storeHas: boolean | undefined;
  if (op.kind === 'image') {
    calls.store++;
    storeHas = await op.store.has(preview.id);
  }
  const list = await readUnpublished(op.listFile);
  const alreadyListed = list.some((i) => i.kind === op.kind && i.id === preview.id);
  const exists =
    op.kind === 'image'
      ? storeHas || preview.usedBy.length > 0
      : preview.found || inManifest !== null;
  let draft: UnpublishOutcome['draft'] = null;
  const done = (applied: boolean): UnpublishOutcome => ({
    result: preview,
    applied,
    alreadyListed,
    draft,
    calls,
    ms: Date.now() - started,
  });
  let indexFiles = 0;
  /** The browser's index files of these assessments (step 3.3): no row names them any more. */
  const dropIndexFiles = async (assessments: readonly string[]) => {
    if (!op.store.deletePrefix) return;
    for (const a of assessments) {
      if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(a)) continue;
      calls.store++;
      indexFiles += await op.store.deletePrefix(`browse/${a}/`);
    }
  };
  /** Out of the draft too (a piece that the site does not have, so no record took it out of the draft). */
  const outOfDraft = async (id: string) => {
    if (op.kind === 'deck') {
      // Its assessments' indexes in the draft first: unpublish_draft() takes the decks they are found by.
      calls.db++;
      const r = await op.db.rpc('unpublish_draft_browse_indexes', { item: id });
      if (r.error) log(`No se pudieron revisar los índices del borrador (${r.error.message}).`);
      else await dropIndexFiles((r.data as string[] | null) ?? []);
    }
    calls.db++;
    const r = await op.db.rpc('unpublish_draft', { kind: op.kind, item: id });
    if (r.error) {
      log(`No se pudo revisar el borrador (unpublish_draft: ${r.error.message}).`);
      return;
    }
    draft = r.data as { found: boolean; removed: number };
    if (draft.found) log(`${KIND_NAMES[op.kind]} ${id} también salió del borrador.`);
  };

  const live = op.kind === 'image' ? !!storeHas : preview.found;
  if (alreadyListed && !live) {
    log(
      `${KIND_NAMES[op.kind]} ${preview.id} ya estaba fuera del sitio y en content/unpublished.json.`,
    );
    if (!op.dryRun) await outOfDraft(preview.id);
    return done(false);
  }
  if (!exists) {
    throw new Error(
      `No existe ${KIND_NAMES[op.kind]} ${op.id}: no está publicado` +
        (op.kind === 'note' || op.kind === 'quiz' ? ' ni en el manifiesto' : '') +
        '. Revisa el id.',
    );
  }
  if (op.kind === 'deck' && !/^\d{1,20}$/.test(preview.id)) {
    throw new Error(`El mazo ${op.id} no tiene un id válido.`);
  }
  const above = op.kind === 'deck' && preview.found && preview.assessmentId === null;
  if (above && !op.aboveAssessment && !op.dryRun) {
    const assessments = preview.removed.assessments ?? [];
    throw new Error(
      `El mazo ${preview.id}${preview.title ? ` «${preview.title}»` : ''} está sobre las evaluaciones ` +
        `(es de un ramo, un semestre o la raíz) y se llevaría ${assessments.length === 1 ? 'la evaluación' : `las ${assessments.length} evaluaciones`} ` +
        `${assessments.join(', ') || '(ninguna)'} con ${preview.removed.decks ?? 0} mazos. Saca el mazo de cada evaluación, ` +
        'o, si de verdad es todo, repite con --above-assessment.',
    );
  }

  const summary =
    (preview.found || op.kind === 'image'
      ? describe(preview, storeHas)
      : `${KIND_NAMES[op.kind]} ${preview.id}`) +
    (above && !op.aboveAssessment
      ? '\n  Está sobre las evaluaciones: para sacarlo hace falta --above-assessment.'
      : '') +
    (preview.found || storeHas
      ? ''
      : '\n  No está publicado: queda en la lista para que el importador no lo publique.');
  log(`${op.dryRun ? 'Se sacaría' : 'Se va a sacar'} ${summary}`);
  if (op.dryRun) return done(false);
  if (!(await op.confirm(summary))) {
    log('No se sacó nada.');
    return done(false);
  }

  if (!alreadyListed) {
    const date = (op.now ?? (() => new Date()))().toISOString().slice(0, 10);
    const item = UnpublishedItem.parse({
      kind: op.kind,
      id: preview.id,
      reason: op.reason,
      date,
      by: op.by,
    });
    await writeList(op.listFile, [...list, item]);
  }
  const result = await rpc(true, preview.id);
  if (op.kind === 'image' && storeHas) {
    calls.store++;
    await op.store.delete(preview.id);
  }
  // Its thumbnail in the browser's list (step 3.3), if it has one.
  const thumb = op.kind === 'image' ? thumbKeyOf(preview.id) : null;
  if (thumb) {
    calls.store++;
    if (await op.store.has(thumb)) {
      calls.store++;
      await op.store.delete(thumb);
      indexFiles++;
    }
  }
  // A deck: its assessments' index files (their rows left with it, in public and in the draft).
  if (op.kind === 'deck' && result.found) await dropIndexFiles(result.removed.assessments ?? []);
  // Published, it left the draft with it (the record's trigger); if not, it may be only in the draft.
  if (!result.found) await outOfDraft(result.id);
  return {
    result,
    applied: true,
    alreadyListed,
    draft,
    calls,
    indexFiles,
    ms: Date.now() - started,
  };
}

/**
 * Takes a piece out of content/unpublished.json (to publish it again, import afterwards). Null if it was not there.
 * With `dryRun`, only says which entry it would take out (the file is not written).
 */
export async function restore(
  listFile: string,
  manifest: Pick<Manifest, 'notes' | 'tests'>,
  kind: UnpublishedKind,
  id: string,
  options: { dryRun?: boolean } = {},
): Promise<UnpublishedItem | null> {
  const list = await readUnpublished(listFile);
  const target = canonicalId(manifest, kind, id) ?? id;
  const item = list.find((i) => i.kind === kind && i.id === target);
  if (!item || options.dryRun) return item ?? null;
  await writeList(
    listFile,
    list.filter((i) => i !== item),
  );
  return item;
}

/** The assessment a note or a test of the manifest is in (to say which import publishes it again). */
export function assessmentOf(
  manifest: Pick<Manifest, 'notes' | 'tests'>,
  kind: UnpublishedKind,
  id: string,
): string | null {
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
