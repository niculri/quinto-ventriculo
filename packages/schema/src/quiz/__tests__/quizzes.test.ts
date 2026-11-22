// The practice tests' shapes: what a question has to be, and how an imported test becomes the detail the API gives and
// the summary the lists show.
import { describe, expect, it } from 'vitest';
import { ImportedQuiz, QuizQuestion, QuizTheme, quizDetail, quizSummary } from '../quizzes';

const THEME = Object.fromEntries(
  ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((t) => [t, '#0f3d4c']),
);

const choice = (over: Record<string, unknown> = {}) => ({
  kind: 'choice',
  id: 'q1',
  prompt: '¿Cuál?',
  options: ['a', 'b', 'c'],
  correct: 1,
  ...over,
});

describe('a choice question', () => {
  it('the correct one is an alternative that exists, counted from 0', () => {
    expect(QuizQuestion.safeParse(choice({ correct: 2 })).success).toBe(true);
    expect(QuizQuestion.safeParse(choice({ correct: 3 })).success).toBe(false);
    expect(QuizQuestion.safeParse(choice({ correct: -1 })).success).toBe(false);
    expect(QuizQuestion.safeParse(choice({ correct: 1.5 })).success).toBe(false);
  });

  it('has from two to six alternatives', () => {
    expect(QuizQuestion.safeParse(choice({ options: ['a'], correct: 0 })).success).toBe(false);
    expect(QuizQuestion.safeParse(choice({ options: ['a', 'b'], correct: 0 })).success).toBe(true);
    expect(
      QuizQuestion.safeParse(choice({ options: Array.from({ length: 6 }, () => 'x'), correct: 5 }))
        .success,
    ).toBe(true);
    expect(
      QuizQuestion.safeParse(choice({ options: Array.from({ length: 7 }, () => 'x'), correct: 0 }))
        .success,
    ).toBe(false);
  });

  it('explains every alternative or none', () => {
    expect(QuizQuestion.safeParse(choice({ optionExplanations: ['x', 'y', 'z'] })).success).toBe(
      true,
    );
    expect(QuizQuestion.safeParse(choice({ optionExplanations: ['x', 'y'] })).success).toBe(false);
    expect(QuizQuestion.safeParse(choice({ optionExplanations: [] })).success).toBe(false);
  });

  it('fills what is left out: no figures, none beside the options, and its alternatives may shuffle', () => {
    const parsed = QuizQuestion.parse(choice());
    expect(parsed).toMatchObject({ figures: [], figureBeside: false, fixedOrder: false });
  });
});

describe('a short question', () => {
  it('has an answer instead of alternatives', () => {
    expect(
      QuizQuestion.safeParse({ kind: 'short', id: 'q2', prompt: 'p', answer: 'a' }).success,
    ).toBe(true);
    expect(QuizQuestion.safeParse({ kind: 'short', id: 'q2', prompt: 'p' }).success).toBe(false);
  });

  it('is told apart by its kind, so a short one with alternatives has no use for them', () => {
    expect(QuizQuestion.safeParse({ kind: 'other', id: 'q', prompt: 'p' }).success).toBe(false);
  });
});

describe('the ids that progress hangs from', () => {
  it('a question id starts with a letter or digit and may hold dots, dashes, pluses and underscores, up to 64', () => {
    for (const id of ['a', '1', 'a.b-c_d+e', 'a'.repeat(64)]) {
      expect(QuizQuestion.safeParse(choice({ id })).success).toBe(true);
    }
    for (const id of ['', '-a', '.a', 'a b', 'a/b', 'a'.repeat(65)]) {
      expect(QuizQuestion.safeParse(choice({ id })).success).toBe(false);
    }
  });
});

describe('the colors of a theme', () => {
  const TOKENS = ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'];
  const colors = (): Record<string, string> =>
    Object.fromEntries(TOKENS.map((t) => [t, '#0f3d4c']));
  const theme = (light = colors(), dark = colors()) => QuizTheme.safeParse({ light, dark }).success;

  it('are hex colors of 3 to 8 digits for every token, for the light and the dark', () => {
    expect(theme()).toBe(true);
    expect(theme({ ...colors(), ac: '#fff' }, { ...colors(), 'on-ac': '#0F3D4CAA' })).toBe(true);
  });

  it('a color is refused if it is a name, too short, too long or not hexadecimal', () => {
    for (const bad of ['red', '#ff', '#fffffffff', '#ggg', 'fff', '#fff ']) {
      expect(theme({ ...colors(), ac: bad })).toBe(false);
    }
  });

  it('a token missing in either side, or one that is not known, is refused', () => {
    const { g3: _g3, ...short } = colors();
    expect(theme(short as Record<string, string>)).toBe(false);
    expect(theme(colors(), short as Record<string, string>)).toBe(false);
    expect(theme({ ...colors(), unknown: '#fff' })).toBe(false);
  });
});

describe('an imported test', () => {
  const imported = () =>
    ImportedQuiz.parse({
      id: 'practica',
      slug: 'practica',
      courseId: 'bc',
      assessmentId: 'bc/c2',
      title: 'Práctica',
      position: 1,
      questionCount: 3,
      sectionCount: 1,
      updatedAt: '2026-11-07T12:00:00.000Z',
      kicker: '',
      heading: '',
      footer: '',
      theme: { light: THEME, dark: THEME },
      hash: 'h',
      media: ['cards/a.webp'],
      sections: [
        {
          id: 's1',
          name: 'S',
          description: 'd',
          groupsTitle: 'Temas',
          questionCount: 3,
          hasChoices: true,
          groups: [
            { id: 'g1', name: 'G1', questions: [choice({ id: 'a' }), choice({ id: 'b' })] },
            { id: 'g2', name: 'G2', questions: [choice({ id: 'c' })] },
          ],
        },
      ],
    });

  it('the detail for the API drops the hash and the list of images, and swaps each group’s questions for how many they are', () => {
    const detail = quizDetail(imported());
    expect(detail).not.toHaveProperty('hash');
    expect(detail).not.toHaveProperty('media');
    expect(detail.sections[0]!.groups).toEqual([
      { id: 'g1', name: 'G1', questionCount: 2 },
      { id: 'g2', name: 'G2', questionCount: 1 },
    ]);
    expect(detail.sections[0]).toMatchObject({ id: 's1', questionCount: 3, hasChoices: true });
  });

  it('the summary keeps only what a list shows, from the imported test or from its detail', () => {
    const fromImported = quizSummary(imported());
    expect(fromImported).toEqual({
      id: 'practica',
      slug: 'practica',
      courseId: 'bc',
      assessmentId: 'bc/c2',
      title: 'Práctica',
      position: 1,
      questionCount: 3,
      sectionCount: 1,
      updatedAt: '2026-11-07T12:00:00.000Z',
    });
    expect(quizSummary(quizDetail(imported()))).toEqual(fromImported);
  });

  it('a test needs at least one section and every section at least one group', () => {
    const base = imported();
    expect(ImportedQuiz.safeParse({ ...base, sections: [] }).success).toBe(false);
    expect(
      ImportedQuiz.safeParse({ ...base, sections: [{ ...base.sections[0]!, groups: [] }] }).success,
    ).toBe(false);
  });
});
