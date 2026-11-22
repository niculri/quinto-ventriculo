// Tests for the made-up «Uso» figures and opens of the demo: valid, repeatable and never showing a small count.
import { describe, expect, it } from 'vitest';
import { AdminUsageRow, FEW } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import type { UsageGroups } from '../../../ports/usage';
import { bundle } from '../../../test/draftApp';
import { demoUsageEvents, demoUsageStats, orFew } from '../usage';

const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);

const GROUPS: UsageGroups = {
  decks: {
    u1: ['u1', 'certamen-1', 'anatomia'],
    u2: ['u2', 'certamen-1', 'anatomia'],
    u3: ['u3', 'certamen-2', 'biocel'],
    u4: ['u4', null, null],
    u5: [null, 'certamen-9', null],
    u6: ['u6', null, 'histo'],
    u7: ['u7', 'certamen-3', 'histo'],
    u8: ['u8', 'certamen-4', 'fisica'],
    u9: ['u9', 'certamen-5', 'salud'],
    u10: ['u10', 'certamen-6', 'bioestadistica'],
  },
  quizzes: {
    q1: ['a', 'b'],
    q2: ['a', 'b'],
    q3: ['a', 'b'],
    q4: ['a', 'b'],
    q5: ['a', 'b'],
    q6: ['a', 'b'],
  },
};

const row = async (groups = GROUPS) =>
  (await demoUsageStats(() => NOW).stats('t', groups)) as AdminUsageRow;

describe('demoUsageStats', () => {
  it('is a valid usage row, the same one every time for the same moment', async () => {
    const first = await row();
    expect(AdminUsageRow.parse(first)).toEqual(first);
    expect(await row()).toEqual(first);
    expect(first.generated_at).toBe(new Date(NOW).toISOString());
  });

  it('30 days ending today and 12 weeks that start on a Monday, oldest first', async () => {
    const r = await row();
    expect(r.days).toHaveLength(30);
    expect(r.days.at(-1)!.day).toBe(r.today);
    expect(r.days.map((d) => d.day)).toEqual([...r.days.map((d) => d.day)].sort());
    expect(r.weeks).toHaveLength(12);
    for (const w of r.weeks) expect(new Date(`${w.week}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(r.weeks.at(-1)!.week <= r.today).toBe(true);
  });

  it('no figure shows a count of one to four students as a number', async () => {
    const r = await row();
    for (const f of [r.totals.today, r.totals.last_7, r.totals.last_30, ...r.days, ...r.weeks]) {
      if (typeof f.active_students === 'number') expect(f.active_students).not.toBeLessThan(5);
      if (f.active_students === FEW) expect(f.anki_answers).toBe(FEW);
    }
  });

  it('the lists come from the groups: distinct names, no empty ones, and capped', async () => {
    const r = await row();
    expect(r.decks.map((d) => d.deck_id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u6', 'u7']);
    expect(r.courses.map((c) => c.course_id)).toEqual(['anatomia', 'biocel', 'histo', 'fisica']);
    expect(r.assessments.map((a) => [a.assessment_id, a.course_id])).toEqual([
      ['certamen-1', 'anatomia'],
      ['certamen-2', 'biocel'],
      ['certamen-3', 'histo'],
      ['certamen-4', 'fisica'],
      ['certamen-5', 'salud'],
      ['certamen-6', 'bioestadistica'],
    ]);
    expect(r.quizzes).toHaveLength(5);
  });

  it('without decks or quizzes there are no rows to show, and the rest is still there', async () => {
    const r = await row({ decks: {}, quizzes: {} });
    expect([r.decks, r.quizzes, r.courses, r.assessments]).toEqual([[], [], [], []]);
    expect(r.days).toHaveLength(30);
  });

  it('the fifth deck of a short list is shown as few, so is the last quiz and course', async () => {
    const r = await row();
    expect(r.decks[5]!.new_cards).toBe(FEW);
    expect(r.quizzes[4]!.rounds_finished).toBe(FEW);
    expect(r.courses[3]!.rounds_finished).toBe(FEW);
  });
});

describe('orFew', () => {
  it('under the minimum it shows few when there was any activity and nothing when there was none', () => {
    expect(orFew(0, 5, 99)).toBe(0);
    expect(orFew(1, 5, 99)).toBe(FEW);
    expect(orFew(4, 5, 99)).toBe(FEW);
  });

  it('from the minimum on it shows the figure', () => {
    expect(orFew(5, 5, 99)).toBe(99);
    expect(orFew(6, 6, 0)).toBe(0);
  });
});

describe('demoUsageEvents', () => {
  const full: ContentBundle = {
    ...bundle('Uno'),
    ankiDecks: ['A::B::C', 'A::B::C::D', 'A::B::C::E', 'A::B::C::F', 'A::B::C::G'].map(
      (name, i) => ({
        id: String(i),
        name,
        description: '',
        parentId: null,
        semester: 2,
        courseId: 'biologia-celular',
        assessmentId: null,
        preset: null,
        position: i,
      }),
    ),
  };

  it('seeds opens of the notes, only the decks of four levels or more, and the three kinds of search', async () => {
    const events = demoUsageEvents(full, () => NOW);
    const counts = await events.read();
    const decks = counts.items.filter((i) => i.kind === 'deck').map((i) => i.path);
    expect(decks.sort()).toEqual(['/api/decks/1', '/api/decks/2', '/api/decks/3']);
    expect(counts.items.some((i) => i.path === '/api/notes/11-traduccion')).toBe(true);
    expect(counts.searches.map((s) => s.context).sort()).toEqual(['home', 'note', 'search']);
  });

  it('opens of the first two quizzes are seeded, most opened first', async () => {
    const quiz = (id: string) => ({ id }) as ContentBundle['quizzes'][number];
    const withQuizzes = {
      ...full,
      notes: [],
      ankiDecks: [],
      quizzes: [quiz('q1'), quiz('q2'), quiz('q3')],
    };
    const counts = await demoUsageEvents(withQuizzes, () => NOW).read();
    expect(counts.items.map((i) => [i.path, i.count])).toEqual([
      ['/api/quizzes/q1', 18],
      ['/api/quizzes/q2', 12],
    ]);
  });

  it('every seeded open falls inside the last 30 days, none in the future', () => {
    const { points } = demoUsageEvents(full, () => NOW);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.at).toBeLessThanOrEqual(NOW);
      expect(p.at).toBeGreaterThan(NOW - 30 * 86_400_000);
    }
  });

  it('a site without content has only the searches', async () => {
    const empty: ContentBundle = { ...full, notes: [], ankiDecks: [], quizzes: [] };
    const counts = await demoUsageEvents(empty, () => NOW).read();
    expect(counts.items).toEqual([]);
    expect(counts.searches).toHaveLength(3);
  });
});
