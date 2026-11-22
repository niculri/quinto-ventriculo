// Runs `npm run import`: builds the content bundle and writes it to the dry-run folder or to the draft.
import { resolve } from 'node:path';
import { buildBundle } from '../bundle/build';
import { sameUnpublished } from '../bundle/unpublished';
import { ImportError } from '../ImportError';
import { ImageCache } from '../media/ImageCache';
import { readManifest, readUnpublished } from '../manifest/read';
import { contentFolder, requireContentFolder } from '../privateFolder';
import { FolderTarget } from '../targets/FolderTarget';
import { CloudTarget } from '../targets/cloud';
import { cloudConfigFromEnv, draftReviewUrl } from '../targets/cloudConfig';
import { contentDatabase } from '../targets/contentDatabase';
import type { Target } from '../targets/target';
import { HELP, parseImportArgs } from './importArgs';
import type { ImportArgs } from './importArgs';
import { noticesOf, summaryOf } from './importReport';

/** Where the material, the dry-run folder and the image cache are unless the options say another place. */
export function pathsOf(args: Pick<ImportArgs, 'root' | 'output' | 'cache'>, repo: string) {
  return {
    root: resolve(args.root ?? resolve(repo, '..')),
    output: resolve(repo, args.output ?? '.output'),
    cache: resolve(repo, args.cache ?? '.cache/images'),
  };
}

function targetOf(args: ImportArgs, output: string): Target {
  if (args.target === 'draft') {
    return CloudTarget.fromConfig(cloudConfigFromEnv(process.env), 'draft');
  }
  return new FolderTarget(output, args.only.length > 0);
}

export async function runImport(argv?: string[]): Promise<void> {
  const args = parseImportArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }
  const repo = resolve(import.meta.dirname, '../../../..');
  const { root, output, cache: cacheFolder } = pathsOf(args, repo);
  // After the options, so a wrong one says so even without the private repository.
  const content = requireContentFolder(contentFolder(args.content));
  const manifest = await readManifest(content);
  const { unpublished } = manifest;
  const started = Date.now();
  const cache = await ImageCache.open(cacheFolder);
  const built = await buildBundle({
    manifest,
    root,
    process: cache.file,
    processCardImage: cache.card,
    processQuizImage: cache.quiz,
    assessments: args.assessments,
    only: args.only,
    onlyDecks: args.onlyDecks,
    onlyTests: args.onlyTests,
    onProgress: (m) => console.log(`· ${m}`),
  });
  const { warnings } = built;
  const remote = args.target === 'draft';
  const target = targetOf(args, output);

  if (remote && warnings.length && !args.allowWarnings) {
    console.error(
      `\n⚠ ${warnings.length} avisos; no se subió nada (usa --allow-warnings para subir igual):\n` +
        warnings.map((w) => `  - ${w}`).join('\n'),
    );
    process.exitCode = 2;
    return;
  }

  // An `npm run unpublish` during the build would otherwise be undone.
  const listNow = await readUnpublished(resolve(content, 'unpublished.json'));
  if (!sameUnpublished(listNow, unpublished)) {
    throw new ImportError(
      'material',
      'content/unpublished.json cambió mientras se armaba la importación (¿un npm run unpublish?): no se escribió nada. Vuelve a importar.',
    );
  }
  if (args.resetDraft) {
    const r = await contentDatabase(cloudConfigFromEnv(process.env)).rpc('reset_draft', {});
    if (r.error) throw new ImportError('cloud', `reset_draft: ${r.error.message}`);
    console.log('· borrador igual a lo publicado (reset_draft)');
  }

  const report = await target.save(built.bundle, built.media, {
    notes: built.notesIncluded,
    decks: built.decksIncluded,
    tests: built.testsIncluded,
    partialNotes: args.only.length > 0,
    ...(args.assessments.length ? { assessments: args.assessments } : {}),
    unpublished,
  });
  console.log(
    summaryOf({
      built,
      bundle: built.bundle,
      report,
      assessments: args.assessments,
      remote,
      images: { misses: cache.misses, hits: cache.hits },
      reviewUrl: remote ? draftReviewUrl(process.env) : null,
      seconds: (Date.now() - started) / 1000,
    }),
  );
  const notices = noticesOf(built);
  if (notices) console.log(notices);
  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} avisos:\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
    process.exitCode = 2;
  }
}
