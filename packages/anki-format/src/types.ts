/** What an .apkg contains, as Anki stores it. Ids are strings: Anki's are 64-bit integers. */

export type NoteTypeKind = 'normal' | 'cloze';

export interface AnkiTemplate {
  name: string;
  ord: number;
  /** Question format (front template). */
  qfmt: string;
  /** Answer format (back template). */
  afmt: string;
  /** Browser formats (optional, usually empty). */
  bqfmt: string;
  bafmt: string;
}

export interface AnkiNoteType {
  id: string;
  name: string;
  kind: NoteTypeKind;
  /** Field names, in order (the note fields come in this same order). */
  fields: string[];
  templates: AnkiTemplate[];
  css: string;
  /** Index of the sort field (the first column of Anki's browser). */
  sortField: number;
  /** Anki's stock kind the note type was made from (6 = Image Occlusion), if known. */
  originalStockKind: number | null;
}

export interface AnkiDeck {
  id: string;
  /** Full name with «::» between levels: «Parent::Child». */
  name: string;
  description: string;
  /** Preset (deck options) id; null for filtered decks. */
  presetId: string | null;
  /** Filtered (dynamic) deck. */
  filtered: boolean;
}

export interface AnkiPreset {
  id: string;
  name: string;
  /** The whole configuration as Anki exports it (new/rev/lapse, steps, limits…). */
  config: Record<string, unknown>;
}

export interface AnkiNote {
  id: string;
  guid: string;
  noteTypeId: string;
  /** Field values, in the order of the note type's fields. */
  fields: string[];
  tags: string[];
}

export interface AnkiCard {
  id: string;
  noteId: string;
  /** Template index (normal note types) or cloze number − 1 (cloze). */
  ord: number;
  deckId: string;
  /** Original deck if the card is in a filtered deck. */
  originalDeckId: string | null;
  flags: number;
}

export interface AnkiCollection {
  /** Collection schema version (11 for the classic exports). */
  schemaVersion: number;
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  presets: AnkiPreset[];
  notes: AnkiNote[];
  cards: AnkiCard[];
}

export interface AnkiPackage {
  collection: AnkiCollection;
  /** Media file names in the package. */
  mediaNames: string[];
  /** Contents of a media file, or null if it is not in the package. */
  readMedia(name: string): Uint8Array | null;
}
