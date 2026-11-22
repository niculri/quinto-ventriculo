#!/usr/bin/env -S npx tsx
// `npm run unpublish`: takes a piece off the site, lists what is off, or puts it back in the publishable list.
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { readManifest, readUnpublished } from '../manifest/read';
import type { Manifest } from '../manifest/schemas';
import { contentFolder, requireContentFolder } from '../privateFolder';
import { cloudConfigFromEnv } from '../targets/cloudConfig';
import { contentDatabase } from '../targets/contentDatabase';
import { r2Media } from '../targets/r2';
import { assessmentOf } from '../unpublish/ids';
import { restore } from '../unpublish/list';
import { unpublish } from '../unpublish/unpublish';
import type { UnpublishOutcome } from '../unpublish/types';
import { ImportError } from '../ImportError';
import { HELP, parseUnpublishArgs, pieceOf } from './unpublishArgs';
import type { UnpublishArgs } from './unpublishArgs';

type Piece = ReturnType<typeof pieceOf>;

async function listItems(listFile: string): Promise<void> {
  const items = await readUnpublished(listFile);
  console.log(
    items.length
      ? items
          .map((i) => `${i.date}  ${i.kind}  ${i.id}  — ${i.reason}${i.by ? ` (${i.by})` : ''}`)
          .join('\n')
      : 'No hay nada fuera del sitio.',
  );
}

async function restoreItem(
  args: UnpublishArgs,
  piece: Piece,
  listFile: string,
  manifest: Manifest,
): Promise<void> {
  const item = await restore(listFile, manifest, piece.kind, piece.id, { dryRun: args.dryRun });
  if (!item) {
    console.log(
      `${piece.kind} ${piece.id} no está en content/unpublished.json` +
        (piece.kind === 'deck' ? ' (un mazo va por su id: --list lo muestra).' : '.'),
    );
    return;
  }
  const assessment = assessmentOf(manifest, item.kind, item.id);
  console.log(
    `${args.dryRun ? 'Se sacaría' : 'Se sacó'} ${item.kind} ${item.id} de content/unpublished.json` +
      `${args.dryRun ? ' (--dry-run: no se cambió nada)' : ''}. Para publicarlo de nuevo:\n` +
      `  npm run import -- --target draft${assessment ? ` --assessment ${assessment}` : ''}\n` +
      '  y después «Publicar» en Opciones → Publicaciones.',
  );
}

async function confirmFromTerminal(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new ImportError('usage', 'Sin terminal para confirmar: usa --yes.');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^(s|si|sí|y|yes)$/i.test((await rl.question('¿Sacarlo del sitio? (s/N) ')).trim());
  } finally {
    rl.close();
  }
}

function appliedSummary(outcome: UnpublishOutcome): string {
  return [
    '',
    `Fuera del sitio: ${outcome.result.kind} ${outcome.result.id}` +
      (outcome.result.logId ? ` (registro ${outcome.result.logId})` : '') +
      '.',
    outcome.alreadyListed
      ? 'Ya estaba en content/unpublished.json.'
      : 'Anotado en content/unpublished.json: haz commit en el repositorio privado.',
    'Quien ya lo tenía abierto puede seguir viéndolo en esa pestaña hasta 10 min; una visita nueva deja de verlo al minuto (docs/arquitectura.md, «Despublicar»).',
    ...(outcome.result.kind === 'deck'
      ? [
          `Explorador de tarjetas: ${outcome.indexFiles ?? 0} archivos de índice borrados; esa evaluación queda sin índice hasta volver a importarla.`,
        ]
      : outcome.indexFiles
        ? ['También se borró su miniatura del explorador de tarjetas.']
        : []),
    `Tiempo: ${(outcome.ms / 1000).toFixed(1)} s (${outcome.calls.db} llamadas a la base, ${outcome.calls.store} a R2).`,
  ].join('\n');
}

async function unpublishItem(
  args: UnpublishArgs,
  piece: Piece,
  listFile: string,
  manifest: Manifest,
): Promise<void> {
  const config = cloudConfigFromEnv(process.env);
  const outcome = await unpublish({
    db: contentDatabase(config),
    store: r2Media(config),
    listFile,
    manifest,
    kind: piece.kind,
    id: piece.id,
    ...(args.reason ? { reason: args.reason } : {}),
    by: args.by ?? userInfo().username,
    dryRun: args.dryRun,
    aboveAssessment: args.aboveAssessment,
    log: (line) => console.log(line),
    confirm: () => confirmFromTerminal(args.yes),
  });
  if (outcome.applied) console.log(appliedSummary(outcome));
  else if (args.dryRun) {
    console.log(
      `\n(--dry-run: no se sacó nada; ${outcome.calls.db} llamada a la base, ${(outcome.ms / 1000).toFixed(1)} s.)`,
    );
  }
}

async function main() {
  const args = parseUnpublishArgs();
  if (args.help) {
    console.log(HELP);
    return;
  }
  const content = requireContentFolder(contentFolder(args.content));
  const listFile = resolve(content, 'unpublished.json');
  if (args.list) {
    await listItems(listFile);
    return;
  }
  const piece = pieceOf(args);
  const manifest = await readManifest(content, { taxonomies: false });
  if (args.restore) await restoreItem(args, piece, listFile, manifest);
  else await unpublishItem(args, piece, listFile, manifest);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
