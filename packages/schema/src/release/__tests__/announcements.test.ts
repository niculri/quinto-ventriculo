// Tests for the announcements' contracts and their status.
import { describe, expect, it } from 'vitest';
import {
  AnnouncementDraft,
  announcementStatus,
  NEWS_TITLE_MAX,
  SaveAnnouncementRequest,
} from '../announcements';
import type { AnnouncementRow } from '../announcements';
import { PublishRequest } from '../release';

const row: AnnouncementRow = {
  id: 1,
  releaseId: 3,
  releaseTitle: 'A · Certamen 1',
  releaseStatus: 'published',
  kind: 'new',
  title: 'Clases nuevas',
  body: '',
  items: [],
  createdAt: '2026-11-25T12:00:00+00:00',
  createdBy: 'dueno@ug.uchile.cl',
  publishAt: '2026-11-25T12:30:00+00:00',
  withdrawnAt: null,
  withdrawnBy: null,
};

describe('announcementStatus', () => {
  it('waits until its time, then is out', () => {
    expect(announcementStatus(row, Date.parse('2026-11-25T12:29:59Z'))).toBe('waiting');
    expect(announcementStatus(row, Date.parse('2026-11-25T12:30:00Z'))).toBe('out');
  });

  it('is withdrawn by hand or with its release undone', () => {
    const late = Date.parse('2026-11-26T00:00:00Z');
    expect(announcementStatus({ ...row, releaseStatus: 'reverted' }, late)).toBe('withdrawn');
    expect(announcementStatus({ ...row, withdrawnAt: row.createdAt, withdrawnBy: 'x' }, late)).toBe(
      'withdrawn',
    );
  });
});

describe('what the author writes', () => {
  it('trims, and counts the length as the database does', () => {
    expect(
      AnnouncementDraft.parse({ kind: 'new', title: '  Hola ', body: ' b ', items: [] }),
    ).toEqual({ kind: 'new', title: 'Hola', body: 'b', items: [] });
    expect(
      AnnouncementDraft.safeParse({ kind: 'new', title: ' ', body: '', items: [] }).success,
    ).toBe(false);
    const emoji = '😀'.repeat(NEWS_TITLE_MAX / 2 + 1);
    expect(
      AnnouncementDraft.safeParse({ kind: 'new', title: emoji, body: '', items: [] }).success,
    ).toBe(false);
  });

  it('a site announcement has no release and a release’s is not about the site', () => {
    const base = { title: 'x', body: '', items: [] };
    expect(
      SaveAnnouncementRequest.safeParse({ ...base, kind: 'site', releaseId: null }).success,
    ).toBe(true);
    expect(SaveAnnouncementRequest.safeParse({ ...base, kind: 'site', releaseId: 2 }).success).toBe(
      false,
    );
    expect(
      SaveAnnouncementRequest.safeParse({ ...base, kind: 'new', releaseId: null }).success,
    ).toBe(false);
  });

  it('publishing without an announcement is the request of before', () => {
    const body = {
      fingerprint: '0'.repeat(32),
      title: 'T',
      checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
    };
    expect(PublishRequest.parse(body).announcement).toBeNull();
    const site = { kind: 'site', title: 'x', body: '', items: [] };
    expect(PublishRequest.safeParse({ ...body, announcement: site }).success).toBe(false);
  });
});
