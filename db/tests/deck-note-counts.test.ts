// Plan step 3.2 (20261116000000_deck_note_counts.sql): anki_deck_tree() also gives each deck's own notes (a card
// directly in it) and its exclusive notes (every card directly in it), what the home page needs to count new cards
// without the deck.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './pglite';

const ROOT = '1000000000000000001';
const TOPIC = '1000000000000000002';
const EXTRAS = '1000000000000000003';
const OTHER = '1000000000000000004';

let db: PGlite;

const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });

beforeAll(async () => {
  db = await createDatabase('content');
  await db.exec(`
    insert into anki_presets (name, config) values ('Default', '{}'), ('Extras', '{}');
    insert into anki_decks (id, name, parent, preset) values
      ('${ROOT}', 'Raíz', null, 'Default'),
      ('${TOPIC}', 'Raíz::Tema', '${ROOT}', 'Default'),
      ('${EXTRAS}', 'Raíz::Tema::Extras', '${TOPIC}', 'Extras'),
      ('${OTHER}', 'Raíz::Otro', '${ROOT}', 'Default');
    insert into anki_note_types (id, name, kind, fields, templates, css)
      values ('1', 'Cloze', 'cloze', '["Texto"]', '[]', '');
    insert into anki_notes (guid, note_type_id, fields, hash) values
      ('solo-tema', '1', '{}', 'a'), ('partida', '1', '{}', 'b'), ('solo-extras', '1', '{}', 'c'),
      ('otro', '1', '{}', 'd');
    insert into anki_cards (note_guid, ord, deck_id, front_html, back_html) values
      ('solo-tema', 0, '${TOPIC}', '', ''), ('solo-tema', 1, '${TOPIC}', '', ''),
      ('partida', 0, '${TOPIC}', '', ''), ('partida', 1, '${EXTRAS}', '', ''),
      ('solo-extras', 0, '${EXTRAS}', '', ''),
      ('otro', 0, '${OTHER}', '', '');
  `);
});

describe('anki_deck_tree with the notes of each deck', () => {
  it('own notes have a card directly in the deck; exclusive ones, every card; closed ones, every card in its subtree', async () => {
    const r = await asService((tx) =>
      tx.query<{
        id: string;
        note_count: number;
        card_count: number;
        own_note_count: number;
        exclusive_note_count: number;
        closed_note_count: number;
      }>(
        `select id, note_count, card_count, own_note_count, exclusive_note_count, closed_note_count
           from public.anki_deck_tree()`,
      ),
    );
    expect(
      r.rows.map((x) => [
        x.id,
        x.note_count,
        x.card_count,
        x.own_note_count,
        x.exclusive_note_count,
        x.closed_note_count,
      ]),
    ).toEqual([
      [ROOT, 4, 6, 0, 0, 0],
      [OTHER, 1, 1, 1, 1, 1],
      [TOPIC, 3, 5, 2, 1, 2],
      [EXTRAS, 2, 2, 2, 1, 1],
    ]);
  });

  it('only the Worker reads it', async () => {
    const r = await db.query<{ anon: boolean; signed_in: boolean; service: boolean }>(
      `select has_function_privilege('anon', 'public.anki_deck_tree()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.anki_deck_tree()', 'execute') as signed_in,
              has_function_privilege('service_role', 'public.anki_deck_tree()', 'execute') as service`,
    );
    expect(r.rows[0]).toEqual({ anon: false, signed_in: false, service: true });
  });

  it('the draft has the same', async () => {
    const r = await asService((tx) =>
      tx.query<{ n: number }>(
        `select count(*)::integer as n from information_schema.routines
          where routine_schema = 'draft' and routine_name = 'anki_deck_tree'`,
      ),
    );
    expect(r.rows[0]!.n).toBe(1);
    const cols = await db.query<{ name: string }>(
      `select unnest(proargnames) as name from pg_proc
        where pronamespace = 'draft'::regnamespace and proname = 'anki_deck_tree'`,
    );
    expect(cols.rows.map((x) => x.name)).toContain('exclusive_note_count');
  });
});
