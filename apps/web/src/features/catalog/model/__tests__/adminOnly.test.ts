// Tests the reasons of the admin mode that a thing has, and the ones that are its own in a list.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { adminReasons, ownReasons } from '../adminOnly';

const catalog = {
  ...CATALOG,
  adminOnly: {
    'course:fisica': ['hiddenSemester' as const, 'hiddenCourse' as const],
    'semester:2': ['hiddenSemester' as const],
  },
};

describe('adminReasons', () => {
  it('says why, and nothing for a student’s catalog or a thing that is not marked', () => {
    expect(adminReasons(catalog, ['course', 'fisica'])).toEqual(['hiddenSemester', 'hiddenCourse']);
    expect(adminReasons(catalog, ['course', 'anatomia-1'])).toEqual([]);
    expect(adminReasons(CATALOG, ['course', 'fisica'])).toEqual([]);
    expect(adminReasons(undefined, ['course', 'fisica'])).toEqual([]);
  });
});

describe('ownReasons', () => {
  it('leaves out what the holder already says', () => {
    expect(ownReasons(catalog, ['course', 'fisica'], ['semester', 2])).toEqual(['hiddenCourse']);
    expect(ownReasons(catalog, ['course', 'fisica'], ['semester', 9])).toEqual([
      'hiddenSemester',
      'hiddenCourse',
    ]);
  });
});
