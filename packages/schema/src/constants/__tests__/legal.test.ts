// The legal versions the database accepts and the account terms.
import { describe, expect, it } from 'vitest';
import { ACCOUNT_DELETION_DAYS, INACTIVE_ACCOUNT_MONTHS, LEGAL_VERSIONS } from '../legal';

describe('the legal terms', () => {
  it('each version is a number or two joined by a dot, the only thing the database takes, with the date it came into force', () => {
    for (const { version, date } of Object.values(LEGAL_VERSIONS)) {
      expect(version).toMatch(/^\d+(?:\.\d+)?$/);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    }
  });

  it('a deleted account has a week to be cancelled, and an inactive one lasts three years', () => {
    expect(ACCOUNT_DELETION_DAYS).toBe(7);
    expect(INACTIVE_ACCOUNT_MONTHS).toBe(36);
  });
});
