// Tests for what of the announcements a student may read.
import { describe, expect, it } from 'vitest';
import type { Announcement } from '../../release/announcements';
import type { Catalog } from '../api';
import { visibleNews } from '../news';

const assessment = (courseId: string, n: number, notes: number, quizzes = 0) => ({
  id: `${courseId}/certamen-${n}`,
  courseId,
  name: `Certamen ${n}`,
  position: n,
  cardCount: 0,
  quizzes: Array.from({ length: quizzes }, (_, i) => ({
    id: `${courseId}-q${i}`,
    slug: `q${i}`,
    title: 'Test',
    courseId,
    assessmentId: `${courseId}/certamen-${n}`,
    questionCount: 3,
    sections: [],
  })),
  notes: Array.from({ length: notes }, (_, i) => ({
    id: `AP-${courseId}-${n}-${i}`,
    slug: `${courseId}-${n}-${i}`,
    courseId,
    assessmentId: `${courseId}/certamen-${n}`,
    kind: 'lecture' as const,
    title: 'X',
    position: i,
    updatedAt: '2026-11-07T12:00:00.000Z',
  })),
});

const catalog = {
  semesters: [
    {
      number: 2,
      name: '2° Semestre',
      courses: [
        {
          id: 'a',
          semester: 2,
          name: 'A',
          emoji: '📘',
          position: 1,
          assessments: [assessment('a', 1, 1), assessment('a', 2, 0)],
        },
        {
          id: 'b',
          semester: 2,
          name: 'B',
          emoji: '📗',
          position: 2,
          assessments: [assessment('b', 1, 0)],
        },
      ],
    },
  ],
  anki: { decks: [], presets: [], noteTypes: [] },
} as unknown as Catalog;

const news = (
  id: number,
  kind: Announcement['kind'],
  items: Announcement['items'],
): Announcement => ({
  id,
  kind,
  title: `Aviso ${String(id)}`,
  body: '',
  items,
  publishedAt: '2026-11-25T12:00:00.000Z',
});

describe('visibleNews', () => {
  it('keeps only the courses and assessments with material in the catalog', () => {
    const list = [
      news(1, 'new', [
        { courseId: 'a', assessmentId: 'a/certamen-1' },
        { courseId: 'a', assessmentId: 'a/certamen-2' },
        { courseId: 'b', assessmentId: null },
        { courseId: 'gone', assessmentId: null },
        { courseId: 'a', assessmentId: 'a/certamen-9' },
      ]),
      news(2, 'update', [{ courseId: 'a', assessmentId: null }]),
    ];
    expect(visibleNews(list, catalog)).toEqual([
      {
        ...list[0],
        title: 'A · Certamen 1',
        items: [{ courseId: 'a', assessmentId: 'a/certamen-1' }],
      },
      list[1],
    ]);
  });

  it('never tells, in its title or text, what it left out', () => {
    const both = {
      ...news(1, 'new', [
        { courseId: 'a', assessmentId: 'a/certamen-1' },
        { courseId: 'b', assessmentId: 'b/certamen-1' },
      ]),
      title: 'A · Certamen 1 y B · Certamen 1',
      body: 'A · Certamen 1: 2 apuntes nuevos.\nB · Certamen 1: 1 test nuevo.\nTodo lo de B.',
    };
    const [shown] = visibleNews([both], catalog);
    expect(shown).toMatchObject({
      title: 'A · Certamen 1',
      body: 'A · Certamen 1: 2 apuntes nuevos.',
    });
    expect(JSON.stringify(shown)).not.toMatch(/B · |de B/);
    const site = { ...news(2, 'site', [{ courseId: 'b', assessmentId: null }]), title: 'B cambió' };
    expect(visibleNews([site], catalog)).toEqual([]);
    const fourOf = (n: number) => ({ courseId: 'a', assessmentId: `a/certamen-${String(n)}` });
    const wide = {
      ...catalog,
      semesters: [
        {
          ...catalog.semesters[0]!,
          courses: [
            {
              ...catalog.semesters[0]!.courses[0]!,
              assessments: [1, 2, 3, 4].map((n) => assessment('a', n, 1)),
            },
          ],
        },
      ],
    } as Catalog;
    const many = news(3, 'update', [
      ...[1, 2, 3, 4].map(fourOf),
      { courseId: 'b', assessmentId: null },
    ]);
    expect(visibleNews([many], wide)[0]!.title).toBe('A · Certamen 1, A · Certamen 2 y 2 más');
    const three = news(4, 'update', [
      ...[1, 2, 3].map(fourOf),
      { courseId: 'b', assessmentId: null },
    ]);
    expect(visibleNews([three], wide)[0]!.title).toBe(
      'A · Certamen 1, A · Certamen 2 y A · Certamen 3',
    );
    const course = news(5, 'update', [
      { courseId: 'a', assessmentId: null },
      { courseId: 'b', assessmentId: null },
    ]);
    expect(visibleNews([course], wide)[0]!.title).toBe('A');
  });

  it('leaves out one that ends with none, but not one about the site that named nothing', () => {
    const list = [
      news(1, 'new', [{ courseId: 'b', assessmentId: 'b/certamen-1' }]),
      news(2, 'update', []),
      news(3, 'site', []),
      news(4, 'site', [{ courseId: 'gone', assessmentId: null }]),
    ];
    expect(visibleNews(list, catalog).map((a) => [a.id, a.items])).toEqual([[3, []]]);
  });
});
