// Types of what an .apkg contains, as Anki stores it. Ids are strings: Anki's are 64-bit integers.

export type NoteTypeKind = 'normal' | 'cloze';

export interface AnkiTemplate {
  name: string;
  ord: number;
  qfmt: string;
  afmt: string;
  bqfmt: string;
  bafmt: string;
}

export interface AnkiNoteType {
  id: string;
  name: string;
  kind: NoteTypeKind;
  fields: string[];
  templates: AnkiTemplate[];
  css: string;
  sortField: number;
  /** 6 = Image Occlusion. */
  originalStockKind: number | null;
}

export interface AnkiDeck {
  id: string;
  name: string;
  description: string;
  /** null for filtered decks. */
  presetId: string | null;
  filtered: boolean;
}

export interface AnkiPreset {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface AnkiNote {
  id: string;
  guid: string;
  noteTypeId: string;
  fields: string[];
  tags: string[];
}

export interface AnkiCard {
  id: string;
  noteId: string;
  /** Template index, or cloze number − 1 in a cloze note type. */
  ord: number;
  deckId: string;
  originalDeckId: string | null;
  flags: number;
}

export interface AnkiCollection {
  schemaVersion: number;
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  presets: AnkiPreset[];
  notes: AnkiNote[];
  cards: AnkiCard[];
}

export interface AnkiPackage {
  collection: AnkiCollection;
  mediaNames: string[];
  readMedia(name: string): Uint8Array | null;
}
