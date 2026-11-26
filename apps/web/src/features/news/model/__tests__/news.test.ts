// Tests for what the news show: unread, the links to the material, the courses named and the list by day.
import { describe, expect, it } from 'vitest';
import type { Announcement } from '@qv/schema';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { byDay, isUnread, newsCourses, newsLinks, ofCourse } from '../news';

const course = CATALOG.semesters.flatMap((s) => s.courses).find((c) => c.assessments.length)!;
const assessment = course.assessments[0]!;

const news = (
  id: number,
  publishedAt: string,
  items: Announcement['items'] = [],
): Announcement => ({
  id,
  kind: 'new',
  title: `Aviso ${String(id)}`,
  body: '',
  items,
  publishedAt,
});

describe('unread', () => {
  it('newer than what was seen, or anything if nothing was', () => {
    const a = news(1, '2026-11-20T12:00:00.000Z');
    expect(isUnread(a, null)).toBe(true);
    expect(isUnread(a, '2026-11-19T00:00:00.000Z')).toBe(true);
    expect(isUnread(a, '2026-11-20T12:00:00.000Z')).toBe(false);
  });
});

describe('the links of an announcement', () => {
  it('to its assessment or its course, and none for what the catalog does not have', () => {
    const a = news(1, '2026-11-25T12:00:00.000Z', [
      { courseId: course.id, assessmentId: assessment.id },
      { courseId: course.id, assessmentId: null },
      { courseId: course.id, assessmentId: `${course.id}/nunca` },
      { courseId: 'nunca', assessmentId: null },
    ]);
    expect(newsLinks(a, undefined)).toEqual([]);
    expect(newsLinks(a, CATALOG).map((l) => [l.label, l.to])).toEqual([
      [
        `${course.name} · ${assessment.name}`,
        expect.stringContaining(`#${assessment.id.split('/')[1]!}`),
      ],
      [course.name, expect.stringMatching(new RegExp(`/courses/${course.id}$`))],
    ]);
  });

  it('the courses named, in the catalog’s order, and the list of one of them', () => {
    const feed = [
      news(2, '2026-11-25T12:00:00.000Z', [{ courseId: course.id, assessmentId: null }]),
      news(1, '2026-11-20T12:00:00.000Z', [{ courseId: 'nunca', assessmentId: null }]),
    ];
    expect(newsCourses(feed, CATALOG)).toEqual([{ id: course.id, name: course.name }]);
    expect(newsCourses(feed, undefined)).toEqual([]);
    expect(ofCourse(feed, 'all')).toEqual(feed);
    expect(ofCourse(feed, course.id)).toEqual([feed[0]]);
  });
});

describe('byDay', () => {
  it('groups by the day in Chile, newest first', () => {
    const feed = [
      news(3, '2026-11-25T15:00:00.000Z'),
      // 01:00 UTC on the 25th is still the 24th in Santiago.
      news(2, '2026-11-25T01:00:00.000Z'),
      news(1, '2026-11-24T12:00:00.000Z'),
    ];
    expect(byDay(feed).map((d) => [d.day, d.items.map((a) => a.id)])).toEqual([
      ['2026-11-25', [3]],
      ['2026-11-24', [2, 1]],
    ]);
    expect(byDay([])).toEqual([]);
  });
});
