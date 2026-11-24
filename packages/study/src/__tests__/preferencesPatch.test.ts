// What a change of the preferences sends (only what changed, the lists as what they gained and lost) and what
// applying it gives, as save_study_preferences() does.
import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../preferences';
import { applyListPatch, applyPreferencesPatch, preferencesPatch } from '../preferencesPatch';

const base = { ...defaultPreferences('America/Santiago'), dismissed: ['tip-a'] };

describe('preferencesPatch', () => {
  it('only what changed, the lists as what they gained and lost', () => {
    const next = { ...base, fullAnki: true, dismissed: ['tip-b'], semester: 3 };
    expect(preferencesPatch(base, next)).toEqual({
      fullAnki: true,
      semester: 3,
      dismissed: { add: ['tip-b'], remove: ['tip-a'] },
    });
    expect(preferencesPatch(base, { ...base })).toEqual({});
  });

  it('with nothing stored, everything, each list as what it adds', () => {
    const patch = preferencesPatch(null, base);
    expect(patch).toMatchObject({ timeZone: 'America/Santiago', fullAnki: false, semester: null });
    expect(patch.dismissed).toEqual({ add: ['tip-a'], remove: [] });
    expect(patch.addedCourses).toBeUndefined();
  });
});

describe('applying a patch', () => {
  it('keeps what another device changed and adds what this one did', () => {
    const elsewhere = { ...base, fourButtons: true, dismissed: ['tip-a', 'tip-c'] };
    const patch = preferencesPatch(base, { ...base, dismissed: ['tip-a', 'tip-b'], semester: 2 });
    expect(applyPreferencesPatch(elsewhere, patch)).toEqual({
      ...elsewhere,
      semester: 2,
      dismissed: ['tip-a', 'tip-c', 'tip-b'],
    });
  });

  it('a list takes out, moves what comes again to the end, adds each once and keeps the newest', () => {
    expect(applyListPatch(['a', 'b', 'c'], { add: ['a', 'd', 'd'], remove: ['b'] }, 10)).toEqual([
      'c',
      'a',
      'd',
    ]);
    expect(applyListPatch(['a', 'b'], { add: ['c'], remove: [] }, 2)).toEqual(['b', 'c']);
  });

  it('the dismissed list keeps 50, the course lists 100', () => {
    const many = Array.from({ length: 120 }, (_, i) => `x${i}`);
    const r = applyPreferencesPatch(base, {
      dismissed: { add: many, remove: [] },
      addedCourses: { add: many, remove: [] },
    });
    expect(r.dismissed).toEqual(many.slice(-50));
    expect(r.addedCourses).toEqual(many.slice(-100));
    expect(r.removedCourses).toEqual([]);
  });
});
