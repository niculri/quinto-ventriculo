import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReleaseMark, ReleaseRecord } from '@qv/schema';
import type { ReleaseRepository } from '../repository';

/**
 * The release panel without a database (demo mode and the e2e tests): what `release_*` of the content database gave
 * for a folder's published content and its draft, saved in `<folder>/release/` (`summary.json`; `items.json`,
 * `{ "<assessment>|<kind>": [items] }`; `texts.json`; `media.json`). The e2e folder's are written by the database's
 * test (`db/tests/release.test.ts`) from the real SQL. Without the folder, a draft equal to what is published.
 * The marks stay in memory, and so do publishing and undoing (step 1.7, part 3): published, the draft is what is
 * published (an empty summary); undone, it is the folder's again. Nothing is written in the folder.
 */
export async function folderReleaseRepository(folder: string): Promise<ReleaseRepository> {
  const read = async <T>(name: string, fallback: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(join(folder, 'release', name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  };
  const summary = await read<Record<string, unknown>>('summary.json', {
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
  });
  const items = await read<Record<string, { guid?: string; id?: string; key?: string }[]>>(
    'items.json',
    {},
  );
  const texts = await read<{ key: string }[]>('texts.json', []);
  const browseIndexes = await read<unknown[]>('browse-indexes.json', []);
  const media = await read<string[]>('media.json', []);
  const draftFingerprint = String(summary.fingerprint);
  /** The fingerprint of a draft equal to what is published, after publishing it. */
  const publishedFingerprint = 'f'.repeat(32);
  const empty = {
    ...summary,
    fingerprint: publishedFingerprint,
    unpublished: [],
    catalog: [],
    noteTypes: [],
    presets: [],
    decks: [],
    assessments: [],
    findings: [],
  };
  let published = false;
  const fingerprint = () => (published ? publishedFingerprint : draftFingerprint);
  let marks: ReleaseMark[] = [];
  const log: ReleaseRecord[] = [];
  const PAGE = 200;
  const pageOf = <T>(list: T[], key: (x: T) => string, after: string | null, size: number) => {
    const rest = list.filter((x) => after === null || key(x) > after);
    const items = rest.slice(0, size);
    return { items, next: rest.length > size ? key(items.at(-1)!) : null };
  };
  return {
    async summaryJson() {
      return JSON.stringify({ ...(published ? empty : summary), marks });
    },
    async browseIndexesJson() {
      return JSON.stringify(published ? [] : browseIndexes);
    },
    async itemsJson(assessment, kind, after) {
      const list = published ? [] : (items[`${assessment}|${kind}`] ?? []);
      return JSON.stringify(pageOf(list, (x) => x.guid ?? x.key ?? x.id ?? '', after, PAGE));
    },
    async textsJson(after) {
      return JSON.stringify(pageOf(published ? [] : texts, (x) => x.key, after, 500));
    },
    async media(after, limit) {
      const p = pageOf(published ? [] : media, (k) => k, after, limit);
      return { keys: p.items, next: p.next };
    },
    async setMark(fp, mark, checked, by) {
      if (fp !== fingerprint()) return 'stale';
      marks = marks.filter((m) => m.mark !== mark);
      if (checked) {
        marks = [...marks, { mark, checkedBy: by, checkedAt: new Date().toISOString() }].sort(
          (a, b) => a.mark.localeCompare(b.mark),
        );
      }
      return marks;
    },
    async publish(input) {
      const refused = (reason: string) => ({ ok: false as const, reason, detail: null });
      if (input.fingerprint !== fingerprint()) return refused('fingerprint');
      if (published) return refused('empty');
      if (summary.schemaVersion !== input.schemaVersion) return refused('schema_version');
      const wanted = new Set(['phone', 'answers', ...input.marks]);
      if ([...wanted].some((m) => !marks.some((x) => x.mark === m))) return refused('marks');
      if (input.checks.blocking !== 0 || !input.checks.ready) return refused('blocked');
      for (const r of log) r.canRevert = false;
      const record: ReleaseRecord = {
        id: log.length + 1,
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
      log.unshift(record);
      published = true;
      marks = [];
      return {
        ok: true,
        result: {
          id: record.id,
          title: record.title,
          publishedAt: record.publishedAt,
          changes: {},
        },
      };
    },
    async revert(id, by) {
      const last = log[0];
      if (!last || last.id !== id) return { ok: false, reason: 'not_last', detail: null };
      if (last.status !== 'published') return { ok: false, reason: 'reverted', detail: null };
      last.status = 'reverted';
      last.revertedAt = new Date().toISOString();
      last.revertedBy = by;
      last.canRevert = false;
      published = false;
      marks = [];
      return { ok: true, result: { id, revertedAt: last.revertedAt, changes: {} } };
    },
    async log() {
      return { releases: log.map((r) => ({ ...r })) };
    },
  };
}
