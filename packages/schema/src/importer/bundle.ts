// The content bundle the importer produces and the content database stores; the dry run writes it to
// `.output/content.json`, which the API can serve from memory.
import { z } from 'zod';
import { Assessment, Course, Note, Semester } from '../content/content';
import {
  AnkiDeckRecord,
  AnkiNoteTypeRecord,
  AnkiPresetRecord,
  ImportedAnkiNote,
} from '../anki/flashcards';
import { CardIndexRecord } from '../anki/browse-index';
import { ImportedQuiz } from '../quiz/quizzes';

const NoteSection = z.object({
  anchor: z.string(),
  title: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
});
type NoteSection = z.infer<typeof NoteSection>;

export const ImportedNote = Note.extend({
  sections: z.array(NoteSection),
  hash: z.string(),
  /** sha256 of what the reader sees: the version goes up when it changes. */
  versionHash: z.string().optional(),
  media: z.array(z.string()),
});
export type ImportedNote = z.infer<typeof ImportedNote>;

export const ContentBundle = z.object({
  semesters: z.array(Semester),
  courses: z.array(Course),
  assessments: z.array(Assessment),
  notes: z.array(ImportedNote),
  // Optional when reading, so that an older bundle still parses.
  ankiNoteTypes: z.array(AnkiNoteTypeRecord).default([]),
  ankiPresets: z.array(AnkiPresetRecord).default([]),
  ankiDecks: z.array(AnkiDeckRecord).default([]),
  ankiNotes: z.array(ImportedAnkiNote).default([]),
  quizzes: z.array(ImportedQuiz).default([]),
  ankiBrowseIndexes: z.array(CardIndexRecord).optional(),
});
export type ContentBundle = z.infer<typeof ContentBundle>;
