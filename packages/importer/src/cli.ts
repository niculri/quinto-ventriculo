#!/usr/bin/env -S npx tsx
// `npm run import`: builds the content bundle and writes it to the dry-run folder or to the draft.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildBundle } from './build';
import {
  FolderTarget,
  CloudTarget,
  cloudConfigFromEnv,
  contentDatabase,
  draftReviewUrl,
} from './targets';
import { ImageCache } from './images';
import { readManifest, readUnpublished } from './manifest';
import { sameUnpublished } from './unpublished';
import { taxonomyLines } from './taxonomy';
import { PRIVATE_FOLDER_NAME, contentFolder, requireContentFolder } from './private-folder';

const TARGET_CLOUD_GONE =
  '--target cloud ya no existe: el material va al borrador con --target draft y se publica desde ' +
  'Opciones → Publicaciones (el botón «Publicar», que también se puede deshacer). Ver docs/configuracion.md, ' +
  '«Publicar material».';

const HELP = `Importa los apuntes y mazos de Anki publicados (content/ del repositorio privado) a la base de
contenido.

Uso: npm run import -- [opciones]

  --target folder|draft
                           folder = modo seco en .output/ (por omisión); draft = el borrador
                           (esquema draft de Supabase + R2: no cambia lo que ven los alumnos;
                           se publica desde Opciones → Publicaciones)
  --output <carpeta>       carpeta del modo seco (por omisión, .output)
  --root <carpeta>         carpeta con el material (por omisión, la que contiene el repositorio)
  --content <carpeta>      content/ con el catálogo y los manifiestos (por omisión, QV_CONTENT_DIR o
                           content/ del repositorio privado, ${PRIVATE_FOLDER_NAME}/, junto a este)
  --assessment <id>        solo esa evaluación del catálogo (se puede repetir), p. ej.
                           biologia-celular/certamen-2: sus apuntes, mazos y tests; no toca ni
                           quita nada de otra
  --only <código>          solo ese apunte (se puede repetir); no toca los mazos
  --only-decks             solo los mazos de Anki (content/decks/); no toca los apuntes
  --only-tests             solo los tests de práctica (content/tests/); no toca apuntes ni mazos
  --reset-draft            con --target draft: antes, deja el borrador igual a lo publicado
                           (reset_draft; lo que tenía sin publicar se pierde)
  --allow-warnings         subir al borrador aunque haya avisos (p. ej., una imagen que falta)
  --cache <carpeta>        caché de las imágenes ya convertidas (por omisión, .cache/images)
  -h, --help               esta ayuda
`;

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', default: 'folder' },
      output: { type: 'string' },
      root: { type: 'string' },
      content: { type: 'string' },
      only: { type: 'string', multiple: true },
      assessment: { type: 'string', multiple: true },
      cache: { type: 'string' },
      'only-decks': { type: 'boolean' },
      'only-tests': { type: 'boolean' },
      'allow-warnings': { type: 'boolean' },
      'reset-draft': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const repo = resolve(import.meta.dirname, '../../..');
  const root = resolve(values.root ?? resolve(repo, '..'));

  if (
    [values.only?.length, values['only-decks'], values['only-tests']].filter(Boolean).length > 1
  ) {
    throw new Error('--only, --only-decks y --only-tests no se pueden usar juntos.');
  }
  if (values.target === 'cloud') {
    throw new Error(TARGET_CLOUD_GONE);
  }
  if (values.target !== 'folder' && values.target !== 'draft') {
    throw new Error(`Destino desconocido: ${values.target} (folder o draft).`);
  }
  if (values['reset-draft'] && values.target !== 'draft') {
    throw new Error('--reset-draft va solo con --target draft.');
  }
  // After the options, so a wrong one says so even without the private repository.
  const content = requireContentFolder(contentFolder(values.content));
  const manifest = await readManifest(content);
  const started = Date.now();
  const cache = await ImageCache.open(resolve(repo, values.cache ?? '.cache/images'));
  const assessments = values.assessment ?? [];
  const {
    bundle,
    media,
    warnings,
    decksIncluded,
    notesIncluded,
    testsIncluded,
    unpublished,
    taxonomy,
  } = await buildBundle({
    manifest,
    root,
    process: cache.file,
    processCardImage: cache.card,
    processQuizImage: cache.quiz,
    assessments,
    only: values.only ?? [],
    onlyDecks: values['only-decks'] ?? false,
    onlyTests: values['only-tests'] ?? false,
    onProgress: (m) => console.log(`· ${m}`),
  });

  const only = (values.only ?? []).length > 0;
  const remote = values.target === 'draft';
  const target =
    values.target === 'draft'
      ? CloudTarget.fromConfig(cloudConfigFromEnv(process.env), 'draft')
      : values.target === 'folder'
        ? new FolderTarget(resolve(repo, values.output ?? '.output'), only)
        : null;
  if (!target) throw new Error(`Destino desconocido: ${values.target}`);

  if (remote && warnings.length && !values['allow-warnings']) {
    console.error(
      `\n⚠ ${warnings.length} avisos; no se subió nada (usa --allow-warnings para subir igual):\n` +
        warnings.map((w) => `  - ${w}`).join('\n'),
    );
    process.exitCode = 2;
    return;
  }

  // An `npm run unpublish` during the build would otherwise be undone.
  const listNow = await readUnpublished(resolve(content, 'unpublished.json'));
  if (!sameUnpublished(listNow, manifest.unpublished ?? [])) {
    throw new Error(
      'content/unpublished.json cambió mientras se armaba la importación (¿un npm run unpublish?): no se escribió nada. Vuelve a importar.',
    );
  }

  if (values['reset-draft']) {
    const r = await contentDatabase(cloudConfigFromEnv(process.env)).rpc('reset_draft', {});
    if (r.error) throw new Error(`reset_draft: ${r.error.message}`);
    console.log('· borrador igual a lo publicado (reset_draft)');
  }

  const report = await target.save(bundle, media, {
    notes: notesIncluded,
    decks: decksIncluded,
    tests: testsIncluded,
    partialNotes: only,
    ...(assessments.length ? { assessments } : {}),
    unpublished: manifest.unpublished ?? [],
  });
  const questions = bundle.quizzes.reduce((t, q) => t + q.questionCount, 0);
  const cards = bundle.ankiNotes.reduce((t, n) => t + n.cards.length, 0);
  console.log(
    [
      '',
      assessments.length ? `Solo: ${assessments.join(', ')}.` : 'Todas las evaluaciones.',
      notesIncluded
        ? `${bundle.notes.length} apuntes: ${report.changedNotes.length} con cambios, ` +
          `${report.unchangedNotes.length} iguales, ${report.removedNotes} quitados.`
        : 'Apuntes: sin tocar.',
      decksIncluded
        ? `${bundle.ankiDecks.length} mazos de Anki, ${bundle.ankiNotes.length} notas (${cards} tarjetas): ` +
          `${report.changedCards.length} notas con cambios, ${report.unchangedCards.length} iguales, ` +
          `${report.removedCards} quitadas.` +
          (report.movedCards || report.retiredCards
            ? ` Tarjetas que cambiaron de mazo o volvieron: ${report.movedCards}; que salieron: ` +
              `${report.retiredCards} (el avance de cada alumno las sigue al entrar).`
            : '')
        : 'Mazos de Anki: sin tocar.',
      testsIncluded
        ? `${bundle.quizzes.length} tests (${questions} preguntas): ${report.changedQuizzes.length} con ` +
          `cambios, ${report.unchangedQuizzes.length} iguales, ${report.removedQuizzes} quitados.`
        : 'Tests: sin tocar.',
      `Imágenes: ${report.mediaUploaded} subidas, ${report.mediaExisting} ya estaban` +
        (remote ? ' (solo se revisan las de lo que cambió)' : '') +
        `; convertidas ${cache.misses}, de la caché ${cache.hits}.`,
      ...(decksIncluded
        ? [
            `Índices del explorador: ${report.indexesWritten} escritos, ${report.indexesUnchanged} iguales` +
              (report.indexesRemoved ? `, ${report.indexesRemoved} quitados` : '') +
              `; miniaturas: ${report.thumbsUploaded} subidas, ${report.thumbsExisting} ya estaban.`,
          ]
        : []),
      ...(unpublished.length
        ? [
            `Fuera del sitio (content/unpublished.json), no se publica: ${unpublished
              .map((u) => `${u.kind} ${u.id} ${u.what}`)
              .join('; ')}.`,
          ]
        : []),
      ...taxonomyLines(taxonomy),
      ...(values.target === 'draft'
        ? [`En el borrador: lo publicado no cambió. Revisión: ${draftReviewUrl(process.env)}`]
        : []),
      `Tiempo: ${((Date.now() - started) / 1000).toFixed(1)} s.`,
    ].join('\n'),
  );
  const notices = taxonomy.flatMap((t) => t.notices.map((n) => `${t.assessmentId}: ${n}`));
  if (notices.length) {
    console.log(
      `\nⓘ ${notices.length} avisos de la taxonomía (no frenan la importación):\n` +
        notices.map((n) => `  - ${n}`).join('\n'),
    );
  }
  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} avisos:\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
    process.exitCode = 2;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
