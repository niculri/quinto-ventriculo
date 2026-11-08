import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { deckLeafName, deckTree, parentDeckName, readApkgFile } from '@qv/anki-format';
import type { AnkiPackage } from '@qv/anki-format';
import { createCardRenderer, isImageOcclusion, noteSortText } from '@qv/anki-render';
import { ROOT_DECK_NAME, parseCardCode } from '@qv/schema';
import type {
  AnkiDeckRecord,
  AnkiNoteTypeRecord,
  AnkiPresetRecord,
  Assessment,
  ImportedAnkiCard,
  ImportedAnkiNote,
  Semester,
} from '@qv/schema';
import { sanitizeCard } from './card-html';
import { forSite } from './site-note-types';
import type { CatalogCourse } from './manifest';
import type { ImageDataProcessor, ProcessedImage } from './images';
import type { DecksManifest } from './manifest';

/** IMAIOS is for the owner's personal use (its terms): nothing that names it goes up to the site. */
export const IMAIOS = /imaios/i;

/** Does a note name IMAIOS: in a field (an image's file name, the source, the credit) or in a tag? */
export function namesImaios(note: { fields: string[]; tags: string[] }): boolean {
  return note.fields.some((f) => IMAIOS.test(f)) || note.tags.some((t) => IMAIOS.test(t));
}

export interface DecksResult {
  noteTypes: AnkiNoteTypeRecord[];
  presets: AnkiPresetRecord[];
  decks: AnkiDeckRecord[];
  notes: Omit<ImportedAnkiNote, 'hash' | 'updatedAt'>[];
  media: Map<string, ProcessedImage>;
  warnings: string[];
}

export interface DecksOptions {
  manifests: DecksManifest[];
  assessments: Map<string, Assessment>;
  /** The catalog's courses and semesters: the deck names have to say the same. */
  courses: CatalogCourse[];
  semesters: Semester[];
  /** Folder the `apkg` paths are resolved from. */
  root: string;
  process: ImageDataProcessor;
  onProgress?: (message: string) => void;
  /** Reads a package (injected in tests). */
  read?: (path: string) => Promise<AnkiPackage>;
}

/**
 * The published decks: each card rendered like Anki (front and back), its images as WebP with `data-media`,
 * sanitized; plus the note types, presets and decks they need.
 */
export async function buildDecks(op: DecksOptions): Promise<DecksResult> {
  const read = op.read ?? readApkgFile;
  const result: DecksResult = {
    noteTypes: [],
    presets: [],
    decks: [],
    notes: [],
    media: new Map(),
    warnings: [],
  };
  const noteTypes = new Map<string, AnkiNoteTypeRecord>();
  const presets = new Map<string, AnkiPresetRecord>();
  /** The decks of the packages, by full name. */
  const decks = new Map<string, AnkiDeckRecord>();
  const deckIds = new Set<string>();
  const guids = new Set<string>();
  const courses = new Map(op.courses.map((c) => [c.id, c]));
  const semesters = new Map(op.semesters.map((s) => [s.number, s]));

  for (const manifest of op.manifests) {
    const assessment = op.assessments.get(manifest.assessmentId)!;
    const course = courses.get(assessment.courseId);
    const semester = course ? semesters.get(course.semester) : undefined;
    if (!course || !semester) {
      throw new Error(
        `La evaluación ${assessment.id} no tiene su ramo o su semestre en el catálogo.`,
      );
    }
    /** What the first levels of every deck name have to be: root, semester, course, assessment. */
    const expected = [
      ROOT_DECK_NAME,
      semester.name,
      `${course.emoji} ${course.ankiName ?? course.name}`,
      assessment.name,
    ];
    for (const entry of manifest.decks) {
      const label = entry.apkg.split('/').at(-1)!;
      op.onProgress?.(`mazo ${label}`);
      const pkg = await read(resolve(op.root, entry.apkg));
      // The author's note types with the site's presentation (see site-note-types.ts); Anki is untouched.
      const collection = { ...pkg.collection, noteTypes: pkg.collection.noteTypes.map(forSite) };
      const warn = (m: string) => result.warnings.push(`${label}: ${m}`);

      const tree = deckTree(collection);
      if (!tree.length) {
        warn('no tiene tarjetas.');
        continue;
      }
      const presetById = new Map(collection.presets.map((p) => [p.id, p]));
      const included = new Map(tree.map((n) => [n.deck.id, n]));
      for (const node of tree) {
        const { deck } = node;
        if (IMAIOS.test(deck.name)) {
          throw new Error(
            `${label}: «${deck.name}» es un mazo de IMAIOS, que no se sube al sitio. Sácalo de content/decks/.`,
          );
        }
        checkDeckName(label, deck.name, expected, node.cardCount > 0);
        if (deckIds.has(deck.id)) throw new Error(`${label}: el mazo ${deck.id} está repetido.`);
        if (decks.has(deck.name)) {
          throw new Error(
            `${label}: el mazo «${deck.name}» viene en dos paquetes con ids distintos.`,
          );
        }
        deckIds.add(deck.id);
        const preset = deck.presetId ? presetById.get(deck.presetId) : undefined;
        if (preset) {
          const before = presets.get(preset.name);
          if (before && !sameConfig(before.config, preset.config)) {
            warn(
              `el preset «${preset.name}» trae otra configuración que en otro mazo; queda esta.`,
            );
          }
          presets.set(preset.name, { name: preset.name, config: preset.config });
        }
        decks.set(deck.name, {
          id: deck.id,
          name: deck.name,
          description: deck.description,
          // Set below, once every parent exists.
          parentId: null,
          ...levelOf(deck.name, semester.number, course.id, assessment.id),
          preset: preset?.name ?? null,
          // Siblings go by name, as in Anki's deck list.
          position: 0,
        });
      }

      const typeById = new Map(collection.noteTypes.map((t) => [t.id, t]));
      // Note types of this package already taken (each package is compared with the previous ones once).
      const seenTypes = new Set<string>();
      const render = createCardRenderer(collection);
      const imageCache = new Map<string, ProcessedImage | null>();
      const image = async (name: string) => {
        if (!imageCache.has(name)) {
          const data = pkg.readMedia(name) ?? pkg.readMedia(safeDecode(name));
          let processed: ProcessedImage | null = null;
          if (!data) warn(`falta la imagen ${name}.`);
          else {
            try {
              processed = await op.process(data);
              result.media.set(processed.key, processed);
            } catch (e) {
              warn(`no se pudo leer la imagen ${name} (${(e as Error).message}).`);
            }
          }
          imageCache.set(name, processed);
        }
        return imageCache.get(name) ?? null;
      };

      const cardsByNote = new Map<string, typeof collection.cards>();
      for (const c of collection.cards) {
        if (!included.has(c.deckId)) continue;
        cardsByNote.set(c.noteId, [...(cardsByNote.get(c.noteId) ?? []), c]);
      }
      /** The notes left out because they name IMAIOS (their code, or their GUID). */
      const imaios: string[] = [];
      for (const note of collection.notes) {
        const cards = cardsByNote.get(note.id);
        if (!cards) continue;
        if (namesImaios(note)) {
          // Before rendering: none of its images is processed, so nothing of it reaches the bucket.
          imaios.push(
            parseCardCode(note.fields.find((f) => parseCardCode(f)) ?? '')?.code ?? note.guid,
          );
          continue;
        }
        if (guids.has(note.guid)) throw new Error(`${label}: la nota ${note.guid} está repetida.`);
        guids.add(note.guid);
        const type = typeById.get(note.noteTypeId);
        if (!type) {
          warn(`la nota ${note.guid} no tiene su tipo de nota.`);
          continue;
        }
        if (!seenTypes.has(type.id)) {
          seenTypes.add(type.id);
          const record: AnkiNoteTypeRecord = {
            id: type.id,
            name: type.name,
            kind: type.kind,
            occlusion: isImageOcclusion(type),
            fields: type.fields,
            templates: type.templates.map(({ name, qfmt, afmt }) => ({ name, qfmt, afmt })),
            css: type.css,
            sortField: type.sortField,
          };
          // The same note type in two packages exported at different times: the web shows one CSS for
          // all its cards, so it has to be said (as with the presets). The last one stays.
          const before = noteTypes.get(type.id);
          if (before && JSON.stringify(before) !== JSON.stringify(record)) {
            warn(
              `el tipo de nota «${type.name}» trae otra plantilla o CSS que en otro mazo; queda este.`,
            );
          }
          noteTypes.set(type.id, record);
        }
        const fields = Object.fromEntries(
          type.fields.map((name, i) => [name, note.fields[i] ?? '']),
        );
        const codeField = fields['Código'] ?? fields['Codigo'] ?? fields['Code'] ?? '';
        const parsedCode = parseCardCode(codeField);
        const sortField = noteSortText(note.fields, type.sortField);

        const rendered: ImportedAnkiCard[] = [];
        const media = new Set<string>();
        for (const card of cards) {
          const r = render(card);
          const where = `${parsedCode?.code ?? note.guid} (tarjeta ${card.ord + 1})`;
          if (r.error) warn(`${where}: error en la plantilla: ${r.error}`);
          else if (r.isEmpty) warn(`${where}: Anki la mostraría vacía.`);
          const sides: string[] = [];
          for (const html of [r.question, r.answer]) {
            const clean = await sanitizeCard(html, image);
            clean.missing.forEach((m) => warn(`${where}: falta la imagen ${m}.`));
            clean.media.forEach((k) => media.add(k));
            sides.push(clean.html);
          }
          rendered.push({
            ord: card.ord,
            deckId: card.deckId,
            frontHtml: sides[0]!,
            backHtml: sides[1]!,
            sortField,
          });
        }
        result.notes.push({
          guid: note.guid,
          noteTypeId: type.id,
          fields,
          tags: note.tags,
          code: parsedCode?.code ?? null,
          version: parsedCode?.version ?? null,
          createdAt: createdAt(note.id),
          cards: rendered.sort((a, b) => a.ord - b.ord),
          media: [...media].sort(),
        });
      }
      if (imaios.length && !entry.excludeImaios) {
        throw new Error(
          `${label}: ${imaios.length} nota(s) nombran IMAIOS (${imaios.slice(0, 3).join(', ')}${imaios.length > 3 ? '…' : ''}), que no se sube al sitio. Agrega "excludeImaios": true a su entrada en content/decks/ para dejarlas fuera.`,
        );
      }
      op.onProgress?.(
        `  ${included.size} mazos, ${[...cardsByNote.values()].flat().length} tarjetas · ${deckLeafName(tree[0]!.deck.name)}` +
          (imaios.length ? ` · ${imaios.length} notas de IMAIOS fuera` : ''),
      );
    }
  }
  // The parents the packages do not bring (Anki creates them on import): a deck of their own, with the
  // author's «Default» preset and an id derived from the full name, so it does not change between imports.
  for (const d of [...decks.values()]) {
    for (let name = parentDeckName(d.name); name !== null; name = parentDeckName(name)) {
      if (decks.has(name)) continue;
      const id = containerDeckId(name);
      if (deckIds.has(id)) throw new Error(`El id ${id} del mazo «${name}» está repetido.`);
      deckIds.add(id);
      decks.set(name, {
        id,
        name,
        description: '',
        parentId: null,
        ...levelOf(name, d.semester, d.courseId, d.assessmentId),
        preset: DEFAULT_PRESET,
        position: 0,
      });
    }
  }
  if (
    [...decks.values()].some((d) => d.preset === DEFAULT_PRESET) &&
    !presets.has(DEFAULT_PRESET)
  ) {
    presets.set(DEFAULT_PRESET, { name: DEFAULT_PRESET, config: {} });
  }
  result.decks = [...decks.values()]
    .map((d) => {
      const parent = parentDeckName(d.name);
      return { ...d, parentId: parent === null ? null : decks.get(parent)!.id };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  result.noteTypes = [...noteTypes.values()];
  result.presets = [...presets.values()];
  return result;
}

/** The preset Anki gives the decks it creates: the author's «Default» (Anki's defaults if none came). */
const DEFAULT_PRESET = 'Default';

/**
 * Stable id of a parent deck that no package brings, from its full name: 19 digits, so it never meets an
 * Anki id (a creation time in ms, 13 digits).
 */
export function containerDeckId(name: string): string {
  const digest = createHash('sha256').update(`qv-deck:${name}`).digest();
  const n = digest.readBigUInt64BE(0) % 9_000_000_000_000_000_000n;
  return String(n + 1_000_000_000_000_000_000n);
}

/** Root, semester, course and assessment of a deck by the depth of its name (the rest are below them). */
function levelOf(
  name: string,
  semester: number | null,
  courseId: string | null,
  assessmentId: string | null,
): Pick<AnkiDeckRecord, 'semester' | 'courseId' | 'assessmentId'> {
  const depth = name.split('::').length;
  return {
    semester: depth >= 2 ? semester : null,
    courseId: depth >= 3 ? courseId : null,
    assessmentId: depth >= 4 ? assessmentId : null,
  };
}

/**
 * The first levels of a deck name are the root, the semester, the course and the assessment of the
 * manifest (as the catalog names them); a deck with cards is at least at the assessment's level.
 */
function checkDeckName(label: string, name: string, expected: string[], hasCards: boolean) {
  const parts = name.split('::');
  const what = ['la raíz', 'el semestre', 'el ramo', 'el certamen'];
  for (let i = 0; i < Math.min(parts.length, expected.length); i++) {
    if (parts[i] !== expected[i]) {
      throw new Error(
        `${label}: el mazo «${name}» tiene «${parts[i]}» donde va ${what[i]} («${expected[i]}», ` +
          'según content/catalog.json y el manifiesto). Corrige el nombre del mazo en Anki, o el manifiesto ' +
          '(un ramo que en Anki se llama distinto lleva «ankiName» en el catálogo).',
      );
    }
  }
  if (hasCards && parts.length < expected.length) {
    throw new Error(
      `${label}: el mazo «${name}» tiene tarjetas, pero no está dentro de un certamen ` +
        `(«${expected.join('::')}::…»).`,
    );
  }
}

/** Anki's note id is the time it was created, in ms (another number: unknown). */
function createdAt(noteId: string): string | null {
  const ms = Number(noteId);
  return ms >= Date.UTC(2006, 0, 1) && ms <= Date.UTC(2100, 0, 1)
    ? new Date(ms).toISOString()
    : null;
}

function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const strip = ({ id: _i, mod: _m, usn: _u, ...rest }: Record<string, unknown>) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

function safeDecode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
