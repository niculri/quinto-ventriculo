// Tests which weeks of the notes are open in the menu: the one of the note being read, and what was done by hand while
// in the same assessment.
import { describe, expect, it } from 'vitest';
import { NO_WEEKS, toggleWeek, weekOpen } from '../weeks';

const reading = (noteSlug: string | null, assessmentId: string | null = 'a/c3') => ({
  assessmentId,
  noteSlug,
});

describe('the weeks of the menu', () => {
  it('only the week of the note being read is open; with no note, none', () => {
    expect(weekOpen(NO_WEEKS, reading('n1'), 'w1', true)).toBe(true);
    expect(weekOpen(NO_WEEKS, reading('n1'), 'w2', false)).toBe(false);
    expect(weekOpen(NO_WEEKS, reading(null), 'w1', false)).toBe(false);
  });

  it('a week opened by hand stays open in other pages of the assessment, and is forgotten in another one', () => {
    const opened = toggleWeek(NO_WEEKS, reading('n1'), 'w2', false);
    expect(weekOpen(opened, reading('n1'), 'w2', false)).toBe(true);
    expect(weekOpen(opened, reading(null), 'w2', false)).toBe(true);
    expect(weekOpen(opened, reading('n3'), 'w2', false)).toBe(true);
    expect(weekOpen(opened, reading('n9', 'a/c2'), 'w2', false)).toBe(false);
    const elsewhere = toggleWeek(opened, reading('n9', 'a/c2'), 'w1', false);
    expect(elsewhere).toEqual({
      assessmentId: 'a/c2',
      toggled: { w1: { open: true, note: 'n9' } },
    });
  });

  it('the week being read closes by hand, and opens again on arriving at another of its notes', () => {
    const closed = toggleWeek(NO_WEEKS, reading('n1'), 'w1', true);
    expect(weekOpen(closed, reading('n1'), 'w1', true)).toBe(false);
    expect(weekOpen(closed, reading('n2'), 'w1', true)).toBe(true);
    expect(weekOpen(closed, reading(null), 'w1', false)).toBe(false);
    const again = toggleWeek(closed, reading('n1'), 'w1', true);
    expect(weekOpen(again, reading('n1'), 'w1', true)).toBe(true);
  });
});
