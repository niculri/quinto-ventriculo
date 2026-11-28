// Tests for what is kept of a browser's error report, the per-minute budget and the panel's list.
import { describe, expect, it } from 'vitest';
import { ERRORS_SHOWN } from '@qv/schema';
import type { ClientErrorGroup } from '@qv/schema';
import { clientErrorsReport, errorBudget, scrubErrorMessage, scrubStack } from '../clientErrors';

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

describe('scrubStack', () => {
  it('keeps the lines with the app’s files, scrubbed: at most 15 lines of 200 characters', () => {
    const stack = [
      'TypeError: de ana@ug.uchile.cl',
      '    at f (/assets/index-D4f7Kp1z.js:3:1120)   ',
      `    at g (/assets/${'a'.repeat(30)}.js:1:2)`,
      ...Array.from({ length: 20 }, (_, i) =>
        `    at h${String(i)} (${'b'.repeat(300)})`.slice(0, 20),
      ),
    ].join('\n');
    const lines = scrubStack(stack).split('\n');
    expect(lines.slice(0, 3)).toEqual([
      'TypeError: de (correo)',
      '    at f (/assets/index-D4f7Kp1z.js:3:1120)',
      '    at g (/assets/….js:1:2)',
    ]);
    expect(lines).toHaveLength(15);
    expect(scrubStack(`${'c '.repeat(150)}\n`.repeat(15)).length).toBeLessThanOrEqual(1500);
  });
});

describe('clientErrorsReport', () => {
  it('shows at most ERRORS_SHOWN and says when there were more', () => {
    const g = { page: '/' } as ClientErrorGroup;
    const many = Array.from({ length: ERRORS_SHOWN + 1 }, () => g);
    expect(clientErrorsReport(many, 30)).toMatchObject({ days: 30, more: true });
    expect(clientErrorsReport(many, 30).groups).toHaveLength(ERRORS_SHOWN);
    expect(clientErrorsReport([g], 7)).toEqual({ days: 7, groups: [g], more: false });
  });
});
