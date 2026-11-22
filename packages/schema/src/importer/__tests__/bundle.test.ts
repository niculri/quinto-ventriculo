// The bundle the importer writes: what an older one lacks reads as empty, and what a note has to carry.
import { describe, expect, it } from 'vitest';
import { ContentBundle, ImportedNote } from '../bundle';

const note = {
  id: 'AP-BC-C2-08',
  slug: 'transcripcion',
  courseId: 'bc',
  assessmentId: 'bc/c2',
  kind: 'lecture',
  title: 'T',
  position: 1,
  updatedAt: '2026-11-07T12:00:00.000Z',
  sources: [],
  html: '<p>x</p>',
  toc: [],
  sections: [{ anchor: '', title: 'T', level: 1, text: 'x' }],
  hash: 'h',
  media: [],
};

describe('ContentBundle', () => {
  const bundle = { semesters: [], courses: [], assessments: [], notes: [] };

  it('a bundle from before the cards and the tests reads them as empty, and the browser indexes as missing', () => {
    expect(ContentBundle.parse(bundle)).toEqual({
      ...bundle,
      ankiNoteTypes: [],
      ankiPresets: [],
      ankiDecks: [],
      ankiNotes: [],
      quizzes: [],
    });
    expect(ContentBundle.parse({ ...bundle, ankiBrowseIndexes: [] }).ankiBrowseIndexes).toEqual([]);
  });

  it('the catalog and the notes are always there', () => {
    expect(ContentBundle.safeParse({ semesters: [], courses: [], assessments: [] }).success).toBe(
      false,
    );
  });
});

describe('ImportedNote', () => {
  it('has the sections for the search, the hash and the list of its images', () => {
    expect(ImportedNote.safeParse(note).success).toBe(true);
    for (const key of ['sections', 'hash', 'media']) {
      expect(ImportedNote.safeParse({ ...note, [key]: undefined }).success).toBe(false);
    }
    expect(ImportedNote.safeParse({ ...note, versionHash: 'v' }).success).toBe(true);
  });

  it('a section is at level 1, 2 or 3', () => {
    const level = (n: number) =>
      ImportedNote.safeParse({ ...note, sections: [{ ...note.sections[0]!, level: n }] }).success;
    expect([level(0), level(1), level(3), level(4)]).toEqual([false, true, true, false]);
  });
});
