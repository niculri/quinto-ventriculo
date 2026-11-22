// What a save reports: which pieces changed, which stayed, and what was removed or moved.

export interface Report {
  changedNotes: string[];
  unchangedNotes: string[];
  removedNotes: number;
  /** Anki note guids. */
  changedCards: string[];
  unchangedCards: string[];
  removedCards: number;
  movedCards: number;
  retiredCards: number;
  changedQuizzes: string[];
  unchangedQuizzes: string[];
  removedQuizzes: number;
  mediaUploaded: number;
  mediaExisting: number;
  indexesWritten: number;
  indexesUnchanged: number;
  indexesRemoved: number;
  thumbsUploaded: number;
  thumbsExisting: number;
}

export const emptyReport = (): Report => ({
  changedNotes: [],
  unchangedNotes: [],
  removedNotes: 0,
  changedCards: [],
  unchangedCards: [],
  removedCards: 0,
  movedCards: 0,
  retiredCards: 0,
  changedQuizzes: [],
  unchangedQuizzes: [],
  removedQuizzes: 0,
  mediaUploaded: 0,
  mediaExisting: 0,
  indexesWritten: 0,
  indexesUnchanged: 0,
  indexesRemoved: 0,
  thumbsUploaded: 0,
  thumbsExisting: 0,
});
