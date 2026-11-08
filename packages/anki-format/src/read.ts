import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import type {
  AnkiCard,
  AnkiCollection,
  AnkiDeck,
  AnkiNote,
  AnkiNoteType,
  AnkiPackage,
  AnkiPreset,
  AnkiTemplate,
} from './types';

/** An .apkg that this reader cannot open (the message is for the person running the importer). */
export class ApkgError extends Error {
  override name = 'ApkgError';
}

/** Reads an .apkg from disk. */
export async function readApkgFile(path: string): Promise<AnkiPackage> {
  return readApkg(new Uint8Array(await readFile(path)));
}

/**
 * Reads an .apkg in the classic format: a zip with `collection.anki21` or `collection.anki2` (SQLite, schema
 * 11), `media` (JSON «number → file name») and the media files named `0`, `1`, `2`…
 */
export function readApkg(data: Uint8Array): AnkiPackage {
  let names: string[];
  try {
    names = listZipEntries(data);
  } catch (e) {
    throw new ApkgError(`No es un .apkg válido (zip ilegible): ${(e as Error).message}`);
  }
  if (names.includes('collection.anki21b')) {
    throw new ApkgError(
      'Este .apkg usa el formato nuevo de Anki (collection.anki21b, comprimido con zstd), que todavía no ' +
        'se puede leer. Expórtalo con «Compatibilidad con versiones antiguas de Anki» activado.',
    );
  }
  const collectionName = ['collection.anki21', 'collection.anki2'].find((n) => names.includes(n));
  if (!collectionName)
    throw new ApkgError('El .apkg no trae collection.anki2 ni collection.anki21.');

  const files = unzipSync(data, {
    filter: (f) => f.name === collectionName || f.name === 'media',
  });
  const collection = readCollection(files[collectionName]!);
  const mediaMap = parseMediaMap(files['media']);
  const entryByName = new Map(Object.entries(mediaMap).map(([entry, name]) => [name, entry]));

  return {
    collection,
    mediaNames: [...entryByName.keys()].sort(),
    readMedia(name) {
      const entry = entryByName.get(name);
      if (entry === undefined) return null;
      return unzipSync(data, { filter: (f) => f.name === entry })[entry] ?? null;
    },
  };
}

function parseMediaMap(bytes: Uint8Array | undefined): Record<string, string> {
  if (!bytes || bytes.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(bytes));
  } catch {
    throw new ApkgError(
      'El archivo «media» del .apkg no es JSON (formato nuevo de Anki): expórtalo con compatibilidad.',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApkgError('El archivo «media» del .apkg no tiene el formato esperado.');
  }
  const map: Record<string, string> = {};
  for (const [entry, name] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof name === 'string') map[entry] = name;
  }
  return map;
}

/** Names of the entries of a zip, from its central directory (without decompressing anything). */
function listZipEntries(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // End of central directory record: signature 0x06054b50, searched from the end (there may be a comment).
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('sin directorio central');
  let count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    // zip64: let fflate list it (it decompresses, but these packages are small).
    return Object.keys(unzipSync(data));
  }
  const decoder = new TextDecoder();
  const names: string[] = [];
  while (count-- > 0) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('directorio central dañado');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** node:sqlite only opens files: the collection goes to a temporary folder for the time of the read. */
function readCollection(bytes: Uint8Array): AnkiCollection {
  const folder = mkdtempSync(join(tmpdir(), 'qv-apkg-'));
  const path = join(folder, 'collection.sqlite');
  writeFileSync(path, bytes);
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    return readTables(db);
  } catch (e) {
    if (e instanceof ApkgError) throw e;
    throw new ApkgError(`No se pudo leer la colección del .apkg: ${(e as Error).message}`);
  } finally {
    db?.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

type Row = Record<string, unknown>;

function all(db: DatabaseSync, sql: string): Row[] {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement.all() as Row[];
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => Number(v ?? 0);

function readTables(db: DatabaseSync): AnkiCollection {
  const [col] = all(db, 'select ver, models, decks, dconf from col');
  if (!col) throw new ApkgError('La colección del .apkg está vacía (sin tabla col).');
  const schemaVersion = num(col['ver']);
  if (schemaVersion !== 11) {
    throw new ApkgError(
      `La colección del .apkg tiene el esquema ${schemaVersion}; solo se lee el clásico (11). ` +
        'Expórtalo con «Compatibilidad con versiones antiguas de Anki» activado.',
    );
  }
  const noteTypes = Object.values(parseJson(col['models'], 'models')).map(toNoteType);
  const decks = Object.values(parseJson(col['decks'], 'decks')).map(toDeck);
  const presets = Object.values(parseJson(col['dconf'], 'dconf')).map(toPreset);

  const notes: AnkiNote[] = all(db, 'select id, guid, mid, tags, flds from notes order by id').map(
    (r) => ({
      id: str(r['id']),
      guid: str(r['guid']),
      noteTypeId: str(r['mid']),
      fields: str(r['flds']).split('\x1f'),
      tags: canonicalTags(str(r['tags'])),
    }),
  );
  const cards: AnkiCard[] = all(
    db,
    'select id, nid, ord, did, odid, flags from cards order by nid, ord',
  ).map((r) => ({
    id: str(r['id']),
    noteId: str(r['nid']),
    ord: num(r['ord']),
    deckId: str(r['did']),
    originalDeckId: num(r['odid']) ? str(r['odid']) : null,
    flags: num(r['flags']),
  }));

  return { schemaVersion, noteTypes, decks, presets, notes, cards };
}

/** Tags as Anki leaves them when importing: sorted and without repeats, ignoring case. */
function canonicalTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\s\u3000]+/)
    .filter(Boolean)
    .sort((a, b) => {
      const [x, y] = [a.toLowerCase(), b.toLowerCase()];
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

function parseJson(value: unknown, what: string): Record<string, Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(str(value) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, Record<string, unknown>>;
    }
  } catch {
    // falls through to the error
  }
  throw new ApkgError(`La columna col.${what} del .apkg no es JSON válido.`);
}

function toNoteType(m: Record<string, unknown>): AnkiNoteType {
  const fields = (Array.isArray(m['flds']) ? (m['flds'] as Row[]) : [])
    .slice()
    .sort((a, b) => num(a['ord']) - num(b['ord']))
    .map((f) => str(f['name']));
  const templates: AnkiTemplate[] = (Array.isArray(m['tmpls']) ? (m['tmpls'] as Row[]) : [])
    .slice()
    .sort((a, b) => num(a['ord']) - num(b['ord']))
    .map((t) => ({
      name: str(t['name']),
      ord: num(t['ord']),
      qfmt: str(t['qfmt']),
      afmt: str(t['afmt']),
      bqfmt: str(t['bqfmt']),
      bafmt: str(t['bafmt']),
    }));
  const stock = m['originalStockKind'];
  return {
    id: str(m['id']),
    name: str(m['name']),
    kind: num(m['type']) === 1 ? 'cloze' : 'normal',
    fields,
    templates,
    css: str(m['css']),
    sortField: num(m['sortf']),
    originalStockKind: stock === undefined || stock === null ? null : num(stock),
  };
}

function toDeck(d: Record<string, unknown>): AnkiDeck {
  const filtered = num(d['dyn']) === 1;
  return {
    id: str(d['id']),
    name: str(d['name']),
    description: str(d['desc']),
    presetId: filtered || d['conf'] === undefined ? null : str(d['conf']),
    filtered,
  };
}

function toPreset(c: Record<string, unknown>): AnkiPreset {
  return { id: str(c['id']), name: str(c['name']), config: c };
}
