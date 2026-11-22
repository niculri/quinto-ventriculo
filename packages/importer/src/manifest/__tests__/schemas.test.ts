// Tests the catalog's schemas.
import { Assessment } from '@qv/schema';
import { describe, expect, it } from 'vitest';

describe('the catalog', () => {
  const assessment = {
    id: 'anatomia-1/certamen-1',
    courseId: 'anatomia-1',
    name: 'C1',
    position: 1,
  };

  it('a date the author suggests is optional, and has to be a date', () => {
    expect(Assessment.parse(assessment).suggestedDate).toBeUndefined();
    expect(Assessment.parse({ ...assessment, suggestedDate: '2026-11-05' }).suggestedDate).toBe(
      '2026-11-05',
    );
    expect(() => Assessment.parse({ ...assessment, suggestedDate: '5 de noviembre' })).toThrow();
    expect(() => Assessment.parse({ ...assessment, suggestedDate: '2026-02-31' })).toThrow();
  });
});
