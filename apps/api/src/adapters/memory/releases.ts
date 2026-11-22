// The release panel without a database (demo and e2e): the `release_*` answers saved in `<folder>/release/`, with
// marks, publishing and undoing kept in memory. Nothing is written in the folder.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReleaseMark, ReleaseRecord } from '@qv/schema';
import type { PublishInput, ReleaseRepository } from '../../ports/releases';
import { resolved } from './resolved';

type Summary = Record<string, unknown>;

interface ReleaseFiles {
  summary: Summary;
  items: Record<string, { guid?: string; id?: string; key?: string }[]>;
  texts: { key: string }[];
  browseIndexes: unknown[];
  media: string[];
}

const NO_SUMMARY: Summary = {
  fingerprint: '0'.repeat(32),
  schemaVersion: null,
  unpublished: [],
  marks: [],
  catalog: [],
  noteTypes: [],
  presets: [],
  decks: [],
  assessments: [],
  findings: [],
};

const PUBLISHED_FINGERPRINT = 'f'.repeat(32);
const PAGE = 200;
const TEXTS_PAGE = 500;

async function readFiles(folder: string): Promise<ReleaseFiles> {
  const read = async <T>(name: string, fallback: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(join(folder, 'release', name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  };
  return {
    summary: await read<Summary>('summary.json', NO_SUMMARY),
    items: await read<ReleaseFiles['items']>('items.json', {}),
    texts: await read<ReleaseFiles['texts']>('texts.json', []),
    browseIndexes: await read<unknown[]>('browse-indexes.json', []),
    media: await read<string[]>('media.json', []),
  };
}

const pageOf = <T>(list: T[], key: (x: T) => string, after: string | null, size: number) => {
  const rest = list.filter((x) => after === null || key(x) > after);
  const items = rest.slice(0, size);
  return { items, next: rest.length > size ? key(items.at(-1)!) : null };
};

/** `items.json` is `{ "<assessment>|<kind>": [items] }`; `db/tests/__tests__/release.flow.test.ts` writes the e2e folder's files. */
export async function folderReleaseRepository(folder: string): Promise<ReleaseRepository> {
  return releaseStore(await readFiles(folder));
}

interface ReleaseState {
  published: boolean;
  marks: ReleaseMark[];
  log: ReleaseRecord[];
}

/** What the panel is told is the draft's fingerprint, or the published one once the draft went out. */
const fingerprintOf = (files: ReleaseFiles, state: ReleaseState) =>
  state.published ? PUBLISHED_FINGERPRINT : String(files.summary.fingerprint);

function setMark(
  files: ReleaseFiles,
  state: ReleaseState,
  fp: string,
  mark: ReleaseMark['mark'],
  checked: boolean,
  by: string,
) {
  if (fp !== fingerprintOf(files, state)) return 'stale';
  state.marks = state.marks.filter((m) => m.mark !== mark);
  if (checked) {
    state.marks = [
      ...state.marks,
      { mark, checkedBy: by, checkedAt: new Date().toISOString() },
    ].sort((a, b) => a.mark.localeCompare(b.mark));
  }
  return state.marks;
}

function publish(files: ReleaseFiles, state: ReleaseState, input: PublishInput) {
  const refused = (reason: string) => ({ ok: false as const, reason, detail: null });
  if (input.fingerprint !== fingerprintOf(files, state)) return refused('fingerprint');
  if (state.published) return refused('empty');
  if (files.summary.schemaVersion !== input.schemaVersion) return refused('schema_version');
  const wanted = new Set(['phone', 'answers', ...input.marks]);
  if ([...wanted].some((m) => !state.marks.some((x) => x.mark === m))) return refused('marks');
  if (input.checks.blocking !== 0 || !input.checks.ready) return refused('blocked');
  for (const r of state.log) r.canRevert = false;
  const record: ReleaseRecord = {
    id: state.log.length + 1,
    status: 'published',
    title: input.title,
    schemaVersion: input.schemaVersion,
    publishedAt: new Date().toISOString(),
    publishedBy: input.by,
    revertedAt: null,
    revertedBy: null,
    changes: {},
    canRevert: true,
  };
  state.log.unshift(record);
  state.published = true;
  state.marks = [];
  return {
    ok: true as const,
    result: { id: record.id, title: record.title, publishedAt: record.publishedAt, changes: {} },
  };
}

function revert(state: ReleaseState, id: number, by: string) {
  const last = state.log[0];
  if (last?.id !== id) return { ok: false as const, reason: 'not_last', detail: null };
  if (last.status !== 'published') return { ok: false as const, reason: 'reverted', detail: null };
  last.status = 'reverted';
  last.revertedAt = new Date().toISOString();
  last.revertedBy = by;
  last.canRevert = false;
  state.published = false;
  state.marks = [];
  return { ok: true as const, result: { id, revertedAt: last.revertedAt, changes: {} } };
}

function releaseStore(files: ReleaseFiles) {
  const { summary, items, texts, browseIndexes, media } = files;
  const empty = {
    ...summary,
    fingerprint: PUBLISHED_FINGERPRINT,
    unpublished: [],
    catalog: [],
    noteTypes: [],
    presets: [],
    decks: [],
    assessments: [],
    findings: [],
  };
  const state: ReleaseState = { published: false, marks: [], log: [] };

  return {
    summaryJson: () =>
      resolved(() =>
        JSON.stringify({ ...(state.published ? empty : summary), marks: state.marks }),
      ),
    browseIndexesJson: () => resolved(() => JSON.stringify(state.published ? [] : browseIndexes)),
    itemsJson: (assessment, kind, after) =>
      resolved(() => {
        const list = state.published ? [] : (items[`${assessment}|${kind}`] ?? []);
        return JSON.stringify(pageOf(list, (x) => x.guid ?? x.key ?? x.id ?? '', after, PAGE));
      }),
    textsJson: (after) =>
      resolved(() =>
        JSON.stringify(pageOf(state.published ? [] : texts, (x) => x.key, after, TEXTS_PAGE)),
      ),
    media: (after, limit) =>
      resolved(() => {
        const p = pageOf(state.published ? [] : media, (k) => k, after, limit);
        return { keys: p.items, next: p.next };
      }),
    setMark: (fp, mark, checked, by) =>
      resolved(() => setMark(files, state, fp, mark, checked, by)),
    publish: (input) => resolved(() => publish(files, state, input)),
    revert: (id, by) => resolved(() => revert(state, id, by)),
    log: () => resolved(() => ({ releases: state.log.map((r) => ({ ...r })) })),
  } satisfies ReleaseRepository;
}
