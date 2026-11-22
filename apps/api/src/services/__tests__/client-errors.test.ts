// Tests for what is kept of a browser's error report and for the per-minute budget.
import { describe, expect, it } from 'vitest';
import { errorBudget, scrubErrorMessage } from '../client-errors';

describe('scrubErrorMessage', () => {
  it('takes out emails and long runs of letters and digits, and cuts at 300 characters', () => {
    expect(scrubErrorMessage('falló para ana.prueba@ug.uchile.cl')).toBe('falló para (correo)');
    expect(scrubErrorMessage('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 vencido')).toBe(
      'token … vencido',
    );
    expect(scrubErrorMessage('x'.repeat(10) + ' ' + 'y'.repeat(400))).toBe('xxxxxxxxxx …');
    expect(scrubErrorMessage('a '.repeat(200))).toHaveLength(300);
  });
});

describe('errorBudget', () => {
  it('counts per minute of the clock', () => {
    let ms = 120_000;
    const take = errorBudget(2, () => ms);
    expect([take(), take(), take()]).toEqual([true, true, false]);
    ms += 59_999;
    expect(take()).toBe(false);
    ms += 1;
    expect(take()).toBe(true);
  });
});
