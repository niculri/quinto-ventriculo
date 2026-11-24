// Reads one .apkg of an assessment: its decks, presets, and the notes of the cards it brings, rendered and sanitized.
import { resolve } from 'node:path';
import { deckLeafName, deckTree, readApkgFile } from '@qv/anki-format';
import type { AnkiCollection, AnkiPackage, DeckNode } from '@qv/anki-format';
import { createCardRenderer } from '@qv/anki-render';
import { sanitizeCard } from '@qv/html/sanitize';
import { isImageOcclusion, noteSortText } from '@qv/anki-render';
import { parseCardCode } from '@qv/schema';
import type { ImportedAnkiCard } from '@qv/schema';
import { ImportError } from '../ImportError';
import type { ProcessedImage } from '../media/images';
import type { DecksManifest } from '../manifest/schemas';
import { IMAIOS, noteNamesImaios } from '../policy/imaios';
import { readExcludedCards } from './excludedCards';
import { checkDeckName, createdAt, levelOf, safeDecode, sameConfig } from './names';
import { remapNotes } from './noteTypes';
import type { NewestNoteTypes } from './noteTypes';
import { forSite } from './siteNoteTypes';
import { gymkanaOf, gymkanaWarnings } from './gymkana';
import type { AssessmentPlace, DecksOptions, DecksState } from './types';

type Entry = DecksManifest['decks'][number];
type Card = AnkiCollection['cards'][number];

interface PackageContext {
  op: DecksOptions;
  state: DecksState;
  place: AssessmentPlace;
  label: string;
  pkg: AnkiPackage;
  collection: AnkiCollection;
  warn: (message: string) => void;
}

/** The note types of the newest version in any package, and for the site; the notes' fields mapped to them. */
function siteCollection(pkg: AnkiPackage, newest: NewestNoteTypes, warn: (m: string) => void) {
  const remapped = remapNotes(pkg.collection.notes, pkg.collection.noteTypes, newest);
  for (const [type, names] of remapped.lost) {
    warn(
      `el tipo de nota «${type}» ya no tiene los campos ${[...names].join(', ')}; se descartan.`,
    );
  }
  return {
    ...pkg.collection,
    noteTypes: pkg.collection.noteTypes.map((t) => forSite(newest.get(t.id) ?? t)),
    notes: remapped.notes,
  };
}

/** Checks each deck of the package against the expected names and records it with its preset. */
function registerDecks(ctx: PackageContext, tree: DeckNode[]): void {
  const { state, place, label, warn } = ctx;
  const presetById = new Map(ctx.collection.presets.map((p) => [p.id, p]));
  for (const node of tree) {
    const { deck } = node;
    if (IMAIOS.test(deck.name)) {
      throw new ImportError(
        'material',
        `${label}: «${deck.name}» es un mazo de IMAIOS, que no se sube al sitio. Sácalo de content/decks/.`,
      );
    }
    checkDeckName(label, deck.name, place.expected, node.cardCount > 0);
    if (state.deckIds.has(deck.id)) {
      throw new ImportError('material', `${label}: el mazo ${deck.id} está repetido.`);
    }
    if (state.decks.has(deck.name)) {
      throw new ImportError(
        'material',
        `${label}: el mazo «${deck.name}» viene en dos paquetes con ids distintos.`,
      );
    }
    state.deckIds.add(deck.id);
    const preset = deck.presetId ? presetById.get(deck.presetId) : undefined;
    if (preset) {
      const before = state.presets.get(preset.name);
      if (before && !sameConfig(before.config, preset.config)) {
        warn(`el preset «${preset.name}» trae otra configuración que en otro mazo; queda esta.`);
      }
      state.presets.set(preset.name, { name: preset.name, config: preset.config });
    }
    state.decks.set(deck.name, {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      // Set below, once every parent exists.
      parentId: null,
      ...levelOf(deck.name, place.semesterNumber, place.courseId, place.assessmentId),
      preset: preset?.name ?? null,
      // Siblings go by name, as in Anki's deck list.
      position: 0,
    });
  }
}

/** The package's image by its name in the media folder, processed once; null (with a warning) when it cannot be. */
function imageLoader(ctx: PackageContext) {
  const cache = new Map<string, ProcessedImage | null>();
  return async (name: string): Promise<ProcessedImage | null> => {
    if (!cache.has(name)) {
      const data = ctx.pkg.readMedia(name) ?? ctx.pkg.readMedia(safeDecode(name));
      let processed: ProcessedImage | null = null;
      if (!data) ctx.warn(`falta la imagen ${name}.`);
      else {
        try {
          processed = await ctx.op.process(data);
          ctx.state.result.media.set(processed.key, processed);
        } catch (e) {
          ctx.warn(`no se pudo leer la imagen ${name} (${(e as Error).message}).`);
        }
      }
      cache.set(name, processed);
    }
    return cache.get(name) ?? null;
  };
}

/** The cards of the included decks by note, minus the ones the entry leaves out; and how many were left. */
async function cardsByNote(ctx: PackageContext, entry: Entry, included: ReadonlySet<string>) {
  const { collection } = ctx;
  const excluded = entry.excludeCards
    ? await readExcludedCards(resolve(ctx.op.root, entry.excludeCards))
    : null;
  const guidOf = new Map(collection.notes.map((n) => [n.id, n.guid]));
  let left = 0;
  const byNote = new Map<string, Card[]>();
  for (const c of collection.cards) {
    if (!included.has(c.deckId)) continue;
    if (excluded?.has(`${String(guidOf.get(c.noteId))}:${c.ord}`)) {
      left += 1;
      continue;
    }
    byNote.set(c.noteId, [...(byNote.get(c.noteId) ?? []), c]);
  }
  if (excluded && !left) ctx.warn(`«excludeCards» no deja fuera ninguna tarjeta de este mazo.`);
  return { byNote, left };
}

/** A note's cards as the site shows them: both sides rendered like Anki and sanitized. */
async function renderCards(
  ctx: PackageContext,
  render: ReturnType<typeof createCardRenderer>,
  image: (name: string) => Promise<ProcessedImage | null>,
  cards: Card[],
  who: string,
  sortField: string,
) {
  const rendered: ImportedAnkiCard[] = [];
  const media = new Set<string>();
  for (const card of cards) {
    const r = render(card);
    const where = `${who} (tarjeta ${card.ord + 1})`;
    if (r.error) ctx.warn(`${where}: error en la plantilla: ${r.error}`);
    else if (r.isEmpty) ctx.warn(`${where}: Anki la mostraría vacía.`);
    const sides: string[] = [];
    for (const html of [r.question, r.answer]) {
      const clean = await sanitizeCard(html, image);
      clean.missing.forEach((m) => ctx.warn(`${where}: falta la imagen ${m}.`));
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
  return { rendered: rendered.sort((a, b) => a.ord - b.ord), media: [...media].sort() };
}

function recordNoteType(ctx: PackageContext, type: AnkiCollection['noteTypes'][number]): void {
  if (ctx.state.noteTypes.has(type.id)) return;
  ctx.state.noteTypes.set(type.id, {
    id: type.id,
    name: type.name,
    kind: type.kind,
    occlusion: isImageOcclusion(type),
    fields: type.fields,
    templates: type.templates.map(({ name, qfmt, afmt }) => ({ name, qfmt, afmt })),
    css: type.css,
    sortField: type.sortField,
  });
}

/** Adds the notes of the cards that stay; returns the codes of those that name IMAIOS, which are left out. */
async function addNotes(
  ctx: PackageContext,
  byNote: Map<string, Card[]>,
  image: (name: string) => Promise<ProcessedImage | null>,
): Promise<string[]> {
  const { collection, state, label } = ctx;
  const typeById = new Map(collection.noteTypes.map((t) => [t.id, t]));
  const render = createCardRenderer(collection);
  const imaios: string[] = [];
  for (const note of collection.notes) {
    const cards = byNote.get(note.id);
    if (!cards) continue;
    if (noteNamesImaios(note)) {
      // Before rendering, so none of its images reaches the bucket.
      imaios.push(
        parseCardCode(note.fields.find((f) => parseCardCode(f)) ?? '')?.code ?? note.guid,
      );
      continue;
    }
    if (state.guids.has(note.guid)) {
      throw new ImportError('material', `${label}: la nota ${note.guid} está repetida.`);
    }
    state.guids.add(note.guid);
    const type = typeById.get(note.noteTypeId);
    if (!type) {
      ctx.warn(`la nota ${note.guid} no tiene su tipo de nota.`);
      continue;
    }
    recordNoteType(ctx, type);
    const fields = Object.fromEntries(type.fields.map((name, i) => [name, note.fields[i] ?? '']));
    const parsedCode = parseCardCode(fields['Código'] ?? fields.Codigo ?? fields.Code ?? '');
    const { rendered, media } = await renderCards(
      ctx,
      render,
      image,
      cards,
      parsedCode?.code ?? note.guid,
      noteSortText(note.fields, type.sortField),
    );
    state.result.notes.push({
      guid: note.guid,
      noteTypeId: type.id,
      fields,
      tags: note.tags,
      code: parsedCode?.code ?? null,
      version: parsedCode?.version ?? null,
      createdAt: createdAt(note.id),
      cards: rendered,
      media,
    });
  }
  return imaios;
}

export async function processPackage(
  op: DecksOptions,
  state: DecksState,
  place: AssessmentPlace,
  entry: Entry,
  newest: NewestNoteTypes,
): Promise<void> {
  const label = entry.apkg.split('/').at(-1)!;
  op.onProgress?.(`mazo ${label}`);
  const pkg = await (op.read ?? readApkgFile)(resolve(op.root, entry.apkg));
  const warn = (m: string) => state.result.warnings.push(`${label}: ${m}`);
  const collection = siteCollection(pkg, newest, warn);
  const ctx: PackageContext = { op, state, place, label, pkg, collection, warn };

  const tree = deckTree(collection);
  if (!tree.length) {
    warn('no tiene tarjetas.');
    return;
  }
  const included = new Map(tree.map((n) => [n.deck.id, n]));
  registerDecks(ctx, tree);
  const { byNote, left } = await cardsByNote(ctx, entry, new Set(included.keys()));
  const imaios = await addNotes(ctx, byNote, imageLoader(ctx));
  const gymkana = gymkanaOf(
    label,
    entry,
    place,
    [...included.values()].map((n) => n.deck),
  );
  if (gymkana) {
    state.result.gymkanas.push(gymkana);
    gymkanaWarnings(gymkana, state.result.notes, !!entry.gymkana).forEach(warn);
  }
  if (imaios.length && !entry.excludeImaios) {
    throw new ImportError(
      'material',
      `${label}: ${imaios.length} nota(s) nombran IMAIOS (${imaios.slice(0, 3).join(', ')}${imaios.length > 3 ? '…' : ''}), que no se sube al sitio. Agrega "excludeImaios": true a su entrada en content/decks/ para dejarlas fuera.`,
    );
  }
  op.onProgress?.(
    `  ${included.size} mazos, ${[...byNote.values()].flat().length} tarjetas · ${deckLeafName(tree[0]!.deck.name)}` +
      (imaios.length ? ` · ${imaios.length} notas de IMAIOS fuera` : '') +
      (left ? ` · ${left} tarjetas dejadas fuera` : ''),
  );
}
