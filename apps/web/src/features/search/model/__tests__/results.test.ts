// Tests the order of the quick search from a note: its own sections first among results that match as well.
import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@qv/schema';
import { openNoteFirst } from '../results';

const result = (noteSlug: string, anchor: string, score: number): SearchResult => ({
  noteId: noteSlug,
  noteSlug,
  noteTitle: noteSlug,
  courseName: 'Ramo',
  anchor,
  section: anchor,
  snippet: '',
  score,
});

const RESULTS = [
  result('08-otra', 'a', 2),
  result('08-otra', 'b', 1),
  result('08-otra', 'c', 1),
  result('09-abierta', 'd', 1),
  result('09-abierta', 'e', 0.5),
];
const order = (rs: SearchResult[]) => rs.map((r) => r.anchor).join('');

describe('openNoteFirst', () => {
  it('puts the open note’s sections first among those with the same score, never over a better one', () => {
    expect(order(openNoteFirst(RESULTS, '/semesters/2/courses/biocel/notes/09-abierta'))).toBe(
      'adbce',
    );
  });

  it('keeps the API’s order outside a note, or from a note with nothing found', () => {
    expect(order(openNoteFirst(RESULTS, '/home'))).toBe('abcde');
    expect(order(openNoteFirst(RESULTS, '/semesters/2/courses/biocel/notes/10-nada'))).toBe(
      'abcde',
    );
  });

  it('reads a note’s address written with escapes', () => {
    const own = [result('x', 'a', 1), result('ñandú', 'b', 1)];
    expect(order(openNoteFirst(own, `/notes/${encodeURIComponent('ñandú')}`))).toBe('ba');
  });
});
