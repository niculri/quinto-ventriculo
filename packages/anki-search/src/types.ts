/** What a search runs over: the cards in memory, their decks and note types, and the clock. */

export interface SearchDeck {
  id: string;
  name: string;
}

export interface SearchNoteType {
  id: string;
  name: string;
  kind: 'normal' | 'cloze';
  fields: string[];
  templates: string[];
}

export interface SearchCard {
  noteGuid: string;
  ord: number;
  deckId: string;
  noteTypeId: string;
  tags: string[];
  /** Plain text, without HTML. */
  fields: string[];
  /** Unix ms (Anki's note id). */
  createdMs: number | null;
  type: 'new' | 'learn' | 'review' | 'relearn';
  queue: 'new' | 'learn' | 'dayLearn' | 'review' | 'suspended' | 'buried';
  /**
   * learn: Unix seconds; dayLearn and review: Anki day number; new: null. A suspended or buried card keeps
   * the due of its type, as in Anki.
   */
  due: number | null;
  interval: number;
  reps: number;
  lapses: number;
  flag: number;
  stability: number | null;
  /** 1–10, as Anki stores it. */
  difficulty: number | null;
  /** Unix seconds. */
  lastReview: number | null;
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
  /** Unix seconds. */
  nextDayAt: number;
}

export interface SearchContext {
  decks: SearchDeck[];
  noteTypes: SearchNoteType[];
  timing: SearchTiming;
  learnAheadSecs: number;
  /** At least those in the window that `rated:` asks for (`searchNeeds`). */
  answers?: SearchAnswer[];
  /** By `${noteGuid}\u001f${ord}`. */
  firstAnswerMs?: Map<string, number>;
  /** Anki's «Ignore accents in search»: loose text behaves like `nc:` and `w:` ignores accents on both sides. */
  ignoreAccents?: boolean;
}
