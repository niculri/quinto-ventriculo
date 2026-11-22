// Tests for the summaries of the notes and tests: which optional fields leave out their key, and how times become ISO.
import { describe, expect, it } from 'vitest';
import { quizSummary, summary } from '../summaries';

const ROW = {
  id: 'AP-BC-C2-01',
  slug: 'uno',
  course_id: 'curso',
  assessment_id: 'curso/c1',
  kind: 'lecture' as const,
  title: 'Uno',
  subtitle: null,
  position: 3,
  updated_at: '2026-10-31T12:00:00+00:00',
  code: null,
  version: 0,
  published_at: null,
  version_at: null,
};

describe('summary', () => {
  it('a bare row has only its required fields, with the time as ISO', () => {
    expect(summary(ROW)).toEqual({
      id: 'AP-BC-C2-01',
      slug: 'uno',
      courseId: 'curso',
      assessmentId: 'curso/c1',
      kind: 'lecture',
      title: 'Uno',
      position: 3,
      updatedAt: '2026-10-31T12:00:00.000Z',
    });
  });

  it('what a row has empty does not leave a key, and what it has does, renamed', () => {
    const full = summary({
      ...ROW,
      subtitle: 'sub',
      code: 'QV-1',
      version: 2,
      published_at: '2026-11-01T10:00:00+00:00',
      version_at: '2026-11-02T10:00:00+00:00',
      header: { number: '1' },
      practice: { quizId: 'q' },
      note_group: 'g',
    });
    expect(full).toMatchObject({
      subtitle: 'sub',
      code: 'QV-1',
      version: 2,
      publishedAt: '2026-11-01T10:00:00.000Z',
      versionAt: '2026-11-02T10:00:00.000Z',
      header: { number: '1' },
      practice: { quizId: 'q' },
      group: 'g',
    });
  });

  it('version 0 and an empty subtitle count as «none»', () => {
    const s = summary({ ...ROW, subtitle: '', version: 0 });
    expect(s).not.toHaveProperty('subtitle');
    expect(s).not.toHaveProperty('version');
  });
});

describe('quizSummary', () => {
  const quiz = {
    id: 'q',
    slug: 'q',
    course_id: 'curso',
    assessment_id: 'curso/c1',
    title: 'Test',
    position: 1,
    question_count: 10,
    section_count: 2,
    updated_at: '2026-10-31T12:00:00+00:00',
  };

  it('renames the columns and reads the time as ISO', () => {
    expect(quizSummary(quiz)).toMatchObject({
      courseId: 'curso',
      assessmentId: 'curso/c1',
      questionCount: 10,
      sectionCount: 2,
      updatedAt: '2026-10-31T12:00:00.000Z',
    });
  });

  it('a row that is not a summary is an error, not a half-made summary', () => {
    expect(() => quizSummary({ ...quiz, question_count: -1 })).toThrow();
    expect(() => quizSummary({ ...quiz, assessment_id: null as unknown as string })).toThrow();
  });
});
