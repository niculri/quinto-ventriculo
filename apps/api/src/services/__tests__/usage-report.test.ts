// Tests for the pieces of the usage report: the site's day, the groups of the users' database and the opens' figures.
import { describe, expect, it } from 'vitest';
import { FEW } from '@qv/schema';
import { CATALOG, row } from '../../test/usage-app';
import { opensFigures, siteDay, usageGroups } from '../usage-report';

describe('the usage report', () => {
  it('the site’s day starts at 4:00 in Santiago', () => {
    // 2026-11-09 06:59 UTC = 03:59 in Santiago (summer, -3): still the 8th.
    expect(siteDay(Date.parse('2026-11-09T06:59:00Z'))).toBe('2026-11-08');
    expect(siteDay(Date.parse('2026-11-09T07:00:00Z'))).toBe('2026-11-09');
  });

  it('the groups leave out what is not in a course, and a test with an id the database would refuse', () => {
    const catalog = structuredClone(CATALOG);
    catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes.push({
      ...catalog.semesters[0]!.courses[0]!.assessments[0]!.quizzes[0]!,
      id: 'Mal_Id',
    });
    expect(Object.keys(usageGroups(catalog).quizzes)).toEqual(['test-de-prueba']);
    expect(Object.keys(usageGroups(catalog).decks)).toEqual(['3', '4', '5', '6']);
  });

  it('with fewer than 5 students active in the 30 days, no list of the most opened', () => {
    const r = row();
    r.totals.last_30.active_students = FEW;
    const opens = opensFigures(
      {
        hourly: [],
        items: [{ kind: 'note', path: '/api/notes/apunte', count: 50 }],
        searches: [{ context: 'note', count: 9 }],
      },
      r,
    );
    expect(opens.top).toEqual([]);
    expect(opens.searches).toEqual([]);
  });
});
