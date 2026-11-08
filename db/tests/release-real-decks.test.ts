// Plan step 1.7, part 2 (B4 «Listo cuando»): with real decks, an earlier version against the current one gives exactly
// the known changes, and no changed answer of the ones classified by hand comes out as «format».
//
// The decks are the author's: two versions of the same decks, before and after a sweep of changes. The earlier
// version goes to public, the current one to the draft, as an import would put them. The known changes are what a
// script outside this code says (it reads the .apkg with sqlite). The hand labels were made by an agent that saw only
// each note's before and after, not the classifier. Which decks, the script, the labels and how many notes changed
// are in the private repository (tests/real-material.json, step 2.4): without it (the public CI) or python3, it is
// skipped.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CloudTarget,
  buildBundle,
  materialPath,
  privateMaterial,
  readManifest,
  realMaterialHere,
} from '@qv/importer';
import type { Manifest, MediaStore, ProcessedImage } from '@qv/importer';
import { ReleaseCardItem, ReleaseSummary } from '@qv/schema';
import { serviceRpc } from './import-fixtures';
import { createDatabase } from './pglite';

const PRIVATE = privateMaterial();
const REAL = PRIVATE.config?.releaseDecks;
const ROOT = PRIVATE.root;
const BC = REAL?.assessmentId ?? '';
const DECKS = REAL?.decks ?? [];
const COMPARE = REAL ? materialPath(ROOT, REAL.compare) : '';
const LABELS = REAL ? materialPath(PRIVATE.folder!, REAL.labels) : '';

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
})();
const available =
  !!REAL &&
  hasPython &&
  realMaterialHere([
    COMPARE,
    LABELS,
    ...DECKS.flatMap((d) => [materialPath(ROOT, d.before), materialPath(ROOT, d.now)]),
  ]);

/** The images, without converting them: their key is the hash of their bytes (what matters here is the text). */
const fakeImage = async (data: Uint8Array): Promise<ProcessedImage> => ({
  key: `cards/${createHash('sha256').update(data).digest('hex').slice(0, 32)}.webp`,
  width: 10,
  height: 10,
  contentType: 'image/webp',
  read: async () => Buffer.from(data),
});

async function bundleOfDecks(paths: string[]) {
  const real = await readManifest(PRIVATE.content!, { history: null, taxonomies: false });
  const manifest: Manifest = {
    ...real,
    notes: [],
    tests: [],
    unpublished: [],
    decks: [{ assessmentId: BC, decks: paths.map((apkg) => ({ apkg })) }],
  };
  const r = await buildBundle({
    manifest,
    root: ROOT,
    process: async () => {
      throw new Error('no articles here');
    },
    processCardImage: fakeImage,
    onlyDecks: true,
    assessments: [BC],
  });
  return r;
}

interface Known {
  changed: Set<string>;
  lost: number;
  added: number;
}

/** What comparar_mazos.py says of each deck: the codes of the notes that changed (not counting code and dates). */
function known(): Known {
  const out: Known = { changed: new Set(), lost: 0, added: 0 };
  for (const d of DECKS) {
    let text: string;
    try {
      text = execFileSync(
        'python3',
        [COMPARE, materialPath(ROOT, d.before), materialPath(ROOT, d.now)],
        {
          encoding: 'utf8',
          maxBuffer: 50_000_000,
        },
      );
    } catch (e) {
      // It exits with 1 when a GUID was lost or appeared: its output is still the report.
      text = (e as { stdout: string }).stdout;
    }
    for (const m of text.matchAll(/^● (.+)$/gm)) out.changed.add(m[1]!.trim());
    const g = /GUID perdidos: (\d+) · GUID nuevos: (\d+)/.exec(text)!;
    out.lost += Number(g[1]);
    out.added += Number(g[2]);
  }
  return out;
}

const IGNORED = new Set(['Código', 'Creación', 'Actualización']);

describe.skipIf(!available)(
  available
    ? 'with real decks (two versions of the same decks)'
    : `with real decks (se salta: ${PRIVATE.skipReason || 'falta el material real o python3'})`,
  () => {
    let db: PGlite;
    const notes: ReleaseCardItem[] = [];
    let summary: ReleaseSummary;
    const store: MediaStore = { has: async () => true, put: async () => {} };

    beforeAll(async () => {
      db = await createDatabase('content');
      const pub = new CloudTarget({ db: serviceRpc(() => db, []), store });
      const dra = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });
      const old = await bundleOfDecks(DECKS.map((d) => d.before));
      await pub.save(old.bundle, old.media, {
        notes: false,
        decks: true,
        tests: false,
        assessments: [BC],
      });
      await db.query('select public.reset_draft()');
      const current = await bundleOfDecks(DECKS.map((d) => d.now));
      await dra.save(current.bundle, current.media, {
        notes: false,
        decks: true,
        tests: false,
        assessments: [BC],
        unpublished: [],
      });
      const service = async <T>(sql: string, params: unknown[] = []) =>
        db.transaction(async (tx) => {
          await tx.exec('set local role service_role');
          return (await tx.query<{ r: T }>(sql, params)).rows[0]!.r;
        });
      summary = ReleaseSummary.parse(await service('select public.release_summary() as r'));
      for (let after: string | null = null; ;) {
        const page: { items: unknown[]; next: string | null } = await service(
          `select public.release_items($1, 'card', $2, 500) as r`,
          [BC, after],
        );
        notes.push(...page.items.map((i) => ReleaseCardItem.parse(i)));
        after = page.next;
        if (!after) break;
      }
    }, 300_000);

    it('gives exactly the known changes', () => {
      const k = known();
      const code = (n: ReleaseCardItem) =>
        n.fieldsAfter?.['Código'] ?? n.fieldsBefore?.['Código'] ?? n.guid;
      expect(notes.filter((n) => n.op === 'removed')).toHaveLength(k.lost);
      expect(notes.filter((n) => n.op === 'added')).toHaveLength(k.added);
      // A field (not the code nor the dates) that is not the same, character for character: comparar_mazos.py's.
      const rawChanged = notes.filter(
        (n) =>
          n.op === 'changed' &&
          Object.keys({ ...n.fieldsBefore, ...n.fieldsAfter }).some(
            (f) => !IGNORED.has(f) && (n.fieldsBefore?.[f] ?? '') !== (n.fieldsAfter?.[f] ?? ''),
          ),
      );
      expect(new Set(rawChanged.map(code))).toEqual(k.changed);
      expect(k.changed.size).toBe(REAL!.changed);
      // The rest of the changed notes only changed their code or dates (or their cards' rendering): never «answer».
      for (const n of notes.filter((x) => x.op === 'changed' && !rawChanged.includes(x))) {
        expect([n.code, n.classification]).toEqual([
          n.code,
          expect.stringMatching(/^(no_answer|format)$/),
        ]);
      }
      const a = summary.assessments.find((x) => x.id === BC)!;
      expect(a.cards.notes).toBe(notes.length);
    });

    it('no changed answer of the ones classified by hand is «format»', () => {
      if (process.env.QV_WRITE_HAND_SAMPLE) {
        // The sample for the hand classification: 50 notes whose text changed, half of them of the ones this classifier
        // calls «answer» and half of the others (where a mistake would hide a changed answer), in an order that says
        // nothing of the classifier (by a hash of the GUID). Only the fields that changed, before and after.
        const changed = notes.filter(
          (n) =>
            n.op === 'changed' &&
            Object.keys({ ...n.fieldsBefore, ...n.fieldsAfter }).some(
              (f) => !IGNORED.has(f) && (n.fieldsBefore?.[f] ?? '') !== (n.fieldsAfter?.[f] ?? ''),
            ),
        );
        const order = (n: ReleaseCardItem) => createHash('sha256').update(n.guid).digest('hex');
        const byOrder = (a: ReleaseCardItem, b: ReleaseCardItem) =>
          order(a).localeCompare(order(b));
        const others = changed.filter((n) => n.classification !== 'answer').sort(byOrder);
        const answers = changed.filter((n) => n.classification === 'answer').sort(byOrder);
        const half = Math.min(25, answers.length);
        const sample = [...answers.slice(0, half), ...others.slice(0, 50 - half)]
          .sort((a, b) => order(a).localeCompare(order(b)))
          .map((n) => ({
            guid: n.guid,
            code: n.fieldsAfter?.['Código'] ?? null,
            noteType: n.noteType?.name ?? null,
            fields: Object.fromEntries(
              Object.keys({ ...n.fieldsBefore, ...n.fieldsAfter })
                .filter(
                  (f) =>
                    !IGNORED.has(f) && (n.fieldsBefore?.[f] ?? '') !== (n.fieldsAfter?.[f] ?? ''),
                )
                .map((f) => [
                  f,
                  { before: n.fieldsBefore?.[f] ?? '', after: n.fieldsAfter?.[f] ?? '' },
                ]),
            ),
          }));
        writeFileSync(process.env.QV_WRITE_HAND_SAMPLE, `${JSON.stringify(sample, null, 2)}\n`);
      }
      const labels = JSON.parse(readFileSync(LABELS, 'utf8')) as {
        labels: { guid: string; label: 'answer' | 'no_answer' | 'format' }[];
      };
      expect(labels.labels).toHaveLength(50);
      const byGuid = new Map(notes.map((n) => [n.guid, n]));
      const answers = labels.labels.filter((l) => l.label === 'answer');
      expect(answers.length).toBeGreaterThan(0);
      if (process.env.QV_HAND_AGREEMENT) {
        const table: Record<string, number> = {};
        for (const l of labels.labels) {
          const k = `${l.label} → ${byGuid.get(l.guid)?.classification ?? '?'}`;
          table[k] = (table[k] ?? 0) + 1;
        }
        writeFileSync(process.env.QV_HAND_AGREEMENT, `${JSON.stringify(table, null, 2)}\n`);
      }
      for (const l of answers) {
        const n = byGuid.get(l.guid);
        expect(n, l.guid).toBeDefined();
        expect([l.guid, n!.classification]).not.toEqual([l.guid, 'format']);
      }
    });
  },
);
