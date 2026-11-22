// Builds small .apkg files for the reader’s tests: a SQLite collection written with node:sqlite, zipped with fflate.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';

export interface SampleCollection {
  ver?: number;
  models?: unknown;
  decks?: unknown;
  dconf?: unknown;
  notes?: { id: number; guid: string; mid: number; tags: string; flds: string }[];
  cards?: { id: number; nid: number; ord: number; did: number; odid?: number; flags?: number }[];
  emptyCol?: boolean;
}

const json = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? {}));

export function collectionBytes(c: SampleCollection = {}): Uint8Array {
  const folder = mkdtempSync(join(tmpdir(), 'qv-apkg-test-'));
  const path = join(folder, 'c.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`create table col (ver integer, models text, decks text, dconf text);
      create table notes (id integer, guid text, mid integer, tags text, flds text);
      create table cards (id integer, nid integer, ord integer, did integer, odid integer, flags integer);`);
    if (!c.emptyCol) {
      db.prepare('insert into col values (?, ?, ?, ?)').run(
        c.ver ?? 11,
        json(c.models),
        json(c.decks),
        json(c.dconf),
      );
    }
    for (const n of c.notes ?? []) {
      db.prepare('insert into notes values (?, ?, ?, ?, ?)').run(
        n.id,
        n.guid,
        n.mid,
        n.tags,
        n.flds,
      );
    }
    for (const k of c.cards ?? []) {
      db.prepare('insert into cards values (?, ?, ?, ?, ?, ?)').run(
        k.id,
        k.nid,
        k.ord,
        k.did,
        k.odid ?? 0,
        k.flags ?? 0,
      );
    }
    db.close();
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function apkgBytes(
  c: SampleCollection = {},
  media: string | null = '{}',
  files: Record<string, Uint8Array> = {},
): Uint8Array {
  return zipSync({
    'collection.anki2': collectionBytes(c),
    ...(media === null ? {} : { media: strToU8(media) }),
    ...files,
  });
}
