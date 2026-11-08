import { z } from 'zod';
import { Assessment, Course, Note, Semester } from './content';
import {
  AnkiDeckRecord,
  AnkiNoteTypeRecord,
  AnkiPresetRecord,
  ImportedAnkiNote,
} from './flashcards';
import { ImportedQuiz } from './quizzes';

/**
 * What the importer produces and the content database stores. In dry-run mode it is written as is to
 * `.output/content.json`, and the API can serve it from memory (local development and tests).
 */
export const NoteSection = z.object({
  anchor: z.string(),
  title: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
});
export type NoteSection = z.infer<typeof NoteSection>;

export const ImportedNote = Note.extend({
  sections: z.array(NoteSection),
  hash: z.string(),
  /**
   * sha256 of what the reader sees (title, subtitle, header, sources, HTML, TOC): the version goes up when it
   * changes. Absent in a bundle from before the articles.
   */
  versionHash: z.string().optional(),
  /** Keys of the images in the store (R2), to check that all of them were uploaded. */
  media: z.array(z.string()),
});
export type ImportedNote = z.infer<typeof ImportedNote>;

export const ContentBundle = z.object({
  semesters: z.array(Semester),
  courses: z.array(Course),
  assessments: z.array(Assessment),
  notes: z.array(ImportedNote),
  // Anki decks (v1). Optional when reading, so a bundle from before them still parses.
  ankiNoteTypes: z.array(AnkiNoteTypeRecord).default([]),
  ankiPresets: z.array(AnkiPresetRecord).default([]),
  ankiDecks: z.array(AnkiDeckRecord).default([]),
  ankiNotes: z.array(ImportedAnkiNote).default([]),
  // Practice tests (v1.4). Optional when reading, like the decks.
  quizzes: z.array(ImportedQuiz).default([]),
});
export type ContentBundle = z.infer<typeof ContentBundle>;
