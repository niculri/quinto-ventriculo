// Tests for the announcement the release panel proposes: new or changed, what each assessment brings, its limits.
import { describe, expect, it } from 'vitest';
import type { ReleaseAssessment, ReleaseSummary } from '@qv/schema/release';
import { announcementDraft, announcementPhrases } from '../announcementDraft';

const assessment = (o: Partial<ReleaseAssessment> = {}): ReleaseAssessment => ({
  id: 'biologia-celular/certamen-3',
  courseId: 'biologia-celular',
  courseName: 'Biología celular',
  semester: 2,
  name: 'Certamen 3',
  suggestedDate: null,
  suggestedDateBefore: null,
  articles: { added: 0, removed: 0, content: 0, format: 0 },
  questions: {
    added: 0,
    removed: 0,
    answer: 0,
    noAnswer: 0,
    format: 0,
    moved: 0,
    keyChanged: 0,
    total: 0,
  },
  quizzes: [],
  cards: { added: 0, removed: 0, moved: 0, answer: 0, noAnswer: 0, format: 0, notes: 0 },
  decks: [],
  impactDecks: [],
  ...o,
});
const summary = (
  assessments: ReleaseAssessment[],
  o: Partial<ReleaseSummary> = {},
): ReleaseSummary => ({
  fingerprint: 'a'.repeat(32),
  schemaVersion: 1,
  unpublished: [],
  marks: [],
  catalog: [],
  noteTypes: [],
  presets: [],
  decks: [],
  assessments,
  findings: [],
  ...o,
});
const deck = (op: 'added' | 'changed') => ({
  id: '9',
  name: 'Mazo',
  nameBefore: null,
  op,
  cardsBefore: 0,
  cardsAfter: 4,
  presetBefore: null,
  presetAfter: null,
});

describe('announcementDraft', () => {
  it('new material: what each assessment brings, with its course and assessment', () => {
    const d = announcementDraft(
      summary([
        assessment({
          articles: { added: 2, removed: 0, content: 1, format: 3 },
          quizzes: [{ id: 'q', title: 'Test', op: 'added' }],
          questions: {
            added: 40,
            removed: 0,
            answer: 0,
            noAnswer: 0,
            format: 0,
            moved: 0,
            keyChanged: 0,
            total: 40,
          },
          cards: { added: 1, removed: 2, moved: 0, answer: 0, noAnswer: 0, format: 5, notes: 1 },
        }),
        assessment({
          id: 'fisica/certamen-3',
          courseId: 'fisica',
          courseName: 'Física',
          decks: [deck('added')],
          cards: { added: 30, removed: 0, moved: 0, answer: 0, noAnswer: 0, format: 0, notes: 30 },
        }),
      ]),
    );
    expect(d).toEqual({
      kind: 'new',
      title: 'Biología celular · Certamen 3 y Física · Certamen 3',
      body:
        'Biología celular · Certamen 3: 2 apuntes nuevos, 1 test nuevo, 1 tarjeta nueva y 1 apunte actualizado.\n' +
        'Física · Certamen 3: 1 mazo nuevo.',
      items: [
        { courseId: 'biologia-celular', assessmentId: 'biologia-celular/certamen-3' },
        { courseId: 'fisica', assessmentId: 'fisica/certamen-3' },
      ],
    });
  });

  it('only changes: an update, with the questions and cards that changed', () => {
    const d = announcementDraft(
      summary([
        assessment({
          questions: {
            added: 3,
            removed: 0,
            answer: 1,
            noAnswer: 1,
            format: 0,
            moved: 0,
            keyChanged: 0,
            total: 5,
          },
          cards: { added: 0, removed: 0, moved: 0, answer: 1, noAnswer: 0, format: 0, notes: 1 },
          decks: [deck('changed')],
        }),
      ]),
    );
    expect(d.kind).toBe('new');
    expect(d.body).toBe(
      'Biología celular · Certamen 3: 3 preguntas nuevas, 2 preguntas actualizadas y 1 tarjeta actualizada.',
    );
    const only = announcementDraft(
      summary([assessment({ articles: { added: 0, removed: 0, content: 2, format: 0 } })]),
    );
    expect(only).toMatchObject({
      kind: 'update',
      body: 'Biología celular · Certamen 3: 2 apuntes actualizados.',
    });
  });

  it('what is only of format, only in the catalog or of no course is not announced', () => {
    const d = announcementDraft(
      summary(
        [
          assessment({ articles: { added: 0, removed: 0, content: 0, format: 4 } }),
          assessment({ id: 'x/c1', courseId: 'x', courseName: 'X', name: 'Certamen 1' }),
          assessment({ id: 'z/c1', courseId: null, courseName: null, name: 'C' }),
        ],
        { catalog: [{ kind: 'assessment', id: 'x/c1', op: 'added', before: null, after: {} }] },
      ),
    );
    expect(d).toEqual({
      kind: 'update',
      title: 'Biología celular · Certamen 3',
      body: '',
      items: [{ courseId: 'biologia-celular', assessmentId: 'biologia-celular/certamen-3' }],
    });
  });

  it('keeps within the limits of an announcement', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      assessment({
        id: `curso-${String(i)}/certamen-1`,
        courseId: `curso-${String(i)}`,
        courseName: `Un ramo con un nombre bastante largo número ${String(i)}`,
        articles: { added: 1, removed: 0, content: 0, format: 0 },
      }),
    );
    const d = announcementDraft(summary(many));
    expect(d.title.length).toBeLessThanOrEqual(160);
    expect(d.body.length).toBeLessThanOrEqual(1000);
    expect(d.body.split('\n').length).toBeLessThan(40);
    expect(d.items).toHaveLength(30);
  });
});

describe('announcementPhrases', () => {
  it('finds the phrases of the material’s process or of this semester', () => {
    expect(
      announcementPhrases({ title: 'Clases nuevas', body: 'Para el próximo certamen.' }),
    ).toMatchObject([{ rule: 'this-term' }]);
    expect(announcementPhrases({ title: 'Clases nuevas', body: 'Dos clases.' })).toEqual([]);
  });
});
