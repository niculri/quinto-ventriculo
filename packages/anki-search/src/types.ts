/** What a search runs over: the cards in memory, their decks and note types, and the clock. */

export interface SearchDeck {
  id: string;
  /** Full name with «::». */
  name: string;
}

export interface SearchNoteType {
  id: string;
  name: string;
  kind: 'normal' | 'cloze';
  /** Field names, in order. */
  fields: string[];
  /** Template names, in order (ord = index). */
  templates: string[];
}

export interface SearchCard {
  noteGuid: string;
  ord: number;
  deckId: string;
  noteTypeId: string;
  tags: string[];
  /** Each field as plain text (no HTML), in the note type's order. */
  fields: string[];
  /** When the note was created (Anki's note id), Unix ms. */
  createdMs: number | null;
  /** Anki's card.type. */
  type: 'new' | 'learn' | 'review' | 'relearn';
  /** Anki's card.queue (-1 suspended; -2 and -3 buried). */
  queue: 'new' | 'learn' | 'dayLearn' | 'review' | 'suspended' | 'buried';
  /**
   * learn: Unix seconds; dayLearn and review: Anki day number; new: null. A suspended or buried card keeps
   * the due of its type, as in Anki.
   */
  due: number | null;
  interval: number;
  reps: number;
  lapses: number;
  /** 0–7. */
  flag: number;
  /** FSRS stability in days. */
  stability: number | null;
  /** FSRS difficulty, 1–10 as Anki stores it. */
  difficulty: number | null;
  /** Unix seconds. */
  lastReview: number | null;
  /** The card's FSRS decay (null = the one Anki uses when the card has none: 0.5). */
  decay: number | null;
}

export interface SearchAnswer {
  noteGuid: string;
  ord: number;
  rating: 1 | 2 | 3 | 4;
  atMs: number;
}

export interface SearchTiming {
  /** Unix seconds. */
  now: number;
  /** Anki's day number. */
  today: number;
  /** Unix seconds when the next Anki day starts. */
  nextDayAt: number;
}

export interface SearchContext {
  decks: SearchDeck[];
  noteTypes: SearchNoteType[];
  timing: SearchTiming;
  learnAheadSecs: number;
  /** Answers (rating 1–4), at least those in the window that `rated:` asks for (see `searchNeeds`). */
  answers?: SearchAnswer[];
  /** First answer of each card, by `${noteGuid}\u001f${ord}` (for `introduced:`). */
  firstAnswerMs?: Map<string, number>;
}
