#!/usr/bin/env -S npx tsx
import { resolve } from 'node:path';
import { userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { readManifest, readUnpublished, UnpublishedKind } from './manifest';
import { cloudConfigFromEnv, contentDatabase, r2Media } from './targets';
import { assessmentOf, restore, unpublish } from './unpublish';
import { PRIVATE_FOLDER_NAME, contentFolder, requireContentFolder } from './private-folder';

const HELP = `Saca del sitio un artículo, un mazo (con los de abajo), un test o una imagen, en segundos, sin
tocar el avance de los alumnos, y lo anota en content/unpublished.json para que ninguna importación lo
vuelva a publicar.

Uso: npm run unpublish -- <tipo> <id> --reason "…" [opciones]

  <tipo>                 note (artículo: AP-…, QV-… o su slug), deck (id o nombre completo del mazo),
                         quiz (id o slug del test) o image (clave en R2: notes/<hash>.webp, cards/…, tests/…)
  --reason "…"           por qué (obligatorio para sacarlo; queda en la lista y en el registro)
  --dry-run              solo dice qué sacaría (del sitio, o de la lista con --restore)
  --yes                  no pregunta (para un script)
  --above-assessment     acepta un mazo de ramo, semestre o la raíz (se lleva todas sus evaluaciones)
  --by <quién>           quién lo pide (por omisión, el usuario del computador)
  --restore              lo saca de content/unpublished.json; para publicarlo de nuevo, importa después
  --list                 muestra lo que está fuera del sitio
  --content <carpeta>    content/ (por omisión, QV_CONTENT_DIR o content/ del repositorio privado,
                         ${PRIVATE_FOLDER_NAME}/, junto a este)
  -h, --help             esta ayuda

Necesita las variables de la nube (las mismas de npm run import -- --target draft), salvo --restore y --list.
Saca la pieza de lo publicado y del borrador a la vez.
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      reason: { type: 'string' },
      'dry-run': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'above-assessment': { type: 'boolean' },
      by: { type: 'string' },
      restore: { type: 'boolean' },
      list: { type: 'boolean' },
      content: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const content = requireContentFolder(contentFolder(values.content));
  const listFile = resolve(content, 'unpublished.json');

  if (values.list) {
    const items = await readUnpublished(listFile);
    console.log(
      items.length
        ? items
            .map((i) => `${i.date}  ${i.kind}  ${i.id}  — ${i.reason}${i.by ? ` (${i.by})` : ''}`)
            .join('\n')
        : 'No hay nada fuera del sitio.',
    );
    return;
  }

  const [kindText, id] = positionals;
  const kind = UnpublishedKind.safeParse(kindText);
  if (!kind.success || !id || positionals.length !== 2) {
    throw new Error(`Uso: npm run unpublish -- <note|deck|quiz|image> <id> --reason "…" (--help)`);
  }
  // Without the taxonomy: unpublishing does not use it, and one being edited must not stop it (step 1.6).
  const manifest = await readManifest(content, { taxonomies: false });

  if (values.restore) {
    const dryRun = values['dry-run'] ?? false;
    const item = await restore(listFile, manifest, kind.data, id, { dryRun });
    if (!item) {
      console.log(
        `${kind.data} ${id} no está en content/unpublished.json` +
          (kind.data === 'deck' ? ' (un mazo va por su id: --list lo muestra).' : '.'),
      );
      return;
    }
    const assessment = assessmentOf(manifest, item.kind, item.id);
    console.log(
      `${dryRun ? 'Se sacaría' : 'Se sacó'} ${item.kind} ${item.id} de content/unpublished.json` +
        `${dryRun ? ' (--dry-run: no se cambió nada)' : ''}. Para publicarlo de nuevo:\n` +
        `  npm run import -- --target draft${assessment ? ` --assessment ${assessment}` : ''}\n` +
        '  y después «Publicar» en Opciones → Publicaciones.',
    );
    return;
  }

  const config = cloudConfigFromEnv(process.env);
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const outcome = await unpublish({
    db: contentDatabase(config),
    store: r2Media(config),
    listFile,
    manifest,
    kind: kind.data,
    id,
    ...(values.reason ? { reason: values.reason } : {}),
    by: values.by ?? userInfo().username,
    dryRun: values['dry-run'] ?? false,
    aboveAssessment: values['above-assessment'] ?? false,
    log: (line) => console.log(line),
    confirm: async () => {
      if (values.yes) return true;
      if (!interactive) throw new Error('Sin terminal para confirmar: usa --yes.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return /^(s|si|sí|y|yes)$/i.test((await rl.question('¿Sacarlo del sitio? (s/N) ')).trim());
      } finally {
        rl.close();
      }
    },
  });
  if (outcome.applied) {
    console.log(
      [
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
      ].join('\n'),
    );
  } else if (values['dry-run']) {
    console.log(
      `\n(--dry-run: no se sacó nada; ${outcome.calls.db} llamada a la base, ${(outcome.ms / 1000).toFixed(1)} s.)`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
