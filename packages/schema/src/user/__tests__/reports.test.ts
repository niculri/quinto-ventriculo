// The error reports: what a target and its place may hold, and what each screen reads of a report.
import { describe, expect, it } from 'vitest';
import {
  MyReport,
  NewReport,
  QueueReport,
  ReportLocation,
  ReportQueue,
  ReportTarget,
  Resolution,
  ResolveInput,
} from '../reports';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;
const target = { kind: 'card', id: 'g:0', code: null, version: null, location: {} };

describe('a report’s target and place', () => {
  it('a place may be empty, or hold any of its parts', () => {
    expect(ok(ReportLocation, {})).toBe(true);
    expect(
      ok(ReportLocation, {
        path: '/x',
        quote: { exact: 'e', prefix: 'p', suffix: 's' },
        number: 3,
      }),
    ).toBe(true);
    expect(ok(ReportLocation, { quote: { prefix: 'p' } })).toBe(false);
    expect(ok(ReportLocation, { number: '3' })).toBe(false);
  });

  it('a target is a card, a note or a quiz question, with code and version that may be null', () => {
    expect(ok(ReportTarget, target)).toBe(true);
    for (const kind of ['note', 'quiz_question'])
      expect(ok(ReportTarget, { ...target, kind })).toBe(true);
    expect(ok(ReportTarget, { ...target, kind: 'deck' })).toBe(false);
    expect(ok(ReportTarget, { ...target, code: 'T-1', version: 2 })).toBe(true);
    expect(ok(ReportTarget, { ...target, version: undefined })).toBe(false);
  });

  it('a new report adds the category and the comment, and its category is one of six', () => {
    const report = { ...target, category: 'answer_key', comment: 'c' };
    expect(ok(NewReport, report)).toBe(true);
    expect(ok(NewReport, { ...report, category: 'spelling' })).toBe(false);
    expect(ok(NewReport, { ...target, category: 'fact' })).toBe(false);
  });
});

describe('what comes back', () => {
  const resolution = { status: 'fixed', note: null, fixedVersion: 2, resolvedAt: 't' };

  it('a resolution is fixed, not an error or won’t fix', () => {
    expect(ok(Resolution, resolution)).toBe(true);
    expect(ok(Resolution, { ...resolution, status: 'open' })).toBe(false);
  });

  it('my report may be open (no resolution) or resolved', () => {
    const mine = {
      id: '1',
      kind: 'note',
      targetId: 'n',
      code: null,
      version: null,
      category: 'fact',
      comment: 'c',
      location: {},
      createdAt: 't',
    };
    expect(ok(MyReport, { ...mine, resolution: null })).toBe(true);
    expect(ok(MyReport, { ...mine, resolution })).toBe(true);
    expect(ok(MyReport, mine)).toBe(false);
  });

  it('a report in the queue may come from an account that no longer exists', () => {
    const report = {
      id: '1',
      category: 'fact',
      comment: 'c',
      location: {},
      version: null,
      createdAt: 't',
    };
    expect(ok(QueueReport, { ...report, reporter: null })).toBe(true);
    expect(
      ok(QueueReport, {
        ...report,
        reporter: { id: 'u', name: null, email: null, blocked: false },
      }),
    ).toBe(true);
    expect(ok(QueueReport, { ...report, reporter: { id: 'u', name: null, email: null } })).toBe(
      false,
    );
  });

  it('the queue has the open groups, the resolved ones and who is blocked', () => {
    expect(
      ok(ReportQueue, {
        open: [],
        resolved: [],
        blocked: [{ id: 'u', name: null, email: 'a', blockedAt: 't' }],
      }),
    ).toBe(true);
    expect(ok(ReportQueue, { open: [], resolved: [] })).toBe(false);
  });

  it('resolving a target says how and whether it was fixed in a version', () => {
    const input = {
      kind: 'card',
      targetId: 'g:0',
      status: 'wont_fix',
      note: null,
      fixedVersion: null,
    };
    expect(ok(ResolveInput, input)).toBe(true);
    expect(ok(ResolveInput, { ...input, status: 'maybe' })).toBe(false);
  });
});
