/**
 * Publishing v1.3 on the content database as production has it: the decks of v1.2 imported (only the
 * package's deck and its Extras, no semester, no creation date), the migration, and then the importer's new
 * bundle saved as CloudTarget saves it. The bundle is the e2e content (apps/web/e2e/content), the importer's
 * output for the test package.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261102000000_deck_tree.sql';

interface Bundle {
  semesters: unknown[];
  courses: unknown[];
  assessments: unknown[];
  ankiNoteTypes: { id: string }[];
  ankiPresets: { name: string }[];
  ankiDecks: { id: string; parentId: string | null; semester?: number | null }[];
  ankiNotes: {
    guid: string;
    hash: string;
    createdAt?: string | null;
    updatedAt?: string;
    media?: string[];
  }[];
}

const bundle = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'apps', 'web', 'e2e', 'content', 'content.json'),
    'utf8',
  ),
) as Bundle;
const DECK = '2059400110';
const EXTRAS = '2059400111';

/** The same bundle as the v1.2 importer wrote it. */
function before(): Bundle {
  return {
    ...bundle,
    ankiDecks: bundle.ankiDecks
      .filter((d) => d.id === DECK || d.id === EXTRAS)
      .map(({ semester: _s, ...d }) => ({ ...d, parentId: d.id === DECK ? null : d.parentId })),
    ankiNotes: bundle.ankiNotes.map(({ createdAt: _c, ...n }) => ({
      ...n,
      hash: `v1.2-${n.hash}`,
    })),
  };
}

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

/** What CloudTarget does with the catalog and the decks of a bundle. Returns the notes it rewrote. */
async function save(b: Bundle) {
  let changed = 0;
  await asService(async (tx) => {
    await tx.query('select public.save_catalog($1)', [
      { semesters: b.semesters, courses: b.courses, assessments: b.assessments },
    ]);
    await tx.query('select public.save_anki_catalog($1)', [
      { noteTypes: b.ankiNoteTypes, presets: b.ankiPresets, decks: b.ankiDecks },
    ]);
    for (const { updatedAt: _u, media: _m, ...note } of b.ankiNotes) {
      const r = await tx.query<{ r: boolean }>('select public.save_anki_note($1) as r', [note]);
      if (r.rows[0]!.r) changed++;
    }
    const pruned = await tx.query<{ r: number }>('select public.prune_anki($1) as r', [
      {
        noteGuids: b.ankiNotes.map((n) => n.guid),
        deckIds: b.ankiDecks.map((d) => d.id),
        noteTypeIds: b.ankiNoteTypes.map((t) => t.id),
        presets: b.ankiPresets.map((p) => p.name),
      },
    ]);
    expect(pruned.rows[0]!.r).toBe(0);
  });
  return changed;
}

const cards = () =>
  db.query('select note_guid, ord, deck_id from anki_cards order by note_guid, ord');
const summaries = () =>
  db.query('select id, parent, assessment_id, card_count from anki_deck_summaries() order by id');

let cardsBefore: unknown[];
let summariesBefore: unknown[];

beforeAll(async () => {
  db = await createDatabase('content', [], MIGRATION);
  await save(before());
  cardsBefore = (await cards()).rows;
  summariesBefore = (await summaries()).rows;
  await applyMigration(db, 'content', MIGRATION);
});

describe('publishing v1.3 on the production content database', () => {
  it('the migration changes nothing the published Worker reads', async () => {
    expect((await summaries()).rows).toEqual(summariesBefore);
    expect((await cards()).rows).toEqual(cardsBefore);
  });

  it('the new import adds the parents and keeps the decks, their ids and every card', async () => {
    expect(await save(bundle)).toBe(bundle.ankiNotes.length);
    expect((await cards()).rows).toEqual(cardsBefore);
    const decks = await db.query<{ id: string; parent: string | null }>(
      'select id, parent from anki_decks order by name collate "C"',
    );
    expect(decks.rows).toEqual(bundle.ankiDecks.map((d) => ({ id: d.id, parent: d.parentId })));
    const created = await db.query<{ missing: number }>(
      'select count(*)::integer as missing from anki_notes where created_at is null',
    );
    expect(created.rows[0]!.missing).toBe(
      bundle.ankiNotes.filter((n) => n.createdAt === null).length,
    );
  });

  it('importing again rewrites nothing', async () => {
    expect(await save(bundle)).toBe(0);
    expect((await cards()).rows).toEqual(cardsBefore);
  });

  it('the new reads see the whole tree; the old one still answers for the package’s deck', async () => {
    const root = bundle.ankiDecks.find((d) => d.parentId === null)!.id;
    const tree = await db.query<{ id: string; card_count: number }>(
      'select id, card_count from anki_deck_tree()',
    );
    expect(tree.rows.map((r) => r.id)).toEqual(bundle.ankiDecks.map((d) => d.id));
    const total = (cardsBefore as unknown[]).length;
    expect(tree.rows.find((r) => r.id === root)!.card_count).toBe(total);
    const detail = await db.query<{ d: { cards: unknown[]; subdecks: unknown[] } }>(
      'select anki_deck_detail($1) as d',
      [root],
    );
    expect(detail.rows[0]!.d.cards).toHaveLength(total);
    expect(detail.rows[0]!.d.subdecks).toHaveLength(bundle.ankiDecks.length - 1);
    const old = await db.query<{ d: { courseId: string; cards: unknown[] } }>(
      'select anki_deck($1) as d',
      [DECK],
    );
    expect(old.rows[0]!.d).toMatchObject({ courseId: 'anatomia-1' });
    expect(old.rows[0]!.d.cards).toHaveLength(total);
  });
});
