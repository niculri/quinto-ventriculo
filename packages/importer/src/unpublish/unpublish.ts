// Takes a piece off the site (`npm run unpublish`) and puts it back in the list of what can be published.
import { thumbKeyOf } from '@qv/schema';
import { ImportError } from '../errors';
import { UnpublishedItem } from '../manifest/schemas';
import { readUnpublished } from '../manifest/read';
import { canonicalId } from './ids';
import { describe } from './describe';
import { writeList } from './list';
import { KIND_NAMES } from './types';
import type { UnpublishOptions, UnpublishOutcome, UnpublishResult } from './types';

/** One run: its calls, the draft's answer and the index files removed, which the outcome reports. */
class Unpublisher {
  readonly calls = { db: 0, store: 0 };
  draft: UnpublishOutcome['draft'] = null;
  indexFiles = 0;
  private readonly started = Date.now();
  private readonly log: (line: string) => void;

  constructor(private readonly op: UnpublishOptions) {
    this.log = op.log ?? (() => undefined);
  }

  async rpc(apply: boolean, id: string): Promise<UnpublishResult> {
    const { op } = this;
    this.calls.db++;
    const r = await op.db.rpc('unpublish_content', {
      kind: op.kind,
      item: id,
      reason: op.reason ?? null,
      requested_by: op.by,
      apply,
    });
    if (r.error) throw new ImportError('cloud', `unpublish_content: ${r.error.message}`);
    return r.data as UnpublishResult;
  }

  ms = () => Date.now() - this.started;

  async dropIndexFiles(assessments: readonly string[]): Promise<void> {
    if (!this.op.store.deletePrefix) return;
    for (const a of assessments) {
      if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(a)) continue;
      this.calls.store++;
      this.indexFiles += await this.op.store.deletePrefix(`browse/${a}/`);
    }
  }

  /** For a piece the site does not have, so no record took it out of the draft. */
  async outOfDraft(id: string): Promise<void> {
    const { op } = this;
    if (op.kind === 'deck') {
      // Its assessments' indexes in the draft first: unpublish_draft() takes the decks they are found by.
      this.calls.db++;
      const r = await op.db.rpc('unpublish_draft_browse_indexes', { item: id });
      if (r.error)
        this.log(`No se pudieron revisar los índices del borrador (${r.error.message}).`);
      else await this.dropIndexFiles((r.data as string[] | null) ?? []);
    }
    this.calls.db++;
    const r = await op.db.rpc('unpublish_draft', { kind: op.kind, item: id });
    if (r.error) {
      this.log(`No se pudo revisar el borrador (unpublish_draft: ${r.error.message}).`);
      return;
    }
    this.draft = r.data as { found: boolean; removed: number };
    if (this.draft.found) this.log(`${KIND_NAMES[op.kind]} ${id} también salió del borrador.`);
  }

  outcome(result: UnpublishResult, applied: boolean, alreadyListed: boolean): UnpublishOutcome {
    return {
      result,
      applied,
      alreadyListed,
      draft: this.draft,
      calls: this.calls,
      ...(applied ? { indexFiles: this.indexFiles } : {}),
      ms: this.ms(),
    };
  }

  /** What leaves with the piece besides its rows: the image, its thumbnail, the browser's index files. */
  async removeFiles(
    preview: UnpublishResult,
    result: UnpublishResult,
    storeHas: boolean | undefined,
  ): Promise<void> {
    const { op } = this;
    if (op.kind === 'image' && storeHas) {
      this.calls.store++;
      await op.store.delete(preview.id);
    }
    const thumb = op.kind === 'image' ? thumbKeyOf(preview.id) : null;
    if (thumb) {
      this.calls.store++;
      if (await op.store.has(thumb)) {
        this.calls.store++;
        await op.store.delete(thumb);
        this.indexFiles++;
      }
    }
    if (op.kind === 'deck' && result.found)
      await this.dropIndexFiles(result.removed.assessments ?? []);
  }
}

function checkReason(op: UnpublishOptions): void {
  if (!op.dryRun && !op.reason?.trim()) {
    throw new ImportError(
      'usage',
      'Falta el motivo: --reason "…" (queda en content/unpublished.json y en el registro).',
    );
  }
}

function checkId(op: UnpublishOptions, id: string): void {
  const parsed = UnpublishedItem.safeParse({
    kind: op.kind,
    id,
    reason: op.reason?.trim() ? op.reason.trim() : 'dry-run',
    date: '2026-01-01',
  });
  // A deck can be named by its full name: the database says its id.
  if (!parsed.success && op.kind !== 'deck') {
    throw new ImportError('usage', `No es un id de ${op.kind} válido: ${op.id}`);
  }
}

function checkExists(op: UnpublishOptions, exists: boolean, preview: UnpublishResult): void {
  if (!exists) {
    throw new ImportError(
      'usage',
      `No existe ${KIND_NAMES[op.kind]} ${op.id}: no está publicado` +
        (op.kind === 'note' || op.kind === 'quiz' ? ' ni en el manifiesto' : '') +
        '. Revisa el id.',
    );
  }
  if (op.kind === 'deck' && !/^\d{1,20}$/.test(preview.id)) {
    throw new ImportError('usage', `El mazo ${op.id} no tiene un id válido.`);
  }
}

function checkAbove(op: UnpublishOptions, above: boolean, preview: UnpublishResult): void {
  if (!above || op.aboveAssessment || op.dryRun) return;
  const assessments = preview.removed.assessments ?? [];
  throw new ImportError(
    'usage',
    `El mazo ${preview.id}${preview.title ? ` «${preview.title}»` : ''} está sobre las evaluaciones ` +
      `(es de un ramo, un semestre o la raíz) y se llevaría ${assessments.length === 1 ? 'la evaluación' : `las ${assessments.length} evaluaciones`} ` +
      `${assessments.join(', ') || '(ninguna)'} con ${preview.removed.decks ?? 0} mazos. Saca el mazo de cada evaluación, ` +
      'o, si de verdad es todo, repite con --above-assessment.',
  );
}

function summaryOf(
  op: UnpublishOptions,
  preview: UnpublishResult,
  storeHas: boolean | undefined,
  above: boolean,
): string {
  return (
    (preview.found || op.kind === 'image'
      ? describe(preview, storeHas)
      : `${KIND_NAMES[op.kind]} ${preview.id}`) +
    (above && !op.aboveAssessment
      ? '\n  Está sobre las evaluaciones: para sacarlo hace falta --above-assessment.'
      : '') +
    (preview.found || storeHas
      ? ''
      : '\n  No está publicado: queda en la lista para que el importador no lo publique.')
  );
}

/**
 * The list entry is written before taking the piece off, so no import publishes it again even if what follows fails.
 * Never writes in the users' database.
 */
export async function unpublish(op: UnpublishOptions): Promise<UnpublishOutcome> {
  const run = new Unpublisher(op);
  const log = op.log ?? (() => undefined);
  checkReason(op);
  const inManifest = canonicalId(op.manifest, op.kind, op.id);
  const id = inManifest ?? op.id;
  checkId(op, id);

  const preview = await run.rpc(false, id);
  let storeHas: boolean | undefined;
  if (op.kind === 'image') {
    run.calls.store++;
    storeHas = await op.store.has(preview.id);
  }
  const list = await readUnpublished(op.listFile);
  const alreadyListed = list.some((i) => i.kind === op.kind && i.id === preview.id);
  const exists =
    op.kind === 'image'
      ? storeHas === true || preview.usedBy.length > 0
      : preview.found || inManifest !== null;

  const live = op.kind === 'image' ? !!storeHas : preview.found;
  if (alreadyListed && !live) {
    log(
      `${KIND_NAMES[op.kind]} ${preview.id} ya estaba fuera del sitio y en content/unpublished.json.`,
    );
    if (!op.dryRun) await run.outOfDraft(preview.id);
    return run.outcome(preview, false, alreadyListed);
  }
  checkExists(op, exists, preview);
  const above = op.kind === 'deck' && preview.found && preview.assessmentId === null;
  checkAbove(op, above, preview);

  const summary = summaryOf(op, preview, storeHas, above);
  log(`${op.dryRun ? 'Se sacaría' : 'Se va a sacar'} ${summary}`);
  if (op.dryRun) return run.outcome(preview, false, alreadyListed);
  if (!(await op.confirm(summary))) {
    log('No se sacó nada.');
    return run.outcome(preview, false, alreadyListed);
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
  const result = await run.rpc(true, preview.id);
  await run.removeFiles(preview, result, storeHas);
  // A published piece already left the draft through the record's trigger.
  if (!result.found) await run.outOfDraft(result.id);
  return run.outcome(result, true, alreadyListed);
}
