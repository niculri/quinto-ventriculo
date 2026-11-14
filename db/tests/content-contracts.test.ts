// The content database's functions and `jsonb` columns that the Worker parses, against their contracts in
// @qv/schema/content: each one is run as the service role on the importer's small content and has to fit.
import type { PGlite } from '@electric-sql/pglite';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import { CONTENT_RPC, NoteDocument, NoteTypeTemplates, PresetRows } from '@qv/schema/content';
import type { RpcArgs, RpcResult } from '@qv/schema/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BC, article, bundleOf, everything, serviceRpc } from './import-fixtures';
import { createDatabase } from './pglite';

type Name = keyof typeof CONTENT_RPC;

let db: PGlite;
const ran = new Set<Name>();
const store: MediaStore = { has: async () => true, put: async () => {} };

const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

async function argTypes(fn: string) {
  const rows = await service<{ names: string[] | null; types: string }>(
    `select proargnames as names, oidvectortypes(proargtypes) as types
       from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`,
    [fn],
  );
  expect(rows, fn).toHaveLength(1);
  const types = rows[0]!.types ? rows[0]!.types.split(', ') : [];
  return new Map((rows[0]!.names ?? []).map((n, i) => [n, types[i]!]));
}

/** Calls `fn` with named arguments, as PostgREST would, and checks both sides against its contract. */
async function rpc<K extends Name>(fn: K, args: RpcArgs<(typeof CONTENT_RPC)[K]>) {
  const contract = CONTENT_RPC[fn];
  const sent = contract.args.safeParse(args);
  if (!sent.success) throw new Error(`${fn} (arguments): ${sent.error.message}`);
  const types = await argTypes(fn);
  const entries = Object.entries((args ?? {}) as Record<string, unknown>);
  const list = entries.map(([k], i) => `${k} => $${i + 1}::${types.get(k) ?? 'unknown'}`);
  const params = entries.map(([k, v]) => (types.get(k) === 'jsonb' ? JSON.stringify(v) : v));
  const rows = await service<{ r: unknown }>(
    `select public.${fn}(${list.join(', ')}) as r`,
    params,
  );
  const value = rows[0]!.r;
  const got = contract.returns.safeParse(value);
  if (!got.success) throw new Error(`${fn}: ${got.error.message}\n${JSON.stringify(value)}`);
  ran.add(fn);
  return value as RpcResult<(typeof CONTENT_RPC)[K]>;
}

beforeAll(async () => {
  db = await createDatabase('content');
  const published = new CloudTarget({ db: serviceRpc(() => db, []), store });
  const { bundle, media } = bundleOf(everything());
  await published.save(bundle, media);
  await service('select public.reset_draft()');
});

describe('the content database', () => {
  it('site settings', async () => {
    await rpc('site_settings', undefined);
    await rpc('set_site_settings', { p: { hideEmptySemesters: true, by: 'dueno@ug.uchile.cl' } });
    expect((await rpc('site_settings', undefined)).updatedAt).toEqual(expect.any(String));
  });

  it('what the catalog and the student read', async () => {
    expect((await rpc('anki_browse_indexes', undefined)).length).toBeGreaterThan(0);
    expect(await rpc('quiz_detail', { quiz_id: 'practica-bc' })).not.toBeNull();
    expect(await rpc('quiz_detail', { quiz_id: 'no-existe' })).toBeNull();
    expect(await rpc('anki_card', { note_guid: 'bc-1', card_ord: 0 })).not.toBeNull();
    expect(await rpc('anki_card', { note_guid: 'bc-1', card_ord: 9 })).toBeNull();
    await rpc('anki_card_changes_since', { since: 0, max_rows: 10 });
    await rpc('anki_card_changes_since', { since: 0 });
  });

  it('the jsonb columns', async () => {
    const docs = await service<{ d: unknown }>('select document as d from public.notes');
    expect(docs.length).toBeGreaterThan(0);
    for (const { d } of docs) expect(NoteDocument.safeParse(d).success).toBe(true);
    const types = await service<{ t: unknown }>(
      'select templates as t from public.anki_note_types',
    );
    for (const { t } of types) expect(NoteTypeTemplates.safeParse(t).success).toBe(true);
    const presets = await service<{ r: unknown }>(
      `select coalesce(jsonb_agg(jsonb_build_object('name', name, 'config', config)), '[]') as r
         from public.anki_presets`,
    );
    expect(PresetRows.safeParse(presets[0]!.r).success).toBe(true);
  });

  it('a release: media, marks, publishing, the log and undoing', async () => {
    const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });
    const p = everything();
    p.notes.push(article('AP-BC-C2-10', BC, 'Núcleo', 3));
    const { bundle, media } = bundleOf(p);
    await draft.save(bundle, media);
    const page = await rpc('release_media', { after_key: null, max_rows: 1 });
    if (page.next) await rpc('release_media', { after_key: page.next, max_rows: 1 });
    const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
    await rpc('set_release_mark', {
      fingerprint: fp,
      mark: 'phone',
      checked: true,
      checked_by: 'x',
    });
    await rpc('set_release_mark', {
      fingerprint: fp,
      mark: 'answers',
      checked: true,
      checked_by: 'x',
    });
    const done = await rpc('publish_release', {
      p: {
        fingerprint: fp,
        title: 'Biología celular · Certamen 2',
        schemaVersion: 1,
        checks: {
          blocking: 0,
          pending: 0,
          ready: true,
          warnings: [],
          marks: [
            { mark: 'phone', checkedBy: 'x' },
            { mark: 'answers', checkedBy: 'x' },
          ],
        },
        marks: ['phone', 'answers'],
        by: 'dueno@ug.uchile.cl',
      },
    });
    const log = await rpc('release_log', { max_rows: 50 });
    expect(log.releases).toHaveLength(1);
    await rpc('revert_release', { p: { id: done.id, by: 'dueno@ug.uchile.cl' } });
    await rpc('release_log', {});
  });

  it('what was taken off the site', async () => {
    await service(
      `select public.unpublish_content('quiz', 'practica-an', 'Prueba', 'dueño', true)`,
    );
    const r = await rpc('unpublish_log_entries', { max_entries: 200 });
    expect(r.entries).toHaveLength(1);
    await rpc('unpublish_log_entries', {});
  });
});

afterAll(() => {
  expect(Object.keys(CONTENT_RPC).filter((n) => !ran.has(n as Name))).toEqual([]);
});
