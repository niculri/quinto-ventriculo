// Plan step 1.3 (content): the content database remembers which cards moved to another deck or were taken out
// (20261106000000_card_changes.sql), so that each student's progress can follow them when they enter.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const DECK = '2059400110';
const EXTRAS = '2059400111';

const catalog = {
  presets: [{ name: 'Default', config: { id: 1, name: 'Default' } }],
  noteTypes: [
    {
      id: '1607392321',
      name: 'Cloze',
      kind: 'cloze',
      occlusion: false,
      fields: ['Texto'],
      templates: [{ name: 'Cloze', qfmt: '{{cloze:Texto}}', afmt: '{{cloze:Texto}}' }],
      css: '',
      sortField: 0,
    },
  ],
  decks: [
    {
      id: DECK,
      name: 'Raíz::Mazo',
      description: '',
      parentId: null,
      courseId: 'anatomia-1',
      assessmentId: 'anatomia-1/certamen-1',
      preset: 'Default',
      position: 0,
    },
    {
      id: EXTRAS,
      name: 'Raíz::Mazo::Extras',
      description: '',
      parentId: DECK,
      courseId: 'anatomia-1',
      assessmentId: 'anatomia-1/certamen-1',
      preset: 'Default',
      position: 1,
    },
  ],
};

const card = (ord: number, deckId: string, text = `tarjeta ${ord}`) => ({
  ord,
  deckId,
  frontHtml: `<p>${text}</p>`,
  backHtml: `<p>${text}</p>`,
  sortField: text,
});

const note = (guid: string, hash: string, cards: ReturnType<typeof card>[]) => ({
  guid,
  noteTypeId: '1607392321',
  fields: { Texto: guid },
  tags: [],
  code: null,
  version: 1,
  hash,
  cards,
});

const saveNote = (n: object) =>
  asService((tx) => tx.query('select public.save_anki_note($1)', [n]));

interface Page {
  changes: { noteGuid: string; ord: number; deckId: string | null }[];
  next: number;
  latest: number;
  more: boolean;
}

const changesSince = async (since: number, max?: number) =>
  (
    await asService((tx) =>
      tx.query<{ r: Page }>(
        max === undefined
          ? 'select public.anki_card_changes_since($1) as r'
          : 'select public.anki_card_changes_since($1, $2) as r',
        max === undefined ? [since] : [since, max],
      ),
    )
  ).rows[0]!.r;

const keep = (noteGuids: string[]) => ({
  noteGuids,
  deckIds: [DECK, EXTRAS],
  noteTypeIds: ['1607392321'],
  presets: ['Default'],
});

beforeAll(async () => {
  db = await createDatabase('content');
  await db.exec(`
    insert into semesters values (1, '1° Semestre');
    insert into courses values ('anatomia-1', 1, 'Anatomía I', '🦴', 3);
    insert into assessments values ('anatomia-1/certamen-1', 'anatomia-1', 'Certamen 1', 1);
  `);
  await asService((tx) => tx.query('select public.save_anki_catalog($1)', [catalog]));
});

describe('what the content remembers', () => {
  it('a card published for the first time leaves nothing: nobody has progress in it', async () => {
    await saveNote(note('n1', 'a', [card(0, DECK), card(1, DECK)]));
    await saveNote(note('n2', 'a', [card(0, DECK)]));
    expect(await changesSince(0)).toEqual({ changes: [], next: 0, latest: 0, more: false });
  });

  it('a card that goes to another deck, with its new deck; one whose text changed, nothing', async () => {
    await saveNote(note('n1', 'b', [card(0, DECK, 'otro texto'), card(1, EXTRAS)]));
    const page = await changesSince(0);
    expect(page.changes).toEqual([{ noteGuid: 'n1', ord: 1, deckId: EXTRAS }]);
    expect(page.more).toBe(false);
    expect(page.next).toBe(page.latest);
    expect(page.next).toBeGreaterThan(0);
  });

  it('a card taken out of its note, and a whole note taken out, without a deck', async () => {
    const before = (await changesSince(0)).latest;
    await saveNote(note('n1', 'c', [card(0, DECK, 'otro texto')]));
    await asService((tx) => tx.query('select public.prune_anki($1)', [keep(['n1'])]));
    const page = await changesSince(before);
    expect(page.changes).toEqual([
      { noteGuid: 'n1', ord: 1, deckId: null },
      { noteGuid: 'n2', ord: 0, deckId: null },
    ]);
  });

  it('a card that comes back says where it is now, and each card is there once', async () => {
    const before = (await changesSince(0)).latest;
    await saveNote(note('n2', 'b', [card(0, EXTRAS)]));
    await saveNote(note('n1', 'd', [card(0, DECK, 'otro texto'), card(1, DECK)]));
    expect((await changesSince(before)).changes).toEqual([
      { noteGuid: 'n2', ord: 0, deckId: EXTRAS },
      { noteGuid: 'n1', ord: 1, deckId: DECK },
    ]);
    // From the beginning: the last thing that happened to each card, once.
    expect((await changesSince(0)).changes).toEqual([
      { noteGuid: 'n2', ord: 0, deckId: EXTRAS },
      { noteGuid: 'n1', ord: 1, deckId: DECK },
    ]);
  });

  it('in pages: «next» is where the next page starts, and «more» says there is one', async () => {
    const first = await changesSince(0, 1);
    expect(first.changes).toHaveLength(1);
    expect(first.more).toBe(true);
    const second = await changesSince(first.next, 1);
    expect(second.changes).toHaveLength(1);
    expect(second.more).toBe(false);
    expect(second.next).toBe(second.latest);
    expect([...first.changes, ...second.changes]).toEqual((await changesSince(0)).changes);
    // Past the end: nothing, and the cursor stays.
    expect(await changesSince(second.latest)).toEqual({
      changes: [],
      next: second.latest,
      latest: second.latest,
      more: false,
    });
  });

  it('a content database made again numbers its changes after any cursor of the one before', async () => {
    const before = (await changesSince(0)).latest;
    expect(before).toBeGreaterThan(Date.parse('2026-01-01'));
    const again = await createDatabase('content');
    await again.exec(`
      insert into semesters values (1, '1° Semestre');
      insert into courses values ('anatomia-1', 1, 'Anatomía I', '🦴', 3);
      insert into assessments values ('anatomia-1/certamen-1', 'anatomia-1', 'Certamen 1', 1);
    `);
    const service = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
      again.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return fn(tx);
      });
    await service((tx) => tx.query('select public.save_anki_catalog($1)', [catalog]));
    await service((tx) =>
      tx.query('select public.save_anki_note($1)', [note('n9', 'a', [card(0, DECK)])]),
    );
    await service((tx) =>
      tx.query('select public.save_anki_note($1)', [note('n9', 'b', [card(0, EXTRAS)])]),
    );
    // A student whose cursor is `before` (the old database) still gets the change of the new one.
    const page = (
      await service((tx) =>
        tx.query<{ r: Page }>('select public.anki_card_changes_since($1) as r', [before]),
      )
    ).rows[0]!.r;
    expect(page.changes).toEqual([{ noteGuid: 'n9', ord: 0, deckId: EXTRAS }]);
    await again.close();
  });

  it('only the API (service_role) reads it', async () => {
    for (const who of [ANA, null]) {
      await expect(
        asUser(db, who, (tx) => tx.query('select * from public.anki_card_changes')),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, who, (tx) => tx.query('select public.anki_card_changes_since(0)')),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      asService((tx) =>
        tx.query('insert into public.anki_card_changes (note_guid, ord) values ($1, 0)', ['x']),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
